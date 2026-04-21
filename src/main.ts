/**
 * NeuroMetric — app shell + router.
 *
 * State flow per session:
 *   home (assigned task) → (consent on first run) → pre-task context →
 *   calibration → instructions → task → post-task context → save →
 *   results → home
 *
 * Deferral flow:
 *   home → defer → (dismiss | reroll | pick-other) → log DeferralRecord
 */

import { runCalibration } from "./calibration";
import { ensurePersistentStorage } from "./persistent-storage";
import { captureTelemetry } from "./telemetry";
import { runTaskSession } from "./tasks/registry";
import { assignNextTask } from "./tasks/scheduler";
import {
  deleteAllSessions,
  exportAll,
  getMeta,
  listSessions,
  markBackupDone,
  saveDeferral,
  saveSession,
  setMeta,
  shouldRemindBackup,
} from "./storage";
import type {
  Calibration,
  DeferralRecord,
  Session,
  SessionContext,
  TaskId,
} from "./types";
import { hasSupabase } from "./supabase/client";
import { getDisplayName, getSession } from "./supabase/auth";
import { getActivePartner } from "./supabase/pairing";
import { syncSession } from "./supabase/sync";
import { renderAccount, renderAuthGate } from "./ui/auth-views";
import { renderRawPlot } from "./ui/raw-plot";
import {
  installNavDelegate,
  renderConsent,
  renderDeferralPrompt,
  renderHome,
  renderInstructions,
  renderManualPicker,
  renderMethodologyView,
  renderPostTaskContext,
  renderPreTaskContext,
  renderResults,
  renderResultsList,
} from "./ui/views";

const app = document.querySelector<HTMLElement>("#app")!;

async function goHome(): Promise<void> {
  const sessions = await listSessions();
  const assigned = assignNextTask(sessions);
  const backupDue = await shouldRemindBackup();

  let isAuthed = false;
  let displayName: string | null = null;
  let pairedWith: string | null = null;
  if (hasSupabase()) {
    const session = await getSession();
    isAuthed = session !== null;
    if (session?.user) {
      displayName = await getDisplayName(session.user.id);
      const partner = await getActivePartner();
      if (partner) pairedWith = (await getDisplayName(partner.partnerId)) ?? "PARTNER";
    }
  }

  renderHome(app, sessions, assigned, backupDue, {
    onStartAssigned: () => goConsent(assigned, true),
    onDefer: () => goDeferral(assigned),
    onShowRawPlot: () => void goExploration(),
    onShowAdvanced: () =>
      renderManualPicker(app, (t) => goConsent(t, false), () => goHome()),
    onExport: doExport,
    onWipe: async () => {
      if (!confirm("Delete all sessions and deferral records? This cannot be undone.")) return;
      await deleteAllSessions();
      await goHome();
    },
    onDismissBackup: async () => {
      await setMeta("backupReminderSnoozedAt", new Date().toISOString());
      await goHome();
    },
    onOpenAccount: () => goAccount(),
    onOpenMode: (mode) => goModeStub(mode),
    isAuthed,
    displayName,
    pairedWith,
  });
}

async function goAccount(): Promise<void> {
  if (!hasSupabase()) {
    renderAuthGate(app, () => goHome());
    return;
  }
  const session = await getSession();
  if (!session) {
    renderAuthGate(app, () => goHome());
    return;
  }
  await renderAccount(app, () => goHome(), () => renderAuthGate(app, () => goHome()));
}

function goModeStub(mode: "sampling" | "reflection" | "joint_notice" | "mirror" | "bigfive"): void {
  const names: Record<typeof mode, string> = {
    sampling: "SAMPLING_TRACKER",
    reflection: "REFLECTION_LIBRARY",
    joint_notice: "JOINT_NOTICE",
    mirror: "REFLECTING_MIRROR",
    bigfive: "BIG_FIVE_IPIP_NEO_120",
  };
  app.innerHTML = `
    <div class="shell">
      <nav class="sidenav">
        <div class="brand-block">
          <div class="brand-mark">◼</div>
          <h2>NEUROMETRIC</h2>
          <div class="version">V.1.0.0_STABLE</div>
        </div>
      </nav>
      <header class="topbar">
        <div><span class="brand">NEUROMETRIC_OS</span><span class="sys-active">MODE_PENDING</span></div>
        <div class="meta"><span>MODE</span><span class="value mono">${names[mode]}</span></div>
      </header>
      <main class="main">
        <div class="wrap">
          <div class="context-header">
            <div>
              <div class="label accent"><span class="status-dot"></span>NOT YET IMPLEMENTED</div>
              <h1>${names[mode]}</h1>
            </div>
          </div>
          <section class="banner warn">
            <span class="pip"></span>
            <div class="body">
              <div class="label warn">MODE SKELETON</div>
              <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.9rem;">
                Data model + RLS policies shipped in <code>001_init.sql</code>. UI implementation scheduled in the next build pass (see build order in <code>tasks/accounts-deployment.md</code>).
              </div>
            </div>
          </section>
          <div class="actions">
            <button class="btn ghost" id="back">‹ RETURN</button>
          </div>
        </div>
      </main>
    </div>`;
  app.querySelector<HTMLButtonElement>("#back")!.addEventListener("click", () => goHome());
}

async function doExport(): Promise<void> {
  const json = await exportAll();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neurometric-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  await markBackupDone();
  await goHome();
}

async function goDeferral(assigned: TaskId): Promise<void> {
  renderDeferralPrompt(
    app,
    assigned,
    async () => {
      await logDeferral(assigned, null, "dismissed");
      await goHome();
    },
    async () => {
      await logDeferral(assigned, null, "rerolled");
      // Re-assign, excluding the first assignment for fairness.
      const sessions = await listSessions();
      const next = assignNextTask(sessions, [assigned]);
      await goConsent(next, true);
    },
    async (other) => {
      await logDeferral(assigned, other, "picked-other");
      await goConsent(other, false);
    },
  );
}

async function logDeferral(
  assigned: TaskId,
  chosen: TaskId | null,
  reason: DeferralRecord["reason"],
): Promise<void> {
  let telemetry = null;
  try {
    telemetry = await captureTelemetry();
  } catch {
    // best-effort only
  }
  await saveDeferral({
    id: uuid(),
    timestamp: new Date().toISOString(),
    assignedTask: assigned,
    chosenInstead: chosen,
    reason,
    telemetry,
  });
}

async function goConsent(task: TaskId, wasAssigned: boolean): Promise<void> {
  const already = await getMeta<boolean>("consentAccepted");
  if (already) {
    await goPreContext(task, wasAssigned);
    return;
  }
  renderConsent(app, async () => {
    await setMeta("consentAccepted", true);
    await setMeta("consentAcceptedAt", new Date().toISOString());
    await goPreContext(task, wasAssigned);
  });
}

async function goPreContext(task: TaskId, wasAssigned: boolean): Promise<void> {
  renderPreTaskContext(app, task, async (partial) => {
    await goCalibration(task, wasAssigned, partial);
  });
}

async function goCalibration(
  task: TaskId,
  wasAssigned: boolean,
  preCtx: Partial<SessionContext>,
): Promise<void> {
  const calibration = await runCalibration(app);
  renderInstructions(app, task, async () => {
    await goTask(task, wasAssigned, preCtx, calibration);
  });
}

async function goTask(
  task: TaskId,
  wasAssigned: boolean,
  preCtx: Partial<SessionContext>,
  calibration: Calibration,
): Promise<void> {
  // Capture telemetry right before the task starts (closest to actual
  // device state during the task).
  const telemetry = await captureTelemetry();

  // Run the task with a placeholder post-ctx; we finalize after task.
  const now = new Date();
  const contextShell: SessionContext = {
    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
    ...preCtx,
  };

  const sessionMinusPost: Session = await runTaskSession(
    task,
    app,
    calibration,
    telemetry,
    contextShell,
    wasAssigned,
  );

  // Now collect the subjective post-task context and merge it in.
  renderPostTaskContext(app, async (postPartial) => {
    const finalContext: SessionContext = { ...sessionMinusPost.context, ...postPartial };
    const finalSession: Session = { ...sessionMinusPost, context: finalContext };
    await saveSession(finalSession);
    // Best-effort mirror to cloud if authed. Never blocks the UI.
    if (hasSupabase()) {
      syncSession(finalSession).catch(() => {});
    }
    const all = (await listSessions()).filter((s) => s.task === task);
    renderResults(app, finalSession, all, () => goHome());
  });
}

function uuid(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Service worker registration for PWA install / offline (HTTPS required
// for it to register; localhost is exempt).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW register failed", err);
    });
  });
}

// Global nav delegate — wires the sidebar + mobile topbar-btn + cta-cap
// for EVERY view, once. Previously only renderHome wired these, which
// meant nav was dead from every other view.
installNavDelegate({
  onHome: () => void goHome(),
  onResults: () => void goResults(),
  onExploration: () => void goExploration(),
  onMethodology: () => void goMethodology(),
  onAccount: () => void goAccount(),
});

async function goResults(): Promise<void> {
  const all = await listSessions();
  renderResultsList(app, all, async (sessionId) => {
    const session = (await listSessions()).find((s) => s.id === sessionId);
    if (!session) return goResults();
    const forTask = (await listSessions()).filter((s) => s.task === session.task);
    renderResults(app, session, forTask, () => goResults());
  });
}

async function goExploration(): Promise<void> {
  const all = await listSessions();
  renderRawPlot(app, all, () => goHome());
}

function goMethodology(): void {
  renderMethodologyView(app);
}

(async function boot() {
  try {
    await ensurePersistentStorage();
  } catch {
    // best-effort, non-fatal
  }
  await goHome();
})().catch((err) => {
  console.error(err);
  app.innerHTML = `<div class="warn">Something went wrong: ${
    err instanceof Error ? err.message : String(err)
  }</div>`;
});

/**
 * Monolith-aesthetic views.
 *
 * Shell: sidenav + topbar + main on desktop; topbar + main on mobile.
 * Copy is in a technical-instrument register ("INITIATE SESSION",
 * "PROTOCOL PARAMETERS", "ENV_CONSTRAINTS") per the design system.
 */

import type { Session, SessionContext, TaskId } from "../types";
import { TASK_DEFINITIONS } from "../types";
import {
  BASELINE_WINDOW,
  computeTrendPoint,
  formatDelta,
  MIN_BASELINE_SESSIONS,
} from "../trend";
import { METRIC_SPECS, type MetricSpec } from "../tasks/registry";
import { explainAssignment } from "../tasks/scheduler";

export type NavKey = "home" | "results" | "exploration" | "methodology" | "account";

/**
 * Document-level nav delegate. Called once at app boot. Wires EVERY
 * view's sidenav + mobile topbar-btn + cta-cap without each view having
 * to remember to re-wire. Fixes the class of bugs where navigating to
 * another view killed the sidebar links.
 */
export function installNavDelegate(handlers: {
  onHome: () => void;
  onResults: () => void;
  onExploration: () => void;
  onMethodology: () => void;
  onAccount: () => void;
}): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const navEl = target.closest<HTMLElement>("[data-nav]");
    if (navEl) {
      const key = navEl.dataset.nav as NavKey | undefined;
      if (!key) return;
      // For buttons with data-nav we take over — but still allow any
      // local data-nav=x we might have on non-nav elements by only
      // handling our five known keys.
      switch (key) {
        case "home":
          e.preventDefault();
          handlers.onHome();
          return;
        case "results":
          e.preventDefault();
          handlers.onResults();
          return;
        case "exploration":
          e.preventDefault();
          handlers.onExploration();
          return;
        case "methodology":
          e.preventDefault();
          handlers.onMethodology();
          return;
        case "account":
          e.preventDefault();
          handlers.onAccount();
          return;
      }
    }
    const cta = target.closest<HTMLElement>(".cta-cap");
    if (cta) {
      e.preventDefault();
      handlers.onHome();
    }
  });
}

function modeCard(
  mode: string,
  name: string,
  desc: string,
  available: boolean,
  locked: boolean,
  tag?: string,
  primary: boolean = false,
): string {
  const badge = locked
    ? `<span class="chip amber">${tag ?? "LOCKED"}</span>`
    : tag
    ? `<span class="chip amber">${tag}</span>`
    : primary
    ? `<span class="chip primary">READY</span>`
    : `<span class="chip primary">AVAILABLE</span>`;
  const disabled = !available;
  const cls = ["task-card", primary ? "featured" : ""].filter(Boolean).join(" ");
  return `<button class="${cls}" data-mode="${mode}" ${disabled ? "disabled" : ""}>
    <div>
      <div class="name">${name}</div>
      <div class="construct">${desc}</div>
    </div>
    <div>${badge}</div>
  </button>`;
}

/* ---------- Shell ---------- */

interface ShellOpts {
  active: NavKey;
  title: string;
  seqId: string;
  statusLabel: string;
  body: string;
  /** Optional extra meta shown top-right of context header. */
  metaRight?: { key: string; value: string } | null;
}

function shellHtml(opts: ShellOpts): string {
  const metaRight =
    opts.metaRight ??
    { key: "SEQ_ID", value: opts.seqId };

  return `
    <div class="shell">
      <nav class="sidenav">
        <div class="brand-block">
          <div class="brand-mark">◼</div>
          <h2>NEUROMETRIC</h2>
          <div class="version">V.1.0.0_STABLE</div>
        </div>
        <div class="nav-items">
          ${navButton("home", opts.active, "▶", "Home")}
          ${navButton("results", opts.active, "▦", "Results")}
          ${navButton("exploration", opts.active, "◇", "Exploration")}
          ${navButton("methodology", opts.active, "§", "Methodology")}
          ${navButton("account", opts.active, "@", "Account")}
        </div>
        <button class="cta-cap" data-nav-cta>
          <span>INITIATE_SESSION</span><span>›</span>
        </button>
      </nav>

      <header class="topbar">
        <div>
          <span class="brand">NEUROMETRIC_OS</span>
          <span class="sys-active">SYS_ACTIVE</span>
        </div>
        <div class="meta">
          <span>LOCAL</span>
          <span class="value mono">${location.host}</span>
        </div>
        <div class="topbar-actions">
          <button class="topbar-btn" data-nav="home" aria-label="Home" title="Home">▶</button>
          <button class="topbar-btn" data-nav="account" aria-label="Account" title="Account">@</button>
        </div>
      </header>

      <main class="main">
        <div class="wrap">
          <div class="context-header">
            <div>
              <div class="label accent"><span class="status-dot"></span>${opts.statusLabel}</div>
              <h1>${opts.title}</h1>
            </div>
            <div class="meta-right">
              <div class="key">${metaRight.key}</div>
              <div class="val">${metaRight.value}</div>
            </div>
          </div>
          ${opts.body}
        </div>
      </main>
    </div>`;
}

function navButton(key: NavKey, active: NavKey, glyph: string, label: string): string {
  const isActive = key === active;
  return `<button class="nav-item ${isActive ? "active" : ""}" data-nav="${key}">
    <span class="glyph">${glyph}</span><span>${label}</span>
  </button>`;
}

function shortSeqId(s: string): string {
  return s.slice(0, 4).toUpperCase();
}

/* ---------- Home ---------- */

export interface HomeHandlers {
  onStartAssigned: () => void;
  onDefer: () => void;
  onShowRawPlot: () => void;
  onShowAdvanced: () => void;
  onExport: () => void;
  onWipe: () => void;
  onDismissBackup: () => void;
  onOpenAccount: () => void;
  onOpenMode?: (mode: "sampling" | "reflection" | "joint_notice" | "mirror" | "bigfive") => void;
  isAuthed: boolean;
  displayName: string | null;
  pairedWith: string | null;
}

export function renderHome(
  container: HTMLElement,
  sessions: Session[],
  assignedTask: TaskId,
  backupDue: boolean,
  handlers: HomeHandlers,
) {
  const def = TASK_DEFINITIONS[assignedTask];
  const assignedLine = explainAssignment(assignedTask, sessions);
  const totalAssigned = sessions.filter((s) => s.wasAssigned).length;
  const taskIds: TaskId[] = ["gonogo", "stroop", "digitspan", "nback"];
  const seq = `${String(totalAssigned + 1).padStart(4, "0")}-A`;

  // Accurate status label. "LOCAL ONLY" used to fire even when Supabase
  // was configured, which looked like a bug.
  const cloudConfigured = typeof import.meta !== "undefined" && (
    Boolean((import.meta as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL)
  );
  const cloudState = handlers.isAuthed
    ? handlers.pairedWith
      ? "PAIRED · " + handlers.pairedWith.toUpperCase()
      : "SOLO"
    : cloudConfigured
    ? "SIGNED OUT"
    : "LOCAL ONLY";

  // Prominent sign-in banner when cloud is configured and the user is
  // not signed in. The only other path is the sidebar (hidden on
  // mobile) or the topbar-btn (also small). This makes it obvious.
  const signinBanner =
    cloudConfigured && !handlers.isAuthed
      ? `<div class="signin-banner">
          <div class="body">
            <div class="label accent">AUTH REQUIRED FOR MULTI-MODE</div>
            <div class="desc">Cognitive Self-Tracking runs locally without an account. Sampling Tracker, Reflection Library, Joint Notice, Big Five, and Mirror require sign-in. Pairing happens after sign-in.</div>
          </div>
          <button class="btn" id="top-signin-btn">SIGN IN / CREATE</button>
        </div>`
      : "";

  // Lock-state label depends on why a mode is locked. "LOCKED" alone
  // doesn't tell the user what unlocks it.
  const authLock = cloudConfigured ? "SIGN IN" : "CLOUD SETUP";
  const pairLock = handlers.isAuthed ? "PAIR REQUIRED" : authLock;

  const modesMenu = `
    <section class="module">
      <div class="head">
        <div class="label">OPERATING MODES</div>
        <div class="label">${cloudState}</div>
      </div>
      <div style="display: grid; gap: 6px;">
        ${modeCard("cognitive", "COGNITIVE SELF-TRACKING", "4-task battery · assigned protocol · local-first timing-precise", true, false, undefined, true)}
        ${modeCard("sampling", "SAMPLING TRACKER", "Real-world experiments, structured debriefs, pattern surfacing", handlers.isAuthed, !handlers.isAuthed, !handlers.isAuthed ? authLock : undefined)}
        ${modeCard("reflection", "REFLECTION LIBRARY", "Structured self-reflection archive + IPIP-NEO-120 Big Five", handlers.isAuthed, !handlers.isAuthed, !handlers.isAuthed ? authLock : undefined)}
        ${modeCard("joint_notice", "JOINT NOTICE", "Weekly reciprocal noticing ritual · requires pairing", Boolean(handlers.isAuthed && handlers.pairedWith), !handlers.isAuthed || !handlers.pairedWith, !handlers.isAuthed || !handlers.pairedWith ? pairLock : undefined)}
        ${modeCard("bigfive", "BIG FIVE · IPIP-NEO-120", "Validated personality inventory, public domain, stored over time", handlers.isAuthed, !handlers.isAuthed, !handlers.isAuthed ? authLock : undefined)}
        ${modeCard("mirror", "REFLECTING MIRROR", "LLM-generated reflective reading from your own data · entertainment mode", false, true, "NOT BUILT")}
      </div>
    </section>`;

  const backupBanner = backupDue
    ? `<div class="banner warn" id="backup-banner">
        <span class="pip"></span>
        <div class="body">
          <div class="label warn">STORAGE ADVISORY</div>
          <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.85rem;">
            Local telemetry held in IndexedDB only. Export recommended to preserve the current baseline chain.
          </div>
          <div class="actions">
            <button class="btn sm amber" id="backup-now">EXPORT JSON</button>
            <button class="btn sm ghost" id="backup-dismiss">SUPPRESS</button>
          </div>
        </div>
      </div>`
    : "";

  // Protocol parameters panel per task
  const warmup =
    assignedTask === "gonogo" ? "5" :
    assignedTask === "stroop" ? "5" :
    assignedTask === "digitspan" ? "1 (per block)" :
    "10";
  const trialCount =
    assignedTask === "gonogo" ? "60 scored" :
    assignedTask === "stroop" ? "60 scored" :
    assignedTask === "digitspan" ? "2 × span" :
    "40 scored";
  const latestCards = taskIds
    .map((id) => {
      const forTask = sessions.filter((s) => s.task === id && s.wasAssigned);
      if (forTask.length === 0) return "";
      const latest = forTask[forTask.length - 1]!;
      const specs = METRIC_SPECS[id];
      const grid = renderMetricGrid(latest, forTask, specs);
      const iccLo = TASK_DEFINITIONS[id].expectedIcc[0];
      const iccHi = TASK_DEFINITIONS[id].expectedIcc[1];
      return `<div class="module">
        <div class="head">
          <div class="label">LATEST_${TASK_DEFINITIONS[id].shortName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}</div>
          <div class="label">ICC_EXPECTED ${iccLo.toFixed(2)}–${iccHi.toFixed(2)}</div>
        </div>
        ${grid}
      </div>`;
    })
    .join("");

  const body = `
    ${signinBanner}
    ${backupBanner}

    <section class="primary-action">
      <div class="body">
        <div>
          <span class="chip"><span class="mono">EST_DURATION</span> <span>${String(def.estMinutes).padStart(2, "0")}:00</span></span>
          <h2 style="margin-top: 14px">${def.name}</h2>
          <p class="desc">${def.construct}. ${def.description}</p>
          <p class="label" style="margin-top: 8px">${assignedLine}</p>
          <div class="actions">
            <button class="btn lg" id="start-btn"><span class="glyph">▶</span>INITIATE SESSION</button>
            <button class="btn ghost" id="defer-btn">DEFER</button>
          </div>
          <p class="label" style="margin-top: 18px; color: var(--on-surface-variant); letter-spacing: 0.12em;">
            ASSIGNMENT IS ALGORITHMIC. USER SELECTION INVALIDATES CONTEXT-CORRELATION ANALYSIS.
          </p>
        </div>

        <aside class="module data" style="min-width: 260px;">
          <div class="label" style="margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--outline-variant);">PROTOCOL PARAMETERS</div>
          <div class="kv-list">
            <div class="kv"><span class="k">TASK_ID</span><span class="v">${def.id.toUpperCase()}</span></div>
            <div class="kv"><span class="k">CONSTRUCT</span><span class="v">${def.construct.split(/\s+\/\s+/)[0]!.split(/\s+/)[0]!.toUpperCase()}</span></div>
            <div class="kv"><span class="k">TRIAL_CT</span><span class="v">${trialCount}</span></div>
            <div class="kv"><span class="k">WARMUP_N</span><span class="v">${warmup}</span></div>
            <div class="kv sep warn">
              <span class="k"><span class="pip"></span>CALIBRATION</span>
              <span class="v">REQ</span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    ${modesMenu}

    <section class="bento">
      <div class="module">
        <div class="head">
          <div class="label">RUN_LEDGER</div>
          <div class="label">ASSIGNED × ${totalAssigned}</div>
        </div>
        <div class="grid-metrics">
          ${taskIds
            .map((id) => {
              const n = sessions.filter((s) => s.task === id && s.wasAssigned).length;
              const last = [...sessions]
                .filter((s) => s.task === id && s.wasAssigned)
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
              const hours = last
                ? Math.round((Date.now() - new Date(last.timestamp).getTime()) / 3600000)
                : null;
              const hoursStr = hours === null ? "—" : hours < 24 ? `${hours}H` : `${Math.round(hours / 24)}D`;
              const isAssigned = id === assignedTask;
              return `<div class="cell ${isAssigned ? "amber" : ""}">
                <span class="k">${TASK_DEFINITIONS[id].shortName.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}</span>
                <span class="v ${isAssigned ? "amber" : "plain"}">${String(n).padStart(2, "0")}</span>
                <span class="delta">T-${hoursStr}</span>
              </div>`;
            })
            .join("")}
        </div>
      </div>

      <div class="module">
        <div class="head">
          <div class="label">ENV_CONSTRAINTS</div>
          <div class="label">ADVISORY</div>
        </div>
        <div class="kv-list">
          <div class="kv"><span class="k">QUIET ROOM</span><span class="v">USER_VERIFY</span></div>
          <div class="kv"><span class="k">SAME DEVICE</span><span class="v">USER_VERIFY</span></div>
          <div class="kv"><span class="k">SAME HAND</span><span class="v">USER_VERIFY</span></div>
          <div class="kv warn"><span class="k"><span class="pip"></span>ANCHOR HABIT</span><span class="v">SET IN DOC</span></div>
        </div>
      </div>
    </section>

    ${latestCards}

    <section class="bento">
      <div class="module">
        <div class="head">
          <div class="label">DATA EXPLORATION</div>
        </div>
        <div class="actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn ghost" id="raw-plot-btn">RAW DATA PLOT</button>
          <button class="btn ghost" id="adv-btn">MANUAL PICKER</button>
        </div>
        <p class="label" style="margin-top: 14px; color: var(--on-surface-variant); letter-spacing: 0.1em;">
          MANUAL PICKS FLAGGED <span class="mono">wasAssigned=false</span>. EXCLUDED FROM PRIMARY ANALYSIS.
        </p>
      </div>

      <div class="module">
        <div class="head">
          <div class="label">DATA OPERATIONS</div>
        </div>
        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn ghost" id="export-btn">EXPORT JSON</button>
          <button class="btn ghost" id="wipe-btn" style="color: var(--tertiary);">PURGE ALL SESSIONS</button>
        </div>
        <p class="label" style="margin-top: 14px; color: var(--on-surface-variant); letter-spacing: 0.1em;">
          STORED ON-DEVICE. ORIGIN <span class="mono">${location.host}</span>.
        </p>
      </div>
    </section>
  `;

  container.innerHTML = shellHtml({
    active: "home",
    title: "SESSION_STATUS",
    seqId: seq,
    statusLabel: "SYSTEM READY",
    body,
    metaRight: { key: "SEQ_ID", value: seq },
  });

  // Wire up mode cards (per-view, since these are home-specific actions).
  // Sidenav / topbar / cta-cap nav buttons are wired at the document
  // level by installNavDelegate() in main.ts.
  container.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode;
      if (m === "cognitive") {
        handlers.onStartAssigned();
      } else if (handlers.onOpenMode && (m === "sampling" || m === "reflection" || m === "joint_notice" || m === "mirror" || m === "bigfive")) {
        handlers.onOpenMode(m);
      }
    });
  });

  // Prominent sign-in CTA when it's rendered
  const topSigninBtn = container.querySelector<HTMLButtonElement>("#top-signin-btn");
  if (topSigninBtn) topSigninBtn.addEventListener("click", handlers.onOpenAccount);

  // Wire up
  container.querySelector<HTMLButtonElement>("#start-btn")!.addEventListener("click", handlers.onStartAssigned);
  container.querySelector<HTMLButtonElement>("#defer-btn")!.addEventListener("click", handlers.onDefer);
  container.querySelector<HTMLButtonElement>("#raw-plot-btn")!.addEventListener("click", handlers.onShowRawPlot);
  container.querySelector<HTMLButtonElement>("#adv-btn")!.addEventListener("click", handlers.onShowAdvanced);
  container.querySelector<HTMLButtonElement>("#export-btn")!.addEventListener("click", handlers.onExport);
  container.querySelector<HTMLButtonElement>("#wipe-btn")!.addEventListener("click", handlers.onWipe);

  const cta = container.querySelector<HTMLButtonElement>(".cta-cap");
  if (cta) cta.addEventListener("click", handlers.onStartAssigned);

  // Nav items are handled by the document-level delegate in main.ts.

  if (backupDue) {
    container.querySelector<HTMLButtonElement>("#backup-now")!.addEventListener("click", handlers.onExport);
    container.querySelector<HTMLButtonElement>("#backup-dismiss")!.addEventListener("click", handlers.onDismissBackup);
  }
}

function renderMetricGrid(
  current: Session,
  allForTask: Session[],
  specs: MetricSpec[],
): string {
  const cells = specs
    .map((spec) => {
      const priorValues = allForTask
        .filter((s) => s.id !== current.id)
        .map((s) => spec.extract(s as never));
      const currentValue = spec.extract(current as never);
      const pt = computeTrendPoint(priorValues, currentValue, spec.betterWhenHigher);
      const cls =
        pt.direction === "up"
          ? "up"
          : pt.direction === "down"
          ? "down"
          : pt.direction === "pending"
          ? "pending"
          : "flat";
      const amber = pt.direction === "pending";
      return `<div class="cell ${amber ? "amber" : ""}">
        <span class="k">${spec.label.toUpperCase()}</span>
        <span class="v ${amber ? "amber" : ""}">${spec.format(pt.value)}</span>
        <span class="delta ${cls}">${formatDelta(pt, spec.unit).toUpperCase()}</span>
      </div>`;
    })
    .join("");
  return `<div class="grid-metrics">${cells}</div>`;
}

/* ---------- Consent ---------- */

export function renderConsent(container: HTMLElement, onContinue: () => void): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">INSTRUMENT DISCLOSURE</div>
      <p class="lead" style="font-size: 1.02rem;">
        This instrument measures inhibitory control, interference control, short-term and working memory, and working-memory updating — on this device, over time, against your own rolling baseline.
      </p>
      <p><b style="color: var(--on-surface);">OPERATION:</b> the instrument assigns the task each session. Operator selection invalidates downstream context-correlation analysis.</p>
      <p><b style="color: var(--on-surface);">NOT A MEDICAL DEVICE.</b> Does not diagnose. Does not compare to other subjects. Does not claim generalizable cognitive improvement from training — the transfer literature is weak.</p>
      <p><b style="color: var(--on-surface);">DATA LOCALITY:</b> all telemetry retained on this device. IndexedDB, origin-scoped. Export to JSON at your discretion.</p>
      <div class="actions" style="margin-top: 20px;">
        <button class="btn lg" id="consent-ok">ACKNOWLEDGE &amp; COMMENCE</button>
      </div>
    </section>`;
  container.innerHTML = shellHtml({
    active: "home",
    title: "PRE_OPERATION",
    seqId: "0001-A",
    statusLabel: "AWAITING ACKNOWLEDGEMENT",
    body,
  });
  container
    .querySelector<HTMLButtonElement>("#consent-ok")!
    .addEventListener("click", onContinue, { once: true });
}

/* ---------- Pre-task context ---------- */

export function renderPreTaskContext(
  container: HTMLElement,
  taskId: TaskId,
  onSubmit: (partial: Partial<SessionContext>) => void,
): void {
  const now = new Date();
  const def = TASK_DEFINITIONS[taskId];
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 10px;">ASSIGNED PROTOCOL</div>
      <h2 style="margin-bottom: 4px;">${def.name}</h2>
      <p class="subtle label" style="color: var(--secondary); margin-bottom: 14px;">${def.construct}</p>
      <p>${def.description}</p>
    </section>

    <section class="module">
      <div class="label" style="margin-bottom: 14px;">CONTEXT_ENTRY · PRE-TASK (OBJECTIVE ONLY)</div>
      <p>Neutral facts only. Arousal-sensitive self-report is deferred until after the task to avoid priming attention.</p>

      <div class="segmented-block">
        <div class="label" style="color: var(--on-surface-variant);">HOURS SINCE WAKING</div>
        <div class="segmented" data-group="hoursSinceWaking">
          <button data-value="1">&lt;2</button>
          <button data-value="3">2–4</button>
          <button data-value="6">4–8</button>
          <button data-value="10">8–12</button>
          <button data-value="14">12+</button>
        </div>
      </div>

      <div class="segmented-block">
        <div class="label" style="color: var(--on-surface-variant);">HOURS SINCE MEAL</div>
        <div class="segmented" data-group="hoursSinceMeal">
          <button data-value="0.5">&lt;1</button>
          <button data-value="2">1–3</button>
          <button data-value="4">3–5</button>
          <button data-value="7">5+</button>
          <button data-value="0">N/A</button>
        </div>
      </div>

      <div class="actions" style="margin-top: 18px;">
        <button class="btn" id="ctx-go"><span class="glyph">›</span>PROCEED TO CALIBRATION</button>
      </div>
    </section>`;

  container.innerHTML = shellHtml({
    active: "home",
    title: "CONTEXT_ENTRY",
    seqId: `${taskId.slice(0, 4).toUpperCase()}-${String(now.getMinutes()).padStart(2, "0")}`,
    statusLabel: "AWAITING INPUT",
    body,
  });

  const chosen: Partial<SessionContext> = {
    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
  };

  container.querySelectorAll<HTMLElement>(".segmented").forEach((group) => {
    const key = group.getAttribute("data-group")!;
    group.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
          b.setAttribute("aria-pressed", "false"),
        );
        btn.setAttribute("aria-pressed", "true");
        const v = Number(btn.dataset.value!);
        (chosen as Record<string, unknown>)[key] = Number.isFinite(v) ? v : undefined;
      });
    });
  });

  container
    .querySelector<HTMLButtonElement>("#ctx-go")!
    .addEventListener("click", () => onSubmit(chosen), { once: true });
}

/* ---------- Post-task context ---------- */

export function renderPostTaskContext(
  container: HTMLElement,
  onSubmit: (partial: Partial<SessionContext>) => void,
): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">CONTEXT_ENTRY · POST-TASK (RETROSPECTIVE)</div>
      <p>Cast back to the moment you opened the instrument. These are the arousal-sensitive items — captured after the task to keep them from priming attention.</p>

      <div class="segmented-block">
        <div class="label" style="color: var(--on-surface-variant);">SLEEP QUALITY · LAST NIGHT</div>
        <div class="segmented" data-group="sleepQuality">
          <button data-value="low">POOR</button>
          <button data-value="med">OK</button>
          <button data-value="high">GOOD</button>
        </div>
      </div>

      <div class="segmented-block">
        <div class="label" style="color: var(--on-surface-variant);">CAFFEINE · TODAY</div>
        <div class="segmented" data-group="caffeine">
          <button data-value="none">NONE</button>
          <button data-value="some">SOME</button>
          <button data-value="lots">LOTS</button>
        </div>
      </div>

      <div class="segmented-block">
        <div class="label" style="color: var(--on-surface-variant);">STRESS @ APP_OPEN</div>
        <div class="segmented" data-group="stress">
          <button data-value="low">LOW</button>
          <button data-value="med">MED</button>
          <button data-value="high">HIGH</button>
        </div>
      </div>

      <div class="actions" style="margin-top: 18px;">
        <button class="btn" id="post-go"><span class="glyph">›</span>COMMIT SESSION</button>
      </div>
    </section>`;

  container.innerHTML = shellHtml({
    active: "home",
    title: "CONTEXT_ENTRY",
    seqId: "POST",
    statusLabel: "AWAITING INPUT",
    body,
  });

  const chosen: Partial<SessionContext> = {};
  container.querySelectorAll<HTMLElement>(".segmented").forEach((group) => {
    const key = group.getAttribute("data-group")!;
    group.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
          b.setAttribute("aria-pressed", "false"),
        );
        btn.setAttribute("aria-pressed", "true");
        (chosen as Record<string, unknown>)[key] = btn.dataset.value!;
      });
    });
  });

  container
    .querySelector<HTMLButtonElement>("#post-go")!
    .addEventListener("click", () => onSubmit(chosen), { once: true });
}

/* ---------- Instructions ---------- */

export function renderInstructions(
  container: HTMLElement,
  taskId: TaskId,
  onStart: () => void,
): void {
  const def = TASK_DEFINITIONS[taskId];
  const extra = TASK_INSTRUCTION_EXTRAS[taskId] ?? "";
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">INSTRUMENT PROTOCOL</div>
      <h2 style="margin-bottom: 6px;">${def.name}</h2>
      <p class="lead">${def.description}</p>
      ${extra}
      <p class="label" style="margin-top: 16px; color: var(--on-surface-variant); letter-spacing: 0.12em;">
        EST_DURATION ${String(def.estMinutes).padStart(2, "0")}:00 · QUIET ROOM · SAME DEVICE · SAME HAND
      </p>
      <div class="actions" style="margin-top: 18px;">
        <button class="btn lg" id="go-instr"><span class="glyph">▶</span>COMMENCE PROTOCOL</button>
      </div>
    </section>`;
  container.innerHTML = shellHtml({
    active: "home",
    title: def.shortName.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
    seqId: "RUN",
    statusLabel: "READY",
    body,
  });
  container
    .querySelector<HTMLButtonElement>("#go-instr")!
    .addEventListener("click", onStart, { once: true });
}

const TASK_INSTRUCTION_EXTRAS: Partial<Record<TaskId, string>> = {
  gonogo: `<p><span class="label accent">TRIAL_STRUCTURE</span> — 60 scored + 5 warmup dropped. 2:1 Go:No-Go.</p>`,
  stroop: `<p><span class="label accent">TRIAL_STRUCTURE</span> — 60 scored + 5 warmup dropped. Respond to the <b>ink color</b>, not the word.</p>`,
  digitspan: `<p><span class="label accent">TRIAL_STRUCTURE</span> — Forward block, then Backward block. WAIS-IV discontinue (both trials at a span fail). One unscored practice per block.</p>`,
  nback: `<p><span class="label accent">TRIAL_STRUCTURE</span> — 40 scored + 10 warmup dropped. Tap MATCH when current letter equals the one <b>two back</b>.</p>`,
};

/* ---------- Deferral prompt ---------- */

export function renderDeferralPrompt(
  container: HTMLElement,
  assignedTask: TaskId,
  onDismiss: () => void,
  onReroll: () => void,
  onPickOther: (other: TaskId) => void,
): void {
  const others: TaskId[] = (["gonogo", "stroop", "digitspan", "nback"] as const).filter(
    (t) => t !== assignedTask,
  );
  const def = TASK_DEFINITIONS[assignedTask];
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">DEFERRAL · ASSIGNMENT OVERRIDE</div>
      <p>Assigned task: <b style="color: var(--on-surface);">${def.name}</b>. The override is logged as a <code>DeferralRecord</code> with telemetry and reason so selection pressure remains observable.</p>
      <div style="display: grid; gap: 8px; margin-top: 14px;">
        <button class="btn ghost" id="dismiss">SUPPRESS · NO SESSION TODAY</button>
        <button class="btn ghost" id="reroll">RE-ROLL · ASSIGN DIFFERENT TASK</button>
      </div>
      <p class="label" style="margin-top: 16px;">MANUAL OVERRIDE (flagged <span class="mono">wasAssigned=false</span>, excluded from primary analysis)</p>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${others
          .map(
            (t) =>
              `<button class="btn ghost sm" data-task="${t}">${TASK_DEFINITIONS[t].shortName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}</button>`,
          )
          .join("")}
      </div>
    </section>`;
  container.innerHTML = shellHtml({
    active: "home",
    title: "DEFERRAL",
    seqId: assignedTask.slice(0, 4).toUpperCase(),
    statusLabel: "AWAITING DECISION",
    body,
  });
  container.querySelector<HTMLButtonElement>("#dismiss")!.addEventListener("click", onDismiss, {
    once: true,
  });
  container.querySelector<HTMLButtonElement>("#reroll")!.addEventListener("click", onReroll, {
    once: true,
  });
  container.querySelectorAll<HTMLButtonElement>("[data-task]").forEach((btn) => {
    btn.addEventListener(
      "click",
      () => onPickOther(btn.dataset.task as TaskId),
      { once: true },
    );
  });
}

/* ---------- Manual task picker ---------- */

export function renderManualPicker(
  container: HTMLElement,
  onPick: (t: TaskId) => void,
  onBack: () => void,
): void {
  const taskIds: TaskId[] = ["gonogo", "stroop", "digitspan", "nback"];
  const body = `
    <section class="banner warn">
      <span class="pip"></span>
      <div class="body">
        <div class="label warn">MANUAL OVERRIDE</div>
        <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.9rem;">
          Sessions created here are flagged <code>wasAssigned=false</code> and excluded from baseline, trend, and context-correlation computations. Use sparingly.
        </div>
      </div>
    </section>

    <section class="module">
      <div class="label" style="margin-bottom: 14px;">SELECT PROTOCOL</div>
      <div style="display: grid; gap: 8px;">
        ${taskIds
          .map((id) => {
            const d = TASK_DEFINITIONS[id];
            return `<button class="btn ghost" data-task="${id}" style="justify-content: space-between; display: flex; padding: 18px 20px;">
              <span style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-family: var(--font-body);">
                <span class="mono" style="font-size: 0.85rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--primary);">${d.name}</span>
                <span style="text-transform: none; letter-spacing: 0; color: var(--on-surface-variant); font-size: 0.8rem; font-weight: 400;">${d.construct}</span>
              </span>
              <span class="mono" style="color: var(--secondary); font-size: 0.68rem; letter-spacing: 0.16em;">${String(d.estMinutes).padStart(2, "0")}:00 ›</span>
            </button>`;
          })
          .join("")}
      </div>
      <div class="actions" style="margin-top: 18px;">
        <button class="btn ghost sm" id="back-btn">‹ BACK</button>
      </div>
    </section>`;
  container.innerHTML = shellHtml({
    active: "home",
    title: "MANUAL_PICKER",
    seqId: "OVRD",
    statusLabel: "OVERRIDE MODE",
    body,
  });
  container.querySelectorAll<HTMLButtonElement>("[data-task]").forEach((btn) => {
    btn.addEventListener("click", () => onPick(btn.dataset.task as TaskId), { once: true });
  });
  container
    .querySelector<HTMLButtonElement>("#back-btn")!
    .addEventListener("click", onBack, { once: true });
}

/* ---------- Results timeline (chronological session list) ---------- */

export function renderResultsList(
  container: HTMLElement,
  sessions: Session[],
  onSelect: (sessionId: string) => void,
): void {
  const assigned = sessions.filter((s) => s.wasAssigned);
  const manual = sessions.filter((s) => !s.wasAssigned);

  function line(s: Session): string {
    const def = TASK_DEFINITIONS[s.task];
    const when = new Date(s.timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    let summary = "";
    if (s.task === "gonogo") summary = `d' ${s.metrics.dPrime.toFixed(2)}`;
    else if (s.task === "stroop")
      summary =
        s.metrics.interferenceMs !== null
          ? `int ${s.metrics.interferenceMs.toFixed(0)} ms`
          : "—";
    else if (s.task === "digitspan")
      summary = `fwd ${s.metrics.forwardMaxSpan} / bwd ${s.metrics.backwardMaxSpan}`;
    else if (s.task === "nback") summary = `d' ${s.metrics.dPrime.toFixed(2)}`;
    const flag = s.wasAssigned
      ? ""
      : ` <span class="chip amber" style="margin-left: 6px;">MANUAL</span>`;
    return `<button class="task-card" data-session="${s.id}">
      <div>
        <div class="name">${def.shortName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}${flag}</div>
        <div class="construct">${when} · ${summary}</div>
      </div>
      <div class="label">›</div>
    </button>`;
  }

  const body = `
    <section class="module">
      <div class="head">
        <div class="label">ASSIGNED SESSIONS</div>
        <div class="label">N=${String(assigned.length).padStart(3, "0")}</div>
      </div>
      ${
        assigned.length === 0
          ? `<p class="label" style="color: var(--on-surface-variant);">NO ASSIGNED SESSIONS YET. RUN ONE FROM HOME.</p>`
          : `<div style="display: grid; gap: 4px;">${[...assigned].reverse().map(line).join("")}</div>`
      }
    </section>

    ${
      manual.length
        ? `<section class="module">
            <div class="head">
              <div class="label">MANUAL-PICK SESSIONS</div>
              <div class="label">N=${String(manual.length).padStart(3, "0")}</div>
            </div>
            <p class="label" style="color: var(--on-surface-variant); margin-bottom: 10px;">Flagged <code>wasAssigned=false</code>. Excluded from primary analysis but inspectable here.</p>
            <div style="display: grid; gap: 4px;">${[...manual].reverse().map(line).join("")}</div>
          </section>`
        : ""
    }`;

  container.innerHTML = shellHtml({
    active: "results",
    title: "RESULTS",
    seqId: "ALL",
    statusLabel: "SESSION TIMELINE",
    body,
  });

  container.querySelectorAll<HTMLButtonElement>("[data-session]").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.session!));
  });
}

/* ---------- Methodology (in-app summary of commitments) ---------- */

export function renderMethodologyView(container: HTMLElement): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">INSTRUMENT COMMITMENTS</div>
      <p>Summary of the rules this instrument is pre-committed to. Changing any of them mid-collection invalidates the baseline. The full document lives in the repo at <code>tasks/methodology.md</code>.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">01 · TASK ASSIGNMENT</div></div>
      <p>App assigns the task each session. Rule: least-recently-run, random tiebreak. Deferrals logged as <code>DeferralRecord</code> with telemetry. Manual picks flagged <code>wasAssigned=false</code> and excluded from primary analysis.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">02 · CONTEXT CAPTURE</div></div>
      <p>Objective items (hours since waking, hours since meal, auto telemetry) before the task. Arousal-sensitive items (sleep, caffeine, stress) retrospectively after. Committed. Do not re-order.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">03 · DEVICE FINGERPRINT</div></div>
      <p><code>stableHash</code> covers screen, DPR, refresh, <code>hardwareConcurrency</code>, <code>deviceMemory</code>. Baseline restarts when this changes. <code>fullHash</code> includes user-agent for forensics only — iOS / Chrome minor updates don't invalidate your data.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">04 · PER-TASK WARMUP</div></div>
      <div class="kv-list">
        <div class="kv"><span class="k">GO/NO-GO</span><span class="v">5 TRIALS</span></div>
        <div class="kv"><span class="k">STROOP</span><span class="v">5 TRIALS</span></div>
        <div class="kv"><span class="k">DIGIT SPAN</span><span class="v">1 PRACTICE / BLOCK</span></div>
        <div class="kv"><span class="k">N-BACK</span><span class="v">10 TRIALS</span></div>
      </div>
    </section>

    <section class="module">
      <div class="head"><div class="label">05 · N THRESHOLDS</div></div>
      <div class="kv-list">
        <div class="kv"><span class="k">FIRST DELTA</span><span class="v">N ≥ 3 / TASK</span></div>
        <div class="kv"><span class="k">ICC CHECK</span><span class="v">N ≥ 30 / TASK</span></div>
        <div class="kv"><span class="k">HYPOTHESIS TEST</span><span class="v">N ≥ 50 / TASK</span></div>
      </div>
    </section>

    <section class="module">
      <div class="head"><div class="label">06 · EXPECTED ICC (HEDGE-POWELL 2018)</div></div>
      <div class="kv-list">
        <div class="kv"><span class="k">GO/NO-GO D'</span><span class="v">0.55 – 0.70</span></div>
        <div class="kv warn"><span class="k">STROOP INTERFERENCE</span><span class="v">0.30 – 0.50</span></div>
        <div class="kv"><span class="k">DIGIT SPAN</span><span class="v">0.65 – 0.80</span></div>
        <div class="kv"><span class="k">N-BACK D'</span><span class="v">0.50 – 0.70</span></div>
      </div>
      <p class="label warn" style="margin-top: 10px;">STROOP INTERFERENCE IS A DIFFERENCE SCORE — INDIVIDUAL-LEVEL DELTAS MAY BE UNRELIABLE REGARDLESS OF N.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">07 · PRE-REGISTERED HYPOTHESES</div></div>
      <div class="kv-list">
        <div class="kv"><span class="k">H1</span><span class="v">SLEEP → GO/NO-GO D' (+)</span></div>
        <div class="kv"><span class="k">H2</span><span class="v">HRS-WAKE → N-BACK D' (−)</span></div>
        <div class="kv"><span class="k">H3</span><span class="v">CAFFEINE → GO/NO-GO RT (−)</span></div>
        <div class="kv"><span class="k">H4</span><span class="v">STRESS → STROOP INTERFERENCE (+)</span></div>
        <div class="kv"><span class="k">H5</span><span class="v">CIRCADIAN → DIGIT SPAN FWD</span></div>
      </div>
      <p class="label" style="margin-top: 10px; color: var(--on-surface-variant);">α = 0.01 EACH. ADDING HYPOTHESES AFTER COLLECTION STARTS IS NOT ALLOWED.</p>
    </section>

    <section class="module">
      <div class="head"><div class="label">08 · STOP CONDITIONS</div></div>
      <ul style="font-family: var(--font-body); color: var(--on-surface-variant); padding-left: 18px; line-height: 1.6; margin: 0;">
        <li>Hard stop at 60 assigned sessions if no plateau on ≥ 2 tasks.</li>
        <li>Soft stop at 6 months if compliance &lt; 40%.</li>
        <li>Catastrophic data loss stop — do not restart.</li>
        <li>Tool-instability stop if CPU-benchmark compromised for 60+ days.</li>
      </ul>
    </section>

    <section class="module">
      <div class="head"><div class="label">09 · CROSS-USER ISOLATION</div></div>
      <p>Cognitive scores and Mirror readings never leave the self-only silo. No share policy exists for either. This is a structural firewall, not a UI choice.</p>
    </section>`;

  container.innerHTML = shellHtml({
    active: "methodology",
    title: "METHODOLOGY",
    seqId: "DOC",
    statusLabel: "READ-ONLY · COMMITTED",
    body,
  });
}

/* ---------- Single-session result detail (post-task) ---------- */

export function renderResults(
  container: HTMLElement,
  session: Session,
  allForTask: Session[],
  onDone: () => void,
): void {
  const def = TASK_DEFINITIONS[session.task];
  const specs = METRIC_SPECS[session.task];
  const assignedCount = allForTask.filter((s) => s.wasAssigned).length;
  const grid = renderMetricGrid(
    session,
    allForTask.filter((s) => s.wasAssigned),
    specs,
  );
  const calib = session.calibration;
  const tel = session.telemetry;

  const manualFlag = session.wasAssigned
    ? ""
    : `<section class="banner warn" style="margin-bottom: 14px;">
        <span class="pip"></span>
        <div class="body">
          <div class="label warn">MANUAL OVERRIDE SESSION</div>
          <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.9rem;">
            Flagged <code>wasAssigned=false</code>. Excluded from baseline, trend, and context-correlation computations.
          </div>
        </div>
      </section>`;

  const calibrationBelowBaseline =
    assignedCount < MIN_BASELINE_SESSIONS
      ? `<section class="banner warn">
          <span class="pip"></span>
          <div class="body">
            <div class="label warn">CALIBRATION PHASE</div>
            <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.9rem;">
              ${MIN_BASELINE_SESSIONS - assignedCount} more assigned session${MIN_BASELINE_SESSIONS - assignedCount === 1 ? "" : "s"} required before baseline deltas report.
              Rolling window ${BASELINE_WINDOW}. ICC expected ${def.expectedIcc[0]}–${def.expectedIcc[1]} for this protocol.
            </div>
          </div>
        </section>`
      : "";

  const body = `
    ${manualFlag}
    ${calibrationBelowBaseline}

    <section class="module">
      <div class="head">
        <div class="label">ASSESSMENT RESULTS · ${def.name.toUpperCase()}</div>
        <div class="label">N_ASSIGNED ${String(assignedCount).padStart(3, "0")}</div>
      </div>
      ${grid}
    </section>

    <section class="module">
      <div class="head">
        <div class="label">SESSION TELEMETRY</div>
        <div class="label">T ${new Date(session.timestamp).toISOString().slice(0, 19).replace("T", " ")}Z</div>
      </div>
      <div class="grid-metrics">
        <div class="cell">
          <span class="k">REFRESH_HZ</span>
          <span class="v plain">${calib.fingerprint.refreshRateHz}</span>
          <span class="delta">FRAME ${calib.frameMs.toFixed(2)} MS</span>
        </div>
        <div class="cell">
          <span class="k">BASELINE_TAP</span>
          <span class="v plain">${calib.baselineTapMedianMs.toFixed(0)}<span style="font-size: 0.6em; color: var(--secondary); margin-left: 4px;">MS</span></span>
          <span class="delta">IQR ${calib.baselineTapIqrMs.toFixed(0)} MS</span>
        </div>
        <div class="cell">
          <span class="k">CPU_BENCH</span>
          <span class="v plain">${tel.cpuBenchmarkMs.toFixed(1)}<span style="font-size: 0.6em; color: var(--secondary); margin-left: 4px;">MS</span></span>
          <span class="delta">CORES ${tel.hardwareConcurrency ?? "?"}</span>
        </div>
        <div class="cell">
          <span class="k">BATTERY</span>
          <span class="v plain">${tel.batteryLevel !== null ? Math.round(tel.batteryLevel * 100) + "%" : "N/A"}</span>
          <span class="delta">${tel.batteryCharging ? "CHARGING" : "DISCHARGING"}</span>
        </div>
      </div>
      <p class="label" style="margin-top: 12px; color: var(--on-surface-variant); letter-spacing: 0.1em;">
        Device-adjusted RT subtracts the session baseline-tap median. Motor latency rises slightly under cognitive load, so the subtracted value understates the cognitive component by a few ms.
      </p>
    </section>

    <div class="actions" style="margin-top: 4px;">
      <button class="btn" id="done-btn">‹ RETURN TO SESSION_STATUS</button>
    </div>
  `;

  container.innerHTML = shellHtml({
    active: "results",
    title: "ASSESSMENT_RESULTS",
    seqId: `${def.shortName.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${String(assignedCount).padStart(3, "0")}`,
    statusLabel: "SESSION COMPLETE",
    body,
  });
  container
    .querySelector<HTMLButtonElement>("#done-btn")!
    .addEventListener("click", onDone, { once: true });
}

/* ---------- Utility export ---------- */

export { shellHtml, shortSeqId };

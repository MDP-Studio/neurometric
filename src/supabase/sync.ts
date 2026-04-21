/**
 * Cognitive-session sync (local ↔ cloud).
 *
 * Local-first remains authoritative for timing precision. Never call
 * network from inside a task trial loop. After a session is written to
 * IndexedDB, this module best-effort mirrors it to Supabase.
 *
 * Conflict policy: server is a mirror. If a session with the same id
 * already exists server-side, the local record wins (upsert by id).
 * This keeps the client source-of-truth and makes "I used it offline"
 * work transparently.
 */

import { getSupabase } from "./client";
import { getUser } from "./auth";
import { listSessions, listDeferrals } from "../storage";
import type { Session } from "../types";

function sessionToRow(s: Session, userId: string): Record<string, unknown> {
  return {
    id: s.id,
    user_id: userId,
    task: s.task,
    timestamp: s.timestamp,
    schema_version: s.schemaVersion,
    was_assigned: s.wasAssigned,
    calibration_json: s.calibration,
    telemetry_json: s.telemetry,
    context_json: s.context,
    trials_json: s.trials,
    metrics_json: s.metrics,
    imported_from_local: false,
  };
}

export async function syncSession(session: Session): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  const me = await getUser();
  if (!me) return;
  const row = sessionToRow(session, me.id);
  const { error } = await s.from("cognitive_sessions").upsert(row, { onConflict: "id" });
  if (error) console.warn("sync session failed", error.message);
}

export async function syncAllLocalToCloud(): Promise<{ synced: number; skipped: number }> {
  const s = getSupabase();
  if (!s) return { synced: 0, skipped: 0 };
  const me = await getUser();
  if (!me) return { synced: 0, skipped: 0 };

  let synced = 0;
  let skipped = 0;
  const sessions = await listSessions();
  for (const session of sessions) {
    const row = sessionToRow(session, me.id);
    const { error } = await s.from("cognitive_sessions").upsert(row, { onConflict: "id" });
    if (error) {
      skipped++;
    } else {
      synced++;
    }
  }
  const deferrals = await listDeferrals();
  for (const d of deferrals) {
    const row = {
      id: d.id,
      user_id: me.id,
      timestamp: d.timestamp,
      assigned_task: d.assignedTask,
      chosen_instead: d.chosenInstead,
      reason: d.reason,
      telemetry_json: d.telemetry,
    };
    const { error } = await s.from("cognitive_deferrals").upsert(row, { onConflict: "id" });
    if (error) skipped++;
    else synced++;
  }
  return { synced, skipped };
}

/**
 * Account operations: export everything, delete everything.
 *
 * Export: pulls every table the user has rows in, plus the local
 * IndexedDB cognitive archive, and returns a single JSON blob.
 *
 * Delete: revokes all pairings, calls the server-side delete_my_account
 * RPC, then signs out. Supabase does not expose auth.admin.deleteUser()
 * from the anon client — for full auth-row removal you need a server
 * edge function. That's documented in the deployment doc. For now,
 * delete_my_account() purges all user-owned rows, which is the bit
 * that actually contains personal data.
 */

import { getSupabase } from "./client";
import { getUser, signOut } from "./auth";
import { listPairings, revokePairing } from "./pairing";
import { exportAll as exportLocal } from "../storage";

export async function exportEverything(): Promise<string> {
  const s = getSupabase();
  const me = await getUser();
  const local = await exportLocal();
  const localParsed = JSON.parse(local);

  let remote: Record<string, unknown> = {};
  if (s && me) {
    const tables = [
      "profiles",
      "pairings",
      "sample_categories",
      "samples",
      "sample_debriefs",
      "sample_followups",
      "sample_shares",
      "reflections",
      "reflection_prompts",
      "reflection_shares",
      "big_five_results",
      "big_five_shares",
      "mirror_readings",
      "joint_notice_rounds",
      "joint_notice_entries",
      "cognitive_sessions",
      "cognitive_deferrals",
    ];
    for (const t of tables) {
      const { data, error } = await s.from(t).select("*");
      if (!error) remote[t] = data ?? [];
    }
  }

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      user: me ? { id: me.id, email: me.email } : null,
      remote,
      local: localParsed,
    },
    null,
    2,
  );
}

export async function deleteAccount(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Not signed in." };

  // 1. Revoke all pairings first (symmetric relationships shouldn't orphan).
  const pairings = await listPairings();
  for (const p of pairings) {
    if (p.status === "active" || p.status === "pending") {
      await revokePairing(p.id);
    }
  }

  // 2. Call the RPC that purges all owned rows.
  const { error } = await s.rpc("delete_my_account");
  if (error) return { ok: false, error: error.message };

  // 3. Sign out locally.
  await signOut();
  return { ok: true };
}

export function downloadExport(json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `monolith-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

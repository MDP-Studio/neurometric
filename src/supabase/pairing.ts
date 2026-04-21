/**
 * Pairing module.
 *
 * Flow:
 *   A calls createInvite() → returns an invite code.
 *   A sends the code to B out-of-band (text, signal, etc.).
 *   B calls acceptInvite(code) → the pairing becomes 'active'.
 *   Either side can call revokePairing(pairingId) at any time.
 *
 * The invite code is short and human-readable so it can be dictated.
 * Codes are only valid while the pairing is 'pending' and unique.
 *
 * Important: after pairing is active, each share (sample, reflection,
 * big_five) still requires an explicit per-item opt-in. Pairing is a
 * permission to share, not an act of sharing.
 */

import { getSupabase } from "./client";
import { getUser } from "./auth";

export type PairingStatus = "pending" | "active" | "revoked";

export interface Pairing {
  id: string;
  a_user_id: string;
  b_user_id: string | null;
  invite_code: string | null;
  status: PairingStatus;
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1
  let code = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i]! % alphabet.length];
    if (i === 3) code += "-";
  }
  return code;
}

export async function createInvite(): Promise<
  { ok: true; code: string; pairingId: string } | { ok: false; error: string }
> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Not signed in." };

  // Rotate if there is already a pending invite — revoke the old one first.
  const { data: existingPending } = await s
    .from("pairings")
    .select("id")
    .eq("a_user_id", me.id)
    .eq("status", "pending");
  if (existingPending && existingPending.length > 0) {
    await s
      .from("pairings")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: me.id })
      .in(
        "id",
        existingPending.map((p) => p.id as string),
      );
  }

  const code = generateInviteCode();
  const { data, error } = await s
    .from("pairings")
    .insert({
      a_user_id: me.id,
      b_user_id: null,
      invite_code: code,
      status: "pending",
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, code, pairingId: (data as Pairing).id };
}

export async function acceptInvite(
  code: string,
): Promise<{ ok: true; pairingId: string } | { ok: false; error: string }> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const clean = code.trim().toUpperCase();

  const { data: row, error: lookupErr } = await s
    .from("pairings")
    .select()
    .eq("invite_code", clean)
    .eq("status", "pending")
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!row) return { ok: false, error: "Invite code not found or already used." };
  if ((row as Pairing).a_user_id === me.id) {
    return { ok: false, error: "You can't accept your own invite." };
  }

  const { error: updateErr } = await s
    .from("pairings")
    .update({
      b_user_id: me.id,
      status: "active",
      activated_at: new Date().toISOString(),
      invite_code: null,
    })
    .eq("id", (row as Pairing).id);
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true, pairingId: (row as Pairing).id };
}

export async function listPairings(): Promise<Pairing[]> {
  const s = getSupabase();
  if (!s) return [];
  const me = await getUser();
  if (!me) return [];
  const { data, error } = await s
    .from("pairings")
    .select()
    .or(`a_user_id.eq.${me.id},b_user_id.eq.${me.id}`)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Pairing[]) ?? [];
}

export async function getActivePartner(): Promise<
  { pairingId: string; partnerId: string } | null
> {
  const me = await getUser();
  if (!me) return null;
  const all = await listPairings();
  for (const p of all) {
    if (p.status !== "active") continue;
    if (p.a_user_id === me.id && p.b_user_id) return { pairingId: p.id, partnerId: p.b_user_id };
    if (p.b_user_id === me.id) return { pairingId: p.id, partnerId: p.a_user_id };
  }
  return null;
}

export async function revokePairing(pairingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const { error } = await s
    .from("pairings")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: me.id,
    })
    .eq("id", pairingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

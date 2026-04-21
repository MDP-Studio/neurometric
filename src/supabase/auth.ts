/**
 * Auth module. Wraps Supabase auth with the specific flows the spec asks
 * for: email+password, magic link, sign out, session observation.
 */

import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./client";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export async function getSession(): Promise<Session | null> {
  const s = getSupabase();
  if (!s) return null;
  const { data } = await s.auth.getSession();
  return data.session ?? null;
}

export async function getUser(): Promise<User | null> {
  const s = getSupabase();
  if (!s) return null;
  const { data } = await s.auth.getUser();
  return data.user ?? null;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const { data, error } = await s.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: location.origin,
      data: { display_name: displayName },
    },
  });
  if (error) return { ok: false, error: error.message };
  if (data.user) {
    // Backfill display name on profiles (trigger creates the row, we update it).
    await s
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", data.user.id);
  }
  return { ok: true };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const { error } = await s.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signInWithMagicLink(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSupabase();
  if (!s) return { ok: false, error: "Cloud not configured." };
  const { error } = await s.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: location.origin,
      shouldCreateUser: true,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  await s.auth.signOut();
}

/** Subscribe to auth state changes. Returns unsubscribe fn. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const s = getSupabase();
  if (!s) return () => {};
  const { data } = s.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function getDisplayName(userId: string): Promise<string | null> {
  const s = getSupabase();
  if (!s) return null;
  const { data } = await s.from("profiles").select("display_name").eq("id", userId).single();
  return (data?.display_name as string | undefined) ?? null;
}

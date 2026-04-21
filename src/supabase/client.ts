/**
 * Supabase client singleton.
 *
 * Credentials are read from Vite env vars at build time:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * If these are not set, getSupabase() returns null and the app runs
 * in local-only mode — the cognitive tracker still works, but all
 * cloud-dependent modes (Sampling Tracker, Reflection Library, Joint
 * Notice, Mirror) show a "requires account" gate.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let attempted = false;

export function getSupabase(): SupabaseClient | null {
  if (attempted) return client;
  attempted = true;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    console.info("Supabase env not configured — local-only mode.");
    return null;
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}

export function hasSupabase(): boolean {
  return getSupabase() !== null;
}

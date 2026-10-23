import { createClient } from "@supabase/supabase-js";

// The publishable key is safe to ship in the browser — the database is
// protected by Row Level Security. Env vars override the defaults.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nqoejusnvfexouvoaiag.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_Eo4jnOySrujh6xscDHPoNg_uT6HoJMD";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Unique realtime channel name (avoids clashes on React StrictMode re-mounts). */
export function chanName(base: string): string {
  return base + "-" + Math.random().toString(36).slice(2, 10);
}

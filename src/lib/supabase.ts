// Supabase client for the CRM. Gated on env: with no VITE_SUPABASE_* vars the
// client is null, CRM_ENABLED is false, and the proposal builder behaves
// exactly as the local-only app it always was. Both values are publishable —
// row-level security (see supabase/schema.sql) is the real gate.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const CRM_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = CRM_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // completes the magic-link redirect
      },
    })
  : null;

/** Non-null client for code paths that only run behind the AuthGate. */
export function sb(): SupabaseClient {
  if (!supabase) throw new Error('CRM is not configured (missing VITE_SUPABASE_* env)');
  return supabase;
}

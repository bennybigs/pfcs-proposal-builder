// The red-dot lead counter. Counts contacts that need triage — every "new"
// lead plus any on-hold lead whose resurface date has arrived — and shows it
// on the CRM nav from ANYWHERE in the app (proposal pages included), so a
// fresh inquiry is visible the moment someone opens the tool.
//
// Zustand + a 60s poll instead of react-query because the app header renders
// outside the CRM's QueryClientProvider. Mutations that change lead status
// call refreshLeadBadge() directly so the dot updates instantly.
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface LeadBadgeState {
  count: number;
}

export const useLeadBadge = create<LeadBadgeState>(() => ({ count: 0 }));

let started = false;

/** Local calendar date (not UTC) — an on-hold lead resurfaces on ITS day. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function refreshLeadBadge(): Promise<void> {
  if (!supabase) return;
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    useLeadBadge.setState({ count: 0 });
    return;
  }
  // one-card model: the red dot counts Lead-stage cards that aren't archived
  // and aren't paused on hold (a hold whose callback date arrived counts again)
  const { count, error } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('stage', 'lead')
    .is('archived_at', null)
    .or(`held_until.is.null,held_until.lte.${todayIso()}`);
  // RLS quietly returns 0 rows for non-members — that renders as "no dot", correct.
  if (!error) useLeadBadge.setState({ count: count ?? 0 });
}

/** Idempotent — call from any component that renders the badge. */
export function startLeadBadge(): void {
  if (started || !supabase) return;
  started = true;
  void refreshLeadBadge();
  window.setInterval(() => void refreshLeadBadge(), 60_000);
  window.addEventListener('focus', () => void refreshLeadBadge());
  supabase.auth.onAuthStateChange(() => void refreshLeadBadge());
}

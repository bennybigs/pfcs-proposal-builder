import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { STAGE_META, type Deal, type DealStage } from '@/lib/crm/types';
import { logActivity } from './activities';
import { markCustomer, promoteLeadOnDeal } from './contacts';

export type DealInput = Partial<Omit<Deal, 'id' | 'created_at' | 'updated_at'>> & {
  contact_id: string;
  title: string;
};

export async function listDeals(): Promise<Deal[]> {
  const { data, error } = await sb().from('deals').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Deal[];
}

export async function listDealsForContact(contactId: string): Promise<Deal[]> {
  const { data, error } = await sb()
    .from('deals')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Deal[];
}

export async function createDeal(input: DealInput): Promise<Deal> {
  const stage = input.stage ?? 'lead';
  // you create it, you own it (RLS requires reps to self-assign; admins can
  // still pass assigned_to: null explicitly for the unassigned queue)
  const assigned_to =
    input.assigned_to !== undefined
      ? input.assigned_to
      : ((await sb().auth.getUser()).data.user?.email ?? null);
  const { data, error } = await sb()
    .from('deals')
    .insert({ probability: STAGE_META[stage].probability, ...input, stage, assigned_to })
    .select()
    .single();
  if (error) throw error;
  // Lead lifecycle: a team member opening a deal qualifies the lead.
  try {
    await promoteLeadOnDeal(input.contact_id);
  } catch {
    // lifecycle bookkeeping never fails the deal itself
  }
  return data as Deal;
}

/**
 * Permanent. Takes the card's activities, tasks and proposal links with it
 * (FK cascade) — the CONTACT and the proposal documents survive. Admin-only
 * in the UI; RLS allows it for admins and a rep's own cards.
 */
export async function deleteDeal(id: string): Promise<void> {
  const { error } = await sb().from('deals').delete().eq('id', id);
  if (error) throw error;
}

export async function updateDeal(id: string, patch: Partial<DealInput>): Promise<void> {
  const { error } = await sb().from('deals').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Stage moves go through here so every one updates stage_entered_at, resets
 * the default probability, and lands on the contact's timeline.
 */
export async function moveDealStage(deal: Deal, to: DealStage, lostReason?: string): Promise<void> {
  if (deal.stage === to) return;
  // probability auto-suggests from the stage, but a manual override sticks:
  // only replace it when it still equals the OLD stage's default
  const untouched = deal.probability === STAGE_META[deal.stage].probability;
  const { error } = await sb()
    .from('deals')
    .update({
      stage: to,
      stage_entered_at: new Date().toISOString(),
      probability: untouched ? STAGE_META[to].probability : deal.probability,
      lost_reason: to === 'lost' ? (lostReason ?? deal.lost_reason) : deal.lost_reason,
    })
    .eq('id', deal.id);
  if (error) throw error;
  await logActivity({
    contact_id: deal.contact_id,
    deal_id: deal.id,
    type: 'note',
    source: 'system',
    body: `Stage: ${STAGE_META[deal.stage].label} → ${STAGE_META[to].label}${to === 'lost' && lostReason ? ` — ${lostReason}` : ''}`,
  });
  // Lead lifecycle: winning makes a customer; any other move on a deal that
  // is being actively worked qualifies a lead still sitting in triage.
  try {
    if (to === 'won') await markCustomer(deal.contact_id);
    else await promoteLeadOnDeal(deal.contact_id);
  } catch {
    // never fail the stage move over lifecycle bookkeeping
  }
}

/**
 * Assignment goes through here so every change lands on the timeline and the
 * assignee's email gets flushed (the DB trigger already wrote the in-app
 * notification). assigneeName/byName are display names for the log line.
 */
export async function assignDeal(
  deal: Deal,
  toEmail: string | null,
  assigneeName: string,
  byName: string
): Promise<void> {
  if (deal.assigned_to === toEmail) return;
  const { error } = await sb().from('deals').update({ assigned_to: toEmail }).eq('id', deal.id);
  if (error) throw error;
  await logActivity({
    contact_id: deal.contact_id,
    deal_id: deal.id,
    type: 'note',
    source: 'system',
    body: toEmail ? `Assigned to ${assigneeName} by ${byName}` : `Unassigned by ${byName}`,
  });
  // fire-and-forget: deliver the notification email the trigger just queued
  void fetch('/api/notify-flush', { method: 'POST' }).catch(() => undefined);
}

// ── hooks ────────────────────────────────────────────────────────────

export function useDeals() {
  return useQuery({ queryKey: ['deals'], queryFn: listDeals });
}

export function useContactDeals(contactId: string | undefined) {
  return useQuery({
    queryKey: ['deals', 'contact', contactId],
    queryFn: () => listDealsForContact(contactId!),
    enabled: !!contactId,
  });
}

export function useDealMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
    qc.invalidateQueries({ queryKey: ['contacts'] }); // lead status may have moved
  };
  const create = useMutation({ mutationFn: createDeal, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DealInput> }) => updateDeal(id, patch),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: ({ deal, to, lostReason }: { deal: Deal; to: DealStage; lostReason?: string }) =>
      moveDealStage(deal, to, lostReason),
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: ({
      deal,
      toEmail,
      assigneeName,
      byName,
    }: {
      deal: Deal;
      toEmail: string | null;
      assigneeName: string;
      byName: string;
    }) => assignDeal(deal, toEmail, assigneeName, byName),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  return { create, update, move, assign };
}

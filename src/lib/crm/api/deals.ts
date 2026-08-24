import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { STAGE_META, type Deal, type DealStage } from '@/lib/crm/types';
import { logActivity } from './activities';

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
  const stage = input.stage ?? 'inquiry';
  const { data, error } = await sb()
    .from('deals')
    .insert({ probability: STAGE_META[stage].probability, ...input, stage })
    .select()
    .single();
  if (error) throw error;
  return data as Deal;
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
  const { error } = await sb()
    .from('deals')
    .update({
      stage: to,
      stage_entered_at: new Date().toISOString(),
      probability: STAGE_META[to].probability,
      lost_reason: to === 'lost' ? (lostReason ?? deal.lost_reason) : deal.lost_reason,
    })
    .eq('id', deal.id);
  if (error) throw error;
  await logActivity({
    contact_id: deal.contact_id,
    deal_id: deal.id,
    type: 'note',
    body: `Stage: ${STAGE_META[deal.stage].label} → ${STAGE_META[to].label}${to === 'lost' && lostReason ? ` — ${lostReason}` : ''}`,
  });
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
  return { create, update, move };
}

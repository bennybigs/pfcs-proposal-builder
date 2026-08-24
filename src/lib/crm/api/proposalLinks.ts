import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { ProposalLink } from '@/lib/crm/types';

export interface ProposalLinkInput {
  deal_id: string;
  proposal_id: string;
  title?: string;
  total?: number;
  share_url?: string | null;
}

/** Insert-or-refresh on (deal_id, proposal_id) — share/PDF events call this. */
export async function upsertProposalLink(input: ProposalLinkInput): Promise<ProposalLink> {
  const email = (await sb().auth.getUser()).data.user?.email ?? '';
  const { data, error } = await sb()
    .from('proposal_links')
    .upsert({ linked_by: email, ...input }, { onConflict: 'deal_id,proposal_id' })
    .select()
    .single();
  if (error) throw error;
  return data as ProposalLink;
}

export async function listLinksForDeals(dealIds: string[]): Promise<ProposalLink[]> {
  if (!dealIds.length) return [];
  const { data, error } = await sb()
    .from('proposal_links')
    .select('*')
    .in('deal_id', dealIds)
    .order('linked_at', { ascending: false });
  if (error) throw error;
  return data as ProposalLink[];
}

export async function unlinkProposal(dealId: string, proposalId: string): Promise<void> {
  const { error } = await sb()
    .from('proposal_links')
    .delete()
    .eq('deal_id', dealId)
    .eq('proposal_id', proposalId);
  if (error) throw error;
}

export function useDealProposalLinks(dealIds: string[]) {
  return useQuery({
    queryKey: ['proposal_links', ...[...dealIds].sort()],
    queryFn: () => listLinksForDeals(dealIds),
    enabled: dealIds.length > 0,
  });
}

export function useProposalLinkMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['proposal_links'] });
  const upsert = useMutation({ mutationFn: upsertProposalLink, onSuccess: invalidate });
  const unlink = useMutation({
    mutationFn: ({ dealId, proposalId }: { dealId: string; proposalId: string }) =>
      unlinkProposal(dealId, proposalId),
    onSuccess: invalidate,
  });
  return { upsert, unlink };
}

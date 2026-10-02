// Deleting the last proposal on a job leaves the job behind — empty, still on
// the board, looking like work that isn't there. (Ben: "the Jeff Mitchell new
// project, which I think I deleted".) After a delete we check whether the job
// is now an empty shell and offer to clear it away too.
import { supabase } from '@/lib/supabase';
import { useProposalStore } from '@/store/useProposalStore';
import type { Proposal } from '@/types';

export interface EmptyJob {
  dealId: string;
  title: string;
}

/**
 * Is this proposal's job now empty — no other paperwork, never worked, still
 * sitting at Lead? Returns the job when it is safe to offer removing it.
 */
export async function emptyJobAfterDelete(deleted: Proposal): Promise<EmptyJob | null> {
  const dealId = deleted.crm?.dealId;
  if (!dealId || !supabase) return null;
  try {
    // any other proposal still on this job (locally or on the server)?
    const localOthers = Object.values(useProposalStore.getState().proposals).filter(
      (p) => p.id !== deleted.id && !p.deletedAt && p.crm?.dealId === dealId
    );
    if (localOthers.length) return null;

    const { data: links } = await supabase
      .from('proposal_links')
      .select('proposal_id')
      .eq('deal_id', dealId);
    if ((links ?? []).some((l) => l.proposal_id !== deleted.id)) return null;

    const { data: deal } = await supabase
      .from('deals')
      .select('id, title, stage, value')
      .eq('id', dealId)
      .maybeSingle();
    const job = deal as { id: string; title: string; stage: string; value: number } | null;
    if (!job || job.stage !== 'lead' || Number(job.value) > 0) return null;

    // a job someone has actually worked (calls, notes, tasks) is not empty
    const { data: acts } = await supabase
      .from('activities')
      .select('id, source')
      .eq('deal_id', dealId)
      .eq('source', 'manual')
      .limit(1);
    if ((acts ?? []).length) return null;

    return { dealId: job.id, title: job.title };
  } catch {
    return null; // never let bookkeeping block a delete
  }
}

/** Remove the empty job and its leftovers. */
export async function removeEmptyJob(dealId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('proposal_links').delete().eq('deal_id', dealId);
  const { error } = await supabase.from('deals').delete().eq('id', dealId);
  if (error) throw error;
}

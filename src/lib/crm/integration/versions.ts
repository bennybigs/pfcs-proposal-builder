// Revise / Add option — the store makes the document, this keeps the CRM
// honest: the new version is attached to the same deal (so it shows under
// the card), a revision takes over the deal value from the version it
// replaces, and the timeline says what happened.
//
// Lives outside the CRM's QueryClientProvider (the editor uses it too), so it
// talks to supabase directly; callers inside the CRM pass onSynced to refetch.
import { supabase } from '@/lib/supabase';
import { grandTotal } from '@/lib/pricing';
import { familyLabel, linkTitle } from '@/lib/proposalFamily';
import { useProposalStore } from '@/store/useProposalStore';
import { toast } from '@/components/ui/toast';
import type { Proposal } from '@/types';

export type VersionKind = 'revision' | 'option';

async function attachToDeal(sourceId: string, copy: Proposal, kind: VersionKind): Promise<void> {
  if (!copy.crm || !supabase) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return; // signed out: the doc still syncs later; link on next edit
  const email = session.session.user.email ?? '';
  const { dealId, contactId } = copy.crm;
  const byId = useProposalStore.getState().proposals;
  const source = byId[sourceId];
  const total = Math.round(grandTotal(copy));

  const { data: srcRows } = await supabase
    .from('proposal_links')
    .select('counts_toward_value')
    .eq('deal_id', dealId)
    .eq('proposal_id', sourceId);
  const sourceCounted = Boolean(srcRows?.[0]?.counts_toward_value);

  const { error } = await supabase.from('proposal_links').upsert(
    { deal_id: dealId, proposal_id: copy.id, title: linkTitle(copy), total, linked_by: email },
    { onConflict: 'deal_id,proposal_id' }
  );
  if (error) throw error;

  // the original may have just become "Option 1" — keep its CRM title in step
  if (source) {
    await supabase
      .from('proposal_links')
      .update({ title: linkTitle(source) })
      .eq('deal_id', dealId)
      .eq('proposal_id', source.id);
  }

  // Rev B replaces Rev A, so it inherits "counts as the deal value"
  if (kind === 'revision' && sourceCounted) {
    await supabase.from('proposal_links').update({ counts_toward_value: false }).eq('deal_id', dealId);
    await supabase
      .from('proposal_links')
      .update({ counts_toward_value: true })
      .eq('deal_id', dealId)
      .eq('proposal_id', copy.id);
    await supabase.from('deals').update({ value: total }).eq('id', dealId);
  }

  await supabase.from('activities').insert({
    contact_id: contactId,
    deal_id: dealId,
    type: 'proposal_event',
    body:
      kind === 'revision'
        ? `${familyLabel(copy)} started — revising ${source?.proposalNumber ?? 'the sent proposal'}, which is kept as sent`
        : `${familyLabel(copy)} started from ${source?.proposalNumber ?? 'an existing proposal'} — an alternate for the customer to choose from`,
    logged_by: email,
  });
}

/**
 * Make the new version and wire it into the CRM. Returns the new proposal so
 * the caller can open it; CRM bookkeeping runs after and never blocks.
 */
export function createVersion(
  id: string,
  kind: VersionKind,
  onSynced?: () => void
): Proposal | undefined {
  const store = useProposalStore.getState();
  const copy = kind === 'revision' ? store.reviseProposal(id) : store.addOption(id);
  if (!copy) return undefined;
  const sourceId = copy.lineage?.from ?? id;
  toast.success(
    `${familyLabel(copy)} created`,
    kind === 'revision'
      ? 'The version you sent is kept exactly as the customer saw it.'
      : 'Both options stay open until the customer signs one.'
  );
  void attachToDeal(sourceId, copy, kind)
    .then(() => onSynced?.())
    .catch((err) =>
      toast.error(
        'Created, but not attached to the deal yet',
        err instanceof Error ? err.message : String(err)
      )
    );
  return copy;
}

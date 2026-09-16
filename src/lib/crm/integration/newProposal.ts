// Contact/deal → new proposal. Creates the proposal exactly the way the app
// does (useProposalStore.createProposal), prefills CustomerInfo through the
// one mapping function, stamps proposal.crm, and records the proposal_links
// row (share_url stays null until the first share).
import { useProposalStore } from '@/store/useProposalStore';
import { supabase } from '@/lib/supabase';
import { grandTotal } from '@/lib/pricing';
import { contactToCustomerInfo } from './mapping';
import type { Contact, Deal } from '@/lib/crm/types';

export async function createProposalForContact(
  contact: Contact,
  deal: Deal,
  templateId: string | null = null
): Promise<string> {
  const store = useProposalStore.getState();
  const proposal = store.createProposal(templateId, contact.name);
  store.updateProposal(proposal.id, {
    customer: contactToCustomerInfo(contact),
    project: { ...proposal.project, referenceName: deal.title },
    crm: { contactId: contact.id, dealId: deal.id },
  });
  if (supabase) {
    const email = (await supabase.auth.getUser()).data.user?.email ?? '';
    await supabase.from('proposal_links').upsert(
      {
        deal_id: deal.id,
        proposal_id: proposal.id,
        title: deal.title,
        total: 0,
        linked_by: email,
      },
      { onConflict: 'deal_id,proposal_id' }
    );
  }
  return proposal.id;
}

/**
 * "Copy for another customer": same cards and prices, a fresh number and
 * history, born attached to the new customer's deal like any new proposal.
 */
export async function copyProposalForContact(
  sourceId: string,
  contact: Contact,
  deal: Deal
): Promise<string> {
  const store = useProposalStore.getState();
  const copy = store.duplicateProposal(sourceId);
  if (!copy) throw new Error('The proposal to copy is not on this device.');
  store.updateProposal(copy.id, {
    customer: contactToCustomerInfo(contact),
    project: { streetAddress: '', cityStateZip: '', county: '', referenceName: deal.title },
    crm: { contactId: contact.id, dealId: deal.id },
  });
  if (supabase) {
    const email = (await supabase.auth.getUser()).data.user?.email ?? '';
    const saved = useProposalStore.getState().proposals[copy.id];
    await supabase.from('proposal_links').upsert(
      {
        deal_id: deal.id,
        proposal_id: copy.id,
        title: deal.title,
        total: Math.round(grandTotal(saved)),
        linked_by: email,
      },
      { onConflict: 'deal_id,proposal_id' }
    );
  }
  return copy.id;
}

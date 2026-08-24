// Contact/deal → new proposal. Creates the proposal exactly the way the app
// does (useProposalStore.createProposal), prefills CustomerInfo through the
// one mapping function, stamps proposal.crm, and records the proposal_links
// row (share_url stays null until the first share).
import { useProposalStore } from '@/store/useProposalStore';
import { supabase } from '@/lib/supabase';
import { contactToCustomerInfo } from './mapping';
import type { Contact, Deal } from '@/lib/crm/types';

export async function createProposalForContact(contact: Contact, deal: Deal): Promise<string> {
  const store = useProposalStore.getState();
  const proposal = store.createProposal(null, contact.name);
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

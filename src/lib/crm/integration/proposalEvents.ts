// Auto-logging: after a share link is generated or a PDF downloaded for a
// CRM-linked proposal, refresh proposal_links and drop a proposal_event on
// the contact's timeline; deals still sitting at Inquiry / Site Visit
// auto-advance to Proposal Sent.
//
// MUST never block or break sharing/PDF: fire-and-forget, all failures
// collapse into one quiet toast.
import { supabase } from '@/lib/supabase';
import { grandTotal } from '@/lib/pricing';
import { formatDollars, STAGE_META, type Deal, type DealStage } from '@/lib/crm/types';
import { toast } from '@/components/ui/toast';
import type { Proposal } from '@/types';

export function logProposalEvent(
  proposal: Proposal,
  kind: 'share' | 'pdf',
  shareUrl?: string
): void {
  if (!proposal.crm) return; // not linked — nothing to log
  void (async () => {
    try {
      if (!supabase) throw new Error('CRM not configured');
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('not signed in');
      const email = session.session.user.email ?? '';
      const { contactId, dealId } = proposal.crm!;
      const total = grandTotal(proposal);
      const title = proposal.project.referenceName || proposal.customer.fullName || proposal.proposalNumber;

      const link: Record<string, unknown> = {
        deal_id: dealId,
        proposal_id: proposal.id,
        title,
        total,
        linked_by: email,
      };
      if (shareUrl) link.share_url = shareUrl;
      const { error: linkErr } = await supabase
        .from('proposal_links')
        .upsert(link, { onConflict: 'deal_id,proposal_id' });
      if (linkErr) throw linkErr;

      const { error: actErr } = await supabase.from('activities').insert({
        contact_id: contactId,
        deal_id: dealId,
        type: 'proposal_event',
        body: `Proposal sent — ${formatDollars(total)} (${kind === 'share' ? 'share link' : 'PDF'})`,
        logged_by: email,
      });
      if (actErr) throw actErr;

      // auto-advance early-stage deals
      const { data: deal } = await supabase.from('deals').select('*').eq('id', dealId).maybeSingle();
      const d = deal as Deal | null;
      if (d && (d.stage === 'inquiry' || d.stage === 'site_visit_scheduled')) {
        const to: DealStage = 'proposal_sent';
        await supabase
          .from('deals')
          .update({ stage: to, stage_entered_at: new Date().toISOString(), probability: STAGE_META[to].probability })
          .eq('id', d.id);
        await supabase.from('activities').insert({
          contact_id: contactId,
          deal_id: dealId,
          type: 'note',
          body: `Stage: ${STAGE_META[d.stage].label} → ${STAGE_META[to].label}`,
          logged_by: email,
        });
      }
      toast.success('Logged to CRM', `Proposal sent — ${formatDollars(total)}`);
    } catch {
      toast.error('Not logged to CRM', 'The proposal itself went out fine.');
    }
  })();
}

// "New proposal" from a contact (or a specific deal). Deal resolution per the
// brief: no open deal → auto-create one at Inquiry; exactly one → use it;
// several → ask which.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { createDeal, listDealsForContact } from '@/lib/crm/api/deals';
import { createProposalForContact } from '@/lib/crm/integration/newProposal';
import { STAGE_META, formatDollars, type Contact, type Deal } from '@/lib/crm/types';

export function NewProposalButton({
  contact,
  deal,
  size = 'sm',
}: {
  contact: Contact;
  deal?: Deal; // set when launched from the deal drawer — skips resolution
  size?: 'sm' | 'default';
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Deal[] | null>(null);

  const start = async (target: Deal) => {
    try {
      const id = await createProposalForContact(contact, target);
      navigate(`/proposal/${id}`);
    } catch (err) {
      toast.error('Could not start proposal', err instanceof Error ? err.message : String(err));
    }
  };

  const go = async () => {
    if (deal) return start(deal);
    setBusy(true);
    try {
      const deals = (await listDealsForContact(contact.id)).filter(
        (d) => !['won', 'lost'].includes(d.stage)
      );
      if (deals.length === 1) return start(deals[0]);
      if (deals.length > 1) return setChoices(deals);
      const created = await createDeal({
        contact_id: contact.id,
        title: `${contact.name} — new project`,
        segment: 'other',
      });
      return start(created);
    } catch (err) {
      toast.error('Could not start proposal', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} variant="outline" onClick={go} disabled={busy}>
        <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> New proposal
      </Button>
      <Dialog open={!!choices} onOpenChange={(o) => !o && setChoices(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Which deal is this proposal for?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(choices ?? []).map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setChoices(null);
                  start(d);
                }}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-brand-gray-bg"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_META[d.stage].color}`}>
                  {STAGE_META[d.stage].label}
                </span>
                <span className="text-brand-steel">{formatDollars(d.value)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

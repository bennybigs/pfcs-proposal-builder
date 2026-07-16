import type { Proposal } from '@/types';
import { Switch } from '@/components/ui/switch';
import { grandTotal, useProposalStore } from '@/store/useProposalStore';
import { formatCurrency } from '@/lib/format';

export function GrandTotal({ proposal }: { proposal: Proposal }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const total = grandTotal(proposal);

  return (
    <div className="grand-total-block flex items-center justify-between rounded-lg bg-brand-black px-5 py-4 text-white shadow-sm">
      <div className="flex items-center gap-4">
        <span className="font-heading text-lg font-bold uppercase tracking-wide">Grand Total</span>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <Switch
            checked={proposal.showGrandTotalToCustomer}
            onCheckedChange={(v) => updateProposal(proposal.id, { showGrandTotalToCustomer: v })}
          />
          {proposal.showGrandTotalToCustomer ? 'Shown to customer' : 'Hidden from customer'}
        </label>
      </div>
      <span className="font-heading text-2xl font-bold text-brand-orange-light">
        {formatCurrency(total)}
      </span>
    </div>
  );
}

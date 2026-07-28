import type { Proposal } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useProposalStore } from '@/store/useProposalStore';
import { DEFAULT_MARKUP_LABEL, DEFAULT_TAX_RATE_PCT, proposalPricing } from '@/lib/pricing';
import { formatCurrency } from '@/lib/format';

export function GrandTotal({ proposal }: { proposal: Proposal }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const pricing = proposalPricing(proposal);
  const markupVisible = proposal.showTotalMarkupToCustomer ?? false;
  const taxEnabled = proposal.applySalesTax ?? false;

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      {/* Internal controls — never rendered for the customer */}
      <div className="space-y-3 border-b border-brand-gray-light p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="total-markup">Total markup %</Label>
            <div className="relative w-28">
              <Input
                id="total-markup"
                type="number"
                step={0.5}
                className="pr-6 text-right"
                value={proposal.totalMarkupPct ?? ''}
                onChange={(e) =>
                  updateProposal(proposal.id, {
                    totalMarkupPct: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
              <span className="absolute right-2 top-2 text-sm text-brand-steel">%</span>
            </div>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-brand-steel">
            <Switch
              checked={markupVisible}
              onCheckedChange={(v) =>
                updateProposal(proposal.id, { showTotalMarkupToCustomer: v })
              }
            />
            {markupVisible ? 'Shown as line item' : 'Hidden (folded into prices)'}
          </label>
          {markupVisible && (
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="markup-label">Line item label</Label>
              <Input
                id="markup-label"
                placeholder={DEFAULT_MARKUP_LABEL}
                value={proposal.totalMarkupLabel ?? ''}
                onChange={(e) =>
                  updateProposal(proposal.id, { totalMarkupLabel: e.target.value })
                }
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-brand-gray-bg pt-3">
          <label className="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-brand-steel">
            <Switch
              checked={taxEnabled}
              onCheckedChange={(v) =>
                updateProposal(proposal.id, {
                  applySalesTax: v,
                  ...(v && proposal.taxRatePct === undefined
                    ? { taxRatePct: DEFAULT_TAX_RATE_PCT }
                    : {}),
                })
              }
            />
            {taxEnabled ? 'Sales tax on' : 'Sales tax off'}
          </label>
          {taxEnabled && (
            <div className="space-y-1">
              <Label htmlFor="tax-rate">Tax rate %</Label>
              <div className="relative w-28">
                <Input
                  id="tax-rate"
                  type="number"
                  min={0}
                  step={0.25}
                  className="pr-6 text-right"
                  value={proposal.taxRatePct ?? DEFAULT_TAX_RATE_PCT}
                  onChange={(e) =>
                    updateProposal(proposal.id, {
                      taxRatePct: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
                <span className="absolute right-2 top-2 text-sm text-brand-steel">%</span>
              </div>
            </div>
          )}
          {taxEnabled && (
            <p className="pb-2 text-xs text-brand-steel">
              Adds {formatCurrency(pricing.taxAmount)} on {formatCurrency(pricing.preTaxTotal)} —
              shown to the customer as its own line.
            </p>
          )}
        </div>

        <p className="text-xs text-brand-steel">
          Internal breakdown: base {formatCurrency(pricing.baseTotal)}
          {pricing.subtotal !== pricing.baseTotal && (
            <> → after card markups {formatCurrency(pricing.subtotal)}</>
          )}
          {pricing.markupAmount !== 0 && (
            <>
              {' '}
              → total markup ({pricing.markupPct}%) adds {formatCurrency(pricing.markupAmount)}
            </>
          )}
          . Markups are never labeled as such to the customer unless shown as a line item.
        </p>
      </div>

      {/* Customer total */}
      <div className="grand-total-block flex items-center justify-between bg-brand-black px-5 py-4 text-white">
        <div className="flex items-center gap-4">
          <span className="font-heading text-lg font-bold uppercase tracking-wide">
            Customer Total
          </span>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <Switch
              checked={proposal.showGrandTotalToCustomer}
              onCheckedChange={(v) =>
                updateProposal(proposal.id, { showGrandTotalToCustomer: v })
              }
            />
            {proposal.showGrandTotalToCustomer ? 'Shown to customer' : 'Hidden from customer'}
          </label>
        </div>
        <span className="font-heading text-2xl font-bold text-brand-orange-light">
          {formatCurrency(pricing.total)}
        </span>
      </div>
    </div>
  );
}

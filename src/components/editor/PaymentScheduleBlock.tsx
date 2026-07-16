import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { PaymentMilestone, Proposal } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProposalStore } from '@/store/useProposalStore';
import { DEFAULT_PAYMENT_SCHEDULE } from '@/constants/defaults';

export function PaymentScheduleBlock({ proposal }: { proposal: Proposal }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const { milestones } = proposal.paymentSchedule;

  const setMilestones = (next: PaymentMilestone[], type: 'standard-30-60-10' | 'custom' = 'custom') =>
    updateProposal(proposal.id, {
      paymentSchedule: { type, milestones: next },
    });

  const pctSum = milestones.reduce((sum, m) => sum + (m.percentage || 0), 0);

  return (
    <div className="payment-block overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="section-banner flex items-center justify-between">
        <span>Payment Schedule</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-white hover:bg-white/20 hover:text-white"
            onClick={() =>
              setMilestones(
                JSON.parse(JSON.stringify(DEFAULT_PAYMENT_SCHEDULE.milestones)),
                'standard-30-60-10'
              )
            }
            title="Reset to standard 30/60/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-2 p-4">
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative w-20 shrink-0">
              <Input
                type="number"
                min={0}
                max={100}
                className="pr-6 text-right"
                value={m.percentage}
                onChange={(e) => {
                  const next = [...milestones];
                  next[i] = { ...m, percentage: Number(e.target.value) };
                  setMilestones(next);
                }}
              />
              <span className="absolute right-2 top-2 text-sm text-brand-steel">%</span>
            </div>
            <Input
              value={m.label}
              onChange={(e) => {
                const next = [...milestones];
                next[i] = { ...m, label: e.target.value };
                setMilestones(next);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-brand-steel hover:text-red-600"
              onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
              aria-label="Remove milestone"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMilestones([...milestones, { percentage: 0, label: 'New milestone' }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add milestone
          </Button>
          <span
            className={
              pctSum === 100 ? 'text-xs text-brand-steel' : 'text-xs font-semibold text-red-600'
            }
          >
            Total: {pctSum}%{pctSum !== 100 && ' — should equal 100%'}
          </span>
        </div>
      </div>
    </div>
  );
}

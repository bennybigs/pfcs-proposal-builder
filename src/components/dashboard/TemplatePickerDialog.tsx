import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SEED_PROPOSAL_TEMPLATES } from '@/constants/seedProposalTemplates';
import { useProposalStore } from '@/store/useProposalStore';

const BLANK_OPTION = {
  id: null as string | null,
  name: 'Blank Proposal',
  description: 'Start from scratch — add cards from the library as you go',
};

export function TemplatePickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createProposal = useProposalStore((s) => s.createProposal);
  const [selected, setSelected] = useState<string | null>('barndominium');
  const [customerName, setCustomerName] = useState('');

  const options = [
    ...SEED_PROPOSAL_TEMPLATES.map((t) => ({
      id: t.id as string | null,
      name: t.name,
      description: t.description,
    })),
    BLANK_OPTION,
  ];

  const handleCreate = () => {
    const proposal = createProposal(selected, customerName.trim() || 'New Customer');
    onOpenChange(false);
    setCustomerName('');
    navigate(`/proposal/${proposal.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Proposal</DialogTitle>
          <DialogDescription>
            Pick a starting template and enter the customer's name.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((opt) => (
            <button
              key={opt.id ?? 'blank'}
              type="button"
              onClick={() => setSelected(opt.id)}
              className={cn(
                'rounded-lg border-2 p-3 text-left transition-colors',
                selected === opt.id
                  ? 'border-brand-orange bg-brand-orange/5'
                  : 'border-brand-gray-light hover:border-brand-orange/40'
              )}
            >
              <div className="font-heading text-sm font-bold uppercase tracking-wide">
                {opt.name}
              </div>
              <div className="mt-1 text-xs text-brand-steel">{opt.description}</div>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-name">Customer Name</Label>
          <Input
            id="customer-name"
            placeholder="e.g., John & Jane Smith"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create Proposal</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

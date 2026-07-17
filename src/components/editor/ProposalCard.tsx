import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Eye, EyeOff, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Card } from '@/types';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProposalStore } from '@/store/useProposalStore';
import { formatCurrency } from '@/lib/format';
import { cardMarkedPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';

export function ProposalCard({
  proposalId,
  card,
  selected,
  onSelect,
}: {
  proposalId: string;
  card: Card;
  selected: boolean;
  onSelect: (cardId: string) => void;
}) {
  const updateCard = useProposalStore((s) => s.updateCard);
  const removeCard = useProposalStore((s) => s.removeCard);
  const duplicateCard = useProposalStore((s) => s.duplicateCard);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border-l-4 border-brand-orange bg-white shadow-sm transition-shadow',
        selected && 'ring-2 ring-brand-orange',
        isDragging && 'z-10 opacity-70 shadow-lg',
        !card.isEnabled && 'border-brand-gray-light opacity-50'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-brand-gray-bg px-3 py-2">
        <button
          className="cursor-grab touch-none text-brand-gray-light hover:text-brand-steel"
          {...listeners}
          {...attributes}
          aria-label={`Drag ${card.title}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Switch
          checked={card.isEnabled}
          onCheckedChange={(v) => updateCard(proposalId, card.id, { isEnabled: v })}
          aria-label="Include card in proposal"
        />
        <input
          className="min-w-0 flex-1 bg-transparent font-heading text-base font-bold uppercase tracking-wide outline-none focus:text-brand-orange"
          value={card.title}
          onChange={(e) => updateCard(proposalId, card.id, { title: e.target.value })}
        />
        {card.hasPrice && typeof card.price === 'number' && (
          <span
            className="whitespace-nowrap font-heading text-base font-bold text-brand-orange"
            title={
              (card.markupPct ?? 0) !== 0
                ? `Base ${formatCurrency(card.price)} + ${card.markupPct}% markup`
                : undefined
            }
          >
            {formatCurrency(cardMarkedPrice(card) ?? card.price)}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelect(card.id)}>
              <Pencil /> Edit content
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateCard(proposalId, card.id)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateCard(proposalId, card.id, { isEnabled: !card.isEnabled })}
            >
              {card.isEnabled ? <EyeOff /> : <Eye />}
              {card.isEnabled ? 'Disable' : 'Enable'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => removeCard(proposalId, card.id)}
            >
              <Trash2 /> Delete card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content preview — click to edit */}
      <button
        type="button"
        className="block w-full cursor-pointer px-4 py-3 text-left hover:bg-brand-gray-bg/50"
        onClick={() => onSelect(card.id)}
      >
        <Markdown className="pointer-events-none max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
          {card.content}
        </Markdown>
      </button>

      {/* Price badges row */}
      {card.hasPrice && (
        <div className="flex items-center justify-end gap-1.5 border-t border-brand-gray-bg px-3 py-1.5">
          {(card.markupPct ?? 0) !== 0 && (
            <Badge variant="outline">+{card.markupPct}% markup</Badge>
          )}
          <Badge variant={card.showPriceToCustomer ? 'default' : 'muted'}>
            {card.showPriceToCustomer ? 'Shown to customer' : 'Hidden'}
          </Badge>
          <Badge variant={card.includeInTotal ? 'default' : 'muted'}>
            {card.includeInTotal ? 'In total' : 'Not in total'}
          </Badge>
        </div>
      )}
    </div>
  );
}

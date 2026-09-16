import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useLibraryStore } from '@/store/useLibraryStore';
import { CATEGORY_META, CATEGORY_ORDER } from '@/constants/defaults';
import type { Card, CardTemplate, Proposal } from '@/types';
import { useProposalStore } from '@/store/useProposalStore';
import { familyLabel } from '@/lib/proposalFamily';
import { formatCurrency } from '@/lib/format';
import { cardMarkedPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';

function LibraryItem({
  template,
  onAdd,
}: {
  template: CardTemplate;
  onAdd: (template: CardTemplate) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${template.id}`,
    data: { templateId: template.id },
  });
  const meta = CATEGORY_META[template.category];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-sm transition-colors hover:border-brand-gray-light hover:bg-white',
        isDragging && 'opacity-40'
      )}
    >
      <button
        className="cursor-grab touch-none text-brand-gray-light group-hover:text-brand-steel"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${template.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={() => onAdd(template)}
        title={template.title}
      >
        {template.title}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={() => onAdd(template)}
        aria-label={`Add ${template.title}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function LibrarySidebar({
  onAdd,
  proposal,
  onAddCard,
}: {
  onAdd: (template: CardTemplate) => void;
  /** With these, a second tab offers cards from the customer's other proposals. */
  proposal?: Proposal;
  onAddCard?: (card: Card) => void;
}) {
  const templates = useLibraryStore((s) => s.templates);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'library' | 'theirs'>('library');
  const allProposals = useProposalStore((s) => s.proposals);

  // the customer's other proposals: same CRM contact, else same name
  const theirs = useMemo(() => {
    if (!proposal) return [];
    const name = proposal.customer.fullName.trim().toLowerCase();
    return Object.values(allProposals)
      .filter(
        (p) =>
          p.id !== proposal.id &&
          !p.deletedAt &&
          !p.pendingVersion &&
          !p.conflictOf &&
          p.cards.length > 0 &&
          (proposal.crm
            ? p.crm?.contactId === proposal.crm.contactId
            : Boolean(name) && p.customer.fullName.trim().toLowerCase() === name)
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [allProposals, proposal]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? templates.filter((t) => t.title.toLowerCase().includes(q))
      : templates;
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: filtered.filter((t) => t.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [templates, query]);

  return (
    <div className="flex h-full flex-col">
      {proposal && onAddCard && (
        <div className="flex border-b bg-white text-xs font-semibold">
          {(
            [
              ['library', 'Card library'],
              ['theirs', `Their other proposals${theirs.length ? ` (${theirs.length})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 border-b-2 px-2 py-2',
                tab === key ? 'border-brand-orange text-brand-orange' : 'border-transparent text-brand-steel'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'theirs' && proposal && onAddCard ? (
        <TheirCards proposals={theirs} current={proposal} query={query} setQuery={setQuery} onAddCard={onAddCard} />
      ) : (
      <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-brand-steel" />
          <Input
            placeholder="Search cards…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <Accordion type="multiple" defaultValue={CATEGORY_ORDER as unknown as string[]}>
          {grouped.map((group) => (
            <AccordionItem key={group.category} value={group.category}>
              <AccordionTrigger className="font-heading text-xs font-bold uppercase tracking-wider text-brand-steel">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: CATEGORY_META[group.category].color }}
                  />
                  {CATEGORY_META[group.category].label}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-0.5">
                {group.items.map((t) => (
                  <LibraryItem key={t.id} template={t} onAdd={onAdd} />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {grouped.length === 0 && (
          <p className="mt-6 text-center text-sm text-brand-steel">No cards match "{query}"</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}

/**
 * Mix and match: every card from this customer's other proposals (options,
 * earlier revisions, old quotes), with its price, one tap to pull a copy in.
 */
function TheirCards({
  proposals,
  current,
  query,
  setQuery,
  onAddCard,
}: {
  proposals: Proposal[];
  current: Proposal;
  query: string;
  setQuery: (q: string) => void;
  onAddCard: (card: Card) => void;
}) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const titles = new Set(current.cards.map((c) => c.title.trim().toLowerCase()));
  return (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-brand-steel" />
          <Input
            placeholder="Search their cards…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3 pb-6">
        {proposals.length === 0 && (
          <p className="mt-4 text-center text-sm text-brand-steel">
            {current.customer.fullName || 'This customer'} has no other proposals yet. Options and
            revisions you make will show up here.
          </p>
        )}
        {proposals.map((p) => {
          const q = query.trim().toLowerCase();
          const cards = p.cards.filter((c) => !q || c.title.toLowerCase().includes(q));
          if (!cards.length) return null;
          const label = familyLabel(p);
          return (
            <div key={p.id}>
              <div className="mb-1 font-heading text-xs font-bold uppercase tracking-wider text-brand-steel">
                {p.project.referenceName || p.proposalNumber}
                {label && <span className="ml-1 text-brand-orange">· {label}</span>}
              </div>
              <div className="space-y-0.5">
                {cards.map((c) => {
                  const price = cardMarkedPrice(c) ?? null;
                  const isAdded = added.has(c.id);
                  const already = titles.has(c.title.trim().toLowerCase());
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onAddCard(c);
                        setAdded((s) => new Set(s).add(c.id));
                      }}
                      title={already ? 'A card with this name is already in this proposal — adds another copy' : 'Add a copy of this card'}
                      className="group flex w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-left text-sm hover:border-brand-gray-light hover:bg-white"
                    >
                      {isAdded ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 shrink-0 text-brand-steel group-hover:text-brand-orange" />
                      )}
                      <span className={cn('min-w-0 flex-1 truncate', !c.isEnabled && 'text-brand-steel line-through')}>
                        {c.title}
                      </span>
                      {already && !isAdded && (
                        <span className="shrink-0 text-[10px] text-brand-steel">in this one</span>
                      )}
                      {price !== null && (
                        <span className="shrink-0 text-xs text-brand-steel">{formatCurrency(price)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

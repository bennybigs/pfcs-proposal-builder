import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, Search } from 'lucide-react';
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
import type { CardTemplate } from '@/types';
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

export function LibrarySidebar({ onAdd }: { onAdd: (template: CardTemplate) => void }) {
  const templates = useLibraryStore((s) => s.templates);
  const [query, setQuery] = useState('');

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
    </div>
  );
}

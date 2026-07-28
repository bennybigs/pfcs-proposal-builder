import { useState } from 'react';
import { Link } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import { ArrowDown, ArrowUp, Check, Copy, Save, Trash2, X } from 'lucide-react';
import type { Card } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { uuid } from '@/lib/uuid';
import { cardMarkedPrice } from '@/lib/pricing';
import { formatCurrency } from '@/lib/format';

export function CardEditorPanel({
  proposalId,
  card,
  index,
  count,
  onClose,
}: {
  proposalId: string;
  card: Card;
  index: number;
  count: number;
  onClose: () => void;
}) {
  const updateCard = useProposalStore((s) => s.updateCard);
  const removeCard = useProposalStore((s) => s.removeCard);
  const moveCard = useProposalStore((s) => s.moveCard);
  const duplicateCard = useProposalStore((s) => s.duplicateCard);
  const addTemplate = useLibraryStore((s) => s.addTemplate);
  const templates = useLibraryStore((s) => s.templates);

  const [justDuplicated, setJustDuplicated] = useState(false);
  const [justSavedTemplate, setJustSavedTemplate] = useState(false);
  const [alreadyInLibrary, setAlreadyInLibrary] = useState(false);

  const sourceTemplate = card.templateId
    ? templates.find((t) => t.id === card.templateId)
    : undefined;

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    window.setTimeout(() => setter(false), 2500);
  };

  const handleDuplicate = () => {
    duplicateCard(proposalId, card.id);
    flash(setJustDuplicated);
  };

  const saveAsTemplate = () => {
    // Guard against accidental duplicates from repeated clicks.
    const exists = templates.some(
      (t) => t.title === card.title && t.defaultContent === card.content
    );
    if (exists) {
      flash(setAlreadyInLibrary);
      return;
    }
    addTemplate({
      id: uuid(),
      category: 'custom',
      title: card.title,
      defaultContent: card.content,
    });
    flash(setJustSavedTemplate);
  };

  return (
    <div className="flex h-full flex-col" data-color-mode="light">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-heading text-sm font-bold uppercase tracking-wide text-brand-steel">
            Edit Card
          </span>
          <div className="flex items-center gap-1">
            <span className="mr-2 text-xs text-brand-steel">
              {index + 1} of {count}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              onClick={() => moveCard(proposalId, index, index - 1)}
              aria-label="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index >= count - 1}
              onClick={() => moveCard(proposalId, index, index + 1)}
              aria-label="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close editor">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="rounded-md bg-brand-gray-bg px-3 py-2 text-xs leading-relaxed text-brand-steel">
          Changes here apply to <strong>this proposal only</strong> — the library template is never
          affected.
          {sourceTemplate && (
            <>
              {' '}
              This card started from the "{sourceTemplate.title}" template; to change the template
              itself, use the{' '}
              <Link to="/library" className="font-semibold text-brand-orange underline">
                Card Library
              </Link>
              .
            </>
          )}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="card-title">Title</Label>
          <Input
            id="card-title"
            value={card.title}
            onChange={(e) => updateCard(proposalId, card.id, { title: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Content (Markdown)</Label>
          <MDEditor
            value={card.content}
            onChange={(v) => updateCard(proposalId, card.id, { content: v ?? '' })}
            height={320}
            preview="edit"
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Has price?</Label>
            <Switch
              checked={card.hasPrice}
              onCheckedChange={(v) =>
                updateCard(proposalId, card.id, {
                  hasPrice: v,
                  ...(v && card.price === undefined ? { price: 0 } : {}),
                })
              }
            />
          </div>

          {card.hasPrice && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="card-price">Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-brand-steel">$</span>
                  <Input
                    id="card-price"
                    type="number"
                    min={0}
                    step={100}
                    className="pl-7"
                    value={card.price ?? ''}
                    onChange={(e) =>
                      updateCard(proposalId, card.id, {
                        price: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-markup">Markup %</Label>
                <div className="relative">
                  <Input
                    id="card-markup"
                    type="number"
                    step={0.5}
                    className="pr-7"
                    value={card.markupPct ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      updateCard(proposalId, card.id, {
                        markupPct: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                  <span className="absolute right-3 top-2 text-sm text-brand-steel">%</span>
                </div>
                {typeof card.price === 'number' && (card.markupPct ?? 0) !== 0 && (
                  <p className="text-xs text-brand-steel">
                    Customer line price:{' '}
                    <span className="font-semibold">
                      {formatCurrency(cardMarkedPrice(card) ?? 0)}
                    </span>{' '}
                    (base {formatCurrency(card.price)})
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>Show to customer?</Label>
                <Switch
                  checked={card.showPriceToCustomer}
                  onCheckedChange={(v) =>
                    updateCard(proposalId, card.id, { showPriceToCustomer: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Include in total?</Label>
                <Switch
                  checked={card.includeInTotal}
                  onCheckedChange={(v) => updateCard(proposalId, card.id, { includeInTotal: v })}
                />
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-steel">
            This proposal only
          </div>
          <Button
            variant="outline"
            className={'w-full ' + (justDuplicated ? 'border-green-600 text-green-700' : '')}
            onClick={handleDuplicate}
          >
            {justDuplicated ? (
              <>
                <Check className="h-4 w-4" /> Copy added below this card
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Duplicate card in this proposal
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              removeCard(proposalId, card.id);
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove card from this proposal
          </Button>
          <p className="text-xs text-brand-steel">
            Removing the card here does not delete anything from the Card Library.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-steel">
            Card library
          </div>
          <Button
            variant="outline"
            className={'w-full ' + (justSavedTemplate ? 'border-green-600 text-green-700' : '')}
            onClick={saveAsTemplate}
          >
            {justSavedTemplate ? (
              <>
                <Check className="h-4 w-4" /> Saved to Card Library
              </>
            ) : alreadyInLibrary ? (
              <>
                <Check className="h-4 w-4" /> Already in the Card Library
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save this card as a new template
              </>
            )}
          </Button>
          <p className="text-xs text-brand-steel">
            Adds a copy of this card's title and content to the library (under Custom) so you can
            reuse it on future proposals. This proposal is not changed.
          </p>
        </div>
      </div>
    </div>
  );
}

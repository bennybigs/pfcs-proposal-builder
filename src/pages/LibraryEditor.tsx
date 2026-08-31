import { useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLibraryStore } from '@/store/useLibraryStore';
import { CATEGORY_META, CATEGORY_ORDER } from '@/constants/defaults';
import type { CardCategory, CardTemplate } from '@/types';
import { uuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';

export default function LibraryEditor() {
  const templates = useLibraryStore((s) => s.templates);
  const addTemplate = useLibraryStore((s) => s.addTemplate);
  const updateTemplate = useLibraryStore((s) => s.updateTemplate);
  const deleteTemplate = useLibraryStore((s) => s.deleteTemplate);
  const resetTemplates = useLibraryStore((s) => s.resetTemplates);

  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CardTemplate | null>(null);
  const selected = templates.find((t) => t.id === selectedId);

  const handleNew = () => {
    const t: CardTemplate = {
      id: uuid(),
      category: 'custom',
      title: 'New Card Template',
      defaultContent: '[Describe this section…]',
    };
    addTemplate(t);
    setSelectedId(t.id);
  };

  return (
    <div className="min-h-screen">
      <AppHeader
        right={
          <Button size="sm" onClick={handleNew} title="New template">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Template</span>
          </Button>
        }
      />

      <main className="mx-auto flex max-w-[1800px] flex-col gap-6 px-4 py-8 md:flex-row">
        {/* Template list */}
        <aside className="w-full shrink-0 md:w-72">
          <h1 className="mb-4 font-heading text-2xl font-bold uppercase tracking-wide">
            Card Library
          </h1>
          <div className="space-y-4">
            {CATEGORY_ORDER.map((cat) => {
              const items = templates.filter((t) => t.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-steel">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: CATEGORY_META[cat].color }}
                    />
                    {CATEGORY_META[cat].label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                          selectedId === t.id
                            ? 'bg-brand-orange/10 font-semibold text-brand-orange'
                            : 'hover:bg-white'
                        )}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* destructive, rare — lives at the BOTTOM, never in the header */}
          <div className="mt-8 border-t pt-4">
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 text-xs text-brand-steel hover:text-red-600"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset library to defaults…
            </button>
            <p className="mt-1 text-[11px] text-brand-steel/70">
              Replaces every template with the original PFCS set. Custom templates are lost;
              existing proposals are not touched.
            </p>
          </div>
        </aside>

        {/* Template editor */}
        <section className="min-w-0 flex-1" data-color-mode="light">
          {selected ? (
            <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={selected.title}
                    onChange={(e) => updateTemplate(selected.id, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={selected.category}
                    onValueChange={(v) =>
                      updateTemplate(selected.id, { category: v as CardCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_META[cat].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Default Content (Markdown — use [brackets] for placeholders)</Label>
                <MDEditor
                  value={selected.defaultContent}
                  onChange={(v) => updateTemplate(selected.id, { defaultContent: v ?? '' })}
                  height={380}
                  preview="live"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Suggested Price — Low ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={selected.suggestedPriceRange?.[0] ?? ''}
                    onChange={(e) => {
                      const low = e.target.value === '' ? undefined : Number(e.target.value);
                      const high = selected.suggestedPriceRange?.[1] ?? 0;
                      updateTemplate(selected.id, {
                        suggestedPriceRange: low === undefined ? undefined : [low, high],
                      });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Suggested Price — High ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={selected.suggestedPriceRange?.[1] ?? ''}
                    onChange={(e) => {
                      const high = e.target.value === '' ? undefined : Number(e.target.value);
                      const low = selected.suggestedPriceRange?.[0] ?? 0;
                      updateTemplate(selected.id, {
                        suggestedPriceRange: high === undefined ? undefined : [low, high],
                      });
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button variant="destructive" onClick={() => setConfirmDelete(selected)}>
                  <Trash2 className="h-4 w-4" /> Delete template
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-brand-gray-light bg-white p-16 text-center text-brand-steel">
              Select a template to edit, or create a new one.
            </div>
          )}
        </section>
      </main>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Library</DialogTitle>
            <DialogDescription>
              Replace all card templates with the original PFCS defaults? Custom templates and
              edits will be lost. Existing proposals are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                resetTemplates();
                setConfirmReset(false);
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Delete "{confirmDelete?.title}" from the library? Cards already added to proposals
              are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  deleteTemplate(confirmDelete.id);
                  if (selectedId === confirmDelete.id) setSelectedId(null);
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

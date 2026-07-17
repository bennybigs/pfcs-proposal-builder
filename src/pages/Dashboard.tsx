import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, FileUp, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { TemplatePickerDialog } from '@/components/dashboard/TemplatePickerDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProposalStore } from '@/store/useProposalStore';
import { grandTotal } from '@/lib/pricing';
import { STATUS_META } from '@/constants/defaults';
import { formatCurrency, formatDateUS } from '@/lib/format';
import type { Proposal } from '@/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const proposals = useProposalStore((s) => s.proposals);
  const deleteProposal = useProposalStore((s) => s.deleteProposal);
  const duplicateProposal = useProposalStore((s) => s.duplicateProposal);
  const importProposal = useProposalStore((s) => s.importProposal);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const list = Object.values(proposals).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Proposal;
      if (!parsed || !Array.isArray(parsed.cards) || !parsed.customer) {
        throw new Error('Not a valid proposal JSON file');
      }
      const imported = importProposal(parsed);
      navigate(`/proposal/${imported.id}`);
    } catch (err) {
      alert(`Could not import proposal: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader
        right={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Import JSON
            </Button>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" /> New Proposal
            </Button>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 font-heading text-3xl font-bold uppercase tracking-wide">
          Proposals
        </h1>

        {list.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-brand-gray-light bg-white p-16 text-center">
            <div className="font-heading text-xl font-bold uppercase tracking-wide text-brand-steel">
              No proposals yet
            </div>
            <p className="mt-2 text-sm text-brand-steel">
              Create your first proposal from a starter template.
            </p>
            <Button className="mt-6" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" /> New Proposal
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const status = STATUS_META[p.status] ?? STATUS_META.draft;
              return (
                <div
                  key={p.id}
                  className="group relative rounded-lg border-l-4 border-brand-orange bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <Link to={`/proposal/${p.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-brand-steel">
                        {p.proposalNumber}
                      </div>
                      <Badge className={status.className} variant="secondary">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="mt-1 font-heading text-lg font-bold uppercase tracking-wide">
                      {p.project.referenceName || 'Untitled Project'}
                    </div>
                    <div className="text-sm text-brand-steel">{p.customer.fullName}</div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-xs text-brand-steel">
                        Updated {formatDateUS(p.updatedAt)}
                      </span>
                      <span className="font-heading text-lg font-bold text-brand-orange">
                        {formatCurrency(grandTotal(p))}
                      </span>
                    </div>
                  </Link>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center">
                        <DropdownMenuItem
                          onClick={() => {
                            const copy = duplicateProposal(p.id);
                            if (copy) navigate(`/proposal/${copy.id}`);
                          }}
                        >
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <TemplatePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Proposal</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.proposalNumber} — {deleteTarget?.project.referenceName}? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteProposal(deleteTarget.id);
                setDeleteTarget(null);
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

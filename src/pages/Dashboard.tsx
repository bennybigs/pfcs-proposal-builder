import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Copy, FileSignature, GitBranchPlus, History, UserPlus, Link2 as LinkIcon, MoreHorizontal, Plus, Trash2, Undo2 } from 'lucide-react';
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
import { toast } from '@/components/ui/toast';
import { formatCurrency, formatDateUS } from '@/lib/format';
import type { Proposal } from '@/types';
import { createVersion, discardVersion, versionName } from '@/lib/crm/integration/versions';
import { familyLabel } from '@/lib/proposalFamily';
import { ConflictBanner } from '@/components/dashboard/ConflictBanner';

export default function Dashboard() {
  const navigate = useNavigate();
  const proposals = useProposalStore((s) => s.proposals);
  const deleteProposal = useProposalStore((s) => s.deleteProposal);
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const archiveProposal = useProposalStore((s) => s.archiveProposal);
  const restoreProposal = useProposalStore((s) => s.restoreProposal);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);
  const [copyTarget, setCopyTarget] = useState<Proposal | null>(null);
  const [showReplaced, setShowReplaced] = useState(false);

  // deleted proposals live on as tombstones so the deletion can sync — they
  // are never shown anywhere
  // unsaved revisions/options aren't proposals yet — they surface below as
  // "not saved" with Resume / Discard, never in the lists
  const unsaved = Object.values(proposals).filter((p) => p.pendingVersion && !p.deletedAt);
  const conflicts = Object.values(proposals).filter((p) => p.conflictOf);
  const all = Object.values(proposals)
    .filter((p) => !p.deletedAt && !p.pendingVersion && !p.conflictOf)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  // a revised proposal is represented by its newest version; the versions it
  // replaced are one tap away ("Show replaced versions"), never lost
  const replaced = all.filter((p) => p.supersededBy && !p.archivedAt);
  const active = all.filter((p) => !p.archivedAt && !p.supersededBy);
  const list = active.filter((p) => p.status !== 'contract');
  const contracts = active.filter((p) => p.status === 'contract');
  const archived = all.filter((p) => p.archivedAt);

  const renderGrid = (items: Proposal[]) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((p) => {
        const status = STATUS_META[p.status] ?? STATUS_META.draft;
        const isContract = p.status === 'contract';
        // the version chip only says something once there is more than one
        const base = p.lineage?.baseNumber ?? p.proposalNumber;
        const family = all.filter((q) => (q.lineage?.baseNumber ?? q.proposalNumber) === base);
        const label = family.length > 1 || p.versionName ? familyLabel(p) : '';
        const earlier = family.filter((q) => q.supersededBy).length;
        const openVersion = (kind: 'revision' | 'duplicate') => {
          const copy = createVersion(p.id, kind);
          if (copy) navigate(`/proposal/${copy.id}`);
        };
        return (
          <div
            key={p.id}
            className={
              'group relative rounded-lg border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ' +
              (isContract ? 'border-brand-black' : 'border-brand-orange') +
              (p.archivedAt ? ' opacity-70' : '')
            }
          >
            <Link to={`/proposal/${p.id}/versions`} className="block">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div className="text-xs font-semibold text-brand-steel">{p.proposalNumber}</div>
                <Badge className={status.className} variant="secondary">
                  {p.archivedAt
                    ? 'Archived'
                    : p.supersededBy
                      ? 'Replaced'
                      : p.notChosen
                        ? 'Not chosen'
                        : status.label}
                </Badge>
              </div>
              <div className="mt-1 font-heading text-lg font-bold uppercase tracking-wide">
                {p.project.referenceName || 'Untitled Project'}
              </div>
              <div className="text-sm text-brand-steel">{p.customer.fullName}</div>
              {label && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-brand-orange/10 px-2 py-0.5 font-semibold text-brand-orange">
                    {label}
                    {p.versionName ? ` — ${p.versionName}` : ''}
                  </span>
                  {earlier > 0 && (
                    <span className="flex items-center gap-1 text-brand-steel">
                      <History className="h-3 w-3" /> {family.length} versions
                    </span>
                  )}
                </div>
              )}
              {!p.crm && (
                <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                  <LinkIcon className="h-3 w-3" /> Not linked to a customer — open it and use
                  “Link to CRM”
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-brand-steel">Updated {formatDateUS(p.updatedAt)}</span>
                <span className="font-heading text-lg font-bold text-brand-orange">
                  {formatCurrency(grandTotal(p))}
                </span>
              </div>
            </Link>
            <div className="absolute right-2 top-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  {isContract ? (
                    <DropdownMenuItem
                      onClick={() => updateProposal(p.id, { status: 'accepted' })}
                    >
                      <Undo2 /> Move back to Proposals
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => updateProposal(p.id, { status: 'contract' })}
                    >
                      <FileSignature /> Mark as Contract
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => openVersion('revision')}>
                    <Copy /> Revise
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/proposal/${p.id}/versions`)}>
                    <GitBranchPlus /> All versions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCopyTarget(p)}>
                    <UserPlus /> Copy for another customer
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {p.archivedAt ? (
                    <DropdownMenuItem onClick={() => restoreProposal(p.id)}>
                      <Undo2 /> Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => archiveProposal(p.id)}>
                      <Archive /> Archive
                    </DropdownMenuItem>
                  )}
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
  );

  return (
    <div className="min-h-screen">
      <AppHeader
        right={
          <Button size="sm" onClick={() => setPickerOpen(true)} title="New proposal">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Proposal</span>
          </Button>
        }
      />

      <main className="mx-auto max-w-[1800px] px-4 py-8">
        <h1 className="mb-6 font-heading text-3xl font-bold uppercase tracking-wide">Proposals</h1>

        {conflicts.map((c) => (
          <ConflictBanner key={c.id} copy={c} />
        ))}

        {unsaved.map((u) => {
          const src = u.pendingVersion ? proposals[u.pendingVersion.sourceId] : undefined;
          return (
            <div
              key={u.id}
              className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-brand-orange bg-brand-orange/5 p-3 text-sm"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-orange" />
              <span className="min-w-0 flex-1">
                <strong>{versionName(u)} isn&apos;t saved</strong> —{' '}
                {u.pendingVersion?.kind === 'duplicate' ? 'a duplicate of' : 'a revision of'}{' '}
                {src?.proposalNumber ?? 'a proposal'} ({u.project.referenceName || u.customer.fullName})
              </span>
              <Button size="sm" variant="outline" onClick={() => { discardVersion(u.id); toast.success(`${versionName(u)} discarded`, 'Nothing was changed.'); }}>
                Discard
              </Button>
              <Button size="sm" onClick={() => navigate(`/proposal/${u.id}`)}>
                Resume
              </Button>
            </div>
          );
        })}

        {list.length === 0 && contracts.length === 0 ? (
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
        ) : list.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-brand-gray-light bg-white p-8 text-center text-sm text-brand-steel">
            No open proposals — everything is under contract.
          </p>
        ) : (
          renderGrid(list)
        )}

        {contracts.length > 0 && (
          <>
            <h1 className="mb-6 mt-12 font-heading text-3xl font-bold uppercase tracking-wide">
              Contracts
            </h1>
            {renderGrid(contracts)}
          </>
        )}

        {replaced.length > 0 && (
          <>
            <div className="mb-6 mt-12 flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold uppercase tracking-wide text-brand-steel">
                Replaced versions
              </h1>
              <Button variant="outline" size="sm" onClick={() => setShowReplaced(!showReplaced)}>
                {showReplaced ? 'Hide' : `Show (${replaced.length})`}
              </Button>
            </div>
            {showReplaced && renderGrid(replaced)}
          </>
        )}

        {archived.length > 0 && (
          <>
            <div className="mb-6 mt-12 flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold uppercase tracking-wide text-brand-steel">
                Archived
              </h1>
              <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide' : `Show (${archived.length})`}
              </Button>
            </div>
            {showArchived && renderGrid(archived)}
          </>
        )}
      </main>

      <TemplatePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <TemplatePickerDialog
        open={!!copyTarget}
        onOpenChange={(o) => !o && setCopyTarget(null)}
        copyFrom={copyTarget ?? undefined}
      />

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

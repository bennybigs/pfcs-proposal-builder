// Opening a proposal shows it the way the customer sees it, with every
// version of that quote listed down the left — each titled and stamped — and
// the things you can do along the top: Edit, Revise, Duplicate, Send.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Pencil, Plus, Send } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomerProposal } from '@/components/customer/CustomerProposal';
import { SendProposalDialog } from '@/components/editor/SendProposalDialog';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { createVersion } from '@/lib/crm/integration/versions';
import { logProposalEvent } from '@/lib/crm/integration/proposalEvents';
import { familyLabel, familyOf, lineageOf, versionLetter } from '@/lib/proposalFamily';
import { buildShareUrl, companySnapshot } from '@/lib/shareLink';
import { grandTotal } from '@/lib/pricing';
import { formatCurrency, formatDateUS } from '@/lib/format';
import { STATUS_META } from '@/constants/defaults';
import { cn } from '@/lib/utils';
import type { Proposal } from '@/types';

const stamp = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDateUS(iso)} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

function stateOf(p: Proposal) {
  if (p.archivedAt) return 'Archived';
  if (p.supersededBy) return 'Replaced';
  if (p.notChosen) return 'Not chosen';
  return (STATUS_META[p.status] ?? STATUS_META.draft).label;
}

export default function Versions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const proposals = useProposalStore((s) => s.proposals);
  const settings = useLibraryStore((s) => s.settings);
  const opened = id ? proposals[id] : undefined;
  const [showId, setShowId] = useState<string | undefined>(id);
  const [duplicating, setDuplicating] = useState<Proposal | null>(null);
  const [name, setName] = useState('');
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => setShowId(id), [id]);

  const shown = (showId && proposals[showId]) || opened;

  if (!opened || !shown) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-[1800px] px-4 py-10 text-center">
          <p className="text-brand-steel">That proposal isn&apos;t on this device.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to proposals
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  const versions = familyOf(Object.values(proposals), opened);
  const closed = Boolean(shown.supersededBy || shown.notChosen);
  const nextLetter = versionLetter(versions.length);

  const revise = () => {
    const copy = createVersion(shown.id, 'revision');
    if (copy) navigate(`/proposal/${copy.id}`);
  };
  const duplicate = () => {
    if (!duplicating) return;
    const copy = createVersion(duplicating.id, 'duplicate', name);
    setDuplicating(null);
    if (copy) navigate(`/proposal/${copy.id}`);
  };

  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* what you can do with the version you're looking at */}
      <div className="sticky top-16 z-30 border-b bg-white shadow-sm sm:top-20">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-4 py-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> All proposals
            </Link>
          </Button>
          <div className="mx-1 min-w-0 flex-1">
            <div className="truncate font-heading text-base font-bold uppercase tracking-wide">
              {opened.project.referenceName || 'Untitled Project'}
            </div>
            <div className="truncate text-xs text-brand-steel">
              {familyLabel(shown)}
              {shown.versionName ? ` — ${shown.versionName}` : ''} · {shown.proposalNumber} ·{' '}
              {stateOf(shown)}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/proposal/${shown.id}`)}>
            <Pencil className="h-4 w-4" /> {closed || shown.status !== 'draft' ? 'Open' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={revise}
            disabled={closed}
            title={
              closed
                ? `${familyLabel(shown)} is ${stateOf(shown).toLowerCase()} — revise the current version, or duplicate this one to work from it`
                : 'A new version that replaces this one; this one is kept as sent'
            }
          >
            <Plus className="h-4 w-4" /> Revise → Version {nextLetter}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDuplicating(shown);
              setName('');
            }}
          >
            <Copy className="h-4 w-4" /> Duplicate → Version {nextLetter}
          </Button>
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4" /> Send…
          </Button>
        </div>
      </div>

      <main className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 lg:flex-row">
        {/* the versions — titled and stamped */}
        <aside className="w-full shrink-0 lg:w-[320px]">
          <h2 className="mb-2 font-heading text-xs font-bold uppercase tracking-wider text-brand-steel">
            {versions.length} version{versions.length === 1 ? '' : 's'} of{' '}
            {lineageOf(opened).baseNumber}
          </h2>
          <div className="grid gap-2">
            {versions.map((p) => {
              const active = p.id === shown.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setShowId(p.id)}
                  className={cn(
                    'rounded-lg border-l-4 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md',
                    active ? 'border-brand-orange ring-1 ring-brand-orange' : 'border-brand-gray-light',
                    (p.supersededBy || p.notChosen) && 'opacity-70'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-sm font-bold uppercase tracking-wide">
                      {familyLabel(p)}
                    </span>
                    <Badge
                      className={(STATUS_META[p.status] ?? STATUS_META.draft).className}
                      variant="secondary"
                    >
                      {stateOf(p)}
                    </Badge>
                    <span className="ml-auto text-sm font-bold text-brand-orange">
                      {formatCurrency(grandTotal(p))}
                    </span>
                  </div>
                  {p.versionName && (
                    <div className="mt-0.5 text-sm font-medium text-brand-black">{p.versionName}</div>
                  )}
                  <div className="mt-1 grid gap-0.5 text-[11px] text-brand-steel">
                    <span>Created {stamp(p.createdAt)}</span>
                    <span>Last edited {stamp(p.updatedAt)}</span>
                    <span>{p.sentAt ? `Sent ${stamp(p.sentAt)}` : 'Not sent yet'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* the proposal itself, exactly as the customer sees it */}
        <section className="min-w-0 flex-1">
          <div className="light-scope rounded-lg bg-brand-gray-bg p-2 sm:p-4">
            <CustomerProposal proposal={shown} company={companySnapshot(settings)} />
          </div>
        </section>
      </main>

      <SendProposalDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        proposal={shown}
        settings={settings}
        buildUrl={() => buildShareUrl(shown, settings)}
        onMailApp={() => undefined}
        afterSent={(url) => logProposalEvent(shown, 'share', url)}
      />

      <Dialog open={!!duplicating} onOpenChange={(o) => !o && setDuplicating(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Duplicate {duplicating ? familyLabel(duplicating) : ''} → Version {nextLetter}
            </DialogTitle>
            <DialogDescription>
              A copy to change however you like. Both stay in this list until the customer signs
              one. Nothing is saved until you press Save in the editor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="version-name" className="text-xs text-brand-steel">
              Name this version (optional) — what makes it different
            </Label>
            <Input
              id="version-name"
              autoFocus
              value={name}
              placeholder="40x72 with lean-to"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && duplicate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicating(null)}>
              Cancel
            </Button>
            <Button onClick={duplicate}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

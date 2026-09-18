// Opening an existing proposal lands here first: every version of this quote
// in one list, each with its own dates, and the three things you can do —
// Open it, Revise it (replaces what was sent), or Duplicate it (an
// alternative alongside, with a name you give it).
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FileText, Pencil, Plus } from 'lucide-react';
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
import { useProposalStore } from '@/store/useProposalStore';
import { createVersion } from '@/lib/crm/integration/versions';
import { familyLabel, familyOf, lineageOf } from '@/lib/proposalFamily';
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

export default function Versions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const proposals = useProposalStore((s) => s.proposals);
  const current = id ? proposals[id] : undefined;
  const [duplicating, setDuplicating] = useState<Proposal | null>(null);
  const [name, setName] = useState('');

  if (!current) {
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

  const versions = familyOf(Object.values(proposals), current);
  const open = (p: Proposal) => navigate(`/proposal/${p.id}`);
  const revise = (p: Proposal) => {
    const copy = createVersion(p.id, 'revision');
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
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> All proposals
          </Link>
        </Button>
        <h1 className="mt-4 font-heading text-3xl font-bold uppercase tracking-wide">
          {current.project.referenceName || 'Untitled Project'}
        </h1>
        <p className="text-brand-steel">
          {current.customer.fullName} · {lineageOf(current).baseNumber}
        </p>
        <p className="mt-4 text-sm text-brand-steel">
          {versions.length === 1
            ? 'One version so far. Revise it to replace what you sent, or duplicate it to offer an alternative.'
            : `${versions.length} versions. Every one is kept — pick the one you want to work on.`}
        </p>

        <div className="mt-4 grid gap-3">
          {versions.map((p) => {
            const status = STATUS_META[p.status] ?? STATUS_META.draft;
            const replaced = Boolean(p.supersededBy);
            const closed = replaced || Boolean(p.notChosen);
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-lg border-l-4 bg-white p-4 shadow-sm',
                  closed ? 'border-brand-gray-light opacity-75' : 'border-brand-orange'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-brand-steel" />
                  <span className="font-heading text-lg font-bold uppercase tracking-wide">
                    {familyLabel(p)}
                  </span>
                  {p.versionName && (
                    <span className="text-sm font-medium text-brand-black">— {p.versionName}</span>
                  )}
                  <Badge className={status.className} variant="secondary">
                    {p.archivedAt
                      ? 'Archived'
                      : replaced
                        ? 'Replaced'
                        : p.notChosen
                          ? 'Not chosen'
                          : status.label}
                  </Badge>
                  <span className="ml-auto font-heading text-lg font-bold text-brand-orange">
                    {formatCurrency(grandTotal(p))}
                  </span>
                </div>

                <div className="mt-1.5 grid gap-0.5 text-xs text-brand-steel sm:grid-cols-3">
                  <span>Created {stamp(p.createdAt)}</span>
                  <span>Last edited {stamp(p.updatedAt)}</span>
                  <span>{p.sentAt ? `Sent ${stamp(p.sentAt)}` : 'Not sent yet'}</span>
                </div>
                <div className="mt-1 text-xs text-brand-steel">
                  {p.proposalNumber}
                  {replaced && ' · replaced by a newer version'}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => open(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {p.status === 'draft' && !closed ? 'Open & edit' : 'Open'}
                  </Button>
                  {!closed && (
                    <Button size="sm" variant="outline" onClick={() => revise(p)}>
                      <Plus className="h-3.5 w-3.5" /> Revise → Version{' '}
                      {String.fromCharCode(65 + versions.length)}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDuplicating(p);
                      setName('');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <Dialog open={!!duplicating} onOpenChange={(o) => !o && setDuplicating(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Duplicate {duplicating ? familyLabel(duplicating) : ''} → Version{' '}
              {String.fromCharCode(65 + versions.length)}
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

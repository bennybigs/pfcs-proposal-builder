// Opening a proposal shows it the way the customer sees it, with every
// version of that quote listed down the left — each titled and stamped — and
// the things you can do along the top: Edit, Revise, Duplicate, and the
// status control (Send / Convert to contract / Mark signed / Change order).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Pencil, Plus, Printer, ScrollText } from 'lucide-react';
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
import { StatusControl } from '@/components/proposal/StatusControl';
import { STATE_META, docState } from '@/lib/proposalStatus';
import { CancellationNotice } from '@/components/customer/CancellationNotice';
import { SendProposalDialog } from '@/components/editor/SendProposalDialog';
import { toast } from '@/components/ui/toast';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { createVersion } from '@/lib/crm/integration/versions';
import { logProposalEvent } from '@/lib/crm/integration/proposalEvents';
import {
  changeOrdersOf,
  familyLabel,
  familyOf,
  isApproved,
  lineageOf,
  versionLetter,
} from '@/lib/proposalFamily';
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
  return STATE_META[docState(p)].short;
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
  const [nocOpen, setNocOpen] = useState(false);
  const updateProposal = useProposalStore((s) => s.updateProposal);

  useEffect(() => setShowId(id), [id]);

  // printing from the cancellation dialog must not also print the page behind it
  useEffect(() => {
    document.body.classList.toggle('sheet-dialog-open', nocOpen);
    return () => document.body.classList.remove('sheet-dialog-open');
  }, [nocOpen]);

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

  const all = Object.values(proposals);
  const versions = familyOf(all, opened);
  const closed = Boolean(shown.supersededBy || shown.notChosen);
  const nextLetter = versionLetter(versions.length);
  // change orders hang off whichever version was signed
  const contract = versions.find((v) => isApproved(v)) ?? versions[versions.length - 1];
  const changeOrders = contract ? changeOrdersOf(all, contract.id) : [];
  const approvedCos = changeOrders.filter(isApproved);
  const contractTotal = contract ? Math.round(grandTotal(contract)) : 0;
  const amendedTotal = contractTotal + approvedCos.reduce((sum, co) => sum + Math.round(grandTotal(co)), 0);
  const signed = contract ? isApproved(contract) : false;
  const viewingCo = shown.kind === 'change_order';

  const revise = () => {
    const copy = createVersion(shown.id, 'revision');
    if (copy) navigate(`/proposal/${copy.id}`);
  };
  const newChangeOrder = () => {
    if (!contract) return;
    const co = createVersion(contract.id, 'change_order');
    if (co) navigate(`/proposal/${co.id}`);
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
      <div className="no-print sticky top-16 z-30 border-b bg-white shadow-sm sm:top-20">
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
              {viewingCo ? `Change order to ${shown.changeOrder?.contractNumber}` : familyLabel(shown)}
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
          <StatusControl
            proposal={shown}
            onSend={() => setSendOpen(true)}
            onPrint={() => window.print()}
            onChangeOrder={newChangeOrder}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNocOpen(true)}
            title="Two copies on one sheet — required when a sale is signed anywhere but our office"
          >
            <ScrollText className="h-4 w-4" /> Cancellation notice
          </Button>

        </div>
      </div>

      <main className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 lg:flex-row">
        {/* the versions — titled and stamped */}
        <aside className="no-print w-full shrink-0 lg:w-[320px]">
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
          {contract && (changeOrders.length > 0 || signed) && (
            <div className="mt-6">
              <h2 className="mb-2 font-heading text-xs font-bold uppercase tracking-wider text-brand-steel">
                Change orders to {contract.proposalNumber}
              </h2>
              {changeOrders.length === 0 && (
                <p className="mb-2 text-xs text-brand-steel">
                  None yet. A change order adds to or takes off the signed contract on its own
                  sheet — the contract itself never changes.
                </p>
              )}
              <div className="grid gap-2">
                {changeOrders.map((co) => {
                  const delta = Math.round(grandTotal(co));
                  const active = co.id === shown.id;
                  return (
                    <button
                      key={co.id}
                      onClick={() => setShowId(co.id)}
                      className={cn(
                        'rounded-lg border-l-4 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md',
                        active ? 'border-brand-orange ring-1 ring-brand-orange' : 'border-brand-gray-light'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-heading text-sm font-bold uppercase tracking-wide">
                          CO-{co.changeOrder?.number}
                        </span>
                        <Badge
                          className={(STATUS_META[co.status] ?? STATUS_META.draft).className}
                          variant="secondary"
                        >
                          {isApproved(co) ? 'Approved' : stateOf(co)}
                        </Badge>
                        <span className={cn('ml-auto text-sm font-bold', delta < 0 ? 'text-green-700' : 'text-brand-orange')}>
                          {delta < 0 ? `(${formatCurrency(Math.abs(delta))})` : `+${formatCurrency(delta)}`}
                        </span>
                      </div>
                      <div className="mt-1 grid gap-0.5 text-[11px] text-brand-steel">
                        <span>Created {stamp(co.createdAt)}</span>
                        <span>{co.sentAt ? `Sent ${stamp(co.sentAt)}` : 'Not sent yet'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {approvedCos.length > 0 && (
                <div className="mt-2 rounded-lg border bg-white p-3 text-sm">
                  <div className="flex items-baseline justify-between text-brand-steel">
                    <span>Contract as signed</span>
                    <span>{formatCurrency(contractTotal)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-semibold text-brand-black">
                    <span>With {approvedCos.length} approved change order{approvedCos.length === 1 ? '' : 's'}</span>
                    <span className="text-brand-orange">{formatCurrency(amendedTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* the proposal itself, exactly as the customer sees it */}
        <section className="min-w-0 flex-1">
          <div className="light-scope print-page print-sheet rounded-lg bg-brand-gray-bg p-2 sm:p-4">
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

      {/* Notice of Cancellation — its own sheet, printed when we choose to */}
      <Dialog open={nocOpen} onOpenChange={setNocOpen}>
        <DialogContent className="light-scope print-sheet max-h-[90vh] max-w-4xl overflow-y-auto bg-brand-gray-bg p-3 sm:p-6">
          <DialogTitle className="sr-only">Notice of Cancellation</DialogTitle>
          <div className="no-print mb-2 flex flex-wrap items-center gap-2 text-sm text-brand-steel">
            <span className="min-w-0 flex-1">
              Ohio requires two copies at signing when the sale happens anywhere other than our
              office. Dated from {shown.sentAt ? 'the day this went out' : "today — fill the date in by hand if you're carrying blanks"}.
            </span>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print both copies
            </Button>
          </div>
          <CancellationNotice proposal={shown} date={shown.sentAt ?? new Date().toISOString()} />
        </DialogContent>
      </Dialog>

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

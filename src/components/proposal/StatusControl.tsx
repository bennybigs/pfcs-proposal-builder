// The one control for where a document stands. The editor header and the
// preview toolbar both render this, so "Convert to contract" means the same
// thing and does the same work wherever you press it.
import { useState } from 'react';
import { Check, FileSignature, PenLine, Printer, Send, Undo2, XCircle } from 'lucide-react';
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
import { toast } from '@/components/ui/toast';
import { useProposalStore } from '@/store/useProposalStore';
import {
  ACTION_LABEL,
  STATE_META,
  docState,
  nextActions,
  stateHint,
  type DocAction,
} from '@/lib/proposalStatus';
import { familyLabel } from '@/lib/proposalFamily';
import { cn } from '@/lib/utils';
import type { Proposal } from '@/types';

const today = () => new Date().toISOString().slice(0, 10);

export function StatusPill({ proposal, className }: { proposal: Proposal; className?: string }) {
  const meta = STATE_META[docState(proposal)];
  return (
    <span
      title={stateHint(proposal)}
      className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.className, className)}
    >
      {meta.short}
    </span>
  );
}

/**
 * The pill plus the actions that belong to this state. The caller supplies
 * the two things only it can do: open its own Send dialog, and print the
 * sheet it is showing.
 */
export function StatusControl({
  proposal,
  onSend,
  onPrint,
  onChangeOrder,
  showHint = true,
}: {
  proposal: Proposal;
  onSend?: () => void;
  onPrint?: () => void;
  onChangeOrder?: () => void;
  showHint?: boolean;
}) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const [confirm, setConfirm] = useState<DocAction | null>(null);
  const [signer, setSigner] = useState('');
  const [signedOn, setSignedOn] = useState(today());

  const actions = nextActions(proposal).filter((a) => {
    if (a === 'send' || a === 'sendForSignature') return Boolean(onSend);
    if (a === 'print') return Boolean(onPrint);
    if (a === 'changeOrder') return Boolean(onChangeOrder);
    return true;
  });

  const run = (action: DocAction) => {
    switch (action) {
      case 'send':
      case 'sendForSignature':
        return onSend?.();
      case 'print':
        return onPrint?.();
      case 'changeOrder':
        return onChangeOrder?.();
      case 'convert':
      case 'markSigned':
      case 'decline':
        setSigner('');
        setSignedOn(today());
        return setConfirm(action);
      case 'reopen':
        updateProposal(proposal.id, { status: 'sent', notChosen: undefined });
        return toast.success('Reopened', 'Back with the customer.');
      case 'backToProposal':
        updateProposal(proposal.id, { status: 'sent', signedAt: undefined });
        return toast.success('Back to a proposal', 'The terms and signature lines come off again.');
    }
  };

  const doConvert = () => {
    updateProposal(proposal.id, { status: 'contract' });
    setConfirm(null);
    toast.success(
      `${proposal.proposalNumber} is now the contract`,
      'Terms and signature lines are attached — send it for signature, or print it.'
    );
  };

  const doMarkSigned = () => {
    updateProposal(proposal.id, {
      status: 'contract',
      executedAt: new Date(`${signedOn}T12:00:00`).toISOString(),
      executedBy: signer.trim() || proposal.customer.fullName,
    });
    setConfirm(null);
    toast.success('Signed', 'This is executed work now — changes go on a change order.');
  };

  const doDecline = () => {
    updateProposal(proposal.id, { status: 'declined' });
    setConfirm(null);
    toast.success('Marked declined');
  };

  const icon: Partial<Record<DocAction, React.ReactNode>> = {
    send: <Send className="h-4 w-4" />,
    sendForSignature: <PenLine className="h-4 w-4" />,
    print: <Printer className="h-4 w-4" />,
    convert: <FileSignature className="h-4 w-4" />,
    markSigned: <Check className="h-4 w-4" />,
    decline: <XCircle className="h-4 w-4" />,
    reopen: <Undo2 className="h-4 w-4" />,
    backToProposal: <Undo2 className="h-4 w-4" />,
    changeOrder: <FileSignature className="h-4 w-4" />,
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill proposal={proposal} />
        {showHint && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-brand-steel xl:block">
            {stateHint(proposal)}
          </span>
        )}
        {actions.map((a, i) => (
          <Button
            key={a}
            size="sm"
            variant={i === 0 ? 'default' : 'outline'}
            onClick={() => run(a)}
            title={
              a === 'sendForSignature'
                ? 'Email the contract — the customer signs it on the link'
                : a === 'markSigned'
                  ? 'For a contract signed on paper'
                  : undefined
            }
          >
            {icon[a]} {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>

      <Dialog open={confirm === 'convert'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert {familyLabel(proposal)} to the contract?</DialogTitle>
            <DialogDescription>
              Use this the moment the customer says yes — on the phone, by email, or on paper.
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1.5 text-sm text-brand-steel">
            <li>• The Standard Terms and Conditions attach to the document.</li>
            <li>• Signature lines appear for both parties.</li>
            <li>• You can then send it for signature, or print it and sign on paper.</li>
            <li>• Once it&apos;s signed, change orders become available.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={doConvert}>
              <FileSignature className="h-4 w-4" /> Convert to contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'markSigned'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {proposal.proposalNumber} signed</DialogTitle>
            <DialogDescription>
              For a contract signed on paper — one signed on the link records itself.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-brand-steel">Who signed</Label>
              <Input
                autoFocus
                value={signer}
                placeholder={proposal.customer.fullName}
                onChange={(e) => setSigner(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-brand-steel">Date signed</Label>
              <Input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={doMarkSigned}>
              <Check className="h-4 w-4" /> Mark signed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'decline'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {proposal.proposalNumber} declined?</DialogTitle>
            <DialogDescription>
              It stays in the list, and you can reopen it if they come back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDecline}>
              Mark declined
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Where a document stands, and what you can do next — defined once so the
// editor header, the preview toolbar and the lists all say the same thing.
//
// The life of a quote:
//   Draft      you're writing it
//   Sent       it's with the customer
//   Contract   they said yes: terms and signature lines attached, not signed yet
//   Signed     executed — signed on paper or electronically
//   Declined   they passed, or another version was chosen
//
// 'accepted' is gone from the workflow: when a customer says yes, you convert
// it to the contract. The value is still read from older documents.
import type { Proposal } from '@/types';

export type DocState = 'draft' | 'sent' | 'contract' | 'signed' | 'declined';

export const STATE_META: Record<DocState, { label: string; short: string; className: string }> = {
  draft: { label: 'Draft', short: 'Draft', className: 'bg-brand-gray-light text-brand-steel' },
  sent: { label: 'With the customer', short: 'Sent', className: 'bg-brand-orange-light/20 text-brand-orange' },
  contract: {
    label: 'Contract — awaiting signature',
    short: 'Contract',
    className: 'bg-brand-black text-brand-orange-light',
  },
  signed: { label: 'Signed', short: 'Signed', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', short: 'Declined', className: 'bg-red-100 text-red-700' },
};

export function docState(p: Proposal): DocState {
  if (p.notChosen || p.status === 'declined') return 'declined';
  if (p.executedAt) return 'signed';
  if (p.status === 'contract' || p.status === 'accepted') return 'contract';
  if (p.status === 'sent') return 'sent';
  return 'draft';
}

/** A contract (signed or not) carries the terms and the signature lines. */
export const isContractStage = (p: Proposal) => ['contract', 'signed'].includes(docState(p));

/** What this document can become next, in the order the work happens. */
export type DocAction = 'send' | 'convert' | 'sendForSignature' | 'print' | 'markSigned' | 'decline' | 'reopen' | 'backToProposal' | 'changeOrder';

export function nextActions(p: Proposal): DocAction[] {
  if (p.kind === 'change_order') {
    return docState(p) === 'signed'
      ? ['print']
      : ['sendForSignature', 'print', 'markSigned'];
  }
  switch (docState(p)) {
    case 'draft':
      return ['send', 'convert', 'print'];
    case 'sent':
      return ['convert', 'print', 'decline'];
    case 'contract':
      return ['sendForSignature', 'print', 'markSigned', 'backToProposal'];
    case 'signed':
      return ['changeOrder', 'send', 'print'];
    case 'declined':
      return ['reopen', 'print'];
  }
}

export const ACTION_LABEL: Record<DocAction, string> = {
  send: 'Send…',
  convert: 'Convert to contract',
  sendForSignature: 'Send for signature',
  print: 'Print',
  markSigned: 'Mark as signed',
  decline: 'Mark declined',
  reopen: 'Reopen',
  backToProposal: 'Back to proposal',
  changeOrder: 'Change order',
};

/** One line telling you what this state means and what happens next. */
export function stateHint(p: Proposal): string {
  switch (docState(p)) {
    case 'draft':
      return 'Not sent yet. Nothing here is visible to the customer.';
    case 'sent':
      return 'With the customer. When they say yes — on the phone, by email, or on paper — convert it to the contract.';
    case 'contract':
      return 'Terms and signature lines are attached. Send it for signature, or print it, sign on paper, and mark it signed.';
    case 'signed':
      return p.executedBy
        ? `Signed by ${p.executedBy}. Changes from here go on a change order.`
        : 'Signed. Changes from here go on a change order.';
    case 'declined':
      return 'Closed. Reopen it if the customer comes back.';
  }
}

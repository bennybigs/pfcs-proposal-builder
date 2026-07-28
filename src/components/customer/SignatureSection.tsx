import { useState } from 'react';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
import type { CompanySnapshot, Proposal } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { proposalPricing } from '@/lib/pricing';
import { formatCurrency } from '@/lib/format';

type SignState = 'idle' | 'sending' | 'done' | 'error';

/**
 * Electronic acceptance for the customer view. Renders only when the proposal
 * carries a notification address (project manager email, falling back to the
 * company email). Screen-only — the printed document keeps the ink signature
 * lines from the Acceptance Block.
 */
export function SignatureSection({
  proposal,
  company,
}: {
  proposal: Proposal;
  company: CompanySnapshot;
}) {
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SignState>('idle');
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const notifyEmail = proposal.salesRepEmail?.trim() || company.email?.trim() || '';
  if (!notifyEmail) return null;

  const pricing = proposalPricing(proposal);
  const canSign = signerName.trim().length >= 2 && consent && state !== 'sending';

  const handleSign = async () => {
    setState('sending');
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalNumber: proposal.proposalNumber,
          projectName: proposal.project.referenceName,
          customerName: proposal.customer.fullName,
          total: proposal.showGrandTotalToCustomer ? formatCurrency(pricing.total) : 'Not shown',
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim(),
          notifyEmail,
          notifyName: proposal.salesRep,
          documentUrl: window.location.href,
          consent,
          website: '', // honeypot
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.error === 'signing-not-configured') {
          setErrorMsg(
            'Electronic signing is not available yet. Please print and sign the acceptance section above, or contact us.'
          );
        } else {
          setErrorMsg(
            'Something went wrong sending your signature. Please try again, or contact us directly.'
          );
        }
        setState('error');
        return;
      }
      setSignedAt(new Date().toLocaleString());
      setState('done');
    } catch {
      setErrorMsg(
        'Something went wrong sending your signature. Please try again, or contact us directly.'
      );
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <section className="no-print mt-8 rounded-lg border-2 border-green-600 bg-green-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h3 className="mt-2 font-heading text-xl font-bold uppercase tracking-wide text-green-800">
          Proposal Accepted
        </h3>
        <p className="mt-1 text-sm text-green-800">
          Signed by <strong>{signerName}</strong> on {signedAt}.{' '}
          {proposal.salesRep || 'Your project manager'} has been notified and will be in touch to
          prepare the construction contract.
          {signerEmail.trim() ? ' A copy has been emailed to you.' : ''}
        </p>
      </section>
    );
  }

  return (
    <section className="no-print mt-8">
      <div className="section-banner flex items-center gap-2">
        <PenLine className="h-4 w-4" /> Accept &amp; Sign Electronically
      </div>
      <div className="space-y-4 border border-t-0 border-brand-gray-light bg-white p-5">
        <p className="text-sm leading-relaxed text-brand-steel">
          Prefer not to print? You can accept this proposal electronically. Typing your full legal
          name below and clicking Sign has the same effect as signing the acceptance section above:
          it authorizes Post-Frame Construction Solutions, LLC to proceed to the contract phase of
          the project.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sign-name">Full Legal Name *</Label>
            <Input
              id="sign-name"
              placeholder="Type your full name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="font-heading text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sign-email">Your Email (receives a signed copy)</Label>
            <Input
              id="sign-email"
              type="email"
              placeholder="you@example.com"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand-orange"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I agree to conduct this transaction electronically and intend my typed name to serve as
            my signature accepting this proposal.
          </span>
        </label>
        {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}
        <Button size="lg" disabled={!canSign} onClick={handleSign}>
          {state === 'sending' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4" /> Sign &amp; Accept Proposal
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

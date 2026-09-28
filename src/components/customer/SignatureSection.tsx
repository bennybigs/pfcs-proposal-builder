import { useState } from 'react';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
import type { CompanySnapshot, Proposal } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StandardTerms } from '@/components/customer/StandardTerms';
import { proposalPricing } from '@/lib/pricing';
import { formatCurrency } from '@/lib/format';

type SignState = 'idle' | 'sending' | 'terms' | 'done' | 'error';

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

  // After they accept, the Terms are shown and signed as their own step —
  // that is the moment the proposal becomes a contract.
  const handleSign = async (documentKind: 'proposal' | 'terms' = 'proposal') => {
    setState('sending');
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          appOrigin: window.location.origin,
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
          documentKind,
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
      setState(documentKind === 'proposal' ? 'terms' : 'done');
    } catch {
      setErrorMsg(
        'Something went wrong sending your signature. Please try again, or contact us directly.'
      );
      setState('error');
    }
  };

  // Step 2: accepted — now the agreement itself, to read and sign.
  if (state === 'terms') {
    return (
      <section className="mt-8">
        <div className="no-print rounded-lg border-2 border-green-600 bg-green-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
          <h3 className="mt-1 font-heading text-lg font-bold uppercase tracking-wide text-green-800">
            Proposal Accepted
          </h3>
          <p className="mt-1 text-sm text-green-800">
            Signed by <strong>{signerName}</strong> on {signedAt}.{' '}
            {proposal.salesRep || 'Your project manager'} has been notified.
            {signerEmail.trim() ? ' A copy has been emailed to you.' : ''}
          </p>
          <p className="mt-3 text-sm font-medium text-green-900">
            One more step: read the Standard Terms and Conditions below — they form the contract —
            and sign them as well.
          </p>
        </div>

        <StandardTerms company={company} />

        <div className="no-print mt-6">
          <div className="section-banner flex items-center gap-2">
            <PenLine className="h-4 w-4" /> Accept the Terms and Conditions
          </div>
          <div className="space-y-3 border border-t-0 border-brand-gray-light bg-white p-5">
            <p className="text-sm leading-relaxed text-brand-steel">
              Typing your full legal name and clicking Sign has the same effect as signing the
              acceptance grid in the Terms above.
            </p>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full legal name"
              className="max-w-sm"
            />
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
            <Button
              onClick={() => void handleSign('terms')}
              disabled={signerName.trim().length < 2 || state !== 'terms'}
            >
              <PenLine className="mr-1.5 h-4 w-4" /> Sign the Terms
            </Button>
            <p className="text-xs text-brand-steel">
              Prefer paper? You can skip this — we&apos;ll bring printed copies to sign.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (state === 'done') {
    return (
      <section className="no-print mt-8 rounded-lg border-2 border-green-600 bg-green-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h3 className="mt-2 font-heading text-xl font-bold uppercase tracking-wide text-green-800">
          Signed — Proposal and Terms
        </h3>
        <p className="mt-1 text-sm text-green-800">
          Signed by <strong>{signerName}</strong> on {signedAt}.{' '}
          {proposal.salesRep || 'Your project manager'} has both signatures and will be in touch.
          {signerEmail.trim() ? ' Copies have been emailed to you.' : ''}
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
            I have read this proposal. I agree to conduct this transaction electronically and
            intend my typed name to serve as my signature accepting it. The Standard Terms and
            Conditions of Construction will be shown next for me to read and sign.
          </span>
        </label>
        {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}
        <Button size="lg" disabled={!canSign} onClick={() => void handleSign('proposal')}>
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

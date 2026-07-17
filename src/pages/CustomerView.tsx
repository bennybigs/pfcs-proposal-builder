import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { CustomerProposal } from '@/components/customer/CustomerProposal';
import { Button } from '@/components/ui/button';
import { decodeShareHash } from '@/lib/shareLink';
import { useProposalStore } from '@/store/useProposalStore';

/**
 * Read-only customer view. The entire proposal is decoded from the URL hash
 * (/view#p=...), so no data ever touches a server.
 */
export default function CustomerView() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const payload = useMemo(() => decodeShareHash(hash), [hash]);

  // Owner escape hatch: if this browser has the proposal in its local store,
  // the viewer is the author — offer a way back to the editor. Customers on
  // other devices never have it locally, so they never see this control.
  const isOwner = useProposalStore((s) =>
    payload ? Boolean(s.proposals[payload.p.id]) : false
  );

  useEffect(() => {
    if (payload) {
      document.title = `Proposal ${payload.p.proposalNumber} — ${payload.c.companyName}`;
    }
  }, [payload]);

  if (!payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <img src="/logo.svg" alt="PFCS" className="h-16 max-w-[320px] object-contain" />
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide">
          Proposal Not Found
        </h1>
        <p className="max-w-md text-sm text-brand-steel">
          This link appears to be incomplete or damaged. Please ask your PFCS representative to
          re-send the proposal link.
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Go to proposal builder
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 print:py-0">
      {isOwner && (
        <div className="no-print fixed left-4 top-4 z-50">
          <Button asChild variant="outline" size="sm" className="shadow-lg">
            <Link to={`/proposal/${payload.p.id}`}>
              <ArrowLeft className="h-4 w-4" /> Back to builder
            </Link>
          </Button>
        </div>
      )}
      <div className="no-print fixed bottom-6 right-6 z-50">
        <Button size="lg" className="shadow-lg" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      <CustomerProposal proposal={payload.p} company={payload.c} />
    </div>
  );
}

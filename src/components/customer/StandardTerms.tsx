// The Standard Terms and Conditions attachment — rendered at the end of
// EVERY proposal (customer share view, preview dialog, and PDF), per the
// instrument itself: "attached to and forming part of every proposal issued
// by Post Frame Construction Solutions, LLC." Includes the acceptance
// signature grid and TWO copies of the Notice of Cancellation, as Ohio
// R.C. 1345.23 requires two copies be furnished to the buyer.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  NOC_BODY_MD,
  STANDARD_TERMS_MD,
  TERMS_LETTERHEAD,
} from '@/constants/standardTerms';
import type { CompanySnapshot } from '@/types';

function SigLine({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={wide ? 'mt-6' : 'mt-6 flex-1'}>
      <div className="border-b border-brand-black" style={{ height: '1.4rem' }} />
      <div className="mt-1 text-[10px] uppercase tracking-wide text-brand-steel">{label}</div>
    </div>
  );
}

function NoticeOfCancellation() {
  return (
    <div className="mt-6 border-t-2 border-dashed border-brand-steel pt-4" style={{ breakInside: 'avoid' }}>
      <h3 className="text-center font-heading text-base font-bold uppercase tracking-wide">
        Notice of Cancellation
      </h3>
      <p className="mt-2 text-xs">
        Date of transaction: ____________________________
      </p>
      <div className="card-prose mt-2 text-xs [&_p]:my-1.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{NOC_BODY_MD}</ReactMarkdown>
      </div>
      <p className="mt-2 text-xs font-semibold">
        NOT LATER THAN MIDNIGHT OF ____________________________ (date).
      </p>
      <p className="mt-3 text-xs font-bold uppercase">I hereby cancel this transaction.</p>
      <div className="flex gap-8">
        <SigLine label="Buyer's signature" />
        <SigLine label="Date" />
      </div>
    </div>
  );
}

export function StandardTerms({ company }: { company: CompanySnapshot }) {
  return (
    <section className="mt-10 border-t-4 border-brand-orange pt-6" style={{ breakBefore: 'page' }}>
      {/* letterhead — as drafted on the instrument */}
      <div className="flex items-center gap-4 border-b-2 border-brand-black pb-4">
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" className="h-16 max-w-[160px] object-contain" />
        )}
        <div className="text-xs leading-relaxed">
          <div className="font-heading text-sm font-bold uppercase tracking-wide">
            {TERMS_LETTERHEAD.company}
          </div>
          <div>{TERMS_LETTERHEAD.address}</div>
          <div>
            {TERMS_LETTERHEAD.phone} · {TERMS_LETTERHEAD.email}
          </div>
          <div>
            {TERMS_LETTERHEAD.web} · {TERMS_LETTERHEAD.taxId}
          </div>
        </div>
      </div>

      <h2 className="mt-5 text-center font-heading text-lg font-bold uppercase tracking-wide">
        Standard Terms and Conditions of Construction
      </h2>
      <p className="mt-1 text-center text-xs italic text-brand-steel">
        Attached to and forming part of every proposal issued by Post Frame Construction
        Solutions, LLC
      </p>

      <div className="card-prose mt-4 text-xs [&_h2]:mt-4 [&_h2]:text-sm [&_li]:my-0.5 [&_p]:my-1.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{STANDARD_TERMS_MD}</ReactMarkdown>
      </div>

      {/* acceptance — the signature grid from the instrument */}
      <div className="mt-8" style={{ breakInside: 'avoid' }}>
        <h3 className="font-heading text-base font-bold uppercase tracking-wide">
          Acceptance of Proposal and Terms
        </h3>
        <p className="mt-2 text-xs">
          I have read these Standard Terms and Conditions and the Proposal to which they are
          attached. I understand them, I accept them, and I authorize Post Frame Construction
          Solutions, LLC to perform the Work described, at the price and on the payment schedule
          stated on the face of the Proposal.
        </p>
        <p className="mt-2 text-xs">
          I acknowledge that I have received a completed copy of the Proposal and these Terms,
          together with two copies of the Notice of Cancellation form, at the time I signed.
        </p>
        <div className="mt-2 flex flex-wrap gap-10">
          <div className="min-w-[240px] flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide">Owner</div>
            <SigLine label="Signature" wide />
            <SigLine label="Printed name" wide />
            <SigLine label="Date" wide />
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide">
              Post Frame Construction Solutions, LLC
            </div>
            <SigLine label="Signature" wide />
            <SigLine label="Printed name and title" wide />
            <SigLine label="Date" wide />
          </div>
        </div>
        <div className="mt-4 max-w-md">
          <p className="text-xs text-brand-steel">
            Second Owner signature, if the property is held jointly:
          </p>
          <SigLine label="Signature and date" wide />
        </div>
      </div>

      {/* two copies, per the statute */}
      <p className="mt-8 text-center text-[10px] uppercase tracking-wide text-brand-steel">
        Two copies of this form must be given to the Owner at the time of signing. Detach along
        the line.
      </p>
      <NoticeOfCancellation />
      <NoticeOfCancellation />
    </section>
  );
}

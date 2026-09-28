// The Notice of Cancellation — its own document, handed to the customer when
// we choose to (Ohio R.C. 1345.21–.28 requires TWO copies at signing for a
// sale made at the buyer's home or anywhere other than our office). It used
// to live at the tail of the Standard Terms; it is separate now so it can be
// printed and given on its own.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NOC_BODY_MD, TERMS_LETTERHEAD } from '@/constants/standardTerms';
import { formatDateLong } from '@/lib/format';
import type { CompanySnapshot, Proposal } from '@/types';

/** Third BUSINESS day after the transaction, as the statute counts it. */
export function thirdBusinessDay(from: Date): Date {
  const d = new Date(from);
  let counted = 0;
  while (counted < 3) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) counted += 1;
  }
  return d;
}

function Line({ label }: { label: string }) {
  return (
    <div className="mt-5">
      <div className="border-b border-brand-black" style={{ height: '1.4rem' }} />
      <div className="mt-1 text-[10px] uppercase tracking-wide text-brand-steel">{label}</div>
    </div>
  );
}

function Copy({
  transactionDate,
  deadline,
  customerName,
  copyLabel,
}: {
  transactionDate: string;
  deadline: string;
  customerName?: string;
  copyLabel: string;
}) {
  return (
    <section className="noc-copy border border-brand-black p-6" style={{ breakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 border-b border-brand-black pb-3">
        <div className="text-xs leading-relaxed">
          <div className="font-heading text-sm font-bold uppercase tracking-wide">
            {TERMS_LETTERHEAD.company}
          </div>
          <div>{TERMS_LETTERHEAD.address}</div>
          <div>
            {TERMS_LETTERHEAD.phone} · {TERMS_LETTERHEAD.email}
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-brand-steel">
          {copyLabel}
        </div>
      </div>

      <h2 className="mt-4 text-center font-heading text-lg font-bold uppercase tracking-wide">
        Notice of Cancellation
      </h2>
      <p className="mt-3 text-xs">
        Date of transaction: <span className="font-semibold">{transactionDate}</span>
      </p>
      {customerName && <p className="mt-1 text-xs">Buyer: {customerName}</p>}

      <div className="card-prose mt-3 text-xs [&_p]:my-1.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{NOC_BODY_MD}</ReactMarkdown>
      </div>

      <p className="mt-3 text-xs font-semibold">
        NOT LATER THAN MIDNIGHT OF <span className="underline">{deadline}</span>.
      </p>
      <p className="mt-4 text-xs font-bold uppercase">I hereby cancel this transaction.</p>
      <div className="flex gap-8">
        <div className="flex-1">
          <Line label="Buyer's signature" />
        </div>
        <div className="flex-1">
          <Line label="Date" />
        </div>
      </div>
    </section>
  );
}

/**
 * Two copies on one sheet, as the statute requires. `date` is the day the
 * customer signs — blank-dated copies are fine to carry in the truck.
 */
export function CancellationNotice({
  proposal,
  date,
}: {
  proposal?: Proposal;
  company?: CompanySnapshot;
  date?: string;
}) {
  const when = date ? new Date(date) : undefined;
  const valid = when && !Number.isNaN(when.getTime());
  const transactionDate = valid ? formatDateLong(when!.toISOString()) : '____________________';
  const deadline = valid
    ? formatDateLong(thirdBusinessDay(when!).toISOString())
    : '____________________';
  return (
    <div className="customer-proposal mx-auto max-w-[820px] space-y-6 bg-white p-8 shadow-md sm:p-10">
      <p className="text-center text-[10px] uppercase tracking-wide text-brand-steel">
        Two copies must be given to the buyer at signing — one to keep, one to return if they
        cancel.
      </p>
      <Copy
        transactionDate={transactionDate}
        deadline={deadline}
        customerName={proposal?.customer.fullName}
        copyLabel="Buyer's copy"
      />
      <Copy
        transactionDate={transactionDate}
        deadline={deadline}
        customerName={proposal?.customer.fullName}
        copyLabel="Copy to return to cancel"
      />
    </div>
  );
}

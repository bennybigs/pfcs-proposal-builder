import type { Card, CompanySnapshot, Proposal } from '@/types';
import { Markdown } from '@/components/Markdown';
import { formatDateLong } from '@/lib/format';

/**
 * A one-card standalone document (e.g. the Ohio tax exemption certificate),
 * used for per-card PDF export and printing. Prices are intentionally omitted —
 * standalone cards are forms/attachments, not quotes.
 */
export function SingleCardDocument({
  card,
  proposal,
  company,
}: {
  card: Card;
  proposal: Proposal;
  company: CompanySnapshot;
}) {
  return (
    <div className="customer-proposal mx-auto max-w-[820px] bg-white p-8 sm:p-10">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b-4 border-brand-orange pb-6 sm:flex-row sm:items-center">
        {company.logoUrl && (
          <img
            src={company.logoUrl}
            alt={company.companyName}
            className="h-20 max-w-[320px] object-contain"
          />
        )}
        <div className="text-left sm:text-right">
          <div className="text-sm text-brand-steel">{proposal.proposalNumber}</div>
          <div className="text-sm text-brand-steel">{formatDateLong(new Date().toISOString())}</div>
        </div>
      </header>

      <section className="proposal-card">
        <div className="section-banner">{card.title}</div>
        <div className="border border-t-0 border-brand-gray-light bg-white p-5">
          <Markdown>{card.content}</Markdown>
        </div>
      </section>

      <footer className="mt-8 border-t border-brand-gray-light pt-4 text-center text-xs text-brand-steel">
        {company.companyName}
        {company.address ? ` • ${company.address}` : ''}
        {company.phone ? ` • ${company.phone}` : ''}
        {company.email ? ` • ${company.email}` : ''}
      </footer>
    </div>
  );
}

import type { CompanySnapshot, Proposal } from '@/types';
import { Markdown } from '@/components/Markdown';
import { AcceptanceBlock } from '@/components/customer/AcceptanceBlock';
import { StandardTerms } from '@/components/customer/StandardTerms';
import { cardDisplayPrice, proposalPricing } from '@/lib/pricing';
import { addDays, formatCurrency, formatDateLong } from '@/lib/format';
import { PROPOSAL_VALID_DAYS } from '@/constants/defaults';

function InfoColumn({ heading, lines }: { heading: string; lines: (string | undefined)[] }) {
  const visible = lines.filter((l): l is string => Boolean(l && l.trim()));
  return (
    <div>
      <div className="mb-1 border-b-2 border-brand-orange pb-1 font-heading text-sm font-bold uppercase tracking-wide text-brand-black">
        {heading}
      </div>
      {visible.length === 0 ? (
        <div className="text-sm text-brand-steel">—</div>
      ) : (
        visible.map((line, i) => (
          <div key={i} className="text-sm leading-relaxed">
            {line}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * The customer-facing proposal document. Shared by the /view route, the editor
 * preview dialog, and the PDF export renderer.
 */
export function CustomerProposal({
  proposal,
  company,
}: {
  proposal: Proposal;
  company: CompanySnapshot;
}) {
  const pricing = proposalPricing(proposal);
  const total = pricing.total;
  // A change order is the same document with a different job: it states what
  // is being added or taken off the signed contract, the difference in price
  // (which can be a credit), and the amended contract total.
  const co = proposal.kind === 'change_order' ? proposal.changeOrder : undefined;
  const isContract = proposal.status === 'contract' || proposal.status === 'accepted';
  const amendedTotal = co ? co.contractTotal + total : total;
  const visibleCards = proposal.cards.filter((c) => c.isEnabled);
  const showTotal = proposal.showGrandTotalToCustomer;
  const showMarkupLine = showTotal && pricing.markupVisible && pricing.markupAmount !== 0;
  const showTaxLine = showTotal && pricing.taxEnabled && pricing.taxAmount !== 0;

  return (
    <div className="customer-proposal mx-auto max-w-[820px] bg-white p-8 shadow-md sm:p-10">
      {/* Logo header */}
      <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b-4 border-brand-orange pb-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {company.logoUrl && (
            <img src={company.logoUrl} alt={company.companyName} className="h-24 max-w-[400px] object-contain" />
          )}
          {/* who this is from — on the face of the document, not just the footer */}
          <div className="text-xs leading-relaxed text-brand-steel">
            <div className="font-heading text-sm font-bold uppercase tracking-wide text-brand-black">
              {company.companyName}
            </div>
            {company.address && <div>{company.address}</div>}
            {(company.phone || company.email) && (
              <div>{[company.phone, company.email].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="font-heading text-2xl font-bold uppercase tracking-wide">
            {co ? `Change Order ${proposal.changeOrder?.number ?? ''}` : isContract ? 'Contract' : 'Proposal'}
          </div>
          <div className="text-sm text-brand-steel">{proposal.proposalNumber}</div>
          <div className="text-sm text-brand-steel">{formatDateLong(proposal.createdAt)}</div>
          {co ? (
            <div className="text-xs text-brand-steel">
              To contract <span className="font-semibold">{co.contractNumber}</span>
              {co.contractSignedAt ? ` signed ${formatDateLong(co.contractSignedAt)}` : ''}
            </div>
          ) : isContract ? (
            // an accepted price is no longer an offer with an expiry
            <div className="text-xs text-brand-steel">
              Contract date {formatDateLong(proposal.signedAt ?? proposal.sentAt ?? proposal.createdAt)}
            </div>
          ) : (
            <div className="text-xs italic text-brand-steel">
              Valid through {formatDateLong(addDays(proposal.createdAt, PROPOSAL_VALID_DAYS))}
            </div>
          )}
        </div>
      </header>

      {/* Customer / Location / Project block */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <InfoColumn
          heading="Prepared For"
          lines={[
            proposal.customer.fullName,
            proposal.customer.streetAddress,
            proposal.customer.cityStateZip,
            proposal.customer.phone,
            proposal.customer.email,
          ]}
        />
        <InfoColumn
          heading="Project"
          lines={[
            proposal.project.referenceName,
            proposal.project.streetAddress,
            proposal.project.cityStateZip,
            proposal.project.county ? `${proposal.project.county} County` : undefined,
          ]}
        />
        <InfoColumn
          heading="Project Manager"
          lines={[
            proposal.salesRep,
            proposal.salesRepPhone,
            proposal.salesRepEmail,
            company.companyName,
          ]}
        />
      </div>

      {/* Intro */}
      {proposal.intro?.trim() && (
        <div className="mb-8">
          <Markdown>{proposal.intro}</Markdown>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-6">
        {visibleCards.map((card) => (
          <section key={card.id} className="proposal-card">
            <div className="section-banner">{card.title}</div>
            <div className="border border-t-0 border-brand-gray-light bg-white p-5">
              <Markdown>{card.content}</Markdown>
              {card.hasPrice &&
                card.showPriceToCustomer &&
                cardDisplayPrice(card, proposal) !== undefined && (
                  <div className="mt-4 flex justify-end border-t border-brand-gray-light pt-3">
                    <span className="font-heading text-lg font-bold tracking-wide">
                      {formatCurrency(cardDisplayPrice(card, proposal) as number)}
                    </span>
                  </div>
                )}
            </div>
          </section>
        ))}
      </div>

      {/* Payment schedule — a change order bills under the contract's own
          schedule, so it says that instead of re-splitting the difference */}
      {co ? (
        <section className="payment-block mt-8">
          <div className="section-banner">Payment</div>
          <div className="border border-t-0 border-brand-gray-light bg-white p-5 text-sm">
            This change order is billed under the payment schedule of contract {co.contractNumber}.
          </div>
        </section>
      ) : (
      <section className="payment-block mt-8">
        <div className="section-banner">Payment Schedule</div>
        <div className="border border-t-0 border-brand-gray-light bg-white p-5">
          <div className="divide-y divide-brand-gray-light">
            {proposal.paymentSchedule.milestones.map((m, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <div className="flex items-baseline gap-3">
                  <span className="font-heading text-lg font-bold text-brand-orange">
                    {m.percentage}%
                  </span>
                  <span>{m.label}</span>
                </div>
                {showTotal && total > 0 && (
                  <span className="whitespace-nowrap font-semibold">
                    {formatCurrency((total * m.percentage) / 100)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      )}

      {/* Subtotal / markup / sales tax breakdown */}
      {(showMarkupLine || showTaxLine) && (
        <section className="mt-8 border border-brand-gray-light bg-white px-5 py-3">
          <div className="flex items-baseline justify-between py-1 text-sm">
            <span>Subtotal</span>
            <span className="font-semibold">
              {formatCurrency(showMarkupLine ? pricing.subtotal : pricing.preTaxTotal)}
            </span>
          </div>
          {showMarkupLine && (
            <div className="flex items-baseline justify-between border-t border-brand-gray-light py-1 pt-2 text-sm">
              <span>
                {pricing.markupLabel} ({pricing.markupPct}%)
              </span>
              <span className="font-semibold">{formatCurrency(pricing.markupAmount)}</span>
            </div>
          )}
          {showTaxLine && (
            <div className="flex items-baseline justify-between border-t border-brand-gray-light py-1 pt-2 text-sm">
              <span>Sales Tax ({pricing.taxRatePct}%)</span>
              <span className="font-semibold">{formatCurrency(pricing.taxAmount)}</span>
            </div>
          )}
        </section>
      )}

      {/* Change order maths: contract → this change → amended total */}
      {co && showTotal && (
        <section className="mt-8 border border-brand-gray-light bg-white px-5 py-3">
          <div className="flex items-baseline justify-between py-1 text-sm">
            <span>Original contract {co.contractNumber}</span>
            <span className="font-semibold">{formatCurrency(co.contractTotal)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-brand-gray-light py-1 pt-2 text-sm">
            <span>This change order ({total < 0 ? 'credit' : 'addition'})</span>
            <span className="font-semibold">
              {total < 0 ? `(${formatCurrency(Math.abs(total))})` : formatCurrency(total)}
            </span>
          </div>
        </section>
      )}

      {/* Grand total */}
      {showTotal && (
        <section className="grand-total-block mt-8 flex items-center justify-between bg-brand-black px-5 py-4 text-white"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          <span className="font-heading text-lg font-bold uppercase tracking-wide">
            {co ? 'Amended Contract Total' : 'Total Investment'}
          </span>
          <span className="font-heading text-2xl font-bold text-brand-orange-light">
            {formatCurrency(co ? amendedTotal : total)}
          </span>
        </section>
      )}

      {/* Disclaimers */}
      {proposal.disclaimers?.trim() && (
        <div className="mt-8 text-xs italic leading-relaxed text-brand-steel [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1">
          <Markdown className="card-prose prose-xs !text-brand-steel [&_*]:!text-brand-steel [&_*]:!text-xs [&_*]:italic">
            {proposal.disclaimers}
          </Markdown>
        </div>
      )}

      {/* Signature lines belong on the things that get signed: the contract
          and change orders. A proposal is a price and a scope — it carries
          no sign-off, so nothing can be signed before the terms exist. */}
      {(isContract || co) && <AcceptanceBlock changeOrderOf={co?.contractNumber} />}

      {/* Terms attach when it BECOMES a contract — a proposal is a price and
          a scope, not an agreement. A change order rides on the contract's
          terms, so it says so rather than restating them. */}
      {co ? (
        <p className="mt-6 text-xs leading-relaxed text-brand-steel">
          All terms and conditions of contract {co.contractNumber} remain in force and apply to
          this change order. Work described here is authorized only when this sheet is signed by
          both parties.
        </p>
      ) : isContract ? (
        <StandardTerms company={company} />
      ) : null}

      <footer className="mt-8 border-t border-brand-gray-light pt-4 text-center text-xs text-brand-steel">
        {company.companyName}
        {company.address ? ` • ${company.address}` : ''}
        {company.phone ? ` • ${company.phone}` : ''}
        {company.email ? ` • ${company.email}` : ''}
      </footer>
    </div>
  );
}

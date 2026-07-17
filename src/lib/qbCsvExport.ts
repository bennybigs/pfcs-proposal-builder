import type { Proposal } from '@/types';
import { addDays, formatDateUS } from '@/lib/format';
import { stripMarkdown } from '@/lib/markdown';
import { cardDisplayPrice, proposalPricing } from '@/lib/pricing';
import { PROPOSAL_VALID_DAYS } from '@/constants/defaults';

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n');
}

/** Cards that flow to QuickBooks: enabled, priced, and included in the total. */
export function billableCards(proposal: Proposal) {
  return proposal.cards.filter(
    (c) => c.isEnabled && c.hasPrice && c.includeInTotal && typeof c.price === 'number'
  );
}

/** QuickBooks Online Estimate import CSV — one row per priced+included card. */
export function generateEstimateCsv(proposal: Proposal): string {
  const estimateDate = formatDateUS(proposal.createdAt);
  const expirationDate = formatDateUS(addDays(proposal.createdAt, PROPOSAL_VALID_DAYS));
  const rows: (string | number)[][] = [
    [
      'Estimate No.',
      'Customer',
      'Estimate Date',
      'Expiration Date',
      'Product/Service',
      'Description',
      'Qty',
      'Rate',
      'Amount',
    ],
  ];
  // Line prices mirror the customer view exactly (card markups applied; a
  // hidden total markup is folded into the lines, a visible one gets its own row).
  for (const card of billableCards(proposal)) {
    const price = cardDisplayPrice(card, proposal) ?? (card.price as number);
    rows.push([
      proposal.proposalNumber,
      proposal.customer.fullName,
      estimateDate,
      expirationDate,
      card.title,
      stripMarkdown(card.content).slice(0, 200),
      1,
      price.toFixed(2),
      price.toFixed(2),
    ]);
  }
  const pricing = proposalPricing(proposal);
  if (pricing.markupVisible && pricing.markupAmount !== 0) {
    rows.push([
      proposal.proposalNumber,
      proposal.customer.fullName,
      estimateDate,
      expirationDate,
      pricing.markupLabel,
      `Applied to project total (${pricing.markupPct}%)`,
      1,
      pricing.markupAmount.toFixed(2),
      pricing.markupAmount.toFixed(2),
    ]);
  }
  return toCsv(rows);
}

/** QuickBooks Online Customers import CSV. */
export function generateCustomerCsv(proposal: Proposal): string {
  const { customer } = proposal;
  const rows: (string | number)[][] = [
    ['Name', 'Email', 'Phone', 'Billing Street', 'Billing City/State/Zip'],
    [
      customer.fullName,
      customer.email,
      customer.phone,
      customer.streetAddress,
      customer.cityStateZip,
    ],
  ];
  return toCsv(rows);
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

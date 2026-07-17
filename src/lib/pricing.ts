import type { Card, Proposal } from '@/types';

export const DEFAULT_MARKUP_LABEL = 'Project Management & Overhead';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Price after this card's own markup — the customer's line price before any total markup. */
export function cardMarkedPrice(card: Card): number | undefined {
  if (!card.hasPrice || typeof card.price !== 'number') return undefined;
  return round2(card.price * (1 + (card.markupPct ?? 0) / 100));
}

function includedCards(proposal: Proposal): Card[] {
  return proposal.cards.filter(
    (c) => c.isEnabled && c.hasPrice && c.includeInTotal && typeof c.price === 'number'
  );
}

/**
 * Customer-facing price for one card line.
 *
 * When the proposal's total markup is hidden, it is folded pro-rata into every
 * included card's displayed price so the lines still sum to the grand total.
 * Cards excluded from the total only ever carry their own markup.
 */
export function cardDisplayPrice(card: Card, proposal: Proposal): number | undefined {
  const marked = cardMarkedPrice(card);
  if (marked === undefined) return undefined;
  const pct = proposal.totalMarkupPct ?? 0;
  const visible = proposal.showTotalMarkupToCustomer ?? false;
  if (!visible && pct !== 0 && card.includeInTotal) {
    return round2(marked * (1 + pct / 100));
  }
  return marked;
}

export interface ProposalPricing {
  /** Internal: sum of entered base prices, no markups. */
  baseTotal: number;
  /** Sum of per-card marked prices for included cards (the customer subtotal). */
  subtotal: number;
  markupPct: number;
  /** Dollars added by the total markup. */
  markupAmount: number;
  /** Whether the markup renders as its own labeled line for the customer. */
  markupVisible: boolean;
  markupLabel: string;
  /** What the customer pays. */
  total: number;
}

export function proposalPricing(proposal: Proposal): ProposalPricing {
  const included = includedCards(proposal);
  const pct = proposal.totalMarkupPct ?? 0;
  const visible = proposal.showTotalMarkupToCustomer ?? false;
  const markupLabel = proposal.totalMarkupLabel?.trim() || DEFAULT_MARKUP_LABEL;
  const baseTotal = round2(included.reduce((s, c) => s + (c.price as number), 0));
  const subtotal = round2(
    included.reduce((s, c) => s + (cardMarkedPrice(c) as number), 0)
  );

  if (visible) {
    const markupAmount = round2((subtotal * pct) / 100);
    return {
      baseTotal,
      subtotal,
      markupPct: pct,
      markupAmount,
      markupVisible: true,
      markupLabel,
      total: round2(subtotal + markupAmount),
    };
  }

  // Hidden: total = sum of the folded display prices so lines always add up.
  const total = round2(
    included.reduce((s, c) => s + (cardDisplayPrice(c, proposal) as number), 0)
  );
  return {
    baseTotal,
    subtotal,
    markupPct: pct,
    markupAmount: round2(total - subtotal),
    markupVisible: false,
    markupLabel,
    total,
  };
}

export function grandTotal(proposal: Proposal): number {
  return proposalPricing(proposal).total;
}

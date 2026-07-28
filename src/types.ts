export interface Proposal {
  id: string; // uuid
  proposalNumber: string; // "PFCS-2026-0001"
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  createdAt: string; // ISO
  updatedAt: string; // ISO

  customer: CustomerInfo;
  project: ProjectInfo;
  salesRep: string;

  intro?: string; // optional custom intro paragraph
  cards: Card[]; // ordered

  showGrandTotalToCustomer: boolean; // default true
  /** Additional markup applied on top of the summed card prices (percent, e.g. 10 = 10%). */
  totalMarkupPct?: number;
  /** true: markup renders as its own labeled line; false: folded invisibly into card prices. */
  showTotalMarkupToCustomer?: boolean;
  /** Customer-facing label for the markup line when visible. */
  totalMarkupLabel?: string;
  /** When true, sales tax is added on top of the customer total and shown as a line item. */
  applySalesTax?: boolean;
  /** Sales tax rate in percent (e.g. 6.5 for Wayne County, OH). */
  taxRatePct?: number;
  paymentSchedule: PaymentSchedule;
  disclaimers?: string; // markdown
}

export interface CustomerInfo {
  fullName: string;
  streetAddress: string;
  cityStateZip: string;
  phone: string;
  email: string;
}

export interface ProjectInfo {
  streetAddress: string;
  cityStateZip: string;
  county: string;
  referenceName: string; // e.g., "Smith Family Barndominium"
}

export interface Card {
  id: string; // uuid
  templateId?: string; // if from library, e.g., 'foundation'; undefined = custom
  title: string;
  content: string; // markdown
  isEnabled: boolean;
  hasPrice: boolean;
  price?: number; // dollars — the internal/base amount entered
  /** Per-card markup (percent). Customer sees price * (1 + markupPct/100). */
  markupPct?: number;
  showPriceToCustomer: boolean; // default true when hasPrice=true
  includeInTotal: boolean; // default true when hasPrice=true
}

export type CardCategory =
  | 'shell'
  | 'exterior'
  | 'openings'
  | 'living-quarters'
  | 'shop'
  | 'systems'
  | 'options'
  | 'custom';

export interface CardTemplate {
  id: string; // 'foundation', 'roofing', 'custom', etc.
  category: CardCategory;
  title: string;
  defaultContent: string; // markdown, uses [placeholder] syntax for TBD values
  suggestedPriceRange?: [number, number];
}

export interface PaymentSchedule {
  type: 'standard-30-60-10' | 'custom';
  milestones: PaymentMilestone[];
}

export interface PaymentMilestone {
  percentage: number; // 30 = 30%
  label: string; // "Down Payment — due upon proposal acceptance"
}

export interface ProposalTemplate {
  id: string; // 'barndominium', 'ag-shop', 'luxury-storage'
  name: string;
  description: string;
  defaultCardTemplateIds: string[]; // ordered list of card templates to auto-add
}

export interface CompanySettings {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string; // path or data URL
  defaultDisclaimers: string;
  proposalNumberPrefix: string; // "PFCS-2026-"
  nextProposalNumber: number; // counter, formatted to 4 digits
  defaultSalesRep: string;
}

/** Snapshot of company info embedded in share links so the customer view is self-contained. */
export interface CompanySnapshot {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
}

export interface SharePayload {
  v: 1;
  p: Proposal;
  c: CompanySnapshot;
}

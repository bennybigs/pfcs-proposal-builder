import type { CardCategory, CompanySettings, PaymentSchedule } from '@/types';

export const DEFAULT_PAYMENT_SCHEDULE: PaymentSchedule = {
  type: 'standard-30-60-10',
  milestones: [
    { percentage: 30, label: 'Down Payment — due upon proposal acceptance and contract signing' },
    { percentage: 60, label: 'Due upon delivery of materials to job site' },
    { percentage: 10, label: 'Due upon completion of PFCS scope of work' },
  ],
};

export const DEFAULT_DISCLAIMERS = `* Proposal valid for 14 days from the date specified above.

* Acceptance of this proposal requires execution of a separate written construction contract containing additional terms and conditions. This proposal is not itself a contract for construction.

* This proposal contains proprietary information and trade secrets of Post-Frame Construction Solutions, LLC and may not be disclosed to third parties without express written authorization.`;

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: 'Post-Frame Construction Solutions, LLC',
  tagline: 'Barndominiums • Agricultural Shops • Luxury Storage',
  address: 'Orrville, Ohio',
  phone: '',
  email: '',
  logoUrl: '/logo.jpg',
  defaultDisclaimers: DEFAULT_DISCLAIMERS,
  proposalNumberPrefix: 'PFCS-2026-',
  nextProposalNumber: 1,
  defaultSalesRep: 'Ben Stahl',
};

export const PROPOSAL_VALID_DAYS = 14;

export const CATEGORY_META: Record<CardCategory, { label: string; color: string }> = {
  shell: { label: 'Shell', color: '#D2782D' },
  exterior: { label: 'Exterior', color: '#F0A52D' },
  openings: { label: 'Openings', color: '#5A7A9A' },
  'living-quarters': { label: 'Living Quarters', color: '#6B8E4E' },
  systems: { label: 'Systems', color: '#4E8E8E' },
  shop: { label: 'Shop', color: '#5A5A5A' },
  options: { label: 'Options', color: '#9A6B5A' },
  custom: { label: 'Custom', color: '#999999' },
};

export const CATEGORY_ORDER: CardCategory[] = [
  'shell',
  'exterior',
  'openings',
  'living-quarters',
  'systems',
  'shop',
  'options',
  'custom',
];

export const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-brand-gray-light text-brand-steel' },
  sent: { label: 'Sent', className: 'bg-brand-orange-light/20 text-brand-orange' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
};

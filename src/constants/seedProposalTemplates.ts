import type { ProposalTemplate } from '@/types';

export const SEED_PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    id: 'barndominium',
    name: 'New Barndominium',
    description: 'Residential barndominium with living quarters and shop area',
    defaultCardTemplateIds: [
      'foundation', 'siding-wainscot', 'roof', 'overhangs-trim',
      'walk-doors', 'windows', 'overhead-doors',
      'lq-framing-walls', 'lq-insulation', 'lq-flooring',
      'lq-kitchen', 'lq-bathrooms',
      'lq-electrical', 'lq-plumbing', 'lq-hvac',
      'shop-area', 'energy-package',
      'includes-excludes',
    ],
  },
  {
    id: 'ag-shop',
    name: 'New Agricultural Shop',
    description: 'Farm shop with clear-span interior and equipment doors',
    defaultCardTemplateIds: [
      'foundation', 'siding-wainscot', 'roof', 'overhangs-trim',
      'walk-doors', 'windows', 'overhead-doors',
      'shop-area', 'energy-package',
      'includes-excludes',
    ],
  },
  {
    id: 'luxury-storage',
    name: 'New Luxury Storage / Garage',
    description: 'Premium storage building with climate control',
    defaultCardTemplateIds: [
      'foundation', 'siding-wainscot', 'roof', 'overhangs-trim',
      'walk-doors', 'windows', 'overhead-doors',
      'shop-area', 'energy-package',
      'includes-excludes',
    ],
  },
];

/** Human label used when deriving a default project reference name from the customer's last name. */
export const TEMPLATE_REFERENCE_SUFFIX: Record<string, string> = {
  barndominium: 'Family Barndominium',
  'ag-shop': 'Farm Shop',
  'luxury-storage': 'Storage Building',
};

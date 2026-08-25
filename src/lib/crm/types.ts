// CRM row types + display metadata. Mirrors supabase/schema.sql exactly.

export type ContactSource = 'referral' | 'website' | 'facebook' | 'show' | 'cold' | 'other';
export type DealStage =
  | 'inquiry'
  | 'site_visit_scheduled'
  | 'proposal_sent'
  | 'negotiating'
  | 'won'
  | 'lost';
export type DealSegment = 'barndominium' | 'ag_shop' | 'storage_garage' | 'other';
export type ActivityType =
  | 'call'
  | 'text'
  | 'email'
  | 'meeting'
  | 'site_visit'
  | 'note'
  | 'proposal_event';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  company_name: string;
  source: ContactSource;
  source_detail: string | null;
  tags: string[];
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  owner: string | null;
}

export interface Deal {
  id: string;
  contact_id: string;
  title: string;
  stage: DealStage;
  stage_entered_at: string;
  segment: DealSegment;
  value: number;
  expected_close: string | null;
  probability: number;
  lost_reason: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  deal_id: string | null;
  type: ActivityType;
  body: string;
  happened_at: string;
  logged_by: string;
}

export interface Task {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  assigned_to: string;
  created_at: string;
}

export interface ProposalLink {
  id: string;
  deal_id: string;
  proposal_id: string;
  title: string;
  total: number;
  share_url: string | null;
  linked_at: string;
  linked_by: string;
}

// ── display metadata ─────────────────────────────────────────────────

export const STAGES: DealStage[] = [
  'inquiry',
  'site_visit_scheduled',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
];

export const STAGE_META: Record<DealStage, { label: string; probability: number; color: string }> = {
  inquiry: { label: 'Inquiry', probability: 10, color: 'bg-slate-100 text-slate-700' },
  site_visit_scheduled: { label: 'Site Visit', probability: 25, color: 'bg-sky-100 text-sky-700' },
  proposal_sent: { label: 'Proposal Sent', probability: 50, color: 'bg-amber-100 text-amber-700' },
  negotiating: { label: 'Negotiating', probability: 75, color: 'bg-orange-100 text-orange-700' },
  won: { label: 'Won', probability: 100, color: 'bg-green-100 text-green-700' },
  lost: { label: 'Lost', probability: 0, color: 'bg-red-100 text-red-600' },
};

export const OPEN_STAGES: DealStage[] = ['inquiry', 'site_visit_scheduled', 'proposal_sent', 'negotiating'];

export const SEGMENTS: DealSegment[] = ['barndominium', 'ag_shop', 'storage_garage', 'other'];
export const SEGMENT_META: Record<DealSegment, { label: string; short: string }> = {
  barndominium: { label: 'Barndominium / Shouse', short: 'Barndo' },
  ag_shop: { label: 'Ag / Farm Shop', short: 'Ag Shop' },
  storage_garage: { label: 'Storage / Garage', short: 'Storage' },
  other: { label: 'Other', short: 'Other' },
};

export const SOURCES: ContactSource[] = ['referral', 'website', 'facebook', 'show', 'cold', 'other'];
export const SOURCE_LABEL: Record<ContactSource, string> = {
  referral: 'Referral',
  website: 'Website',
  facebook: 'Facebook',
  show: 'Trade Show',
  cold: 'Cold',
  other: 'Other',
};

export const ACTIVITY_META: Record<ActivityType, { label: string }> = {
  call: { label: 'Call' },
  text: { label: 'Text' },
  email: { label: 'Email' },
  meeting: { label: 'Meeting' },
  site_visit: { label: 'Site Visit' },
  note: { label: 'Note' },
  proposal_event: { label: 'Proposal' },
};

/** Whole-dollar USD everywhere in the CRM (the brief's currency rule). */
const dollarsFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
export const formatDollars = (n: number) => dollarsFmt.format(Math.round(n || 0));

export const daysBetween = (fromIso: string, to: Date = new Date()) =>
  Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000));

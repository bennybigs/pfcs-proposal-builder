// CRM row types + display metadata. Mirrors supabase/schema.sql exactly.

export type ContactSource = 'referral' | 'website' | 'facebook' | 'show' | 'cold' | 'other';
/**
 * One card, one ID, Lead → Won/Lost. 'inquiry' and 'site_visit_scheduled'
 * are LEGACY values kept only so old stage-history rows still render — no
 * UI offers them and no row carries them anymore.
 */
export type DealStage =
  | 'lead'
  | 'follow_up'
  | 'site_visit'
  | 'estimate'
  | 'proposal_sent'
  | 'negotiating'
  | 'won'
  | 'lost'
  | 'inquiry'                // legacy
  | 'site_visit_scheduled';  // legacy
export type DealSegment = 'barndominium' | 'ag_shop' | 'storage_garage' | 'other';
export type ActivityType =
  | 'call'
  | 'text'
  | 'email'
  | 'meeting'
  | 'site_visit'
  | 'note'
  | 'proposal_event'
  | 'field_change';

export type CallOutcome =
  | 'connected'
  | 'voicemail'
  | 'no_answer'
  | 'busy'
  | 'bad_number'
  | 'wrong_person';

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'bad_number', label: 'Bad number' },
  { value: 'wrong_person', label: 'Wrong person' },
];

/**
 * Lead is a stage of a contact's life, not a separate record. new/contacted/
 * on_hold live in the Leads inbox; qualified/customer/none/disqualified are
 * out of triage. Most transitions are automatic — see api/activities.ts and
 * api/deals.ts.
 */
export type LeadStatus =
  | 'new'
  | 'attempted_contact'
  | 'contacted'
  | 'on_hold'
  | 'qualified'
  | 'customer'
  | 'disqualified'
  | 'none';

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
  lead_status: LeadStatus;
  lead_hold_until: string | null; // ISO date — when an on-hold lead resurfaces
  disqualify_reason: string | null;
  intake_note: string | null;     // the pinned original inquiry note
  intake_source: string | null;   // 'website form' / 'in-app form' / ...
  intake_at: string | null;
  phone2: string;                 // optional secondary phone
  preferred_contact: string | null; // 'call' | 'text' | 'email'
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
  lost_to: string | null;      // competitor / price note on a lost deal
  site_address: string;        // the project site (mailing address lives on the contact)
  held_until: string | null;   // On Hold overlay — stage stays put, clock pauses
  hold_note: string | null;
  reminder_at: string | null;  // per-card reminder override (aging, phase 3)
  archived_at: string | null;  // archived cards leave lists but keep everything
  archive_reason: string | null;
  notes: string;
  assigned_to: string | null;  // team member email — who works this deal
  closed_by: string | null;    // snapshot at won; commission attribution, never rewritten
  created_via: string;         // 'app' | 'api'
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_email: string;
  type: 'deal_assigned' | 'inbound_lead';
  channel: string;
  deal_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  contact_id: string;
  deal_id: string | null;
  type: ActivityType;
  body: string;
  happened_at: string;
  logged_by: string;
  source: string;              // 'manual' | 'system' | future telephony provider
  direction: string | null;    // 'inbound' | 'outbound'
  outcome: string | null;      // CallOutcome for calls
  duration_min: number | null;
  edited_at: string | null;
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
  'lead',
  'follow_up',
  'site_visit',
  'estimate',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
];

export const STAGE_META: Record<DealStage, { label: string; probability: number; color: string }> = {
  lead: { label: 'Lead', probability: 5, color: 'bg-red-100 text-red-700' },
  follow_up: { label: 'Follow Up', probability: 15, color: 'bg-orange-100 text-orange-700' },
  site_visit: { label: 'Site Visit', probability: 25, color: 'bg-sky-100 text-sky-700' },
  estimate: { label: 'Estimate', probability: 40, color: 'bg-violet-100 text-violet-700' },
  proposal_sent: { label: 'Proposal Sent', probability: 50, color: 'bg-amber-100 text-amber-700' },
  negotiating: { label: 'Negotiating', probability: 75, color: 'bg-orange-100 text-orange-700' },
  won: { label: 'Won', probability: 100, color: 'bg-green-100 text-green-700' },
  lost: { label: 'Lost', probability: 0, color: 'bg-red-100 text-red-600' },
  // legacy display-only
  inquiry: { label: 'Inquiry', probability: 10, color: 'bg-slate-100 text-slate-700' },
  site_visit_scheduled: { label: 'Site Visit', probability: 25, color: 'bg-sky-100 text-sky-700' },
};

export const OPEN_STAGES: DealStage[] = ['lead', 'follow_up', 'site_visit', 'estimate', 'proposal_sent', 'negotiating'];

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

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'attempted_contact',
  'contacted',
  'on_hold',
  'qualified',
  'customer',
  'none',
  'disqualified',
];

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: 'New lead', color: 'bg-red-100 text-red-700' },
  attempted_contact: { label: 'Attempted contact', color: 'bg-orange-100 text-orange-700' },
  contacted: { label: 'Contacted', color: 'bg-sky-100 text-sky-700' },
  on_hold: { label: 'Nurture', color: 'bg-amber-100 text-amber-800' },
  qualified: { label: 'Qualified', color: 'bg-green-100 text-green-700' },
  customer: { label: 'Customer', color: 'bg-emerald-100 text-emerald-800' },
  disqualified: { label: 'Disqualified', color: 'bg-gray-200 text-gray-600' },
  none: { label: 'Contact', color: 'bg-gray-100 text-gray-600' },
};

/** Statuses that appear in the Leads inbox. */
export const LEAD_INBOX_STATUSES: LeadStatus[] = ['new', 'attempted_contact', 'contacted', 'on_hold'];

/** Human outreach — the activity types that flip a new lead to "contacted". */
export const HUMAN_TOUCH_TYPES: ActivityType[] = ['call', 'text', 'email', 'meeting', 'site_visit'];

export const ACTIVITY_META: Record<ActivityType, { label: string }> = {
  call: { label: 'Call' },
  text: { label: 'Text' },
  email: { label: 'Email' },
  meeting: { label: 'Meeting' },
  site_visit: { label: 'Site Visit' },
  note: { label: 'Note' },
  proposal_event: { label: 'Proposal' },
  field_change: { label: 'Change' },
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

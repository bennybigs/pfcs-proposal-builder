// Reporting data layer. Two SQL views do the joining + won/lost dating
// (report_deals, report_stage_entries); the client filters by range/segment
// and groups — trivial at a few thousand rows, and the views keep it fast.
// All period boundaries are America/New_York (store UTC, bucket Eastern).
import { useQuery } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { ContactSource, DealSegment, DealStage } from '@/lib/crm/types';

export interface ReportDeal {
  id: string;
  title: string;
  stage: DealStage;
  segment: DealSegment;
  value: number;
  created_at: string;
  stage_entered_at: string;
  lost_reason: string | null;
  contact_id: string;
  contact_name: string;
  assigned_to: string | null;
  closed_by: string | null;
  created_via: string;
  source: ContactSource;
  source_detail: string | null;
  archived: boolean;
  won_at: string | null;
  lost_at: string | null;
}

export interface StageEntry {
  deal_id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_at: string;
  segment: DealSegment;
  source: ContactSource;
  source_detail: string | null;
  archived: boolean;
}

export async function fetchReportDeals(): Promise<ReportDeal[]> {
  const { data, error } = await sb().from('report_deals').select('*');
  if (error) throw error;
  return data as ReportDeal[];
}

export async function fetchStageEntries(): Promise<StageEntry[]> {
  const { data, error } = await sb()
    .from('report_stage_entries')
    .select('*')
    .order('changed_at');
  if (error) throw error;
  return data as StageEntry[];
}

export function useReportDeals() {
  return useQuery({ queryKey: ['report_deals'], queryFn: fetchReportDeals });
}
export function useStageEntries() {
  return useQuery({ queryKey: ['report_stage_entries'], queryFn: fetchStageEntries });
}

// ── Eastern-time bucketing ───────────────────────────────────────────

const easternFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** UTC timestamp → "YYYY-MM-DD" in America/New_York. */
export const easternDate = (iso: string): string => easternFmt.format(new Date(iso));
/** UTC timestamp → "YYYY-MM" in America/New_York. */
export const easternMonth = (iso: string): string => easternDate(iso).slice(0, 7);

/** Inclusive range check on Eastern calendar dates ("YYYY-MM-DD" strings). */
export const inRange = (iso: string | null, from: string, to: string): boolean => {
  if (!iso) return false;
  const d = easternDate(iso);
  return d >= from && d <= to;
};

/** List of "YYYY-MM" months spanning from..to (Eastern date strings). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const end = to.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const label = `${y}-${String(m).padStart(2, '0')}`;
    out.push(label);
    if (label >= end) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ── Range presets ────────────────────────────────────────────────────

export type RangePreset =
  | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter'
  | 'ytd' | 'last_12' | 'custom';

export const PRESET_LABEL: Record<RangePreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  ytd: 'Year to date',
  last_12: 'Last 12 months',
  custom: 'Custom',
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Resolve a preset to inclusive Eastern [from, to] date strings. */
export function presetRange(preset: RangePreset, todayIso?: string): [string, string] {
  const today = todayIso ?? easternDate(new Date().toISOString());
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'this_month':
      return [ymd(y, m, 1), today];
    case 'last_month': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return [ymd(ly, lm, 1), ymd(ly, lm, lastDay(ly, lm))];
    }
    case 'this_quarter': {
      const qm = m - ((m - 1) % 3);
      return [ymd(y, qm, 1), today];
    }
    case 'last_quarter': {
      const qm = m - ((m - 1) % 3);
      const sy = qm <= 3 ? y - 1 : y;
      const sm = qm <= 3 ? qm + 9 : qm - 3;
      const em = sm + 2;
      return [ymd(sy, sm, 1), ymd(sy, em, lastDay(sy, em))];
    }
    case 'ytd':
      return [ymd(y, 1, 1), today];
    case 'last_12': {
      const sy = m === 12 ? y : y - 1;
      const sm = m === 12 ? 1 : m + 1;
      return [ymd(sy, sm, 1), today];
    }
    case 'custom':
      return [today, today]; // caller overrides with explicit from/to
  }
}

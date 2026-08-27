// Aging: every card carries a clock. Stage limits come from shared settings
// (builder_shared key 'crm_settings' — editable on the Team page); the clock
// resets on stage entry, pauses on hold, and a per-card reminder_at override
// replaces the stage default until the card moves stages.
// Escalation: ok → amber at the limit → red at 2× the limit.
// The same math runs in /api/aging-check (cron) for tasks + push.
import { useQuery } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { Deal, DealStage } from '@/lib/crm/types';

export interface CrmSettings {
  /** hours in stage before amber (red at 2×) */
  stageLimitHours: Partial<Record<DealStage, number>>;
  /** per-stage: send push/email when the limit hits (task is always created) */
  notifyStages: Partial<Record<DealStage, boolean>>;
  /** local hours (America/New_York), e.g. 20 → 7 = no pings 8pm–7am */
  quietHours: { start: number; end: number };
}

export const DEFAULT_CRM_SETTINGS: CrmSettings = {
  stageLimitHours: {
    lead: 4,
    follow_up: 48,
    site_visit: 72,
    estimate: 72,
    proposal_sent: 120,
    negotiating: 168,
  },
  notifyStages: {
    lead: true,
    follow_up: true,
    site_visit: true,
    estimate: true,
    proposal_sent: true,
    negotiating: false,
  },
  quietHours: { start: 20, end: 7 },
};

export function mergeSettings(raw: unknown): CrmSettings {
  const r = (raw ?? {}) as Partial<CrmSettings>;
  return {
    stageLimitHours: { ...DEFAULT_CRM_SETTINGS.stageLimitHours, ...(r.stageLimitHours ?? {}) },
    notifyStages: { ...DEFAULT_CRM_SETTINGS.notifyStages, ...(r.notifyStages ?? {}) },
    quietHours: { ...DEFAULT_CRM_SETTINGS.quietHours, ...(r.quietHours ?? {}) },
  };
}

export function useCrmSettings() {
  return useQuery({
    queryKey: ['crm_settings'],
    queryFn: async (): Promise<CrmSettings> => {
      const { data } = await sb()
        .from('builder_shared')
        .select('data')
        .eq('key', 'crm_settings')
        .maybeSingle();
      return mergeSettings(data?.data);
    },
    staleTime: 5 * 60_000,
  });
}

export async function saveCrmSettings(settings: CrmSettings): Promise<void> {
  const email = (await sb().auth.getUser()).data.user?.email ?? '';
  const { error } = await sb().from('builder_shared').upsert({
    key: 'crm_settings',
    data: settings as unknown as object,
    updated_at: new Date().toISOString(),
    updated_by: email,
  });
  if (error) throw error;
}

export type AgingLevel = 'ok' | 'amber' | 'red' | 'paused' | 'none';

export interface Aging {
  level: AgingLevel;
  /** when this card goes (went) amber */
  deadline: Date | null;
  hoursIn: number;
}

/** Pure — identical logic client-side and in the cron. */
export function agingFor(
  deal: Pick<Deal, 'stage' | 'stage_entered_at' | 'held_until' | 'reminder_at' | 'archived_at'>,
  settings: CrmSettings,
  now: Date = new Date()
): Aging {
  if (deal.archived_at || deal.stage === 'won' || deal.stage === 'lost') {
    return { level: 'none', deadline: null, hoursIn: 0 };
  }
  const entered = new Date(deal.stage_entered_at).getTime();
  const hoursIn = Math.max(0, (now.getTime() - entered) / 3_600_000);
  const today = now.toISOString().slice(0, 10);
  if (deal.held_until && deal.held_until > today) {
    return { level: 'paused', deadline: null, hoursIn };
  }
  const limitH = settings.stageLimitHours[deal.stage];
  // per-card override: reminder_at replaces the stage default (amber at the
  // reminder, red 24h past it)
  if (deal.reminder_at) {
    const remind = new Date(deal.reminder_at).getTime();
    const level: AgingLevel =
      now.getTime() >= remind + 24 * 3_600_000 ? 'red' : now.getTime() >= remind ? 'amber' : 'ok';
    return { level, deadline: new Date(remind), hoursIn };
  }
  if (!limitH) return { level: 'ok', deadline: null, hoursIn };
  const deadline = new Date(entered + limitH * 3_600_000);
  const level: AgingLevel =
    hoursIn >= 2 * limitH ? 'red' : hoursIn >= limitH ? 'amber' : 'ok';
  return { level, deadline, hoursIn };
}

/** Sort weight: red first, then amber, then everything else. */
export const agingWeight = (level: AgingLevel): number =>
  level === 'red' ? 0 : level === 'amber' ? 1 : 2;

/** "2d" / "4h" chip text. */
export function hoursLabel(hoursIn: number): string {
  if (hoursIn < 1) return `${Math.max(0, Math.floor(hoursIn * 60))}m`;
  if (hoursIn < 48) return `${Math.floor(hoursIn)}h`;
  return `${Math.floor(hoursIn / 24)}d`;
}

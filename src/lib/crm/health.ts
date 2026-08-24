// "Gone quiet" — deals in an open stage with no open task and no activity in
// the last 14 days. DECISION: computed client-side rather than a Postgres
// view: the pipeline already fetches deals, recent activities, and tasks for
// its own rendering, so a view would add a round-trip without saving one.
import { OPEN_STAGES, type Activity, type Deal, type Task } from './types';

export const GONE_QUIET_DAYS = 14;

export function goneQuietDealIds(
  deals: Deal[],
  activities: Activity[],
  tasks: Task[],
  now: Date = new Date()
): Set<string> {
  const cutoff = now.getTime() - GONE_QUIET_DAYS * 86_400_000;
  const openTaskDeals = new Set(tasks.filter((t) => !t.done && t.deal_id).map((t) => t.deal_id!));
  const recentActivityDeals = new Set(
    activities.filter((a) => a.deal_id && new Date(a.happened_at).getTime() >= cutoff).map((a) => a.deal_id!)
  );
  const quiet = new Set<string>();
  for (const d of deals) {
    if (!OPEN_STAGES.includes(d.stage)) continue;
    if (openTaskDeals.has(d.id) || recentActivityDeals.has(d.id)) continue;
    // a brand-new deal isn't "quiet" yet
    if (new Date(d.stage_entered_at).getTime() >= cutoff) continue;
    quiet.add(d.id);
  }
  return quiet;
}

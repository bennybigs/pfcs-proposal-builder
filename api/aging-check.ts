// Every 15 minutes (vercel.json cron): find cards past their stage limit (or
// past their per-card reminder), create a follow-up task for the assignee,
// and queue a stage_overdue notification (bell + push + email via
// /api/notify-flush). Idempotent per stage-entry: deals.aging_notified_at
// marks "already pinged for this stage/reminder" and stage changes naturally
// re-arm it. Quiet hours (America/New_York) defer pings, never drop them —
// the next cron after quiet ends picks them up. Held cards are skipped.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = () => ({
  apikey: SVC(),
  Authorization: `Bearer ${SVC()}`,
  'Content-Type': 'application/json',
});

const OPEN_STAGES = ['lead', 'follow_up', 'site_visit', 'estimate', 'proposal_sent', 'negotiating'];
const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead', follow_up: 'Follow Up', site_visit: 'Site Visit',
  estimate: 'Estimate', proposal_sent: 'Proposal Sent', negotiating: 'Negotiating',
};
const DEFAULT_LIMITS: Record<string, number> = {
  lead: 4, follow_up: 48, site_visit: 72, estimate: 72, proposal_sent: 120, negotiating: 168,
};
const DEFAULT_NOTIFY: Record<string, boolean> = {
  lead: true, follow_up: true, site_visit: true, estimate: true, proposal_sent: true, negotiating: false,
};

interface DealRow {
  id: string; contact_id: string; title: string; stage: string;
  stage_entered_at: string; held_until: string | null; reminder_at: string | null;
  archived_at: string | null; assigned_to: string | null; aging_notified_at: string | null;
  value: number;
}

async function pg<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { headers: HEADERS(), ...init });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const now = new Date();
  try {
    // settings (shared row, admin-edited in the app)
    const settingsRows = await pg<{ data: Record<string, unknown> }[]>(
      `builder_shared?key=eq.crm_settings&select=data`
    );
    const raw = (settingsRows[0]?.data ?? {}) as {
      stageLimitHours?: Record<string, number>;
      notifyStages?: Record<string, boolean>;
      quietHours?: { start: number; end: number };
    };
    const limits = { ...DEFAULT_LIMITS, ...(raw.stageLimitHours ?? {}) };
    const notifyStages = { ...DEFAULT_NOTIFY, ...(raw.notifyStages ?? {}) };
    const quiet = raw.quietHours ?? { start: 20, end: 7 };

    // quiet hours in Eastern: defer pings entirely (cron runs again after)
    const easternHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now)
    ) % 24;
    const inQuiet =
      quiet.start > quiet.end
        ? easternHour >= quiet.start || easternHour < quiet.end
        : easternHour >= quiet.start && easternHour < quiet.end;
    if (inQuiet) return res.status(200).json({ ok: true, deferred: 'quiet hours' });

    const deals = await pg<DealRow[]>(
      `deals?stage=in.(${OPEN_STAGES.join(',')})&archived_at=is.null&select=id,contact_id,title,stage,stage_entered_at,held_until,reminder_at,archived_at,assigned_to,aging_notified_at,value`
    );
    const admins = await pg<{ email: string }[]>(`team_members?is_admin=eq.true&select=email`);
    const today = now.toISOString().slice(0, 10);

    let pinged = 0;
    for (const d of deals) {
      if (d.held_until && d.held_until > today) continue; // clock paused
      const entered = new Date(d.stage_entered_at).getTime();
      const deadline = d.reminder_at
        ? new Date(d.reminder_at).getTime()
        : entered + (limits[d.stage] ?? 0) * 3_600_000;
      if (!deadline || now.getTime() < deadline) continue;

      // already pinged for this stage entry / this reminder?
      const marked = d.aging_notified_at ? new Date(d.aging_notified_at).getTime() : 0;
      const armAfter = Math.max(entered, d.reminder_at ? 0 : 0);
      const rearmed =
        !marked || marked < armAfter || (d.reminder_at && marked < new Date(d.reminder_at).getTime());
      if (!rearmed) continue;

      const contact = (await pg<{ name: string }[]>(`contacts?id=eq.${d.contact_id}&select=name`))[0];
      const cname = contact?.name ?? 'Unknown';
      const overdueLabel = d.reminder_at
        ? `reminder due`
        : `${STAGE_LABEL[d.stage] ?? d.stage} overdue (${limits[d.stage]}h limit)`;

      // 1) the task — always, quiet or loud
      await pg('tasks', {
        method: 'POST',
        headers: { ...HEADERS(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          contact_id: d.contact_id,
          deal_id: d.id,
          title: `Follow up: ${cname} — ${overdueLabel}`,
          due_date: today,
          assigned_to: d.assigned_to ?? '',
        }),
      });

      // 2) the ping — assignee, or every admin when unassigned — if this
      //    stage's notifications are switched on
      if (notifyStages[d.stage] ?? true) {
        const recipients = d.assigned_to ? [d.assigned_to] : admins.map((a) => a.email);
        for (const email of recipients) {
          await pg('notifications', {
            method: 'POST',
            headers: { ...HEADERS(), Prefer: 'return=minimal' },
            body: JSON.stringify({
              user_email: email,
              type: 'stage_overdue',
              deal_id: d.id,
              title: `Needs attention: ${d.title}`,
              body: `${cname} · ${overdueLabel}${d.value ? ` · $${Math.round(d.value)}` : ''}`,
            }),
          });
        }
      }

      await pg(`deals?id=eq.${d.id}`, {
        method: 'PATCH',
        headers: { ...HEADERS(), Prefer: 'return=minimal' },
        body: JSON.stringify({ aging_notified_at: now.toISOString() }),
      });
      pinged++;
    }

    // deliver queued push/email now
    if (pinged > 0) {
      try {
        await fetch(`https://${String(req.headers.host)}/api/notify-flush`, { method: 'POST' });
      } catch {
        // flush is best-effort; the bell shows regardless
      }
    }
    return res.status(200).json({ ok: true, checked: deals.length, pinged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'failed' });
  }
}

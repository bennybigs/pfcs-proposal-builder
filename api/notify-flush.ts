// Delivers queued notification emails. The DB triggers write notification
// rows (deal_assigned, inbound_lead); this endpoint finds rows with no email
// delivery yet, checks the recipient's preference, and sends via Postmark.
// Called fire-and-forget by the app after assignments, and by the inbound
// endpoint after a lead lands. Idempotent: one delivery row per notification
// (unique constraint), failed sends are retried on the next flush.
//
// Deliberately unauthenticated: it can only ever send pending internal
// notifications to team members' own addresses — invoking it with nothing
// queued does nothing. A small in-memory rate limit blunts abuse.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = () => ({
  apikey: SVC(),
  Authorization: `Bearer ${SVC()}`,
  'Content-Type': 'application/json',
});

interface NotificationRow {
  id: string;
  user_email: string;
  type: 'deal_assigned' | 'inbound_lead';
  deal_id: string | null;
  title: string;
  body: string;
  created_at: string;
}
interface DeliveryRow {
  notification_id: string;
  status: string;
}
interface MemberRow {
  email: string;
  display_name: string;
  email_notifications: boolean;
}

async function pg<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { headers: HEADERS(), ...init });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function recordDelivery(
  notificationId: string,
  status: string,
  providerMessageId?: string,
  error?: string
): Promise<void> {
  await fetch(`${URL_()}/rest/v1/notification_deliveries?on_conflict=notification_id,channel`, {
    method: 'POST',
    headers: { ...HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      notification_id: notificationId,
      channel: 'email',
      status,
      provider_message_id: providerMessageId ?? null,
      error: error ? error.slice(0, 300) : null,
    }),
  });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let lastRuns: number[] = []; // in-memory per-instance rate limit

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const now = Date.now();
  lastRuns = lastRuns.filter((t) => now - t < 60_000);
  if (lastRuns.length >= 10) return res.status(429).json({ error: 'Slow down' });
  lastRuns.push(now);

  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    // no delivery rows written — everything stays queued until the token exists
    return res.status(503).json({ error: 'email-not-configured', queuedStays: true });
  }
  const from = process.env.SIGN_FROM_EMAIL || 'ben@mcsi.work';
  const origin = `https://${String(req.headers.host ?? 'pfcs-proposal-builder.vercel.app')}`;

  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const pending = await pg<NotificationRow[]>(
      `notifications?created_at=gte.${since}&order=created_at.asc&limit=100&select=id,user_email,type,deal_id,title,body,created_at`
    );
    if (!pending.length) return res.status(200).json({ sent: 0, skipped: 0 });

    const ids = pending.map((n) => `"${n.id}"`).join(',');
    const delivered = await pg<DeliveryRow[]>(
      `notification_deliveries?notification_id=in.(${ids})&channel=eq.email&select=notification_id,status`
    );
    const done = new Set(delivered.filter((d) => d.status !== 'failed').map((d) => d.notification_id));
    const work = pending.filter((n) => !done.has(n.id)).slice(0, 20);

    const members = await pg<MemberRow[]>(`team_members?select=email,display_name,email_notifications`);
    const memberByEmail = new Map(members.map((m) => [m.email, m]));

    let sent = 0;
    let skipped = 0;
    for (const n of work) {
      const member = memberByEmail.get(n.user_email);
      if (!member) {
        await recordDelivery(n.id, 'skipped_not_member');
        skipped++;
        continue;
      }
      if (!member.email_notifications) {
        await recordDelivery(n.id, 'skipped_pref_off');
        skipped++;
        continue;
      }
      const dealUrl = n.deal_id ? `${origin}/crm/pipeline?deal=${n.deal_id}` : `${origin}/crm`;
      const subject = n.title;
      const text = `${n.title}\n\n${n.body}\n\nOpen the deal: ${dealUrl}\n\n— PFCS CRM (turn email notifications off on the Team page)`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
<p style="font-weight:bold">${esc(n.title)}</p>
<p>${esc(n.body)}</p>
<p><a href="${dealUrl}" style="display:inline-block;background:#E8930C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open the deal</a></p>
<p style="color:#6b7280;font-size:12px">— PFCS CRM · turn email notifications off on the Team page</p>
</div>`;
      try {
        const r = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Postmark-Server-Token': token,
          },
          body: JSON.stringify({
            From: from,
            To: n.user_email,
            Subject: subject,
            TextBody: text,
            HtmlBody: html,
            MessageStream: 'outbound',
            Tag: n.type,
          }),
        });
        const body = (await r.json()) as { MessageID?: string; Message?: string };
        if (r.ok) {
          await recordDelivery(n.id, 'sent', body.MessageID);
          sent++;
        } else {
          await recordDelivery(n.id, 'failed', undefined, body.Message ?? `HTTP ${r.status}`);
          skipped++;
        }
      } catch (e) {
        await recordDelivery(n.id, 'failed', undefined, e instanceof Error ? e.message : String(e));
        skipped++;
      }
    }
    return res.status(200).json({ sent, skipped });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message.slice(0, 200) : 'flush failed' });
  }
}

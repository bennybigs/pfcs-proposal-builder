// Delivers queued notifications on every configured channel. The DB triggers
// write notification rows (deal_assigned, inbound_lead); this endpoint finds
// rows not yet delivered per channel and sends:
//   email — Postmark (needs POSTMARK_SERVER_TOKEN; until then email stays queued)
//   push  — Web Push to every device the recipient enabled (needs VAPID_PRIVATE_KEY)
// Channels are independent: push fires even while email is unconfigured.
// Called fire-and-forget by the app after assignments and by /api/inbound-lead.
// Idempotent: one delivery row per (notification, channel); failed rows retry
// on the next flush.
//
// Deliberately unauthenticated: it can only ever deliver pending internal
// notifications to team members' own addresses/devices — invoking it with
// nothing queued does nothing. A small in-memory rate limit blunts abuse.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = () => ({
  apikey: SVC(),
  Authorization: `Bearer ${SVC()}`,
  'Content-Type': 'application/json',
});

// public half of the pair; private half lives only in env
const VAPID_PUBLIC_KEY =
  'BNSvFty1DWlANGxUy27gxvMdC5VIDaUZ0CzCUAx4-bWsqAWToI31HnVJ-i1vCOZAMdtkoGRoNYixG1R-VYAI0M0';

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
  channel: string;
  status: string;
}
interface MemberRow {
  email: string;
  display_name: string;
  email_notifications: boolean;
}
interface SubRow {
  id: string;
  user_email: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function pg<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { headers: HEADERS(), ...init });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function recordDelivery(
  notificationId: string,
  channel: 'email' | 'push',
  status: string,
  providerMessageId?: string,
  error?: string
): Promise<void> {
  await fetch(`${URL_()}/rest/v1/notification_deliveries?on_conflict=notification_id,channel`, {
    method: 'POST',
    headers: { ...HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      notification_id: notificationId,
      channel,
      status,
      provider_message_id: providerMessageId ?? null,
      error: error ? error.slice(0, 300) : null,
    }),
  });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const dealUrlOf = (origin: string, n: NotificationRow) =>
  n.deal_id ? `${origin}/crm/pipeline?deal=${n.deal_id}` : `${origin}/crm`;

/** Which notifications still need a given channel (no non-failed delivery). */
function pendingFor(all: NotificationRow[], delivered: DeliveryRow[], channel: string): NotificationRow[] {
  const done = new Set(
    delivered.filter((d) => d.channel === channel && d.status !== 'failed').map((d) => d.notification_id)
  );
  return all.filter((n) => !done.has(n.id)).slice(0, 20);
}

async function flushEmail(
  work: NotificationRow[],
  members: Map<string, MemberRow>,
  origin: string,
  token: string,
  from: string
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const n of work) {
    const member = members.get(n.user_email);
    if (!member) {
      await recordDelivery(n.id, 'email', 'skipped_not_member');
      skipped++;
      continue;
    }
    if (!member.email_notifications) {
      await recordDelivery(n.id, 'email', 'skipped_pref_off');
      skipped++;
      continue;
    }
    const dealUrl = dealUrlOf(origin, n);
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
          Subject: n.title,
          TextBody: text,
          HtmlBody: html,
          MessageStream: 'outbound',
          Tag: n.type,
        }),
      });
      const body = (await r.json()) as { MessageID?: string; Message?: string };
      if (r.ok) {
        await recordDelivery(n.id, 'email', 'sent', body.MessageID);
        sent++;
      } else {
        await recordDelivery(n.id, 'email', 'failed', undefined, body.Message ?? `HTTP ${r.status}`);
        skipped++;
      }
    } catch (e) {
      await recordDelivery(n.id, 'email', 'failed', undefined, e instanceof Error ? e.message : String(e));
      skipped++;
    }
  }
  return { sent, skipped };
}

async function flushPush(
  work: NotificationRow[],
  origin: string
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  if (!work.length) return { sent, skipped };
  const emails = [...new Set(work.map((n) => n.user_email))]
    .map((e) => `"${e}"`)
    .join(',');
  const subs = await pg<SubRow[]>(
    `push_subscriptions?user_email=in.(${emails})&select=id,user_email,endpoint,p256dh,auth`
  );
  const byUser = new Map<string, SubRow[]>();
  for (const s of subs) {
    const list = byUser.get(s.user_email) ?? [];
    list.push(s);
    byUser.set(s.user_email, list);
  }
  for (const n of work) {
    const targets = byUser.get(n.user_email) ?? [];
    if (!targets.length) {
      await recordDelivery(n.id, 'push', 'skipped_no_subscription');
      skipped++;
      continue;
    }
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      url: dealUrlOf(origin, n),
      tag: n.id,
    });
    let delivered = 0;
    let lastError = '';
    for (const t of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload,
          { TTL: 86400 }
        );
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        lastError = e instanceof Error ? e.message : String(e);
        if (status === 404 || status === 410) {
          // device unsubscribed / app removed — drop the dead endpoint
          await fetch(`${URL_()}/rest/v1/push_subscriptions?id=eq.${t.id}`, {
            method: 'DELETE',
            headers: HEADERS(),
          }).catch(() => undefined);
        }
      }
    }
    if (delivered > 0) {
      await recordDelivery(n.id, 'push', 'sent', `${delivered}/${targets.length} devices`);
      sent++;
    } else {
      await recordDelivery(n.id, 'push', 'failed', undefined, lastError || 'all devices failed');
      skipped++;
    }
  }
  return { sent, skipped };
}

let lastRuns: number[] = []; // in-memory per-instance rate limit

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const now = Date.now();
  lastRuns = lastRuns.filter((t) => now - t < 60_000);
  if (lastRuns.length >= 10) return res.status(429).json({ error: 'Slow down' });
  lastRuns.push(now);

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const from = process.env.SIGN_FROM_EMAIL || 'ben@mcsi.work';
  const origin = `https://${String(req.headers.host ?? 'pfcs-proposal-builder.vercel.app')}`;

  if (vapidPrivate) {
    webpush.setVapidDetails('mailto:ben@mcsi.work', VAPID_PUBLIC_KEY, vapidPrivate);
  }

  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const pending = await pg<NotificationRow[]>(
      `notifications?created_at=gte.${since}&order=created_at.asc&limit=100&select=id,user_email,type,deal_id,title,body,created_at`
    );
    if (!pending.length) {
      return res.status(200).json({ email: { sent: 0, skipped: 0 }, push: { sent: 0, skipped: 0 } });
    }
    const ids = pending.map((n) => `"${n.id}"`).join(',');
    const delivered = await pg<DeliveryRow[]>(
      `notification_deliveries?notification_id=in.(${ids})&select=notification_id,channel,status`
    );
    const members = new Map(
      (await pg<MemberRow[]>(`team_members?select=email,display_name,email_notifications`)).map(
        (m) => [m.email, m] as const
      )
    );

    const email = postmarkToken
      ? await flushEmail(pendingFor(pending, delivered, 'email'), members, origin, postmarkToken, from)
      : ('not-configured' as const);
    const push = vapidPrivate
      ? await flushPush(pendingFor(pending, delivered, 'push'), origin)
      : ('not-configured' as const);

    return res.status(200).json({ email, push });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message.slice(0, 200) : 'flush failed' });
  }
}

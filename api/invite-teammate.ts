// Emails a teammate an invitation to the PFCS CRM: what it is, the link,
// install steps for their phone, and the note that their starter password
// arrives from the admin by text (passwords are never emailed).
// Admin-only: the caller's Supabase token must belong to a team admin.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP = 'https://pfcs-proposal-builder.vercel.app';

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function verifyAdmin(authHeader: string | undefined): Promise<{ email: string; name: string } | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const userRes = await fetch(`${URL_()}/auth/v1/user`, {
    headers: { apikey: SVC(), Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as { email?: string };
  if (!user.email) return null;
  const rowRes = await fetch(
    `${URL_()}/rest/v1/team_members?email=eq.${encodeURIComponent(user.email)}&select=email,display_name,is_admin`,
    { headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}` } }
  );
  const rows = (await rowRes.json()) as { email: string; display_name: string; is_admin: boolean }[];
  if (!rows.length || !rows[0].is_admin) return null;
  return { email: rows[0].email, name: rows[0].display_name || rows[0].email };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) return res.status(503).json({ error: 'email-not-configured' });

  const admin = await verifyAdmin(String(req.headers.authorization ?? ''));
  if (!admin) return res.status(401).json({ error: 'Only team admins can send invitations.' });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const toEmail = clean(b.toEmail, 200).toLowerCase();
  const toName = clean(b.toName, 120);
  if (!isEmail(toEmail)) return res.status(400).json({ error: 'Valid teammate email required.' });

  // invitations go only to people actually on the team list
  const memberRes = await fetch(
    `${URL_()}/rest/v1/team_members?email=eq.${encodeURIComponent(toEmail)}&select=email`,
    { headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}` } }
  );
  if (!((await memberRes.json()) as unknown[]).length) {
    return res.status(400).json({ error: 'That address is not on the team list — add them first.' });
  }

  const from = process.env.SIGN_FROM_EMAIL || 'ben@mcsi.work';
  const greeting = toName ? `Hi ${toName.split(' ')[0]},` : 'Hi,';
  const text = [
    greeting,
    '',
    `${admin.name} added you to the Post-Frame Construction Solutions CRM — proposals, leads, and the pipeline, all in one place.`,
    '',
    `Get started: ${APP}/crm`,
    '',
    'On your phone (recommended):',
    '1. Open the link above in your browser',
    `2. iPhone: Share → "Add to Home Screen" · Android: menu → "Install app"`,
    '3. Open the installed app and sign in with this email address',
    `4. Your starter password comes from ${admin.name} by text — not by email`,
    '5. Once you’re in, tap "Enable notifications" so new leads buzz your phone',
    '',
    `Questions? Just reply — this goes straight to ${admin.name}.`,
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;max-width:560px;margin:0 auto">
<div style="background:#1a1a1a;padding:16px 20px;border-radius:8px 8px 0 0">
  <img src="${APP}/logo.jpg" alt="PFCS" style="height:44px;max-width:260px;object-fit:contain" />
</div>
<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:24px 20px">
  <p>${esc(greeting)}</p>
  <p><b>${esc(admin.name)}</b> added you to the Post-Frame Construction Solutions CRM — proposals, leads, and the pipeline, all in one place.</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${APP}/crm" style="display:inline-block;background:#E8930C;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">Open the PFCS CRM</a>
  </p>
  <p style="font-size:14px"><b>On your phone (recommended):</b><br/>
  1. Open the button above in your browser<br/>
  2. iPhone: Share → <b>Add to Home Screen</b> &nbsp;·&nbsp; Android: menu → <b>Install app</b><br/>
  3. Open the installed app and sign in with this email address<br/>
  4. Your starter password comes from ${esc(admin.name)} <b>by text</b> — never by email<br/>
  5. Once you're in, tap <b>Enable notifications</b> so new leads buzz your phone</p>
  <p style="color:#6b7280;font-size:13px">Questions? Just reply — this goes straight to ${esc(admin.name)}.</p>
</div>
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
        // display name quoted — a comma or quote in it breaks From parsing
        From: `"Post-Frame Construction Solutions" <${from}>`,
        To: toEmail,
        ReplyTo: admin.email,
        Subject: `${admin.name} added you to the PFCS CRM`,
        TextBody: text,
        HtmlBody: html,
        MessageStream: 'outbound',
        Tag: 'invite',
      }),
    });
    const body = (await r.json()) as { MessageID?: string; ErrorCode?: number; Message?: string };
    if (!r.ok) {
      const pending = body.ErrorCode === 412 || /pending/i.test(body.Message ?? '');
      return res.status(502).json({
        error: pending
          ? `Postmark hasn't approved the account yet — invitations only deliver to @mcsi.work addresses until then. Text ${toName || toEmail} the link and password instead.`
          : body.Message ?? `Email provider error (HTTP ${r.status}).`,
      });
    }
    return res.status(200).json({ ok: true, messageId: body.MessageID });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message.slice(0, 200) : 'send failed' });
  }
}

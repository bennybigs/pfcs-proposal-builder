// Sends a customer their proposal by email (Postmark), from the app instead
// of the PM's personal mail client. Replies go to the PM (Reply-To).
//
// Auth: requires a signed-in team member — the client passes its Supabase
// access token; we verify it and check team_members. This endpoint mails
// arbitrary recipients, so it must never be open like notify-flush.
//
// The share link is REBUILT onto the canonical production origin regardless
// of what the client sent (localhost dev, preview deploys), and only /view
// fragments are accepted — our sender can't be used to mail arbitrary URLs.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CANONICAL_ORIGIN = 'https://pfcs-proposal-builder.vercel.app';

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Build a From header safely. A display name containing a comma, quote, or
 * angle bracket MUST be quoted — "Post-Frame Construction Solutions, LLC"
 * unquoted parses as two addresses and the send is rejected.
 */
const fromHeader = (displayName: string, email: string): string => {
  const name = displayName.replace(/[\\"<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? `"${name}" <${email}>` : email;
};
const cleanMultiline = (v: unknown, max: number) =>
  String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function verifyTeamMember(authHeader: string | undefined): Promise<string | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const userRes = await fetch(`${URL_()}/auth/v1/user`, {
    headers: { apikey: SVC(), Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as { email?: string };
  if (!user.email) return null;
  const memberRes = await fetch(
    `${URL_()}/rest/v1/team_members?email=eq.${encodeURIComponent(user.email)}&select=email`,
    { headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}` } }
  );
  const rows = (await memberRes.json()) as unknown[];
  return rows.length ? user.email : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: 'email-not-configured',
      message: 'Email sending is not set up yet (Postmark token missing).',
    });
  }

  const sender = await verifyTeamMember(String(req.headers.authorization ?? ''));
  if (!sender) return res.status(401).json({ error: 'Sign in to the CRM to send email from the app.' });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const to = clean(b.to, 200).toLowerCase();
  const customerName = clean(b.customerName, 120);
  const subject = clean(b.subject, 200);
  const message = cleanMultiline(b.message, 2000);
  const pmName = clean(b.pmName, 120);
  const pmPhone = clean(b.pmPhone, 40);
  const companyName = clean(b.companyName, 120) || 'Post-Frame Construction Solutions';
  const replyTo = clean(b.replyTo, 200).toLowerCase();
  const shareUrlRaw = String(b.shareUrl ?? '');

  if (!isEmail(to)) return res.status(400).json({ error: 'Enter a valid customer email address.' });
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });

  // accept only /view share links; pin them to the production origin
  const viewIdx = shareUrlRaw.indexOf('/view#p=');
  if (viewIdx < 0) return res.status(400).json({ error: 'Invalid share link.' });
  const shareUrl = `${CANONICAL_ORIGIN}${shareUrlRaw.slice(viewIdx)}`;

  // Send AS the project manager when their address is a verified Postmark
  // sender (VERIFIED_SENDERS env, comma-separated). Otherwise send from the
  // default address with Reply-To the PM — replies reach them either way.
  const defaultFrom = process.env.SIGN_FROM_EMAIL || 'ben@mcsi.work';
  const verifiedSenders = (process.env.VERIFIED_SENDERS ?? defaultFrom)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const sendAsPm = isEmail(replyTo) && verifiedSenders.includes(replyTo);
  const from = sendAsPm ? replyTo : defaultFrom;
  const fromDisplay = sendAsPm && pmName ? `${pmName} — ${companyName}` : companyName;
  const greeting = customerName ? `Hello ${customerName},` : 'Hello,';
  const signoffName = pmName || companyName;

  const text = [
    greeting,
    '',
    ...(message ? [message, ''] : []),
    'View your proposal here:',
    shareUrl,
    '',
    'You can review everything online, and accept right from the page.',
    '',
    signoffName,
    companyName,
    ...(pmPhone ? [pmPhone] : []),
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;max-width:560px;margin:0 auto">
<div style="background:#1a1a1a;padding:16px 20px;border-radius:8px 8px 0 0">
  <img src="${CANONICAL_ORIGIN}/logo.jpg" alt="${esc(companyName)}" style="height:44px;max-width:260px;object-fit:contain" />
</div>
<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:24px 20px">
  <p>${esc(greeting)}</p>
  ${message ? `<p style="white-space:pre-line">${esc(message)}</p>` : ''}
  <p style="text-align:center;margin:28px 0">
    <a href="${shareUrl}" style="display:inline-block;background:#E8930C;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">View Your Proposal</a>
  </p>
  <p style="color:#6b7280;font-size:13px">You can review everything online, and accept right from the page. If the button doesn't work, copy this link:<br/>
  <span style="word-break:break-all">${shareUrl}</span></p>
  <p style="margin-top:24px">${esc(signoffName)}<br/>${esc(companyName)}${pmPhone ? `<br/>${esc(pmPhone)}` : ''}</p>
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
        From: fromHeader(fromDisplay, from),
        To: to,
        ...(isEmail(replyTo) && !sendAsPm ? { ReplyTo: replyTo } : {}),
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: 'outbound',
        Tag: 'proposal',
        Metadata: { sent_by: sender },
      }),
    });
    const body = (await r.json()) as { MessageID?: string; ErrorCode?: number; Message?: string };
    if (!r.ok) {
      // 412 = Postmark account pending approval — surface it in plain words
      const pending = body.ErrorCode === 412 || /pending/i.test(body.Message ?? '');
      return res.status(502).json({
        error: pending
          ? 'Postmark is still reviewing the account — until approved, mail only delivers to @mcsi.work addresses.'
          : body.Message ?? `Email provider error (HTTP ${r.status}).`,
      });
    }
    return res.status(200).json({ ok: true, messageId: body.MessageID });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message.slice(0, 200) : 'send failed' });
  }
}

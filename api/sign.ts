// Vercel serverless function: records an electronic acceptance and notifies
// the project manager by email (Postmark). The notification email is the
// durable record of the signature — it carries signer, timestamp, IP, and a
// link to the exact document that was signed.
//
// Required environment variables (set in Vercel):
//   POSTMARK_SERVER_TOKEN — Postmark server API token
//   SIGN_FROM_EMAIL       — verified Postmark sender signature, e.g. ben@mcsi.work
// Optional:
//   ALLOWED_NOTIFY_DOMAINS — comma-separated list; if set, notification
//                            recipients must be at one of these domains.

interface SignBody {
  proposalId?: string;
  appOrigin?: string;
  proposalNumber?: string;
  projectName?: string;
  customerName?: string;
  total?: string;
  signerName?: string;
  signerEmail?: string;
  notifyEmail?: string;
  notifyName?: string;
  documentUrl?: string;
  consent?: boolean;
  website?: string; // honeypot — must be empty
}

const MAX_FIELD = 300;

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_FIELD).replace(/[\r\n]/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const recentByIp = new Map<string, number[]>();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  const token = process.env.POSTMARK_SERVER_TOKEN;
  const fromEmail = process.env.SIGN_FROM_EMAIL;
  if (!token || !fromEmail) {
    res.status(503).json({ error: 'signing-not-configured' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || 'unknown';

  // Basic per-instance rate limit: 5 signs per IP per 10 minutes.
  const now = Date.now();
  const times = (recentByIp.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (times.length >= 5) {
    res.status(429).json({ error: 'too-many-requests' });
    return;
  }
  times.push(now);
  recentByIp.set(ip, times);

  const body = (req.body ?? {}) as SignBody;

  // Honeypot: real users never fill this hidden field.
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  const signerName = clean(body.signerName);
  const signerEmail = clean(body.signerEmail);
  const notifyEmail = clean(body.notifyEmail);
  const notifyName = clean(body.notifyName);
  const proposalNumber = clean(body.proposalNumber);
  const projectName = clean(body.projectName);
  const customerName = clean(body.customerName);
  const total = clean(body.total);
  const documentUrl = typeof body.documentUrl === 'string' ? body.documentUrl.slice(0, 16000) : '';
  const proposalId = clean(body.proposalId).replace(/[^a-zA-Z0-9-]/g, '');
  const appOrigin = clean(body.appOrigin);

  if (!signerName || !notifyEmail || body.consent !== true) {
    res.status(400).json({ error: 'missing-fields' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
    res.status(400).json({ error: 'invalid-notify-email' });
    return;
  }
  if (documentUrl && !/^https?:\/\//.test(documentUrl)) {
    res.status(400).json({ error: 'invalid-document-url' });
    return;
  }

  const allowedDomains = (process.env.ALLOWED_NOTIFY_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (allowedDomains.length > 0) {
    const domain = notifyEmail.split('@')[1]?.toLowerCase() ?? '';
    if (!allowedDomains.includes(domain)) {
      res.status(400).json({ error: 'notify-domain-not-allowed' });
      return;
    }
  }

  // One-click link for the project manager: opens the proposal in their own
  // browser (where the data lives) and flips it to Contract status.
  const markContractUrl =
    proposalId && /^https?:\/\//.test(appOrigin)
      ? `${appOrigin.replace(/\/+$/, '')}/proposal/${proposalId}?signed=1&by=${encodeURIComponent(
          signerName
        )}`
      : '';

  const signedAt = new Date().toISOString();
  const signedAtHuman = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  // `internal` = the project manager's notification (carries IP + the
  // mark-as-contract link). The signer's copy omits both.
  const buildText = (internal: boolean) =>
    [
      `Proposal:      ${proposalNumber} — ${projectName}`,
      `Customer:      ${customerName}`,
      `Total:         ${total}`,
      ``,
      `Signed by:     ${signerName}`,
      signerEmail ? `Signer email:  ${signerEmail}` : null,
      `Signed at:     ${signedAtHuman} (${signedAt})`,
      internal ? `IP address:    ${ip}` : null,
      ``,
      `The customer confirmed: "I agree to conduct this transaction electronically`,
      `and intend my typed name to serve as my signature, accepting this proposal`,
      `and authorizing Post-Frame Construction Solutions, LLC to proceed to the`,
      `contract phase."`,
      ``,
      documentUrl ? `Signed document: ${documentUrl}` : null,
      internal && markContractUrl ? `Mark as Contract:  ${markContractUrl}` : null,
      ``,
      `Keep this email — it is the record of the electronic acceptance.`,
    ]
      .filter((l): l is string => l !== null)
      .join('\n');

  const buildHtml = (internal: boolean) => {
    const rows: [string, string][] = [
      ['Customer', customerName],
      ['Total', total],
      ['Signed by', signerName],
      ['Signer email', signerEmail || '—'],
      ['Signed at', signedAtHuman],
    ];
    if (internal) rows.push(['IP address', ip]);
    return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#E8930C;margin-bottom:4px">${
      internal ? 'Proposal accepted ✍️' : 'Thank you — your acceptance is recorded ✍️'
    }</h2>
    <p><strong>${escapeHtml(signerName)}</strong> electronically signed proposal
    <strong>${escapeHtml(proposalNumber)}</strong> (${escapeHtml(projectName)}).</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#5A5A5A">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`
        )
        .join('')}
    </table>
    ${
      internal && markContractUrl
        ? `<p style="margin:20px 0"><a href="${escapeHtml(markContractUrl)}"
             style="background:#E8930C;color:#fff;text-decoration:none;padding:12px 22px;
                    border-radius:6px;font-weight:bold;display:inline-block">
             Open &amp; mark as Contract</a></p>`
        : ''
    }
    ${documentUrl ? `<p><a href="${escapeHtml(documentUrl)}" style="color:#E8930C">Open the signed proposal</a></p>` : ''}
    <p style="color:#5A5A5A;font-size:12px">The customer consented to sign electronically.
    Keep this email — it is the record of the acceptance.
    ${
      internal && markContractUrl
        ? 'The button above opens the proposal on the device where you build proposals and moves it to Contract.'
        : ''
    }</p>
  </div>`;
  };

  const send = async (to: string, isSignerCopy: boolean) => {
    const resp = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: fromEmail,
        To: to,
        Subject: isSignerCopy
          ? `Your signed copy — Proposal ${proposalNumber} (${projectName})`
          : `Proposal ${proposalNumber} accepted by ${signerName}`,
        TextBody: buildText(!isSignerCopy),
        HtmlBody: buildHtml(!isSignerCopy),
        MessageStream: 'outbound',
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`postmark ${resp.status}: ${detail.slice(0, 300)}`);
    }
  };

  try {
    await send(notifyEmail, false);
    if (signerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
      // Copy to the signer is best-effort; the PM notification is the record.
      await send(signerEmail, true).catch(() => {});
    }
  } catch (err) {
    console.error('sign notification failed', err);
    res.status(502).json({ error: 'email-send-failed' });
    return;
  }

  res.status(200).json({ ok: true, signedAt, notified: notifyName || notifyEmail });
}

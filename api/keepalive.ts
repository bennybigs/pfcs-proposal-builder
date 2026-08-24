// Daily Supabase keepalive (vercel.json cron). Free-tier Supabase pauses a
// project after ~a week without API traffic; one authenticated query a day
// keeps the CRM alive. Protected by Vercel's CRON_SECRET so only the cron
// (or someone holding the secret) can invoke it.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ ok: false, reason: 'Supabase env not set' });
  try {
    const r = await fetch(`${url}/rest/v1/heartbeat?id=eq.1`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ beat_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ok: r.ok, supabaseStatus: r.status });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: String(e instanceof Error ? e.message : e) });
  }
}

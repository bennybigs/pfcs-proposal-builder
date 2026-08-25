// Inbound lead intake — one authenticated POST for the marketing company,
// Zapier, website forms, or the 3D configurator. Creates (or matches) a
// contact and appends a deal in the first pipeline stage. Dedup: normalized
// email first, then phone digits — never creates duplicate contacts.
//
// Auth: x-api-key checked against INBOUND_API_KEYS (Vercel env), a
// comma-separated list of "label:secret" pairs so keys can be issued and
// revoked per integrator. The label (never the key) goes in the log.
//
// NOTE (Step 0 conflict resolution): the brief asked for a Supabase Edge
// Function; this repo's established serverless convention is Vercel /api
// functions (sign.ts, keepalive.ts, team-password.ts), so this follows suit.
// Same security shape: service-role key stays server-side.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = () => ({
  apikey: SVC(),
  Authorization: `Bearer ${SVC()}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

const SOURCES = ['referral', 'website', 'facebook', 'show', 'cold', 'other'] as const;
type Source = (typeof SOURCES)[number];
const SEGMENTS = ['barndominium', 'ag_shop', 'storage_garage', 'other'] as const;
type Segment = (typeof SEGMENTS)[number];

function mapSegment(v: unknown): Segment {
  const s = String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (/barndo|shouse|house/.test(s)) return 'barndominium';
  if (/^ag|agshop|farm|shop/.test(s)) return 'ag_shop';
  if (/storage|garage/.test(s)) return 'storage_garage';
  return 'other';
}
function mapSource(v: unknown): Source {
  const s = String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (/tradeshow|^show/.test(s)) return 'show';
  if (/facebook|^fb/.test(s)) return 'facebook';
  if (/referral|referred/.test(s)) return 'referral';
  if (/cold/.test(s)) return 'cold';
  if (/other/.test(s)) return 'other';
  if (/web|site|google|ad/.test(s)) return 'website';
  return 'website';
}
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

interface KeyEntry { label: string; secret: string }
function keyList(): KeyEntry[] {
  return (process.env.INBOUND_API_KEYS ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return i > 0
        ? { label: pair.slice(0, i), secret: pair.slice(i + 1) }
        : { label: 'default', secret: pair };
    });
}

async function pg<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { headers: HEADERS(), ...init });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function log(entry: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${URL_()}/rest/v1/inbound_lead_log`, {
      method: 'POST',
      headers: { ...HEADERS(), Prefer: 'return=minimal' },
      body: JSON.stringify(entry),
    });
  } catch {
    // logging must never break intake
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const provided = String(req.headers['x-api-key'] ?? '');
  const key = keyList().find((k) => k.secret === provided);
  if (!key) {
    await log({ key_label: 'unknown', status: 401, error: 'bad api key' });
    return res.status(401).json({ error: 'Invalid or missing x-api-key' });
  }

  // rate limit: 60 calls/minute per key, counted from the log table
  try {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const recent = await pg<unknown[]>(
      `inbound_lead_log?key_label=eq.${encodeURIComponent(key.label)}&received_at=gte.${cutoff}&select=id`
    );
    if (recent.length >= 60) {
      await log({ key_label: key.label, status: 429, error: 'rate limited' });
      return res.status(429).json({ error: 'Rate limit exceeded (60/minute)' });
    }
  } catch {
    // counting failure never blocks a lead
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = clean(b.email).toLowerCase();
  const phone = clean(b.phone);
  if (!email && !phone) {
    await log({ key_label: key.label, status: 400, error: 'email or phone required', payload: b });
    return res.status(400).json({ error: 'At least one of email or phone is required' });
  }

  const name =
    clean(`${clean(b.first_name)} ${clean(b.last_name)}`) || email || `Lead ${phone}`;
  const address = [clean(b.address), clean(b.city), [clean(b.state), clean(b.zip)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const segment = mapSegment(b.segment);
  const source = mapSource(b.source);
  const sourceDetail = clean(b.source_detail) || null;
  const budget = Math.max(0, Math.round(Number(b.budget) || 0));
  const message = clean(b.message ?? b.notes);

  try {
    // ── dedup: email, then phone digits ──
    let contact: { id: string; name: string } | undefined;
    if (email) {
      const rows = await pg<{ id: string; name: string }[]>(
        `contacts?email=ilike.${encodeURIComponent(email)}&select=id,name&limit=1`
      );
      contact = rows[0];
    }
    if (!contact && phone) {
      const d = digits(phone);
      if (d.length >= 7) {
        const rows = await pg<{ id: string; name: string; phone: string }[]>(
          `contacts?select=id,name,phone&phone=neq.&limit=500`
        );
        contact = rows.find((c) => digits(c.phone).endsWith(d.slice(-10)) && digits(c.phone).length >= 7);
      }
    }

    let createdContact = false;
    if (!contact) {
      const rows = await pg<{ id: string; name: string }[]>('contacts', {
        method: 'POST',
        body: JSON.stringify({
          name, email, phone, address,
          source, source_detail: sourceDetail,
          notes: '',
          lead_status: 'new', // lights the red counter in the app
        }),
      });
      contact = rows[0];
      createdContact = true;
    } else {
      // Re-engagement: a known contact who was out of the funnel (regular
      // contact or previously disqualified) inquired again — back to the
      // Leads inbox. Active leads, qualified deals, and customers keep
      // their status. Never blocks intake.
      try {
        await fetch(
          `${URL_()}/rest/v1/contacts?id=eq.${contact.id}&lead_status=in.(none,disqualified)`,
          {
            method: 'PATCH',
            headers: { ...HEADERS(), Prefer: 'return=minimal' },
            body: JSON.stringify({ lead_status: 'new', lead_hold_until: null }),
          }
        );
      } catch {
        // lifecycle bookkeeping never breaks intake
      }
    }

    const segLabel = { barndominium: 'Barndominium', ag_shop: 'Ag Shop', storage_garage: 'Storage/Garage', other: 'New project' }[segment];
    const deals = await pg<{ id: string }[]>('deals', {
      method: 'POST',
      body: JSON.stringify({
        contact_id: contact.id,
        title: `${contact.name} — ${segLabel}`,
        segment,
        value: budget,
        created_via: 'api', // fires the owners' inbound_lead notifications (DB trigger)
      }),
    });
    const deal = deals[0];

    const specs = b.building_specs && typeof b.building_specs === 'object'
      ? `\n\nSpecs: ${JSON.stringify(b.building_specs)}`
      : '';
    await pg('activities', {
      method: 'POST',
      body: JSON.stringify({
        contact_id: contact.id,
        deal_id: deal.id,
        type: 'note',
        body: `Inbound lead via API — ${source}${sourceDetail ? `/${sourceDetail}` : ''} (${key.label})${message ? ` — "${message}"` : ''}${specs}`,
        logged_by: `api:${key.label}`,
      }),
    });

    await log({
      key_label: key.label, status: 201, created_contact: createdContact,
      contact_id: contact.id, deal_id: deal.id, payload: b,
    });
    // deliver the owners' notification emails now rather than on next app visit
    try {
      await fetch(`https://${String(req.headers.host)}/api/notify-flush`, { method: 'POST' });
    } catch {
      // email delivery is best-effort; the in-app bell has the notification
    }
    return res.status(201).json({ contact_id: contact.id, deal_id: deal.id, created_contact: createdContact });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log({ key_label: key.label, status: 500, error: msg.slice(0, 500), payload: b });
    return res.status(500).json({ error: 'Internal error storing the lead' });
  }
}

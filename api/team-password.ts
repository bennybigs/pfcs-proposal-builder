// Set a team member's password from the Team page. Runs server-side because
// changing ANOTHER user's password needs the service-role key.
//
// Authorization model: the caller must present their own valid Supabase
// session token AND be listed in team_members; the target email must also be
// in team_members. Within those walls, any team member can set any team
// member's password — deliberate for a 2–3 person trusted crew (the team
// list itself is the security boundary).
//
// If the target has never signed in, the auth user is created on the spot
// (confirmed, with the given password) — so a brand-new teammate can skip
// "Create account" entirely and just sign in with what you text them.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL_ = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = () => ({
  apikey: SVC(),
  Authorization: `Bearer ${SVC()}`,
  'Content-Type': 'application/json',
});

async function callerEmail(req: VercelRequest): Promise<string | null> {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const r = await fetch(`${URL_()}/auth/v1/user`, {
    headers: { apikey: SVC(), Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) return null;
  const u = (await r.json()) as { email?: string };
  return u.email ?? null;
}

async function isTeamMember(email: string): Promise<boolean> {
  const r = await fetch(
    `${URL_()}/rest/v1/team_members?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email`,
    { headers: admin() }
  );
  return r.ok && ((await r.json()) as unknown[]).length > 0;
}

async function findUserId(email: string): Promise<string | null> {
  // team is tiny — paging through 200 covers it many times over
  const r = await fetch(`${URL_()}/auth/v1/admin/users?per_page=200`, { headers: admin() });
  if (!r.ok) return null;
  const body = (await r.json()) as { users?: { id: string; email?: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!URL_() || !SVC()) return res.status(500).json({ error: 'Supabase env not configured' });

  const { targetEmail, newPassword } = (req.body ?? {}) as {
    targetEmail?: string;
    newPassword?: string;
  };
  if (!targetEmail || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'targetEmail and a password of 8+ characters required' });
  }

  const caller = await callerEmail(req);
  if (!caller) return res.status(401).json({ error: 'Sign in first' });
  if (!(await isTeamMember(caller))) return res.status(403).json({ error: 'Not on the team' });
  if (!(await isTeamMember(targetEmail))) {
    return res.status(403).json({ error: 'That email is not on the team list — add it there first' });
  }

  const existingId = await findUserId(targetEmail);
  if (existingId) {
    const r = await fetch(`${URL_()}/auth/v1/admin/users/${existingId}`, {
      method: 'PUT',
      headers: admin(),
      body: JSON.stringify({ password: newPassword }),
    });
    if (!r.ok) return res.status(502).json({ error: `Could not update password (${r.status})` });
    return res.status(200).json({ ok: true, created: false });
  }
  const r = await fetch(`${URL_()}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin(),
    body: JSON.stringify({ email: targetEmail, password: newPassword, email_confirm: true }),
  });
  if (!r.ok) return res.status(502).json({ error: `Could not create account (${r.status})` });
  return res.status(200).json({ ok: true, created: true });
}

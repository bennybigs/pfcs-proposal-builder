// One-click sign-in, local development only.
//
// The dev server (never the shipped app) exposes /api/dev-login. It reads the
// Supabase service key from a file on this machine — the key is never bundled,
// never sent to the browser, and this middleware does not exist in a build —
// mints a one-time link for a team member and hands back a session.
//
// Guards: dev server only, POST from a localhost page only, and the account
// must already be on the team list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

const KEY_FILE = path.join(os.homedir(), '.pfcs-supabase-service-key');

const isLocal = (value?: string) =>
  !value || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(value);

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

export function devLogin(): Plugin {
  return {
    name: 'pfcs-dev-login',
    apply: 'serve', // never part of a production build
    configureServer(server) {
      server.middlewares.use('/api/dev-login', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // only a page served from this dev server may call it
        if (!isLocal(req.headers.origin as string)) return send(403, { error: 'local only' });

        const url = server.config.env.VITE_SUPABASE_URL as string | undefined;
        let serviceKey = '';
        try {
          serviceKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
        } catch {
          return send(503, { error: `No service key at ${KEY_FILE} — dev sign-in unavailable.` });
        }
        if (!url) return send(503, { error: 'VITE_SUPABASE_URL is not set' });
        const admin = {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        };

        try {
          // GET → who can I sign in as?
          if (req.method === 'GET') {
            const r = await fetch(`${url}/rest/v1/team_members?select=email,display_name,role&order=role`, {
              headers: admin,
            });
            return send(200, { members: await r.json() });
          }
          if (req.method !== 'POST') return send(405, { error: 'POST only' });

          const { email } = JSON.parse((await readBody(req)) || '{}') as { email?: string };
          if (!email) return send(400, { error: 'email required' });

          // the account must be on the team — no signing in as a stranger
          const check = await fetch(
            `${url}/rest/v1/team_members?select=email&email=eq.${encodeURIComponent(email)}`,
            { headers: admin }
          );
          if (!((await check.json()) as unknown[]).length)
            return send(403, { error: `${email} is not on the team list` });

          const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: admin,
            body: JSON.stringify({ type: 'magiclink', email }),
          });
          const link = (await linkRes.json()) as { hashed_token?: string; msg?: string };
          if (!link.hashed_token) return send(502, { error: link.msg ?? 'could not mint a link' });

          const verify = await fetch(`${url}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: serviceKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
          });
          const session = (await verify.json()) as { access_token?: string; refresh_token?: string };
          if (!session.access_token) return send(502, { error: 'could not start a session' });
          return send(200, {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } catch (err) {
          return send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}

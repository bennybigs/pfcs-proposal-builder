# PFCS CRM — Supabase setup

The CRM's shared data (contacts, deals, activities, tasks, proposal links) lives in a
Supabase project. The proposal builder itself still works entirely without it.

> **Already done for the live deployment (2026-08-24):** project `pfcs-crm`
> (ref `vecpxkcawhdrjzycjjzo`) exists in Ben's Supabase org, the schema is applied,
> `ben@mcsi.work` is seeded in `team_members`, auth redirects are configured, and all
> env vars are set in Vercel. The steps below are for re-creating from scratch.

## Fresh setup (≈10 minutes)

1. **Create the project** — supabase.com/dashboard → New project (any name, region near
   Ohio, e.g. `us-east-2`). Wait for it to provision.
2. **Apply the schema** — SQL Editor → New query → paste all of `schema.sql` → Run.
   It's idempotent; re-running is safe.
3. **Add yourself** — SQL Editor (only the FIRST member needs SQL; after that, the
   app's /crm/team page manages the list):
   ```sql
   insert into public.team_members (email, display_name) values ('ben@mcsi.work', 'Ben');
   ```
   This table is the real access gate: signing in without being listed gets you nothing.
   Guard rail: the app can never delete your own row, so the team can't be emptied.
4. **Auth redirects** — Authentication → URL Configuration:
   - Site URL: `https://pfcs-proposal-builder.vercel.app`
   - Redirect URLs: add `https://pfcs-proposal-builder.vercel.app/crm` and
     `http://localhost:5173/crm`
5. **Env vars** — Project Settings → API gives you the URL + keys. Set in Vercel
   (Production) and in `.env.local` for local dev — see `.env.example`. The
   service-role key is server-only (used by `/api/keepalive`); never put it in a
   `VITE_` variable.
6. **Optional hardening** — once the whole team has signed in at least once, you can
   disable new signups (Authentication → Providers → Email → "Allow new users to sign
   up" off). Not required: RLS already blocks non-members.

## Keepalive

Free-tier Supabase pauses projects after about a week without traffic. `vercel.json`
runs `/api/keepalive` daily (protected by `CRON_SECRET`); it updates one row in the
`heartbeat` table using the service-role key. If the project ever shows as paused in
the dashboard, hit Restore — data survives a pause.

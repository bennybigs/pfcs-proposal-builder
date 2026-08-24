# CRM verification checklist

Each phase appends a section: exactly what to click to prove it works.

## Phase 1 — Contacts (+ backend foundation)

Setup that should already be true: Supabase project live, schema applied, your email in
`team_members`, env vars set (Vercel + `.env.local`).

1. Open `/crm`. You get the **PFCS CRM sign-in card** (not the contact list). Enter your
   email → "Check your email" appears. Open the emailed link → you land on `/crm` signed in.
2. The header shows a **CRM** nav item; the CRM sub-nav shows Contacts / Pipeline / Tasks.
3. Click **New contact**, enter at least a name (try phone + tags too) → it appears in the
   list. Reload the page — it's still there (server data, not localStorage).
4. Search box: type a fragment of the name → list narrows as you type. Source chips and
   tag chips filter; clicking an active chip clears it.
5. Open the contact. Tap **Log call**, then tap it again (or press Enter in the note
   field) → "Call logged" toast and the call appears at the top of the Timeline with your
   email under it.
6. On a phone (or a ≤390px window): the quick-log bar is pinned to the bottom of the
   screen and all four buttons are thumb-reachable.
7. **New deal** on the contact → "Deal created at Inquiry"; the Deals section appears and
   the timeline gains "Deal created — …".
8. Back on `/crm`: **Import CSV** with headers like `Name,Phone,Email` → mapping row
   auto-guesses fields, preview table shows rows, duplicates (same email/phone as an
   existing contact) get a "possible duplicate" badge → Import lands them in the list.
   **Export** downloads the currently filtered list.
9. Sign-out/team test: an email NOT in `team_members` that signs in sees "Not on the
   team" and no data.
10. `curl -H "Authorization: Bearer <CRON_SECRET>" https://pfcs-proposal-builder.vercel.app/api/keepalive`
    returns `{"ok":true,...}`.

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

## Phase 2 — Pipeline

1. `/crm/pipeline` shows six columns (Inquiry → Lost) with per-column deal counts and
   dollar totals in each header.
2. Drag a card to another column → it moves, a toast confirms ("Inquiry → Proposal Sent"),
   and the contact's timeline gains a stage-change entry. On a phone, press-and-hold ~0.2s
   then drag (a quick swipe still scrolls the board).
3. Every card also has a **Move to…** select that does the same without dragging.
4. Cards show contact name, value, segment chip, and "Nd in stage". Moving a card resets
   its days-in-stage to 0.
5. Click a card → the deal drawer slides in: edit value (blur saves), expected close,
   probability, segment, notes; the header links to the contact.
6. **Won** closes the drawer, the card lands in Won, "Deal won — $X" appears on the
   timeline. **Lost** asks for a reason first.
7. Dashboard strip: open value per stage, green "Won this month" (uses the date it was
   marked won), and "Win rate (12 mo)" = won ÷ (won + lost).
8. Segment chips at top-right filter the whole board.
9. At 390px width the columns scroll horizontally and snap; the strip scrolls too.

## Phase 3 — Tasks & follow-ups

1. `/crm/tasks`: quick-add row — type a title, pick a date and a contact, Add (or press
   Enter). It lands in the right section: Overdue / Today / Next 7 days / Later.
2. **Mine / Everyone** toggle filters by who the task is assigned to (tasks you create are
   assigned to your email automatically).
3. The task also appears on its contact's timeline.
4. Tap the circle to complete → green check, it moves to "Recently done", and the contact's
   timeline gains "Task completed: …". Tapping again reopens it.
5. Gone quiet (built with the pipeline, verified here): take a deal in an open stage with no
   open task, whose last activity and stage change are older than 14 days → its pipeline
   card shows an amber **gone quiet** badge and the dashboard strip counts it. Logging any
   activity or adding a task clears the badge.
   (To simulate without waiting 14 days: in Supabase SQL editor,
   `update deals set stage_entered_at = now() - interval '20 days' where id = '…';`
   and ensure its activities are older or absent.)

## Phase 4 — Proposal builder integration

1. On a contact (or in a deal drawer): **New proposal** → the editor opens with the
   customer block prefilled from the contact and the project name set from the deal.
   With no open deal, one is auto-created at Inquiry ("{name} — new project"); with
   several open deals, a picker asks which.
2. The editor header shows the CRM link state: a linked proposal shows the contact's
   name (click = Unlink); an unlinked one shows **Link to CRM** → search contacts or
   "Create contact from this proposal", then pick or create a deal.
3. With a linked proposal, click **Share Link** (or export the PDF): the share still
   works exactly as before, plus a toast "Logged to CRM", the contact's timeline gains
   "Proposal sent — $X (share link/PDF)", and a deal at Inquiry/Site Visit auto-advances
   to Proposal Sent. Signed out of the CRM? You get "Not logged to CRM" and sharing is
   unaffected.
4. Deal drawer → Proposals section: linked proposals show title + snapshot total, an
   **Open** button (works on any teammate's device via the stored share URL), **Use this
   total** (sets the deal value + logs it), and — when the proposal lives in this
   browser — **Refresh from proposal** for the live computed total.
5. The contact page's Proposals section lists the same links.
6. First share of a draft proposal flips its own status to "sent" (later statuses are
   never overwritten by re-sharing).
7. QuickBooks export unchanged. A browser that never opens /crm sees the proposal
   builder exactly as before.

## Team page (post-brief addition)

1. `/crm/team`: your row shows "(you)" with no remove button.
2. Type a teammate's email → Add → toast tells you to send them the /crm link. They sign
   in themselves with a magic link — nothing else needed from you.
3. Remove (trash icon) asks first, then cuts their access immediately; everything they
   logged stays.
4. Guard rails: you can't remove yourself, so the team list can never become empty.

## Password sign-in (no-email path)

1. `/crm` signed out: the card now asks for email + password with **Sign in** and
   **Create account** buttons; "Prefer an emailed sign-in link?" switches to the old flow.
2. New teammate flow, zero email dependency: add their email on `/crm/team`, text them the
   link; they enter that email, pick a password (8+ chars), tap Create account → in
   immediately.
3. Wrong password → clear error; creating an account for an already-registered email →
   pointed to Sign in.
4. An account whose email is NOT on the team list still sees "Not on the team" and no data.

## Archive contacts

1. On a contact page, the trash button now offers two exits: **Archive (recommended)** and
   **Delete forever** (each explains its consequences; Cancel backs out).
2. Archiving hides the contact from the working list and takes their deals off the pipeline
   board and out of the dashboard numbers. Nothing is deleted.
3. The contact list shows an **Archived (n)** chip once anything is archived — click it to
   see the archived set; open one and hit **Restore** on the amber banner to bring them
   (and their deals) right back.
4. An already-archived contact's trash button offers only Delete forever.

## Team passwords

1. `/crm/team`: every row has a key icon — including your own. Click it, type a password
   (8+ chars, shown in clear so you can read it out or text it), Set password.
2. Setting your own: sign out (or grab your phone), sign in with email + that password.
3. Setting a teammate's works even before they've ever signed in — the account is created
   on the spot, so they skip "Create account" and just sign in with what you texted.
4. Guard rails: only signed-in team members can call it, and only for emails on the team
   list (the API refuses anything else).

## Admin roles

1. `/crm/team` as an ADMIN (shield badge): you see the add row, and every member row has
   shield (toggle admin), key (set password), trash (remove). Toggling the shield promotes/
   demotes with a toast; the database refuses to demote or remove the LAST admin.
2. As a NON-admin: no add row, no shields/trashes — just the list, an explanatory note, and
   a key icon on YOUR OWN row only. The API also refuses a non-admin setting anyone else's
   password (server-side, not just hidden buttons).
3. The sign-in card says "Team members only" — no Create account button, no self-signup
   (signups are disabled platform-wide; accounts exist only when an admin sets a password).
   "Forgot password? Email me a sign-in link" remains for recovery.
4. Onboarding flow: admin adds email → key icon → starter password → text link + password
   → teammate signs in directly.

## Team member cards (click-to-manage)

1. `/crm/team`: every row is clickable (chevron on the right). Clicking opens the member's
   card with everything in one place.
2. As an admin, a teammate's card has: Name (edit, saves on Enter/blur), Role (Administrator
   switch with explanation), Password (set/reset — works before their first sign-in), and a
   Danger zone (Remove, two-step inline confirm).
3. Your own card: no Remove; the admin switch is disabled with a hint when you're the last
   admin.
4. As a non-admin: own card shows password change only; other cards are read-only info.
5. Adding a teammate auto-opens their card so setting the starter password is the natural
   next step.

## Reporting & inbound phase (R1–R4)

R1 — Stage history: move any deal between stages, then in Supabase:
`select * from deal_stage_history order by changed_at desc limit 5;` — one row per move,
`from_stage`/`to_stage` filled, creation rows have `from_stage = null`. Trigger-based, so
deals created by the API get history too (verified).

R2 — Source detail: edit a contact → under Source, the "Source detail" box suggests
existing campaign names for that bucket as you type (verified: two "Home Show 2026"
contacts make it a suggestion for the third). Shows on the contact badge, deal drawer
("via Trade Show · Home Show 2026"), CSV export/import.

R3 — Reports (/crm/reports): range presets + custom (URL-shareable), segment chips,
six sections, per-table + full CSV export. RECONCILED: seeded 3 won deals worth exactly
$317,000 in the last 12 months → headline showed $317,000, avg $105,667, win rate 75%,
Trade Show $275,000 (87%) / Website $42,000 (13%). Seeds removed after.

R4 — Inbound leads: POST /api/inbound-lead with x-api-key. Verified: new lead → 201 +
contact + deal; same email again with different segment → same contact, second deal
(created_contact:false); no key → 401. All three calls in inbound_lead_log with key
label. Docs for integrators: /crm/docs/inbound-leads (also docs/inbound-leads.md).
Keys live in Vercel env INBOUND_API_KEYS as comma-separated label:secret pairs.

## Cloud proposals

1. Header shows a cloud badge on proposal pages: "Local only" signed out (links to sign-in),
   "Team cloud" once signed in.
2. Signed in, create or edit any proposal → it upserts to the `proposals` table within ~1s
   (LWW on the proposal's updatedAt; deletes propagate; card library + company settings
   sync as one shared document).
3. VERIFIED cross-device: teammate A created a proposal; teammate B on a wiped browser
   signed in and saw it on the dashboard immediately. Local storage remains the offline
   cache; signed-out use is unchanged.

## Leads inbox (lead lifecycle)

"Lead" is a stage of a contact's life, not a separate list: **New lead → Contacted →
Qualified → Customer**, plus **On hold**, **Disqualified**, and plain **Contact** (out of
the funnel). New / Contacted / On hold live in **/crm/leads**; the red counter on the CRM
tab counts new leads + on-hold leads whose follow-up date has arrived (polls every 60s,
visible from any page, even the proposal builder).

Click-through:

1. **Red dot**: with no leads waiting there is no counter. POST a test lead to
   /api/inbound-lead (or add a contact with Lead stage "New lead") → within a minute the
   CRM tab shows a red count; the Leads subnav shows the same count.
2. **Leads tab** (/crm/leads): the lead appears under "New" with an age chip ("12m") —
   it turns red once a new lead has waited 4+ hours. Source + campaign shown on the row.
3. **Log call** → toast, lead moves to the "Contacted" section (first human touch:
   call/text/email/meeting/site visit all do this, from the Leads row or the contact
   page's quick-log bar).
4. **Qualify** → if they already have an open deal (inbound leads do) they're marked
   qualified; otherwise a deal is created at Inquiry. Either way they leave the inbox
   and the counter drops. Moving any of their deals in the pipeline also auto-qualifies;
   winning a deal marks them **Customer**.
5. **Hold** → date + reason dialog; they move to "On hold". On the follow-up date they
   light the red counter again and the row is highlighted "due — follow up".
6. **⋯ menu**: "Move to Contacts" (legit contact, not a sales lead) and "Disqualify…"
   (reason goes on the timeline; nothing is deleted — a later inbound inquiry from the
   same email/phone automatically puts them back in "New").
7. **Contact page**: the colored lifecycle badge next to Source is a picker — every
   stage can be set by hand; On hold shows an amber banner with the resurface date.
8. Bulk **CSV imports** land as plain Contacts (inbox stays clean); a contact created
   from a proposal is born Qualified.

Verified without sign-in (REST as a throwaway team member, since deleted): badge count
query, RLS on the new columns, backfill (existing contacts with deals → qualified, none
in the inbox). The signed-in click-through above is yours.

## Assignment, My Leads, and notifications

Built to the Phase-2/3 brief with the agreed adaptations: roles live on the existing
team_members table (admin = owner, everyone else = rep — no separate profiles table),
and visibility stays team-wide for now — assignment is for ownership, notifications,
and commission attribution. Hard rep-only RLS walls are a separate step for when the
sales hire has a start date.

What's new:

1. **New lead button** on /crm/leads (top-right on desktop, orange floating button on
   phones). Name + phone-or-email required; segment, source + campaign typeahead,
   assignee (admins pick; reps get themselves), notes. Duplicate email/phone offers
   "Use existing contact" instead of silently duplicating. Creates the contact as a
   New lead (stays in the inbox) plus a deal at Inquiry, then opens the deal.
2. **Assignment**: "Assigned to" select in the deal drawer (admins; read-only for
   others) and inline "Assign to…" on the Unassigned queue at the bottom of the Leads
   screen. Every change lands on the timeline ("Assigned to Shawn by Ben"). The
   Pipeline gets an assignee filter (Everyone / Unassigned / per person) and cards
   show the assignee.
3. **closed_by** — the moment a deal is marked Won, the current assignee is locked in
   as closed_by. Verified: reassigning after the win does NOT change it. This is the
   commission attribution field.
4. **Notifications**: bell in the CRM sub-nav (unread count, latest 20, mark read /
   mark all). Assignment → the assignee gets notified (not when assigning to
   yourself). Inbound API lead → every admin gets "New inbound lead — unassigned".
   The My Leads nav item badges unread assignments. Polls every 60s.
5. **Email**: queued per notification, sent via Postmark by /api/notify-flush,
   logged in notification_deliveries, per-person toggle on the Team page card.
   ⚠️ Requires POSTMARK_SERVER_TOKEN in Vercel env (same setup command as e-sign);
   until then emails stay queued (verified: flush returns 503 and loses nothing).
   And until Postmark approves the account, only @mcsi.work recipients deliver.
6. **My Leads** (/crm/my): your assigned deals grouped by stage with days-in-stage,
   last touch, and overdue-task flags. Non-admin teammates land here by default.
7. **Reports**: now owner-only, with a "By rep" section (won credit via closed_by,
   open pipeline via assigned_to, gross-value disclaimer) and its own CSV export.

Verified live on prod (2026-08-25): SQL trigger suite (assign → notification,
self-assign skipped, won → closed_by snapshot, reassign-after-win immutable, API deal
→ both admins notified); inbound curl → 201 + notifications + created_via=api;
flush without token → 503, queue intact. Signed-in click-through is yours: assign a
deal to Shawn → his bell badges within a minute and the timeline logs it.

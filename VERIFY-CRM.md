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

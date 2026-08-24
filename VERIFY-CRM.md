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

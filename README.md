# PFCS Proposal Builder

A fast, on-brand proposal builder for **Post-Frame Construction Solutions, LLC** — a post-frame construction company in Orrville, Ohio building barndominiums, agricultural shops, and luxury storage buildings. It replaces the manual Word/Excel proposal workflow: assemble customer-facing proposals from a library of pre-made content cards, share them as a web link, download them as a polished PDF, and export line items straight into QuickBooks Online. Built for a 2–3 person sales team; no accounts, no server — everything lives in the browser.

## Local development

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # type-check + production build to dist/
```

## Deploy to Vercel

**One-click:** push this folder to a GitHub repo, then:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**Manual steps:**

1. `npm i -g vercel` (or use the Vercel dashboard)
2. From this directory: `vercel` → accept defaults (Vite is auto-detected)
3. `vercel --prod` to promote to production

`vercel.json` already contains the SPA rewrite so `/proposal/:id`, `/view`, `/library`, and `/settings` resolve correctly on refresh.

## How to add a new card to the library

**In the app (preferred):** go to **Card Library** → **New Template**, set the title, category, markdown content (use `[bracketed]` placeholders for values you fill in per proposal), and an optional suggested price range. It's saved to localStorage and appears in the editor sidebar immediately. You can also select any card inside a proposal and click **Save as new template**.

**In code (seed data):** add an entry to `src/constants/seedCardTemplates.ts`. Note that seed data is only applied on first run — users who already have a saved library keep their version until they use **Reset to defaults**.

## How the share link works (privacy note)

**Get Share Link** compresses the entire proposal (plus a snapshot of your company info) with `lz-string` and puts it in the URL hash: `/view#p=<compressed>`. When the customer opens the link, the app decodes the hash and renders the proposal read-only.

- **The proposal data lives in the URL itself, not on a server.** Nothing is uploaded anywhere.
- Anyone who has the link can read the proposal — treat the link like the document.
- The link is a snapshot: later edits are NOT reflected until you generate and send a new link.
- Browsers and email clients handle very long URLs fine in practice, but extremely large proposals (or a huge uploaded logo) increase link length; oversized logos are automatically left out of links.

## Importing the QuickBooks CSV into QBO

The **Export → QuickBooks Estimate CSV** button produces one row per priced-and-included card. To import:

1. In QuickBooks Online, click the **gear icon → Import Data**.
2. Choose **Estimates** (available on QBO Plus/Advanced; if you don't see it, import via **Sales → All Sales → Import Transactions**).
3. Upload the CSV file.
4. Map columns: `Estimate No.`, `Customer`, `Estimate Date`, `Expiration Date`, `Product/Service`, `Description`, `Qty`, `Rate`, `Amount` — the headers match QBO's field names, so mapping is one-to-one.
5. If the customer doesn't exist yet, import the **QuickBooks Customer CSV** first via **gear icon → Import Data → Customers**.
6. Review the preview and confirm. Multiple rows with the same `Estimate No.` combine into a single multi-line estimate.

## v2 roadmap

- **QuickBooks OAuth integration** — replace the CSV export with a Vercel serverless function that creates Estimates directly via the QuickBooks Online API (OAuth 2.0; store tokens in Vercel KV).
- **Digital signature capture** — real e-signature flow (e.g., embedded Dropbox Sign / DocuSign) replacing v1's print-and-sign workflow.
- **Email sending** — send proposals from the app via a serverless function + transactional email provider, instead of the current `mailto:` handoff.
- Undo/redo history, dark mode, and multi-device sync are also candidates.

## Tech stack

React 18 + TypeScript + Vite • Tailwind CSS • shadcn/ui-style components • Zustand (localStorage persistence, 500ms debounced autosave) • @dnd-kit drag-and-drop • @uiw/react-md-editor • react-markdown + remark-gfm • html2pdf.js • lz-string share links • lucide-react icons.

**Note on the logo:** `public/logo.svg` is a placeholder. Drop in the real logo via **Settings → Upload logo** (stored per-browser) or replace the file before deploying.

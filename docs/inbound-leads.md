# PFCS — Sending leads into our CRM

One HTTP call drops a lead straight into our sales pipeline. Works from Zapier,
Facebook Lead Ads, a website form, or any system that can send a webhook.

## Endpoint

```
POST https://pfcs-proposal-builder.vercel.app/api/inbound-lead
Content-Type: application/json
x-api-key: YOUR-KEY-HERE
```

You'll receive your API key from PFCS directly (text or call — we don't email
keys). One key per integrator; keys can be revoked individually.

## Fields

All fields are JSON strings unless noted. **At least one of `email` or `phone`
is required** — everything else is optional.

| Field | Required | Notes |
|---|---|---|
| `first_name` | no | |
| `last_name` | no | |
| `email` | one of these | Used to match returning customers |
| `phone` | one of these | Digits matched; formatting doesn't matter |
| `address` | no | Street address |
| `city` | no | |
| `state` | no | |
| `zip` | no | |
| `segment` | no | `barndominium`, `ag_shop`, `storage`, or `other`. Friendly aliases accepted ("barndo", "shouse", "farm shop", "garage"). Default `other` |
| `source` | no | One of: `referral`, `website`, `facebook`, `show` (trade show), `cold`, `other`. Aliases accepted ("trade show", "fb", "google ads" → website). Default `website` |
| `source_detail` | no | The specific campaign — e.g. `"Google Ads spring 2026"`, `"Home Show 2026"`. **Please always send this** — it's how we report which campaigns produce won contracts |
| `budget` | no | Number, whole dollars. Becomes the deal's starting value |
| `message` | no | Free text from the lead; lands on their timeline (`notes` also accepted) |
| `building_specs` | no | JSON **object** (not string); stored verbatim on the timeline — use for configurator output |

## What happens on our side

- If the email (or phone) matches an existing customer, **no duplicate is
  created** — a new deal is added to that person and your campaign is noted on
  their timeline. Their existing name/address is never overwritten.
- Otherwise a new contact is created with your `source`/`source_detail`
  stamped, plus a deal in the first pipeline stage ("Inquiry").
- Every call, success or failure, is logged on our side with its payload — if
  numbers ever disagree, we can reconcile to the request.

## Response

```json
201  { "contact_id": "…", "deal_id": "…", "created_contact": true }
400  { "error": "At least one of email or phone is required" }
401  { "error": "Invalid or missing x-api-key" }
429  { "error": "Rate limit exceeded (60/minute)" }
```

## Example — curl

```bash
curl -X POST https://pfcs-proposal-builder.vercel.app/api/inbound-lead \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR-KEY-HERE" \
  -d '{
    "first_name": "Dana",
    "last_name": "Miller",
    "email": "dana@example.com",
    "phone": "330-555-0142",
    "city": "Wooster", "state": "OH",
    "segment": "barndominium",
    "source": "website",
    "source_detail": "Google Ads spring 2026",
    "budget": 250000,
    "message": "Wants a 40x60 shouse, has land already"
  }'
```

## Example — Zapier ("Webhooks by Zapier")

1. Action: **Webhooks by Zapier → Custom Request**
2. Method: `POST` · URL: `https://pfcs-proposal-builder.vercel.app/api/inbound-lead`
3. Data: the JSON body above, with fields mapped from your trigger (e.g. the
   Facebook Lead Ads fields)
4. Headers: `Content-Type: application/json` and `x-api-key: YOUR-KEY-HERE`
5. Test — a `201` with a `contact_id` means the lead is in our pipeline

Questions: ben@mcsi.work

# Relay CRM — Lead source filters & Grok Bot integration

These patches apply to the **[relay](https://github.com/jtucker117/relay)** repo (deployed at relay.sitestac.com).

## What changed

1. **Lead sources** — `grok_google` and `grok_facebook` added alongside existing Relay sources (`live`, `manual`, `places`).
2. **Leads board filters** — new **Source** chip row: All · Relay CRM · Grok · Google · Grok · Facebook, with honest counts. Source badges on cards and in the outreach drawer.
3. **Sorting** — added **Newest first** and **Source (Grok first)** sort options.
4. **Pipeline conversion** — deal source label now reflects where the lead came from.
5. **Grok ingest webhook** — `grok-lead-ingest` edge function for Grok Bot to push leads.

## Apply to relay repo

```bash
cd /path/to/relay
git checkout -b cursor/lead-source-filters-448c
git am /path/to/sitestac/relay-patches/*.patch
```

Or copy the files from `relay-sync/` (mirrors relay paths).

## Supabase setup

1. Run `supabase/015_lead_sources.sql` in the SQL editor.
2. Deploy the edge function:
   ```bash
   supabase functions deploy grok-lead-ingest   # Verify JWT: OFF
   supabase secrets set GROK_INGEST_SECRET=your-long-random-string
   ```

## Grok Bot webhook

```bash
curl -X POST "https://hifuypelxeryqqrfhapx.supabase.co/functions/v1/grok-lead-ingest" \
  -H "Content-Type: application/json" \
  -H "x-grok-secret: YOUR_SECRET" \
  -d '{
    "platform": "google",
    "leads": [{
      "name": "Magnolia Roofing Co",
      "category": "Roofing",
      "area": "Magnolia",
      "state": "TX",
      "phone": "555-123-4567",
      "address": "123 Main St, Magnolia TX",
      "zip": "77354"
    }]
  }'
```

Use `"platform": "facebook"` for Facebook-sourced leads.

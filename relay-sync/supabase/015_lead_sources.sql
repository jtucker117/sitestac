-- Relay migration 015 — Lead acquisition sources (Grok Bot + Relay)
-- Run in the Supabase SQL editor after 014. Safe to re-run.
--
-- Extends the `source` column so leads can be tagged by where they came from:
--   places, manual, live  — Relay CRM (legacy import, manual add, live search)
--   grok_google           — Grok Bot prospecting on Google
--   grok_facebook         — Grok Bot prospecting on Facebook

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('places','manual','live','grok_google','grok_facebook'));

create index if not exists leads_source_idx on public.leads (source);

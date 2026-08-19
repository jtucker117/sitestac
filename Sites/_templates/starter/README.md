# Studio Site — Starter

A rebrandable photography/film studio site with a self-service admin, client
delivery galleries, and embedded video. This is the template Ember & Oak is built
on; Ember & Oak is the live demo.

## What a studio gets
- **Public site** — home, filterable portfolio with lightbox, about, services,
  contact, client access.
- **Studio Admin** (footer link) — profile dashboard with four tabs:
  - *My Work* — collapsible category sections, upload with live progress, delete,
    ★ featured cover per category
  - *Videos* — paste a YouTube/Vimeo link; titles resolve automatically and are
    editable. For films too big or too costly to host.
  - *Client Deliveries* — post a full-res gallery, get a share link, curate the
    photos in it, set an access code
  - *Account* — change password (persisted, bcrypt)
- **Client Access** — opens by share code (+ optional access code), full-screen
  viewer with slideshow, per-file or ZIP download, and "Save to Photos" on iPhone.

## Layout
```
Studio-Site-Starter.dc.html   site SOURCE (branding as [placeholders])
support.js                    DC runtime used by the source
backend/                      Express API + serves backend/public/
tools/rebuild-compiled.py     rebuild backend/public/index.html from the source
CUSTOMIZE.md                  exactly what to change per studio
ONBOARDING_QUESTIONNAIRE.md   what to collect from the photographer
```

`backend/public/index.html` is a **compiled artifact** built from the `.dc.html`
source. It is not committed here — the first build for a new studio produces it.
See `CUSTOMIZE.md` step 6.

## New studio, start to finish
1. **Use this template** on GitHub → a new private repo for the studio.
2. Work through `CUSTOMIZE.md` (branding, categories, copy, `SITE_SLUG`).
3. Their own Cloudinary account → cloud name, API key/secret.
4. Railway → deploy from the repo, **Root Directory = `backend`**, add a
   **Volume at `/data`**, set variables from `backend/.env.example`.
5. Point their domain at Railway; tighten `ALLOWED_ORIGINS` to it.

Each studio ends up with its own repo, Railway service and Cloudinary account, so
media and clients are fully isolated.

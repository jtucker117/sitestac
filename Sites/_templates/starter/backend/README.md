# Studio Site — backend

Express API + static host for the compiled site. One Railway service serves both.

See `.env.example` for every variable. Two things bite people:

1. **`slug` in `CLIENTS_JSON` must equal `SITE_SLUG` in the `.dc.html`.** Media is
   tagged `<SITE_SLUG>__<category>`; the server writes cover tags using the login
   slug. If they differ, uploads appear but the ★ featured cover never shows and
   nothing errors.
2. **Mount a Railway Volume at `/data`.** Password changes, gallery access codes and
   video links are stored there. Without a real mount those writes are refused (503)
   on purpose — the container disk is wiped on every deploy, so "saving" to it would
   lose the data later, which is worse than refusing now.

## Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login` | – | `{slug,password}` → `{token}` |
| GET | `/api/me` | ✓ | profile, `canChangePassword`, `passwordUpdatedAt` |
| POST | `/api/change-password` | ✓ | verifies current, bcrypt(12), persists |
| POST | `/api/sign-upload` | ✓ | signed folder-locked upload params |
| GET | `/api/list?category=` | ✓ | live Cloudinary state incl. `tags` |
| POST | `/api/delete` | ✓ | delete inside the studio's folder only |
| POST | `/api/feature` | ✓ | set/clear the category cover (`{clear}`) |
| POST | `/api/retag` | ✓ | repair assets missing the slug-qualified tag |
| GET | `/api/videos` | – | embedded YouTube/Vimeo links |
| POST | `/api/videos` · `/update` · `/delete` | ✓ | manage those links |
| POST | `/api/sign-delivery` | ✓ | signed upload into `deliveries/<code>` |
| GET | `/api/deliveries` | ✓ | every posted gallery + counts |
| GET | `/api/delivery/items?code=` | ✓ | files in one gallery |
| POST | `/api/delivery/item/delete` | ✓ | remove one file |
| GET/POST | `/api/delivery/settings` | ✓ | gallery access code + title |
| POST | `/api/delivery/delete` | ✓ | delete a whole gallery |
| POST | `/api/gallery/open` | – | client opens by code (+ PIN) |
| POST | `/api/gallery/zip` | – | Cloudinary ZIP of the originals |
| GET | `/api/health` | – | status + `credentialStore` |

## Media limits (Cloudinary free plan)
Images **10 MB**, video **100 MB** — hard plan caps; chunked upload does not raise
them. The uploader pre-checks size and reports the real number. Long-form video
should be embedded from YouTube/Vimeo instead (Videos tab), not stored here: a
single film would drain the 25 GB/month bandwidth and take the photos down with it.

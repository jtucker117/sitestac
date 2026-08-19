# Customising the starter for a studio

Everything below lives in `Studio-Site-Starter.dc.html` unless noted. Search for
`[` to find the placeholders.

## 1. Identity
- `<title>` and `<meta name="description">` in the `<helmet>` block.
- Studio name, tagline, city and all `[bracketed]` copy in the template.
- `STUDIO_INITIALS` — monogram on the sign-in card and profile header.
- Logo/wordmark markup in the header and footer.
- Social links in the footer and on the Contact page.

## 2. The one setting that silently breaks things
```js
SITE_SLUG = 'studio';   // MUST equal "slug" in CLIENTS_JSON
```
Media is tagged `<SITE_SLUG>__<category>`, and the server writes cover tags from
the login slug. If the two differ, uploads still appear but the ★ featured cover
never shows and nothing reports an error. Set both to the same value.

## 3. Cloudinary
- `CLOUD_NAME` and `UPLOAD_PRESET` in the source.
- Settings → Security → leave **Resource list** unchecked, or public galleries
  cannot enumerate images.

## 4. Categories
**Categories are managed from Studio Admin now, not from code** — My Work → *Manage
categories* → add, rename, remove. They persist to `/data/categories.json`.

The list in `catList()` is only the fallback used before the API responds (and if it
is unreachable), so set it to whatever the studio should start with. Notes:
- Renaming changes only the label. The key is baked into every asset's Cloudinary
  tags, so renaming never moves or hides existing photos.
- A category cannot be deleted while it holds photos or video links — otherwise
  those files stay in Cloudinary, billable and invisible.
- `hero` and `about` are reserved (cover photo and About photo).

## 5. Content honesty
- `testimonials` starts empty and the section hides itself. **Only add real client
  quotes.** Shipping invented reviews on a live commercial site is a trust and
  advertising problem, not placeholder text.
- Pricing: keep it qualitative unless the studio has confirmed numbers.

## 6. Build and deploy
```bash
python3 tools/rebuild-compiled.py --old HEAD     # writes backend/public/index.html
osascript -l JavaScript /tmp/component.js        # optional syntax check, no Node needed
```
The compiled file is a bundler shell whose one long line holds the entire inner
document as a JSON string. The tool refuses to run unless it can reproduce the
current build byte-for-byte from the previous source, so a stale divergence list
fails loudly instead of corrupting the artifact.

Then Railway: Root Directory `backend`, Volume at `/data`, variables from
`backend/.env.example`.

## 7. Before handing over
- Change the studio password in Account (the seeded one is temporary).
- Set `ALLOWED_ORIGINS` to the real domain.
- Add access codes to sensitive delivery galleries.
- Upload two or more Cover Photos if they want the hero to cross-fade (6s per
  image with a slow Ken Burns drift; one image renders statically as before).
- Confirm the studio understands the media limits: **10 MB per image, 100 MB per
  video** on Cloudinary's free plan, and video belongs in the Videos tab.

# SiteStac — Astro production site + starter kit

The real, deploy-ready version of the SiteStac marketing site. Built with **Astro + Tailwind v4**, ships as a static site, and is wired for the **Claude Code → GitHub → Cloudflare Pages** workflow. It doubles as your **reusable client starter kit** — clone it, reskin the tokens, ship.

---

## Run it locally

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs static site to ./dist
npm run preview  # preview the production build
```

You need Node 18+ installed.

---

## What's inside

```
src/
  layouts/Base.astro        # <head>, fonts, SEO/OG, JSON-LD, reveal + magnetic scripts
  components/
    Brick.astro             # the reusable brand brick — <Brick color="pink">SEO</Brick>
    Nav.astro  Footer.astro
  pages/
    index.astro             # the full one-page site (hero, stak, process, pricing, work, trust, CTA)
    404.astro
    blog/index.astro        # blog listing
    blog/[...slug].astro    # individual post pages
  content/blog/*.md         # blog posts (front-matter: title, description, date, draft)
  content.config.ts         # blog content collection schema
  styles/global.css         # ALL design tokens + brick components (edit colors here)
public/
  admin/                    # Decap CMS — the client's blog login at /admin
```

**To change the look, edit the tokens at the top of `src/styles/global.css`** (`--blue`, `--pink`, fonts, etc.). Components reference tokens, so one change reskins the whole site — that's what makes this a starter kit.

---

## Deploy: GitHub → Cloudflare Pages

1. **Push to GitHub** (one repo per site):
   ```bash
   git init && git add -A && git commit -m "SiteStac site"
   git branch -M main
   git remote add origin https://github.com/<you>/staksites.git
   git push -u origin main
   ```
2. **Cloudflare Pages** → *Create application → Pages → Connect to Git* → pick the repo.
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Deploy. You get a free `staksites.pages.dev` **preview URL** — send that to a client before going live.
3. **Every `git push` redeploys automatically.** That's your edit loop: change → push → live in ~30s.

---

## Domain: Porkbun → Cloudflare (only when approved)

1. Buy the domain in **Porkbun** (or have the client buy it and add you).
2. Easiest path: in Porkbun, change the domain's **nameservers to Cloudflare's** (Cloudflare walks you through this when you add the site). This gives you free SSL + CDN + DDoS automatically.
3. In your Cloudflare Pages project → **Custom domains → Set up a domain** → enter the domain → accept the records. Done — live with HTTPS.

> Prefer not to move nameservers? You can instead add a `CNAME` in Porkbun's DNS pointing to your `*.pages.dev` target — Cloudflare shows the exact record under Custom domains.

---

## The blog / client login (Decap CMS)

The blog already works as static content — just add `.md` files to `src/content/blog/`.

To give a **client a no-code login** at `yoursite.com/admin`:

1. Edit `public/admin/config.yml` → set `repo:` to the site's GitHub repo.
2. Wire up auth (one-time per site). Simplest is a GitHub OAuth app providing the token, or front the repo with an OAuth provider. (See decapcms.org/docs — "GitHub backend".)
3. The client logs in, writes a post in a visual editor, hits publish → Decap commits to GitHub → Cloudflare rebuilds. No WordPress, nothing to patch.

If a client doesn't want a blog, ignore `/admin` entirely — it doesn't affect the public site.

---

## Reusing this as a client starter kit

1. Copy the folder, rename, `git init`, new GitHub repo.
2. In `src/styles/global.css`, swap the color tokens + the two Google Font families to match the client's niche (see the build prompt's archetype rules — never reuse the last client's palette/fonts).
3. Replace the copy in `index.astro` with the client's real info, photos, and review quotes.
4. Push → Cloudflare preview → client approval → domain → live.

The **brick concept is SiteStac' own brand** — for client sites, change the archetype to fit *their* niche. Keep SiteStac distinct from the sites you build for others.

---

## Handoff ("Own It" tier)

Because each site is one repo + one Cloudflare project:
- Transfer the **GitHub repo** to the client's account, and
- Transfer/redeploy the **Cloudflare Pages project** under their login.

They own everything, no lock-in. Charge a premium since you give up the recurring hosting revenue.

# SiteStac Blog Content Strategy — Keyword & Topic Map

**Target market:** Small business owners nationwide (especially service businesses and trades) who don't have a website or have a bad one.

**Strategy:** Each cluster below is a "pillar" topic. Write one long pillar post per cluster, then 4–8 shorter supporting posts targeting the long-tail keywords. Interlink supporting posts to the pillar. All core posts are written **location-neutral** for nationwide SEO. High-intent posts then get **programmatic location variants**: the same post body with location-specific title, slug, H1, intro, examples, and schema swapped in from a city list (see Location Variant Engine in build requirements). Start the city list with major metros plus SiteStac's home market, and expand over time.

---

## Cluster 1: "Do I even need a website?" (top of funnel — your exact market)
Pillar: **Does My Small Business Really Need a Website in 2026?**
- do i need a website for my small business
- is a facebook page enough for my business
- website vs google business profile — do i need both
- can i run a business without a website
- why isn't my business showing up on google
- do customers still use websites or just social media
- is instagram enough for a small business

## Cluster 2: Cost & pricing (highest commercial intent)
Pillar: **How Much Does a Small Business Website Cost? (Real Numbers)**
- how much does a website cost for a small business
- website design pricing small business
- monthly website cost vs one-time cost
- cheap website vs professional website — what's the difference
- how much should i pay for a website
- website maintenance cost per month
- hidden costs of DIY website builders

## Cluster 3: DIY vs hiring a pro
Pillar: **Wix vs Squarespace vs Hiring a Web Designer: What's Right for Your Business?**
- best website builder for small business
- wix vs squarespace vs wordpress for small business
- should i build my own website or hire someone
- problems with DIY website builders
- godaddy website builder review honest
- how long does it take to build a website
- can i move my wix site to another platform

## Cluster 4: Getting found on Google (local SEO — huge for your leads)
Pillar: **How to Get Your Business to Show Up on Google (Local SEO Basics)**
- how to get my business on google
- how to rank on google maps
- google business profile setup guide
- local seo for small business
- how to get more google reviews
- why is my competitor above me on google
- seo for [plumbers / HVAC / landscapers / roofers / electricians]
- near me searches — how to show up

## Cluster 5: Industry-specific pages (mirrors your lead database)
Pillar: **Website Essentials for Local Service Businesses**
One post per trade — same skeleton, swapped examples:
- website for plumbing company — what it needs
- HVAC company website examples that get calls
- landscaping website design ideas
- roofing contractor website must-haves
- website for a small restaurant / food truck
- salon & barbershop website essentials
- auto repair shop website guide
- pressure washing / cleaning business website
- general contractor website — licensing, portfolio, trust signals

## Cluster 6: Leads & conversion (why a website pays for itself)
Pillar: **How a Website Actually Gets You Customers (Not Just Compliments)**
- how to get more customers online
- does a website generate leads
- landing page vs website for small business
- best call to action for service businesses
- why visitors leave your website without calling
- contact form vs phone number — what converts better
- how to track where your leads come from

## Cluster 7: Trust & credibility
Pillar: **Why Customers Don't Call: The Trust Problem With Bad (or No) Websites**
- does a website make my business look more professional
- what makes a website look trustworthy
- outdated website hurting business
- before and after website redesign examples
- do customers check your website before calling

## Cluster 8: AI & the future of search (timely, low competition)
Pillar: **Will AI Replace Websites? What ChatGPT and Google AI Mean for Your Business**
- how to get recommended by chatgpt
- google ai overviews small business impact
- seo vs ai search — what changes
- do websites still matter with ai search
- how to optimize your website for ai answers

## Cluster 9: Basics & how-to (evergreen support content)
Pillar: **Small Business Website 101: Everything You Need Before You Launch**
- what pages does a website need
- how to choose a domain name for my business
- what is web hosting explained simply
- how to write website content for my business
- mobile friendly website — why it matters
- how fast should my website load
- website photos — stock vs real photos
- business photography near me
- business video production near me
- custom business card design near me
- yard sign design for contractors
- trifold brochure design for small business

## Cluster 10: Location-variant posts (programmatic local SEO, nationwide)
These aren't unique topics — they're templates the Location Variant Engine fills from the `locations` table:
- web design {city} {state}
- website designer near {city}
- [industry] website design {city} (e.g., "plumber website design Dallas")
- small business website cost in {city}
- how to get your {city} business on google
- business photography near {city}
- business video production {city}
- custom print design / business cards / yard signs {city}
- website photo video print near {city} (full-stack brand posts)
- local business spotlight posts (interview real clients wherever they are — free backlinks + goodwill)

## Cluster 11: Visual brand & print (new SiteStac blocks)
Pillar: **Website, Photo, Video & Print: One Brand That Gets You Hired**
- business photography near me
- business video production near me
- why real photos beat stock on local websites
- Google Business Profile photo tips
- custom business card design near me
- yard sign design for local contractors
- trifold and flyer design that matches your website
- print design for small business — what to order first
- how near-me searches reward consistent branding

---

## Build requirements (Claude Code — implement these)

> **Instruction to Claude Code:** Build the automated blog system with the following architecture. These are hard requirements, not suggestions.

1. **Round-robin cluster rotation.** The system must pull topics from the cluster list in round-robin order (Cluster 1 → 2 → 3 → ... → 10 → back to 1) so published content stays varied. Never publish two posts from the same cluster back-to-back.
2. **Supabase slug tracking (no duplicates).** Create a `blog_posts` table in Supabase that stores at minimum: `slug`, `title`, `cluster_id`, `keyword_targeted`, `post_type` (pillar | supporting | local_variant), `status` (draft | pending_review | published), and `published_at`. Before generating any post, the system must query this table and skip any keyword/slug already used. A topic is never written twice.
3. **Pillar posts flagged for manual review.** Any post with `post_type = pillar` must be created with `status = pending_review` and must NOT auto-publish. Surface these to Jordan for approval (dashboard view, email, or CLI list — his choice) before they go live. Pillars carry the most SEO weight and need human sign-off. Supporting and local-variant posts may auto-publish.
4. **Location Variant Engine (nationwide local SEO).** Create a `locations` table in Supabase (`city`, `state`, `state_abbr`, `slug_modifier`, `active`). Core posts are written location-neutral once. For high-intent templates (Clusters 2, 4, 5, 10), the engine generates one variant per active location by swapping in the city/state in the title tag, H1, slug (e.g., `web-design-dallas-tx`), intro paragraph, meta description, and LocalBusiness/FAQ schema — the body content stays the same. Each variant is written to `blog_posts` with `post_type = local_variant` and a `location_id` foreign key so the dedup check in requirement #2 covers city variants too (same keyword + same location = never generated twice; same keyword + new location = allowed). Seed the table with the top ~50 US metros and let Jordan add/deactivate cities without touching code. Important: each variant must get at least a unique intro and localized examples, not just a find-and-replace on the city name — pure token-swapped pages risk Google's doorway-page/scaled-content penalties.

5. **3-month auto-populated content calendar.** On first run, the system must generate and schedule a full 90-day queue: at 3 posts/week that's ~39 posts (36 supporting/location-variant posts + up to 10 pillars, pulled via the round-robin rotation in requirement #1). Add a `scheduled_for` (date) column to `blog_posts`. Each queued post gets an assigned publish date spread evenly across the 13 weeks (e.g., Mon/Wed/Fri). A scheduled job (Supabase cron / pg_cron, or a Railway/Vercel cron hitting an edge function) runs daily, finds posts where `scheduled_for <= today` and `status = 'approved'` or `post_type != 'pillar'`, and publishes them. Pillar posts still respect the review gate in requirement #3 — they sit in the queue with their scheduled date, but if not approved by that date, they're skipped (not auto-published) and the system alerts Jordan. Include a CLI or dashboard command to view the full 90-day calendar, regenerate any single queued post, and extend the queue by another 90 days when it runs low (auto-alert at 2 weeks of runway remaining).

## Automation notes (for Claude Code)
- **Cadence:** 2–3 posts/week. Cluster rotation is handled by the round-robin requirement above.
- **Post skeleton:** H1 with keyword → intro answering the query in 2–3 sentences (AI-overview friendly) → H2 sections → FAQ block with schema markup → CTA to SiteStac free consult.
- **Length:** Pillars 1,800–2,500 words. Supporting posts 800–1,200.
- **Metadata per post:** title tag (<60 chars, keyword front-loaded), meta description (<155 chars), slug, FAQ schema JSON-LD, internal links to pillar + 2 related posts.
- **Local variants:** Generate city-modifier versions only for Clusters 2, 4, 5, 10 (high intent). Don't spam every post with locations.
- **Verify keywords:** Before writing, spot-check volume/difficulty in Google Keyword Planner (free) or Ubersuggest. Long-tail question keywords above are chosen for low competition + high intent, but volumes shift.

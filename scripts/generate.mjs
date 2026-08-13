// Drafts whatever is due in the queue and writes it to src/content/blog/.
// Everything auto-publishes — the Action commits straight to main, which
// triggers the deploy. Nothing waits on review, pillars included.
//
//   npm run blog:generate             (the daily pass)
//   npm run blog:generate -- --dry-run (draft to stdout, write nothing)

import { existsSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getCluster } from "./clusters.mjs";
import { supabase } from "./supabase.mjs";

const BLOG_DIR = "src/content/blog";
const RUNWAY_ALERT_DAYS = 14;

const dryRun = process.argv.includes("--dry-run");

const anthropic = new Anthropic();
const today = new Date().toISOString().slice(0, 10);
const notes = [];

const note = (line) => {
  console.log(line);
  notes.push(line);
};

const POST_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Title tag, under 60 characters, keyword front-loaded" },
    description: { type: "string", description: "Meta description, under 155 characters" },
    body: {
      type: "string",
      description:
        "The post body in Markdown, starting at the first ## heading. No H1 — the layout renders the title. No FAQ section; those are returned separately.",
    },
    faqs: {
      type: "array",
      description: "3-5 FAQs. Questions people actually type into Google.",
      items: {
        type: "object",
        properties: {
          q: { type: "string" },
          a: { type: "string" },
        },
        required: ["q", "a"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "body", "faqs"],
  additionalProperties: false,
};

const SYSTEM = `You write for SiteStac, which builds websites for small local businesses — trades, service companies, restaurants, salons. The reader is an owner who is good at their trade and has no interest in web jargon.

Write like a straight-talking contractor explaining something to a peer, not like a marketing agency. Short paragraphs. Concrete examples from real trades. No hype, no "in today's digital landscape", no stock phrases.

Never quote specific prices or dollar figures — every job is different, and a number on a public page becomes a promise. Talk about cost in relative terms (what drives it up, what to watch for, what's usually included) instead.

Open by answering the question in two or three sentences before anything else, so it can be lifted straight into a Google AI overview. Then go deeper.

End with a light call to action pointing at a free consult with SiteStac. One or two sentences, no pressure.`;

function buildPrompt(post, cluster, location, related, siblingCityPosts) {
  const lines = [
    `Write a blog post targeting the keyword: "${post.keyword_targeted}"`,
    ``,
    `Topic cluster: ${cluster.name}`,
  ];

  if (post.post_type === "pillar") {
    lines.push(
      `Post type: PILLAR — 1,800-2,500 words. This is the anchor post for the whole cluster, so it should be comprehensive and cover the topic end to end.`,
    );
  } else if (post.post_type === "local_variant") {
    lines.push(
      `Post type: LOCAL — 800-1,200 words, written for ${location.city}, ${location.state}.`,
      ``,
      `This must read as though it was written for ${location.city} specifically, not as a template with the city name pasted in. Reference the kinds of businesses that actually operate there, how customers in that market search, and anything true about competing for local search in that market. If you don't know something specific about ${location.city}, write around it rather than inventing a fact — never fabricate local landmarks, statistics, neighborhoods, or business names.`,
    );

    if (siblingCityPosts.length) {
      lines.push(
        ``,
        `We have already published these city posts:`,
        ...siblingCityPosts.map((s) => `  - ${s.title}`),
        ``,
        `Do not reuse their structure. Give this one its own opening, its own section headings, and its own order of argument. A reader who found two of these pages should not be able to tell they came from the same outline — if they can, Google can too, and the whole set gets treated as filler rather than as pages worth ranking.`,
        `${location.city} is not interchangeable with those markets. Lead with what is actually different about doing business there — the trades that dominate, how big the competition is, whether customers are searching from a phone on a job site or from a desk.`,
      );
    }
  } else {
    lines.push(`Post type: SUPPORTING — 800-1,200 words. Focused on this one question.`);
  }

  if (related.length) {
    lines.push(
      ``,
      `Link naturally to these existing posts using Markdown links, where they genuinely fit the sentence:`,
      ...related.map((r) => `  - [${r.title}](/blog/${r.slug}/)`),
    );
  }

  return lines.join("\n");
}

function toMarkdown(post, draft, location, related) {
  const esc = (s) => String(s).replace(/"/g, '\\"');
  const frontmatter = [
    "---",
    `title: "${esc(draft.title)}"`,
    `description: "${esc(draft.description)}"`,
    `date: ${today}`,
    `draft: false`,
    `cluster: ${post.cluster_id}`,
    `keyword: "${esc(post.keyword_targeted)}"`,
    `postType: ${post.post_type}`,
  ];

  if (location) {
    frontmatter.push(`location: "${esc(`${location.city}, ${location.state_abbr}`)}"`);
  }
  if (related.length) {
    frontmatter.push("related:");
    related.forEach((r) => frontmatter.push(`  - ${r.slug}`));
  }
  frontmatter.push("faqs:");
  draft.faqs.forEach((f) => {
    frontmatter.push(`  - q: "${esc(f.q)}"`);
    frontmatter.push(`    a: "${esc(f.a)}"`);
  });
  frontmatter.push("---", "");

  return frontmatter.join("\n") + draft.body.trim() + "\n";
}

// --- load what's due -------------------------------------------------------

const { data: locations } = await supabase.from("locations").select("*");
const locationById = new Map((locations ?? []).map((l) => [l.id, l]));

const { data: due, error } = await supabase
  .from("blog_posts")
  .select("*")
  .lte("scheduled_for", today)
  .is("published_at", null)
  // Nothing waits on review any more. `pending_review` stays in this list only
  // because rows seeded before that change still carry it — they publish like
  // anything else rather than needing a manual status fix.
  .in("status", ["approved", "pending_review"])
  .order("scheduled_for");

if (error) throw error;

// A post whose file is already on main was published by a merged PR (or an
// earlier run) — reconcile the ledger rather than drafting it a second time.
const alreadyOnDisk = due.filter((p) => existsSync(join(BLOG_DIR, `${p.slug}.md`)));
if (alreadyOnDisk.length && !dryRun) {
  await supabase
    .from("blog_posts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .in("id", alreadyOnDisk.map((p) => p.id));
  alreadyOnDisk.forEach((p) => note(`Published (already on main): ${p.slug}`));
}

const queue = due.filter((p) => !alreadyOnDisk.includes(p));

if (!queue.length) {
  note("Nothing due.");
}

// --- draft -----------------------------------------------------------------

for (const post of queue) {
  const cluster = getCluster(post.cluster_id);
  const location = post.location_id ? locationById.get(post.location_id) : null;

  const { data: siblings } = await supabase
    .from("blog_posts")
    .select("slug, title, post_type")
    .eq("cluster_id", post.cluster_id)
    .eq("status", "published")
    .neq("id", post.id)
    .limit(10);

  // City pages all come from the same handful of templates, so each one needs to
  // see what the others already said in order to not repeat it.
  const siblingCityPosts =
    post.post_type === "local_variant"
      ? (siblings ?? []).filter((s) => s.post_type === "local_variant")
      : [];

  // Internal links: the cluster pillar plus two others from the same cluster.
  const pool = siblings ?? [];
  const related = [
    ...pool.filter((s) => s.post_type === "pillar"),
    ...pool.filter((s) => s.post_type !== "pillar"),
  ].slice(0, 3);

  console.log(`\nDrafting [${post.post_type}] ${post.keyword_targeted}`);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: POST_SCHEMA } },
    messages: [
      { role: "user", content: buildPrompt(post, cluster, location, related, siblingCityPosts) },
    ],
  });

  if (response.stop_reason === "refusal") {
    note(`Refused, skipping: ${post.slug} (${response.stop_details?.category ?? "unknown"})`);
    continue;
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  const draft = JSON.parse(text);
  const markdown = toMarkdown(post, draft, location, related);

  if (dryRun) {
    console.log(markdown);
    continue;
  }

  writeFileSync(join(BLOG_DIR, `${post.slug}.md`), markdown);

  await supabase
    .from("blog_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      title: draft.title,
    })
    .eq("id", post.id);

  note(`Wrote ${post.slug}.md — ${draft.title}`);
}

// --- runway ----------------------------------------------------------------

const { data: remaining } = await supabase
  .from("blog_posts")
  .select("scheduled_for")
  .is("published_at", null)
  .gte("scheduled_for", today)
  .order("scheduled_for", { ascending: false })
  .limit(1);

const lastDate = remaining?.[0]?.scheduled_for;
const daysLeft = lastDate
  ? Math.round((new Date(lastDate) - new Date(today)) / 86_400_000)
  : 0;

if (daysLeft <= RUNWAY_ALERT_DAYS) {
  note(`Only ${daysLeft} days of queue left. Run \`npm run blog:seed\` to extend it.`);
}

if (process.env.GITHUB_STEP_SUMMARY && notes.length) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${notes.map((n) => `- ${n}`).join("\n")}\n`);
}

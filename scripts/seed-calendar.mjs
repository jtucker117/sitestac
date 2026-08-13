// Keeps a rolling 90-day publishing queue: round-robin across the 10 clusters,
// Mon/Wed/Fri, ~39 slots. Everything lands approved and auto-publishes on its
// date, pillars included — nothing waits on review.
//
// The daily Action runs this before generating, so the queue tops itself up and
// never runs dry. Safe to run repeatedly: dates that already have a post are
// skipped, and the unique index blocks any keyword being queued twice.
//
//   npm run blog:seed              -- top the queue back up to 90 days
//   npm run blog:seed -- --dry-run -- print the plan without writing
//   npm run blog:calendar          -- show what's already queued

import { ORDERED_CLUSTERS, LOCAL_CLUSTER, fillTemplate, slugify } from "./clusters.mjs";
import { supabase } from "./supabase.mjs";

const POSTS_PER_WEEK = 3;
const WEEKS = 13;
const PUBLISH_DAYS = [1, 3, 5]; // Mon, Wed, Fri

// Every cluster leads with its pillar, so activating all ten at once puts ten
// pillars in the first ten slots — three weeks where nothing auto-publishes and
// ten PRs arrive together. Instead the clusters phase in: two to start, one more
// every ACTIVATION_INTERVAL slots. A cluster's pillar is still the first thing
// it publishes, so supporting posts always have a pillar to link back to, but
// the review load spreads to roughly one PR a week.
const STARTING_CLUSTERS = 2;
const ACTIVATION_INTERVAL = 4;

// City pages get a fixed share of the calendar rather than one turn in the
// cluster rotation, which capped them at 1 post in 10 — far too slow to cover a
// list this size. Every LOCAL_SLOT_EVERY-th slot is a city page; when the city
// list is exhausted the slot falls back to the normal rotation, so the calendar
// never runs short.
const LOCAL_SLOT_EVERY = 2;

const dryRun = process.argv.includes("--dry-run");

// Mon/Wed/Fri dates starting from the next Monday, WEEKS weeks out.
function publishDates() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));

  const dates = [];
  for (let week = 0; week < WEEKS; week++) {
    for (const day of PUBLISH_DAYS) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + week * 7 + (day - 1));
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

// Picks the next unwritten topic for a cluster: pillar first (it anchors the
// cluster and every supporting post links back to it), then supporting
// keywords, then location variants once the neutral keywords are exhausted.
// Cluster 10 has no neutral keywords, so it always yields a variant.
function nextTopic(cluster, taken, locations) {
  if (cluster.pillar) {
    const keyword = cluster.pillarKeyword ?? cluster.pillar;
    if (!taken.has(`${keyword}|0`)) {
      return {
        keyword,
        title: cluster.pillar,
        slug: slugify(cluster.pillar),
        post_type: "pillar",
        location_id: null,
      };
    }
  }

  for (const keyword of cluster.keywords ?? []) {
    if (!taken.has(`${keyword}|0`)) {
      return {
        keyword,
        title: keyword,
        slug: slugify(keyword),
        post_type: "supporting",
        location_id: null,
      };
    }
  }

  // Only clusters with {city} templates can produce variants. Falling back to a
  // cluster's plain keywords looks tempting but produces a duplicate of an
  // existing post with a location_id attached — same query, same content, two
  // pages competing. Cluster 10's templates already cover the high-intent local
  // keywords for cost, local SEO, and the trades.
  if (!cluster.templates?.length) return null;

  for (const location of locations) {
    for (const base of cluster.templates) {
      const keyword = fillTemplate(base, location);
      if (!taken.has(`${keyword}|${location.id}`)) {
        return {
          keyword,
          title: keyword,
          slug: slugify(keyword),
          post_type: "local_variant",
          location_id: location.id,
        };
      }
    }
  }
  return null;
}

const { data: locations, error: locError } = await supabase
  .from("locations")
  .select("id, city, state, state_abbr, slug_modifier")
  .eq("active", true)
  .order("id");

if (locError) throw locError;

const { data: existing, error: postError } = await supabase
  .from("blog_posts")
  .select("keyword_targeted, location_id, cluster_id, post_type, scheduled_for");

if (postError) throw postError;

// Dedup key mirrors the database's unique index.
const taken = new Set(
  existing.map((p) => `${p.keyword_targeted}|${p.location_id ?? 0}`),
);

// Resume where the existing queue left off, so a re-run doesn't restart the
// rotation and publish two posts from one cluster back to back.
const alreadyScheduled = existing.filter((p) => p.scheduled_for).length;
const dates = publishDates().filter(
  (d) => !existing.some((p) => p.scheduled_for === d),
);
let rotation = alreadyScheduled;

const rows = [];

for (const [i, date] of dates.entries()) {
  const slot = alreadyScheduled + i;
  const activeCount = Math.min(
    ORDERED_CLUSTERS.length,
    STARTING_CLUSTERS + Math.floor(slot / ACTIVATION_INTERVAL),
  );

  let topic = null;
  let picked = null;
  const previous = rows.at(-1)?.cluster_id;

  // Reserved city slot. Falls through to the rotation once every city page has
  // been queued.
  if (slot % LOCAL_SLOT_EVERY === 1) {
    const local = nextTopic(LOCAL_CLUSTER, taken, locations);
    if (local) {
      topic = local;
      picked = LOCAL_CLUSTER;
    }
  }

  // Walk the active clusters until one still has an unwritten topic.
  for (let attempt = 0; !topic && attempt < activeCount; attempt++) {
    const cluster = ORDERED_CLUSTERS[rotation % activeCount];
    rotation++;
    // The pool grows as clusters activate, so the modulo can land on the same
    // cluster twice running. Skip it while another option remains — never two
    // posts from one cluster back to back.
    if (cluster.id === previous && attempt < activeCount - 1) continue;
    topic = nextTopic(cluster, taken, locations);
    if (topic) picked = cluster;
  }

  if (!topic) break; // every cluster exhausted

  taken.add(`${topic.keyword}|${topic.location_id ?? 0}`);
  rows.push({
    slug: topic.slug,
    title: topic.title,
    cluster_id: picked.id,
    keyword_targeted: topic.keyword,
    post_type: topic.post_type,
    status: "approved",
    location_id: topic.location_id,
    scheduled_for: date,
  });
}

if (!rows.length) {
  console.log("Queue is already full for the next 90 days. Nothing to add.");
  process.exit(0);
}

for (const r of rows) {
  console.log(
    `${r.scheduled_for}  c${String(r.cluster_id).padStart(2)}  ${r.post_type.padEnd(14)}  ${r.keyword_targeted}`,
  );
}
console.log(`\n${rows.length} posts queued across ${WEEKS} weeks (${POSTS_PER_WEEK}/week).`);
console.log(`  pillars:          ${rows.filter((r) => r.post_type === "pillar").length}`);
console.log(`  city pages:       ${rows.filter((r) => r.post_type === "local_variant").length}`);
console.log(`  supporting posts: ${rows.filter((r) => r.post_type === "supporting").length}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const { error: insertError } = await supabase.from("blog_posts").insert(rows);
if (insertError) throw insertError;
console.log("\nQueue written to Supabase.");

// Builds the 90-day publishing queue: round-robin across the 10 clusters,
// Mon/Wed/Fri, ~39 slots. Pillars land as pending_review (Jordan approves via
// PR); everything else lands approved and auto-publishes on its date.
//
//   npm run blog:seed              -- queue the next 90 days
//   npm run blog:seed -- --dry-run -- print the plan without writing
//   npm run blog:calendar          -- show what's already queued

import { CLUSTERS, fillTemplate, slugify } from "./clusters.mjs";
import { supabase } from "./supabase.mjs";

const POSTS_PER_WEEK = 3;
const WEEKS = 13;
const PUBLISH_DAYS = [1, 3, 5]; // Mon, Wed, Fri

// Every cluster leads with its pillar, so a naive rotation puts all 10 pillars
// in the first 10 slots — three weeks where nothing auto-publishes and ten PRs
// pile up at once. Space them out instead; the cluster falls back to a
// supporting keyword when a pillar is already awaiting review nearby.
const PILLAR_SPACING_DAYS = 14;

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
// cluster), then supporting keywords, then location variants once the neutral
// keywords are exhausted. Cluster 10 has no neutral keywords, so it always
// yields a variant.
function nextTopic(cluster, taken, locations, pillarAllowed) {
  if (cluster.pillar && pillarAllowed && !taken.has(`${cluster.pillar}|0`)) {
    return {
      keyword: cluster.pillar,
      title: cluster.pillar,
      slug: slugify(cluster.pillar),
      post_type: "pillar",
      location_id: null,
    };
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

  if (!cluster.localVariants) return null;

  // Cluster 10 uses its own templates; clusters 2/4/5 reuse their keywords as
  // variant bases once every neutral post is queued.
  const bases = cluster.templates ?? cluster.keywords ?? [];
  for (const location of locations) {
    for (const base of bases) {
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

// Resume the rotation where the existing queue left off, so a re-run doesn't
// restart at cluster 1 and publish two cluster-1 posts back to back.
const scheduled = existing.filter((p) => p.scheduled_for);
const dates = publishDates().filter(
  (d) => !scheduled.some((p) => p.scheduled_for === d),
);
let rotation = scheduled.length % CLUSTERS.length;

const rows = [];
const pillarDates = existing
  .filter((p) => p.scheduled_for && p.post_type === "pillar")
  .map((p) => p.scheduled_for);

const spacedFromLastPillar = (date) =>
  pillarDates.every(
    (d) => Math.abs(new Date(date) - new Date(d)) / 86_400_000 >= PILLAR_SPACING_DAYS,
  );

for (const date of dates) {
  let topic = null;
  const pillarAllowed = spacedFromLastPillar(date);
  // Walk the rotation until a cluster still has an unwritten topic.
  for (let attempt = 0; attempt < CLUSTERS.length; attempt++) {
    const cluster = CLUSTERS[rotation % CLUSTERS.length];
    rotation++;
    topic = nextTopic(cluster, taken, locations, pillarAllowed);
    if (topic) {
      if (topic.post_type === "pillar") pillarDates.push(date);
      taken.add(`${topic.keyword}|${topic.location_id ?? 0}`);
      rows.push({
        ...topic,
        cluster_id: cluster.id,
        scheduled_for: date,
        status: topic.post_type === "pillar" ? "pending_review" : "approved",
      });
      break;
    }
  }
  if (!topic) break; // every cluster exhausted
}

if (!rows.length) {
  console.log("Queue is already full for the next 90 days. Nothing to add.");
  process.exit(0);
}

const insert = rows.map((r) => ({
  slug: r.slug,
  title: r.title,
  cluster_id: r.cluster_id,
  keyword_targeted: r.keyword,
  post_type: r.post_type,
  status: r.status,
  location_id: r.location_id,
  scheduled_for: r.scheduled_for,
}));

for (const r of insert) {
  console.log(
    `${r.scheduled_for}  c${String(r.cluster_id).padStart(2)}  ${r.post_type.padEnd(14)}  ${r.keyword_targeted}`,
  );
}
console.log(`\n${insert.length} posts queued across ${WEEKS} weeks (${POSTS_PER_WEEK}/week).`);
console.log(`  pillars needing review: ${insert.filter((r) => r.post_type === "pillar").length}`);
console.log(`  location variants:      ${insert.filter((r) => r.post_type === "local_variant").length}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const { error: insertError } = await supabase.from("blog_posts").insert(insert);
if (insertError) throw insertError;
console.log("\nQueue written to Supabase.");

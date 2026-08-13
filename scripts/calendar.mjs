// Shows the queue. `npm run blog:calendar`
import { supabase } from "./supabase.mjs";

const today = new Date().toISOString().slice(0, 10);

const { data: posts, error } = await supabase
  .from("blog_posts")
  .select("slug, title, cluster_id, post_type, status, scheduled_for, published_at")
  .order("scheduled_for", { nullsFirst: false });

if (error) throw error;

if (!posts.length) {
  console.log("Queue is empty. Run `npm run blog:seed`.");
  process.exit(0);
}

for (const p of posts) {
  const when = p.scheduled_for ?? "unscheduled";
  const marker = p.published_at ? "*" : when < today ? "!" : " ";
  console.log(
    `${marker} ${when}  c${String(p.cluster_id).padStart(2)}  ${p.post_type.padEnd(14)}  ${p.status.padEnd(14)}  ${p.title}`,
  );
}

const pending = posts.filter((p) => !p.published_at);
const pillars = pending.filter((p) => p.post_type === "pillar");

console.log(`\n${posts.length} total, ${pending.length} still queued.`);
if (pillars.length) {
  console.log(`${pillars.length} pillar(s) awaiting your review:`);
  pillars.forEach((p) => console.log(`  ${p.scheduled_for}  ${p.title}`));
}
console.log("\n* published   ! past due");

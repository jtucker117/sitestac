// Marks ledger rows published once their post file has actually landed on main.
//
// generate.mjs deliberately does not do this. It used to mark a row published
// the moment it wrote the file, so when the commit step silently dropped the
// new posts the ledger still said "done" and those topics were never redrafted.
// Splitting the write out means a failed commit, push, or deploy leaves the row
// untouched and the next run simply drafts it again.
//
//   npm run blog:confirm

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { supabase } from "./supabase.mjs";

const BLOG_DIR = "src/content/blog";

const { data: pending, error } = await supabase
  .from("blog_posts")
  .select("id, slug")
  .is("published_at", null);

if (error) throw error;

const landed = (pending ?? []).filter((p) => existsSync(join(BLOG_DIR, `${p.slug}.md`)));

if (!landed.length) {
  console.log("Nothing to confirm.");
  process.exit(0);
}

const now = new Date().toISOString();

for (const post of landed) {
  const text = readFileSync(join(BLOG_DIR, `${post.slug}.md`), "utf8");
  const title = text.match(/^title:\s*"(.+)"$/m)?.[1];

  const { error: err } = await supabase
    .from("blog_posts")
    .update({ status: "published", published_at: now, ...(title ? { title } : {}) })
    .eq("id", post.id);

  if (err) throw err;
  console.log(`Confirmed published: ${post.slug}`);
}

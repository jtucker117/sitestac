import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    // Written by the blog generator. Optional so hand-written posts still validate.
    cluster: z.number().optional(),
    keyword: z.string().optional(),
    postType: z.enum(["pillar", "supporting", "local_variant"]).optional(),
    location: z.string().optional(),
    related: z.array(z.string()).default([]),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

export const collections = { blog };

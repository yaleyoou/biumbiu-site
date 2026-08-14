import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Images referenced from frontmatter live under src/assets and are processed by
// astro:assets at build time; the schema exposes them as ImageMetadata.

const common = ({ image }: { image: () => z.ZodTypeAny }) => ({
  title: z.string(),
  cardTitle: z.string().optional(),
  description: z.string(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  image: image(),
  imageAlt: z.string(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  order: z.number().int().default(100),
  draft: z.boolean().default(false)
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      ...common({ image }),
      period: z.string(),
      role: z.string(),
      status: z.enum(["Ongoing", "Completed", "Maintained"]).default("Completed"),
      stack: z.string().optional(),
      containImage: z.boolean().default(false),
      darkImage: z.boolean().default(false)
    })
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: ({ image }) =>
    z.object({
      ...common({ image }),
      category: z.string().default("Field note")
    })
});

export const collections = { projects, notes };

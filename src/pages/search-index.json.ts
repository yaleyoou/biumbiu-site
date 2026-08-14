import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { cleanMarkdown, contentPath, formatDate, isPublished } from "../lib/content";

type SearchEntry = CollectionEntry<"notes"> | CollectionEntry<"projects">;

const toSearchRecord = (entry: SearchEntry) => ({
  title: entry.data.cardTitle ?? entry.data.title,
  description: entry.data.description,
  url: contentPath(entry.collection, entry.id),
  type: entry.collection === "notes" ? "笔记" : "项目",
  date: formatDate(entry.data.updated ?? entry.data.date),
  tags: entry.data.tags,
  content: cleanMarkdown(entry.body ?? "")
});

export const prerender = true;

export const GET: APIRoute = async () => {
  const [notes, projects] = await Promise.all([
    getCollection("notes", isPublished),
    getCollection("projects", isPublished)
  ]);
  const records = [...notes, ...projects]
    .map(toSearchRecord)
    .sort((a, b) => b.date.localeCompare(a.date));

  return new Response(JSON.stringify(records), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
};

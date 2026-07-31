import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { byNewest, contentPath, isPublished } from "../lib/content";

export async function GET(context: { site?: URL }) {
  const notes = (await getCollection("notes", isPublished)).sort(byNewest);

  return rss({
    title: "BiumBiu 笔记",
    description: "关于 AI Infrastructure、推理优化、Agent 与工程实践的技术笔记。",
    site: context.site ?? new URL("https://biumbiu.com"),
    items: notes.map(({ id, data }) => ({
      title: data.title,
      description: data.description,
      pubDate: data.date,
      link: contentPath("notes", id),
      categories: data.tags
    }))
  });
}

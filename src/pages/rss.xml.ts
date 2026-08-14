import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { byNewest, contentPath, isPublished } from "../lib/content";

type FeedEntry = CollectionEntry<"notes"> | CollectionEntry<"projects">;

const feedMarkdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

feedMarkdown.renderer.rules.image = (tokens, index) => {
  const alt = feedMarkdown.utils.escapeHtml(tokens[index].content || "图片");
  return `<em>图片：${alt}</em>`;
};

const renderFeedContent = (markdown: string, pageURL: URL) => sanitizeHtml(
  feedMarkdown.render(markdown),
  {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: {
      a: ["href", "title"],
      code: ["class"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => {
        const transformed = { ...attributes };

        if (transformed.href) {
          try {
            transformed.href = new URL(transformed.href, pageURL).href;
          } catch {
            delete transformed.href;
          }
        }

        return { tagName, attribs: transformed };
      }
    }
  }
);

export async function GET(context: { site?: URL }) {
  const [notes, projects] = await Promise.all([
    getCollection("notes", isPublished),
    getCollection("projects", isPublished)
  ]);
  const entries: FeedEntry[] = [...notes, ...projects].sort(byNewest);
  const site = context.site ?? new URL("https://biumbiu.com");

  return rss({
    title: "BiumBiu",
    description: "关于 AI Infrastructure、推理优化、Agent 与工程实践的技术笔记与项目档案。",
    site,
    items: entries.map(({ id, collection, body, data }) => {
      const link = contentPath(collection, id);

      return {
        title: data.title,
        description: data.description,
        content: renderFeedContent(body ?? "", new URL(link, site)),
        pubDate: data.date,
        link,
        categories: [collection === "notes" ? "笔记" : "项目", ...data.tags]
      };
    })
  });
}

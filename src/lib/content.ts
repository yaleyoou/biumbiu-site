import type { CollectionEntry } from "astro:content";

type Publishable = CollectionEntry<"projects"> | CollectionEntry<"notes">;

export const isPublished = ({ data }: Publishable) => import.meta.env.PROD ? !data.draft : true;

export const byOrderThenDate = (a: Publishable, b: Publishable) =>
  a.data.order - b.data.order || b.data.date.getTime() - a.data.date.getTime();

export const byNewest = (a: Publishable, b: Publishable) =>
  b.data.date.getTime() - a.data.date.getTime();

export const contentPath = (collection: "projects" | "notes", id: string) =>
  `/${collection}/${id}/`;

export const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const estimateReadingMinutes = (markdown: string) => {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  const hanCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length ?? 0;

  return Math.max(1, Math.ceil(hanCharacters / 450 + latinWords / 220));
};

// 把 Markdown 正文压成纯文本，供站内搜索索引使用。
export const cleanMarkdown = (markdown: string) => markdown
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/```[^\n]*\n?/g, " ")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/[`#>*_~|=]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const tagSlug = (tag: string) => tag
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase("zh-CN")
  .replace(/&/g, " and ")
  .replace(/\+/g, " plus ")
  .replace(/#/g, " sharp ")
  .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
  .replace(/^-+|-+$/g, "");

export const tagPath = (tag: string) => `/tags/${tagSlug(tag)}/`;

export const relatedEntries = <Entry extends Publishable>(
  current: Entry,
  entries: Entry[],
  limit = 3
) => {
  const currentTags = new Set(current.data.tags.map((tag) => tag.toLocaleLowerCase("zh-CN")));

  return entries
    .filter((entry) => entry.id !== current.id)
    .map((entry) => ({
      entry,
      sharedTags: entry.data.tags.filter((tag) => currentTags.has(tag.toLocaleLowerCase("zh-CN"))).length
    }))
    .sort((a, b) => b.sharedTags - a.sharedTags || b.entry.data.date.getTime() - a.entry.data.date.getTime())
    .slice(0, limit)
    .map(({ entry }) => entry);
};

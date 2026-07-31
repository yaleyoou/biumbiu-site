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

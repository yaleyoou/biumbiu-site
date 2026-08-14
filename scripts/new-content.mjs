import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [collection, slug] = process.argv.slice(2);
const validCollections = new Set(["projects", "notes"]);

if (!validCollections.has(collection) || !slug) {
  console.error("Usage: node scripts/new-content.mjs <projects|notes> <slug>");
  process.exit(1);
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error("Slug must contain only lowercase letters, numbers, and hyphens.");
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const target = resolve(`src/content/${collection}/${slug}.md`);

if (existsSync(target)) {
  console.error(`Content already exists: ${target}`);
  process.exit(1);
}

const common = `title: "在这里填写标题"
description: "用一到两句话说明这篇内容解决了什么问题。"
date: ${date}
image: "../../assets/images/biumbiu-site-cover.webp"
imageAlt: "描述图片内容"
tags: ["Tag"]
featured: false
order: 100
draft: true`;

const frontmatter = collection === "projects"
  ? `${common}
period: "${new Date().getFullYear()}"
role: "Your role"
status: "Ongoing"
stack: "Key technologies"
containImage: false
darkImage: false`
  : `${common}
category: "Field note"`;

const body = `---
${frontmatter}
---

先用一段话说明背景、目标和当前结论。

## 问题

这里写清楚要解决的问题与约束。

## 过程

这里记录关键选择、实现和失败路径。

## 结果

这里写可验证的结果、边界和下一步。
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, body, { encoding: "utf8", flag: "wx" });
console.log(`Created ${target}`);
console.log("Drafts are visible locally. Set draft: false when it is ready to publish.");

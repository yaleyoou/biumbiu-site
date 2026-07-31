---
title: "BiumBiu.com"
description: "一个以内容为中心的个人网站：使用 Astro 静态生成，通过 Markdown 管理项目和笔记，并由 Cloudflare Pages 自动发布。"
date: 2026-07-30
period: "2026 - Now"
role: "Design & Development"
status: "Maintained"
stack: "Astro / Cloudflare"
image: "/images/project-web.webp"
imageAlt: "显示个人网站源码的开发工作区"
tags: ["Astro", "TypeScript", "Content Collections", "Cloudflare Pages"]
featured: false
order: 4
---

BiumBiu.com 是我用来保存项目、技术笔记和阶段性思考的公开空间。它不需要登录、数据库或复杂后台，核心要求是快速、清楚，并且多年以后仍然容易维护。

## 内容优先

站点最初直接用 Astro 页面保存文章。这样可以精确控制每个页面，但新增内容时还要手动维护首页和归档页，长期使用的成本很高。

现在项目与笔记已经迁移到 Astro Content Collections。每篇内容都是一个普通 Markdown 文件，标题、日期、封面和标签写在文件开头；详情页、首页精选与归档列表都从同一份数据自动生成。

```text
src/content/projects/  -> 项目 Markdown
src/content/notes/     -> 笔记 Markdown
src/pages/[collection] -> 自动生成列表与详情
```

## 发布链路

> Markdown 内容 → Astro 静态构建 → Git 版本记录 → Cloudflare Pages → biumbiu.com

Astro 在构建阶段输出普通 HTML，因此线上访问不依赖常驻服务器。Cloudflare Pages 连接生产分支，每次提交后自动安装依赖、执行检查并发布新版本。

## 设计取舍

桌面首页采用固定信息栏和滚动内容区，适合快速浏览“关于、近况、项目、笔记”四组内容；移动端收敛成单栏，避免把桌面布局机械压缩。视觉系统使用深绿背景、荧光绿重点色和少量珊瑚红状态色，保持工程感，同时避免纯黑界面过于生硬。

交互只服务于信息层级：左侧导航显示当前阅读栏目，项目缩略图帮助快速识别内容，文章页面则收窄阅读宽度并强化标题、表格、代码和引用的节奏。

## 维护原则

- 内容只有一个来源，列表页不重复填写标题与链接；
- 草稿通过 frontmatter 控制，不会进入生产构建；
- 图片统一放在 `public/images/`，Markdown 使用稳定的绝对路径；
- 发布前执行类型检查、静态构建和主要链接验证；
- 保留旧 URL，内容架构调整不破坏已经分享出去的链接。

这个网站不会追求不断增加页面。更重要的是让记录一项工作、修改一篇文章和回看过去都足够轻松。

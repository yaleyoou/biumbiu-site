---
title: "BiumBiu.com"
description: "一个以内容为中心的个人网站：使用 Astro 管理项目与笔记，以 Three.js 提供首页交互，并由 Cloudflare Pages 和 D1 承担发布与访问量统计。"
date: 2026-07-30
updated: 2026-08-08
period: "2026 - Now"
role: "Design & Development"
status: "Maintained"
stack: "Astro / TypeScript / Three.js / Cloudflare"
image: "/images/biumbiu-site-cover.webp"
imageAlt: "BiumBiu 个人网站首页的桌面端界面"
tags: ["Astro", "TypeScript", "Three.js", "Cloudflare Pages", "D1", "Content Collections"]
featured: false
order: 4
---

BiumBiu.com 是我用来保存项目、技术笔记和阶段性思考的公开空间。它不需要登录或复杂后台，核心要求是快速、清楚，并且多年以后仍然容易维护。

## 项目目标

首页需要在一个视图中交代我是谁、最近关注什么、做过哪些项目以及正在写什么；项目、笔记、标签和当前状态则拥有独立页面，方便继续浏览和检索。内容应该用普通 Markdown 长期保存，视觉与交互可以迭代，但不应该反过来绑架写作流程。

## 三层职责

站点把不同能力拆在各自合适的运行环境里：

| 层级 | 职责 | 实现 |
| --- | --- | --- |
| 静态内容 | 页面、项目、笔记、标签与搜索索引 | Astro、Content Collections |
| 浏览器交互 | 搜索、主题切换、首页信号场与 3D 模型 | TypeScript、Three.js |
| 服务端能力 | 页面与全站访问量计数 | Pages Functions、D1 |

大部分页面在构建阶段生成普通 HTML，线上不依赖常驻应用服务器。只有确实需要写入状态的访问量接口运行在 Cloudflare 边缘环境中。

## 内容优先

站点最初直接用 Astro 页面保存文章。这样可以精确控制每个页面，但新增内容时还要手动维护首页和归档页，长期使用的成本很高。

现在项目与笔记统一由 Astro Content Collections 管理。每篇内容都是一个普通 Markdown 文件，标题、日期、封面、标签和草稿状态写在 frontmatter 中；详情页、首页精选、归档列表、标签页和搜索索引都从同一份数据自动生成。

```text
src/content/projects/ -> 项目 Markdown
src/content/notes/    -> 笔记 Markdown
src/pages/            -> 列表、详情、标签、搜索与 RSS
```

内容脚手架会默认创建草稿，开发环境可以预览，生产构建自动排除。文件名直接成为稳定的 URL slug，不需要额外维护路由表。

## 首页视觉与交互

桌面首页采用固定个人信息栏和滚动内容区，移动端收敛成单栏。首屏使用 Three.js 渲染可拖动、可用键盘操作的 GLB 个人形象，背景信号场和轻量视差用于建立层次，但不会遮挡主要内容。

3D 模型同时提供静态 WebP 海报作为预载和加载失败回退。开发与构建前的资源脚本会根据模型内容自动更新海报并同步 Draco 解码器；用户偏好减少动态效果时，页面也会降低非必要动画。

## 内容发现

项目和笔记除了归档页，还可以通过标签与全文搜索互相连接。构建阶段生成的 `/search-index.json` 收录已发布内容的标题、摘要、标签和正文，浏览器端直接完成匹配，不依赖第三方搜索服务，也不会把草稿暴露到生产环境。

站点同时生成 RSS 与 sitemap，让内容既能在站内被找到，也能被订阅工具和搜索引擎稳定发现。

## 发布链路

> Markdown 内容 → Astro 静态构建 → Git 版本记录 → Cloudflare Pages → biumbiu.com

Cloudflare Pages 连接生产分支，每次提交后自动安装依赖、检查图片引用、执行 Astro 类型检查并发布 `dist/`。图片导入工具会统一方向、尺寸与 WebP 输出；缺失、损坏或仍需优化的资源能够在发布前被发现。

页面访问量由 Pages Function 接收并写入 D1，同时记录当前路径和全站总量。Astro 本地开发不模拟这部分服务端环境，因此组件会在本地自动隐藏，完整链路放到 Cloudflare Preview 和正式环境验证。

## 设计取舍

视觉系统使用深绿背景、荧光绿重点色和少量珊瑚红状态色，保持工程感，同时避免纯黑界面过于生硬。浅色与深色主题共享同一套信息层级，代码、表格、引用和正文宽度则围绕长时间阅读调整。

交互只服务于信息层级：导航显示当前栏目，项目缩略图帮助快速识别内容，文章页提供目录和内容导航，首页模型有键盘入口与静态回退。站点不会为了视觉效果牺牲移动端布局、可读性或基本可访问性。

## 维护原则

- 内容只有一个来源，列表页不重复填写标题与链接；
- 草稿通过 frontmatter 控制，不会进入生产构建；
- `scripts/` 与浏览器端 `src/client/` 保持明确的运行环境边界；
- 图片和模型放在 `public/`，并由检查或生成脚本维护关联资源；
- 发布前执行图片检查、类型检查、静态构建与 Pages Function 编译；
- 保留旧 URL，内容架构调整不破坏已经分享出去的链接。

## 当前结果

网站已经形成一条可重复的维护路径：用 Markdown 新增内容，用脚本处理图片和模型，用 Astro 生成页面、索引、RSS 与 sitemap，用少量浏览器代码增强交互，再由 Cloudflare Pages、Functions 和 D1 完成发布与统计。

这个项目不会以不断增加页面为目标。更重要的是让记录一项工作、修改一篇文章和回看过去都足够轻松，同时让每次更新仍然能够被构建和检查流程验证。

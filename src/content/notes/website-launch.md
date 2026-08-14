---
title: "从本地预览到正式域名：BiumBiu 个人网站上线记录"
cardTitle: "从零搭建一个个人网站"
description: "记录 BiumBiu 从 Astro 静态站点到 Cloudflare Pages、Three.js 首页、站内搜索与 D1 访问量统计的搭建和维护过程。"
date: 2026-07-30
updated: 2026-08-08
category: "Build log"
image: "../../assets/images/biumbiu-site-cover.webp"
imageAlt: "BiumBiu 个人网站首页的桌面端界面"
tags: ["Astro", "Cloudflare Pages", "Three.js", "D1"]
featured: true
order: 1
---

有了自己的域名以后，我不想只放一个临时首页，而是希望得到一个能长期更新的公开空间：它可以介绍我正在做什么，展示项目，也能沉淀每一次真正解决过的问题。网站最初以 Astro 静态页面上线，后来逐步补齐了 Content Collections、站内搜索、Three.js 首页模型、图片检查和基于 Cloudflare D1 的访问量统计。

现在的发布链路可以概括为：

> Markdown 内容 → Astro 静态构建 → Git 版本记录 → Cloudflare Pages → biumbiu.com

首屏交互由浏览器端 TypeScript 和 Three.js 负责；访问量则由 Pages Function 写入 D1。静态内容、客户端交互和服务端统计各自处在清楚的边界内。

## 先确定网站要承担什么

这个站点不需要登录和复杂后台，核心仍然是内容与阅读体验。首页集中展示关于、近况、项目和笔记，独立页面提供项目归档、笔记归档、标签、当前状态与搜索。

- 项目页保存做过的系统、工具和网站，而不是只罗列技术名词；
- 笔记页记录部署、排错和取舍，让经验以后仍然可以检索；
- 标签和搜索负责跨内容查找，避免文章增多后只能按时间翻阅；
- 首页保留个人信息与精选内容，把完整档案交给独立页面。

内容展示为主的网站很适合静态生成。Astro 在构建阶段输出普通 HTML，线上阅读不依赖常驻应用服务器；只有访问量计数通过一个很小的服务端接口处理。

## 当前项目如何组织

项目要求 Node.js 22 或更高版本。核心目录按照运行环境和职责拆分：

```text
biumbiu-site/
├── functions/                 # Cloudflare Pages Functions
├── migrations/                # D1 数据库迁移
├── public/                    # 图片、3D 模型和其他公开资源
├── scripts/                   # 内容、图片与模型处理脚本
├── src/
│   ├── client/                # 浏览器端搜索和首页交互
│   ├── components/            # Astro UI 组件
│   ├── content/               # 项目与笔记 Markdown
│   ├── layouts/               # 页面骨架与 SEO
│   ├── lib/                   # 内容和 Markdown 工具
│   ├── pages/                 # 文件路由与静态 API
│   └── styles/                # 全局视觉系统
├── astro.config.mjs
└── package.json
```

这里最重要的边界有两组。`scripts/` 由 Node.js 在终端运行，不能依赖 DOM 或 `window`；`src/client/` 会被 Vite 打包到浏览器，用于搜索和 3D 交互。`public/` 中的文件保持原样发布，3D 模型以 `/models/` 为公开路径前缀；`src/` 中的文件则必须经过 Astro 和 Vite 处理，其中 `src/assets/images/` 的图片会由 `astro:assets` 构建期压缩，组件封面生成 AVIF/WebP，Markdown 正文图片生成响应式 `srcset`。

## 本地开发与预览

安装依赖并启动开发服务器：

```bash
npm ci
npm run dev
```

默认地址是 `http://localhost:4321/`。需要用手机等局域网设备检查时，可以运行：

```bash
npm run dev -- --host 0.0.0.0
```

桌面端首页使用固定信息栏与滚动内容区，移动端收敛成单栏。首屏的 3D 形象可以拖动或用键盘旋转，模型无法加载时会回退到静态海报；减少动态效果的系统偏好也会得到尊重。

`npm run dev` 启动前会自动检查首屏 GLB 是否变化，并在需要时重新生成海报，因此模型和回退图片不会依赖两套手工维护流程。

## 内容改用 Content Collections

项目和笔记现在都由 Astro Content Collections 管理。新增内容时先运行脚手架：

```bash
npm run new:note -- my-note
npm run new:project -- my-project
```

生成的 Markdown 默认带有 `draft: true`。草稿可以在开发环境预览，但不会进入生产构建；确认内容完成后，再将它改为 `false` 或删除该字段。

文件名同时是 URL slug。例如 `src/content/notes/example.md` 会生成 `/notes/example/`。slug 只使用小写字母、数字和连字符，公开后尽量不修改，以免已经分享的链接失效。

标题、摘要、日期、封面和替代文本写在 frontmatter 中。首页精选、归档列表、标签页、详情页和搜索索引都从同一份内容生成，不再分别维护标题与链接。正文从二级标题开始，因为详情页的主标题由布局自动生成。

## 图片与 3D 模型进入发布流程

公开图片统一放在 `src/assets/images/`，由 `astro:assets` 在构建期处理。frontmatter 和 Markdown 正文都用相对路径引用（例如 `../../assets/images/cover.webp`），组件里则用 `<Image>`、`<Picture>` 渲染。Frontmatter 封面会生成多宽度 AVIF/WebP，Markdown 正文图片按源格式生成响应式 `srcset`；两者都会写入真实 `width`/`height`，移动端不再下载全尺寸大图，也避免了布局偏移。

```astro
<Picture src={cover} alt={coverAlt} layout="none" widths={[480, 768, 1200]} formats={["avif", "webp"]} fallbackFormat="webp" />
```

相对路径写错或文件缺失会在 `astro check` 阶段直接报错，因此文章在本地能显示但部署后丢图的问题可以更早暴露。

首页模型固定使用 `public/models/myself.glb`。开发和构建前执行的 `model:prepare` 会在模型变化时更新 `public/images/myself-poster.webp`，并同步当前 Three.js 版本需要的 Draco 解码器。浏览器加载真实模型，静态海报负责首屏预载和失败回退。

## 构建不只是生成 dist

页面在开发环境能打开，不代表生产构建一定成功。当前构建命令会依次准备模型资源、执行 Astro 类型检查（含图片引用校验），再输出静态站点：

```bash
npm run build
npm run preview
```

生成结果位于 `dist/`。桌面和手机尺寸都需要分别检查，确认文字没有溢出、图片和模型能够加载、导航与主题切换可操作，站内链接不会跳到不存在的页面。

Pages Function 不由 Astro 本地服务器提供，需要单独验证它能否编译：

```bash
npm run check:functions
```

## 搜索和访问量如何接入

站内搜索没有依赖外部服务。构建时，Astro 会从已经发布的项目与笔记生成 `/search-index.json`，其中包含标题、摘要、标签和正文；浏览器端再加载这份索引完成匹配。草稿不会进入索引。

访问量接口位于 `functions/api/views.ts`，使用 D1 同时记录当前路径和全站总访问量。Cloudflare Pages 中需要创建名为 `DB` 的 D1 绑定，并执行仓库里的数据库迁移。Preview 环境最好使用独立数据库，避免测试访问写入正式统计。

`npm run dev` 只启动 Astro，不提供 Pages Function 和 D1，因此本地访问量组件会自动隐藏。真正的端到端计数需要在 Cloudflare Preview 或正式环境验证。

## Cloudflare Pages 的构建设置

Pages 连接 Git 仓库后，核心参数如下：

| 配置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 仓库根目录 |

首次构建成功后，Pages 会提供独立的 `*.pages.dev` 预览地址。以后生产分支出现新提交，Cloudflare 会重新安装依赖、构建并发布，不需要手动上传压缩包。

## 第一次部署走错了入口

Cloudflare 把 Workers 与 Pages 放在相近的管理入口里，我第一次创建成了 Worker + Static Assets。构建日志出现 `npx wrangler deploy`，最终地址也是 `*.workers.dev`。它同样可以发布静态资源，但不是原先计划的 Pages Git 集成路径。

确认问题后，我重新选择 Pages。正确部署完成后得到 `*.pages.dev` 地址。先在临时域名验证网站，再绑定正式域名；旧 Worker 也等到 Pages 可用后再删除，避免网站中途没有可用版本。

> `workers.dev` 和 `pages.dev` 都可能显示网页，但它们代表不同的 Cloudflare 产品与部署流程。

## 绑定正式域名

在 Pages 项目的自定义域名中，分别添加 `biumbiu.com` 和 `www.biumbiu.com`。按照向导完成 DNS 校验后，Cloudflare 会提供 HTTPS 证书。证书签发与 DNS 生效可能需要一点时间，因此绑定后应分别访问两个地址，而不是只看后台状态。

根域名和 `www` 指向 Pages，其他连接独立服务的子域名继续保持自己的解析方式。两个网站地址都能打开以后，再使用 Redirect Rules 将 `https://www.biumbiu.com/*` 以 301 跳转到根域名，并保留路径和查询字符串。

## 每次更新的发布流程

1. 运行 `npm run dev`，在桌面和手机尺寸下预览；
2. 使用 `git status` 和 `git diff` 确认本次实际改动；
3. 运行 `npm run build`，完成模型、图片、类型和静态构建检查；
4. 运行 `npm run check:functions`，确认访问量函数能够编译；
5. 只提交准备发布的文件，并推送到生产分支；
6. 等待 Cloudflare Pages 构建成功，再检查正式域名、新页面和主要链接。

现在的 BiumBiu 已经不只是“能打开”的个人首页，而是一套边界清楚的内容发布流程：Markdown 保存内容，Astro 负责静态页面与索引，浏览器端代码提供必要交互，Pages Function 与 D1 承担小范围动态能力，Cloudflare Pages 负责构建、HTTPS 和分发。新增一篇笔记、替换一张图片或更新首页模型，都能沿着同一套检查和发布路径完成。

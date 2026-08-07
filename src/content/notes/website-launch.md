---
title: "从本地预览到正式域名：BiumBiu 个人网站上线记录"
cardTitle: "从零搭建一个个人网站"
description: "记录使用 Astro、Git 与 Cloudflare Pages 搭建、设计并上线 BiumBiu 个人网站的完整过程。"
date: 2026-07-30
category: "Build log"
image: "/images/biumbiu-site-cover.webp"
imageAlt: "BiumBiu 个人网站首页的桌面端界面"
tags: ["Astro", "Cloudflare Pages", "DNS", "Deployment"]
featured: true
order: 1
---

有了自己的域名以后，我不想只放一个临时首页，而是希望得到一个能长期更新的公开空间：它可以介绍我正在做什么，展示项目，也能沉淀每一次真正解决过的问题。最终，这个网站以 Astro 构建，并由 Cloudflare Pages 自动发布到 `biumbiu.com`。

> Astro 本地开发 → Git 版本管理 → Cloudflare Pages 自动构建 → biumbiu.com

## 开始前需要准备什么

这套流程需要一台安装了 Node.js、npm 与 Git 的电脑，一个代码托管账号、一个 Cloudflare 账号，以及已经接入 Cloudflare DNS 的域名。绑定前还要检查根域名和 `www` 是否存在旧的 A、AAAA 或 CNAME 记录，避免它们仍然指向其他服务。

无论是从现有项目继续开发，还是新建 Astro 项目，都应该先让本地开发和生产构建正常，再配置正式域名。

## 先确定网站要承担什么

这个站点不是需要登录、数据库和复杂后台的 Web 应用。第一阶段最重要的是内容与阅读体验，因此页面收敛为首页、关于、项目、当前状态和笔记五个部分。

- 首页快速说明我是谁、关注什么，以及最近发布了哪些内容；
- 项目页保存做过的系统、工具和网站，而不是只列技术名词；
- 笔记页记录部署、排错和取舍，让经验以后仍然可以检索；
- 关于与当前状态页负责相对稳定的信息，不挤占首页主体。

内容展示为主的网站很适合静态生成。Astro 可以在构建阶段把页面输出成普通 HTML，访问时不依赖自己的 VPS，也不需要为个人站点维护常驻后端。

## 本地开发先建立清楚的结构

项目中，`src/pages/` 决定页面路由，`src/components/` 放公共组件，`src/layouts/` 统一标题、SEO 元信息和页面骨架，`src/styles/` 管理视觉系统，图片放在 `public/images/`。项目和笔记正文则统一位于 `src/content/`，用 Markdown 编写。

安装依赖后运行 `npm run dev`，浏览器打开终端提示的本地地址就能预览。`127.0.0.1` 只属于当前电脑，不是互联网上的正式地址。

设计上，我参考了 Brittany Chiang 个人站点清晰的双栏信息架构，但没有直接复制。桌面端使用固定的个人信息栏和可滚动内容区，移动端收敛成单栏；项目卡片、文章入口和焦点状态沿用自己的颜色、字体与交互节奏。

## 发布前先让构建通过

开发页面能打开，不代表生产构建一定成功。提交前运行：

```bash
npm run build
```

它会先执行 Astro 检查，再生成静态文件到 `dist/`，提前发现错误的导入、类型问题和无法生成的页面。桌面和手机尺寸也需要分别检查，确认文字没有溢出、图片能够加载、导航可操作，站内链接不会跳到不存在的页面。

## Cloudflare Pages 的构建设置

Pages 连接项目后，核心参数并不多：

| 配置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Root directory | 仓库根目录 |

首次构建成功后，Pages 会提供独立预览地址。以后生产分支出现新提交，Cloudflare 会重新安装依赖、构建并发布，不需要手动上传压缩包。

## 第一次部署走错了入口

Cloudflare 把 Workers 与 Pages 放在相近的管理入口里，我第一次创建成了 Worker + Static Assets。构建日志出现 `npx wrangler deploy`，最终地址也是 `*.workers.dev`。它同样可以发布静态资源，但不是原先计划的 Pages Git 集成路径。

确认问题后，我重新选择 Pages。正确部署完成后得到 `*.pages.dev` 地址。先在临时域名验证网站，再绑定正式域名；旧 Worker 也等到 Pages 可用后再删除，避免网站中途没有可用版本。

> `workers.dev` 和 `pages.dev` 都可能显示网页，但它们代表不同的 Cloudflare 产品与部署流程。

## 绑定根域名，同时保留其他子域名

在 Pages 项目的自定义域名中，分别添加 `biumbiu.com` 和 `www.biumbiu.com`。按照向导完成 DNS 校验后，Cloudflare 会提供 HTTPS 证书。证书签发与 DNS 生效可能需要一点时间，因此绑定后应分别访问两个地址，而不是只看后台状态。

同一域名的不同记录可以承担不同职责。根域名和 `www` 指向 Pages；其他连接独立服务的子域名保持自己的解析方式。绑定网站时只修改目标记录，不删除或覆盖其他子域名。

## 把 www 统一到根域名

两个地址都能打开以后，可以使用 Redirect Rules 将 `https://www.biumbiu.com/*` 以 301 跳转到根域名，并保留路径和查询字符串。验证时不仅要打开首页，还应测试带路径的文章地址。

## 现在如何新增内容

项目和笔记已经改用 Astro Content Collections。新增内容只需执行脚手架命令，然后编辑生成的 Markdown：

```bash
npm run new:note -- my-note
npm run new:project -- my-project
```

标题、摘要、日期、图片和标签都写在文件顶部。首页、归档页和详情路由会自动更新，不再手动维护多个数组。

## 每次更新的发布流程

1. 运行 `npm run dev`，在桌面和手机尺寸下预览；
2. 使用 `git status` 和 `git diff` 确认本次实际改动；
3. 运行 `npm run build`，确认 Astro 检查与静态构建通过；
4. 只添加准备发布的文件，创建说明清楚的提交；
5. 推送到生产分支，等待 Cloudflare Pages 构建成功；
6. 打开正式域名，检查首页、新页面、移动端与主要链接。

现在的 BiumBiu 已经形成一个最小但完整的发布闭环：本地用 Markdown 编写和预览，Git 保存内容历史，Cloudflare Pages 负责构建、HTTPS 和分发，正式域名负责长期入口。

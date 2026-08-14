# BiumBiu

[biumbiu.com](https://biumbiu.com) 的源码仓库。这是一个基于 Astro 的静态个人网站，用于发布技术笔记、项目档案和阶段性近况。

笔记和项目以 Markdown 与 Astro Content Collections 作为唯一内容源，在构建期生成页面、RSS、搜索索引和 sitemap。图片由 `astro:assets` 优化，首页使用 Three.js 展示 3D 模型；访问量由 Cloudflare Pages Functions 和 D1 记录。

## 功能概览

- **内容管理**：笔记与项目使用独立 Content Collection，并通过 schema 校验元数据。
- **静态输出**：归档页、详情页、标签页、RSS、搜索索引和 sitemap 均在构建期生成。
- **图片优化**：封面输出多宽度 AVIF/WebP，Markdown 正文图片生成响应式 `srcset`。
- **站内搜索**：浏览器直接读取静态索引，不依赖外部搜索服务。
- **首页 3D 场景**：Three.js 加载 Draco 压缩的 GLB，并提供静态海报作为回退。
- **访问量统计**：Pages Function 写入 D1，同时记录单页和全站访问量。

## 技术栈

| 类别 | 实现 |
| --- | --- |
| 框架 | Astro 5、TypeScript |
| 内容 | Astro Content Collections、Markdown |
| 样式与交互 | Astro Components、原生 TypeScript、Three.js |
| 代码块 | Expressive Code |
| 部署 | Cloudflare Pages、Pages Functions、D1 |
| 包管理 | npm、`package-lock.json` |

## 本地开发

### 环境要求

- Node.js 22 或更高版本
- npm（随 Node.js 安装）
- Chrome 或 Chromium（仅在首屏 3D 模型变化、需要重新生成海报时使用）

确认版本：

```bash
node --version
npm --version
```

### 安装与启动

```bash
git clone https://github.com/yaleyoou/biumbiu-site.git
cd biumbiu-site
npm ci
npm run dev
```

开发服务器默认运行在 <http://localhost:4321/>。局域网设备需要访问时：

```bash
npm run dev -- --host 0.0.0.0
```

`npm run dev` 会先执行 `model:prepare`。当 GLB 模型或海报渲染脚本发生变化时，该命令会更新首屏静态海报；没有变化时会直接复用现有文件。

### 生产构建

```bash
npm run build
npm run preview
```

`npm run build` 依次准备模型资源、运行 `astro check`，并将生产文件输出到 `dist/`。`npm run preview` 只预览静态产物，不会模拟 Cloudflare Pages Function 或 D1 绑定。

## 创建内容

### 先理解 slug

`slug` 是内容在文件系统和 URL 中使用的稳定标识，不是固定命令，也不要求与中文标题完全一致。

例如，准备发布一篇标题为「在 SGLang 中部署大模型」的笔记，可以选择：

```text
标题：在 SGLang 中部署大模型
slug：sglang-deployment
文件：src/content/notes/sglang-deployment.md
URL：https://biumbiu.com/notes/sglang-deployment/
```

slug 只能包含小写英文字母、数字和连字符，例如 `sglang-deployment`、`a100-benchmark-2026`。内容公开后应尽量保持 slug 不变，否则原 URL 会失效。

### 新建笔记

```bash
npm run new:note -- sglang-deployment
```

这里的 `sglang-deployment` 是示例 slug，可以替换成当前笔记的实际标识。命令中的 `--` 表示把后面的参数传给内容脚手架，而不是传给 npm。

命令会创建：

```text
src/content/notes/sglang-deployment.md
```

新文件默认包含 `draft: true`，因此本地开发环境可见，但不会进入生产页面、RSS、搜索索引或 sitemap。

脚手架还会自动填写当天日期、示例标题和占位封面。它们只用于保证草稿可以立即预览，发布前需要替换为当前内容的真实信息。

笔记 frontmatter 示例：

```yaml
---
title: "在 SGLang 中部署大模型"
description: "记录部署环境、关键参数、验证方法和已知边界。"
date: 2026-08-14
image: "../../assets/images/sglang-deployment-cover.webp"
imageAlt: "SGLang 服务部署架构"
tags: ["SGLang", "LLM 部署"]
featured: false
order: 100
draft: true
category: "Field note"
---
```

### 新建项目

```bash
npm run new:project -- inference-stack
```

该命令会创建 `src/content/projects/inference-stack.md`，对应生产 URL `/projects/inference-stack/`。

项目 frontmatter 示例：

```yaml
---
title: "Inference Stack"
description: "面向生产环境的大模型推理与性能评测工具链。"
date: 2026-08-14
image: "../../assets/images/inference-stack-cover.webp"
imageAlt: "推理系统组件与数据流"
tags: ["Inference", "SGLang"]
featured: true
order: 20
draft: true
period: "2026.06 - 至今"
role: "Infrastructure Engineer"
status: "Ongoing"
stack: "SGLang / CUDA / Prometheus"
containImage: false
darkImage: false
---
```

### 完整发布流程

1. 为内容选择简短、稳定的 slug，并运行对应的脚手架命令。
2. 将封面放入 `src/assets/images/`，再修改新文件中的 `image` 和 `imageAlt`。
3. 填写 frontmatter，正文从 `##` 二级标题开始。页面的一级标题由 `title` 自动生成。
4. 运行 `npm run dev`，检查草稿内容、图片、目录、标签和移动端布局。
5. 发布前将 `draft` 改为 `false`，或删除该字段。
6. 运行 `npm run build`，确认内容 schema、资源引用和所有静态路由均能通过构建。

### Frontmatter 字段

字段定义以 [`src/content.config.ts`](src/content.config.ts) 为准。

所有内容共用以下字段：

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `title` | 是 | 无 | 详情页标题与 SEO 标题 |
| `cardTitle` | 否 | `title` | 列表卡片使用的短标题 |
| `description` | 是 | 无 | 列表摘要与 SEO 描述 |
| `date` | 是 | 无 | 发布日期，推荐 `YYYY-MM-DD` |
| `updated` | 否 | 无 | 最近一次实质更新日期 |
| `image` | 是 | 无 | `src/assets/images/` 中的封面相对路径 |
| `imageAlt` | 是 | 无 | 准确描述封面内容的替代文本 |
| `tags` | 否 | `[]` | 标签数组，用于标签页和相关推荐 |
| `featured` | 否 | `false` | 是否作为重点内容展示 |
| `order` | 否 | `100` | 归档排序优先级，数值越小越靠前 |
| `draft` | 否 | `false` | 是否仅在本地开发环境显示 |

笔记字段：

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `category` | 否 | `Field note` | 详情页显示的内容类别 |

项目字段：

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `period` | 是 | 无 | 项目时间范围 |
| `role` | 是 | 无 | 在项目中的职责 |
| `status` | 否 | `Completed` | `Ongoing`、`Completed` 或 `Maintained` |
| `stack` | 否 | 无 | 技术栈摘要 |
| `containImage` | 否 | `false` | 完整展示 Logo、海报或流程图，避免裁切 |
| `darkImage` | 否 | `false` | 为透明或浅色素材提供深色背景 |

## Markdown 与图片

正文支持标准 Markdown、表格和围栏代码块。写作时遵循以下约定：

- 不在正文重复写 `#` 一级标题。
- 标题层级从 `##` 开始，并保持连续。
- 图片必须提供能表达信息的 alt 文本。
- 代码块标注语言，例如 `bash`、`typescript` 或 `yaml`。
- 不在 Markdown 中保存 Token、私钥、数据库凭据或内部地址。

内容封面和正文插图统一放在 `src/assets/images/`。因为 Markdown 文件位于 `src/content/notes/` 或 `src/content/projects/`，两类内容都使用相同的相对路径：

```yaml
image: "../../assets/images/example-cover.webp"
```

```markdown
![系统流程图](../../assets/images/system-flow.webp)
```

构建时：

- 组件封面生成多宽度 AVIF/WebP。
- Markdown 正文图片保持源格式并生成响应式 `srcset`。
- 所有图片写入真实 `width` 和 `height`，避免加载时布局偏移。
- 路径错误或图片缺失会直接导致内容检查失败。

照片、截图和复杂插图优先使用 WebP，建议原图宽度不超过 1600px。简单图标可使用 SVG。文件名统一使用小写英文、数字和连字符。

## 静态资源与 3D 模型

`src/assets/` 和 `public/` 的处理方式不同：

| 位置 | 构建行为 | 适用内容 | 引用方式 |
| --- | --- | --- | --- |
| `src/assets/images/` | 由 Astro 分析和优化 | 封面、正文插图、头像 | import 或 Markdown 相对路径 |
| `public/images/` | 原样复制到站点根目录 | CSS 引用资源、模型静态海报 | `/images/...` |
| `public/models/` | 原样复制 | GLB 模型 | `/models/...` |

首屏模型固定为 `public/models/myself.glb`。更新模型后运行：

```bash
npm run model:poster
```

该命令会强制生成 `public/images/myself-poster.webp`。`npm run dev` 和 `npm run build` 也会自动执行增量检查；模型与渲染脚本的哈希没有变化时，不会重复渲染。

网站运行时使用的 Draco WASM 解码器直接从 `three` 依赖导入，由 Vite 输出为带内容哈希的 `/_astro/` 资源，因此仓库不需要维护 `public/draco/`。海报生成器同样从已安装的 `three` 依赖读取解码器，但只通过临时本地服务供无头浏览器使用，不会复制到 `public/`。

生成器需要 Chrome 或 Chromium。未安装在默认位置时，可在 macOS 或 Linux 上指定可执行文件：

```bash
MODEL_POSTER_BROWSER=/path/to/chrome npm run model:poster
```

提交模型更新时，应同时提交 GLB、静态海报和 `scripts/model-poster-manifest.json`。

## 搜索、RSS 与访问量

### 搜索

[`src/pages/search-index.json.ts`](src/pages/search-index.json.ts) 在构建时从已发布的笔记和项目生成 `/search-index.json`。浏览器端搜索支持标题、摘要、标签和正文匹配，不需要额外的索引服务或构建命令。

### RSS

[`src/pages/rss.xml.ts`](src/pages/rss.xml.ts) 将已发布的笔记和项目合并到 `/rss.xml`。Markdown 正文会转换为经过清理的结构化 HTML；链接会变成绝对地址，正文图片则以可读的 alt 文本表示，避免 feed 阅读器请求无效的源码相对路径。

### 访问量与 D1

访问量接口位于 [`functions/api/views.ts`](functions/api/views.ts)，数据库结构位于 [`migrations/0001_views.sql`](migrations/0001_views.sql)。接口只接受同源 POST 请求，并同时更新当前页面与全站计数。

首次创建生产数据库：

```bash
npx wrangler login
npx wrangler d1 create biumbiu-views
npx wrangler d1 execute biumbiu-views --remote --file=migrations/0001_views.sql
```

随后在 Cloudflare Pages 项目的 `Settings -> Bindings` 中添加 D1 绑定：

| 配置 | 值 |
| --- | --- |
| Variable name | `DB` |
| D1 database | `biumbiu-views` |

Preview 环境建议绑定独立数据库，避免预览访问写入正式统计。`npm run dev` 只启动 Astro，不提供 Pages Function 和 D1；访问量组件在本地无法请求接口时会自动隐藏。

## 项目结构

```text
biumbiu-site/
├── functions/api/views.ts        # Cloudflare Pages 访问量接口
├── migrations/0001_views.sql     # D1 数据库迁移
├── public/
│   ├── _headers                  # Cloudflare Pages 缓存响应头
│   ├── images/                   # 原样发布的静态图片
│   └── models/                   # 3D 模型
├── scripts/
│   ├── generate-model-poster.mjs # 按需生成模型静态海报
│   └── new-content.mjs           # 笔记与项目脚手架
├── src/
│   ├── assets/images/            # 由 astro:assets 优化的图片
│   ├── client/                   # 浏览器端交互
│   ├── components/               # Astro 组件
│   ├── content/
│   │   ├── notes/                # 技术笔记
│   │   └── projects/             # 项目档案
│   ├── layouts/                  # 页面骨架与 SEO
│   ├── lib/                      # 内容查询与通用工具
│   ├── pages/                    # 路由、RSS 与静态 JSON
│   ├── styles/                   # 全局样式
│   └── content.config.ts         # Content Collections schema
├── astro.config.mjs              # Astro、sitemap 与图片配置
├── package.json                  # npm 命令与依赖
└── tsconfig.json
```

`scripts/` 运行在 Node.js 中，不会打包到网页；`src/client/` 运行在浏览器中，可使用 DOM 和 `window`。不要在两者之间混用运行时 API。

以下目录均为生成产物，已加入 `.gitignore`，不应提交：

| 目录 | 生成方式 |
| --- | --- |
| `node_modules/` | `npm ci` |
| `dist/` | `npm run build` |
| `.astro/` | Astro 开发、检查或构建 |
| `.wrangler/` | Wrangler 构建或本地 Cloudflare 状态 |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 严格按照锁文件安装依赖 |
| `npm run dev` | 准备模型资源并启动开发服务器 |
| `npm run build` | 运行内容检查并生成生产站点 |
| `npm run preview` | 本地预览 `dist/` 静态产物 |
| `npm run check:functions` | 编译 Cloudflare Pages Functions |
| `npm run model:prepare` | 检查模型和渲染脚本，并按需更新模型海报 |
| `npm run model:poster` | 强制重新生成模型海报 |
| `npm run new:note -- <slug>` | 创建笔记草稿 |
| `npm run new:project -- <slug>` | 创建项目草稿 |

## 部署到 Cloudflare Pages

Pages 构建配置：

| 配置 | 值 |
| --- | --- |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

生产域名由 [`astro.config.mjs`](astro.config.mjs) 中的 `site` 指定。缓存策略位于 [`public/_headers`](public/_headers)：带内容哈希的 Astro 资源（包括 Draco 解码器）长期缓存，GLB 模型和静态海报使用有限缓存，HTML 使用 Cloudflare Pages 默认的 ETag 协商策略。

发布前执行：

```bash
npm run build
npm run check:functions
git diff --check
```

构建通过后，还应检查首页 3D 场景与海报回退、站内搜索、RSS、项目和笔记详情、响应式图片，以及移动端导航和排版。

## 常见问题

### `Slug must contain only lowercase letters, numbers, and hyphens`

slug 中包含了大写字母、空格、下划线或中文。将其改为类似 `sglang-deployment` 的小写连字符格式。

### `Content already exists`

目标集合中已经存在同名 Markdown。选择新的 slug，或直接编辑错误信息中列出的现有文件。

### 构建时报内容图片不存在

确认图片位于 `src/assets/images/`，并从内容文件使用 `../../assets/images/<filename>` 引用。路径和文件名区分大小写。

### 模型海报生成器找不到浏览器

安装 Chrome/Chromium，或通过 `MODEL_POSTER_BROWSER` 指定可执行文件。模型没有变化时，普通构建会复用现有海报，不需要启动浏览器。

### 本地页面没有访问量

这是预期行为。Astro 开发服务器不运行 Pages Function，也没有 D1 绑定；请在 Cloudflare Preview 或生产环境验证计数。

## 维护约定

- 内容元数据只在 Markdown frontmatter 中维护一次，页面和索引统一从集合读取。
- 新增或删除内容图片后，检查是否仍有其他页面引用同一文件。
- 新增依赖使用 `npm install <package>`，日常安装和 CI 使用 `npm ci`。
- 不提交生成目录、依赖目录、密钥、`.env` 或本机配置。
- 修改内容 schema、脚本、部署配置或资源流程时，同步更新本 README。

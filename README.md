# BiumBiu

[biumbiu.com](https://biumbiu.com) 是一个使用 Astro 构建的静态个人网站，用于发布项目档案、技术笔记和阶段性近况。

内容由 Markdown 和 Astro Content Collections 管理，前端交互使用 TypeScript，部署目标为 Cloudflare Pages。访问量由 Pages Functions 和 D1 提供。

## 技术栈

- Astro 5
- TypeScript
- Astro Content Collections
- Three.js
- Cloudflare Pages、Pages Functions 与 D1

## 快速开始

要求 Node.js 22 或更高版本。

```bash
npm ci
npm run dev
```

默认开发地址为 `http://localhost:4321/`。需要在局域网设备上测试时：

```bash
npm run dev -- --host 0.0.0.0
```

生产构建和预览：

```bash
npm run build
npm run preview
```

## 项目结构

```text
biumbiu-site/
├── functions/
│   └── api/views.ts              # Cloudflare Pages 访问量接口
├── migrations/
│   └── 0001_views.sql            # D1 数据库迁移
├── public/
│   ├── images/                   # 直接发布的图片
│   ├── models/                   # 直接发布的 3D 模型
│   ├── favicon-256.png           # 浏览器标签页图标
│   ├── favicon.png               # Favicon 高分辨率原图
│   └── robots.txt
├── scripts/
│   └── new-content.mjs           # 由 npm 执行的内容脚手架
├── src/
│   ├── client/                   # 浏览器端交互代码
│   ├── components/               # Astro UI 组件
│   ├── content/
│   │   ├── notes/                # 笔记 Markdown
│   │   └── projects/             # 项目 Markdown
│   ├── layouts/                  # 页面骨架与 SEO
│   ├── lib/                      # 内容、图片和 Markdown 工具
│   ├── pages/                    # 文件路由与静态 API
│   ├── styles/
│   │   └── global.css            # 全局视觉系统
│   └── content.config.ts         # Content Collections Schema
├── astro.config.mjs
├── package.json
├── package-lock.json
└── tsconfig.json
```

### `scripts/` 与 `src/client/`

两个目录的运行环境不同：

- `scripts/` 是仓库工具，由 Node.js 或 npm 在终端执行，不会打包进网页。
- `src/client/` 是浏览器代码，由 Astro/Vite 打包，用于搜索、3D 模型和首页视觉交互。

不要把浏览器逻辑放进根目录 `scripts/`，也不要让仓库工具依赖 DOM 或 `window`。

### `public/` 与 `src/`

- `public/` 中的文件保持原样发布，使用 `/images/...`、`/models/...` 这样的根路径引用。
- `src/` 中的文件由 Astro 和 Vite 处理，不可直接当作线上静态路径使用。
- 公开图片放在 `public/images/`，GLB 等模型放在 `public/models/`。
- 未被网站引用、也没有对应生成流程的设计源文件不保留在仓库中。

## 生成目录

以下目录不属于源码，均已加入 `.gitignore`：

| 目录 | 来源 | 是否需要提交 |
| --- | --- | --- |
| `node_modules/` | `npm ci` 根据锁文件安装的依赖 | 否 |
| `dist/` | `npm run build` 生成的生产文件 | 否 |
| `.astro/` | Astro 的内容索引、类型与开发缓存 | 否 |
| `.wrangler/` | Wrangler 构建结果或本地 Cloudflare 状态 | 否 |
| `.claude/` | 本机开发工具配置 | 否 |

`node_modules/` 对本地开发和构建有用，但不是项目源码。它可以删除，之后运行 `npm ci` 即可按 `package-lock.json` 完整恢复。不要手动修改其中的文件，也不要提交到 Git。

`.wrangler/` 可能包含本地 D1 状态。使用本地数据库时不要直接删除；当前只运行函数编译时，其中内容可以重新生成。

## 内容工作流

新建笔记：

```bash
npm run new:note -- sglang-deployment
```

新建项目：

```bash
npm run new:project -- inference-stack
```

脚手架会在对应集合中创建 Markdown，并默认设置 `draft: true`。开发环境显示草稿，生产构建会排除草稿。发布前将其改为 `false` 或删除该字段。

文件名就是 URL slug：

```text
src/content/notes/example.md
-> /notes/example/

src/content/projects/example.md
-> /projects/example/
```

slug 只使用小写字母、数字和连字符。公开后尽量不要修改，以免旧链接失效。

### Frontmatter

字段定义以 [src/content.config.ts](src/content.config.ts) 为准。

通用必填字段：

| 字段 | 作用 |
| --- | --- |
| `title` | 详情页与 SEO 标题 |
| `description` | 列表摘要与 SEO 描述 |
| `date` | 发布日期 |
| `image` | `public/` 中的封面路径 |
| `imageAlt` | 封面替代文本 |

常用可选字段包括 `cardTitle`、`updated`、`tags`、`featured`、`order` 和 `draft`。

项目还需要 `period` 和 `role`，并可配置：

- `status`: `Ongoing`、`Completed` 或 `Maintained`
- `stack`: 技术栈摘要
- `containImage`: 完整显示 Logo、海报或流程图
- `darkImage`: 为透明素材使用深色背景

正文从二级标题 `##` 开始，主标题由页面自动生成。

## 静态资源

Frontmatter 和 Markdown 均使用站点根路径：

```yaml
image: "/images/example-cover.webp"
imageAlt: "准确描述图片展示的内容"
```

```markdown
![系统流程图](/images/system-flow.webp)
```

资源约定：

- 照片和复杂截图优先使用 WebP。
- 简单矢量标识可以使用 SVG。
- 3D 模型使用 GLB，并提供静态海报作为加载失败回退。
- 文件名使用小写英文、数字和连字符。
- 删除内容后，应检查其图片是否仍被其他页面引用。

导入 JPG、PNG 或已有 WebP 时，使用图片优化命令：

```bash
npm run image:add -- ~/Desktop/article-cover.png
```

命令会修正照片方向，将最长边限制为 1600px，以质量 82 输出到 `public/images/`，并打印可直接使用的 Markdown 和 Frontmatter 路径。原始文件不会被修改或删除，已有的同名 WebP 也不会被覆盖。

文件名无法转换为小写英文 slug，或需要自定义文件名时，使用 `--name`：

```bash
npm run image:add -- ~/Desktop/文章封面.png --name article-cover
```

检查图片引用和优化状态：

```bash
npm run image:check
```

缺失引用或损坏图片会让检查失败；超过 500 KB，以及尺寸或体积较大的 JPG/PNG 只会产生优化提醒。`npm run build` 会自动先执行这项检查。

## 搜索

构建时，[src/pages/search-index.json.ts](src/pages/search-index.json.ts) 从已发布的项目和笔记生成 `/search-index.json`。

浏览器端搜索位于 [src/client/site-search.ts](src/client/site-search.ts)，支持标题、摘要、标签和正文匹配。它不依赖外部搜索服务，也不需要额外的构建后索引命令。

## 访问量与 D1

访问量接口位于 [functions/api/views.ts](functions/api/views.ts)，表结构位于 [migrations/0001_views.sql](migrations/0001_views.sql)。

首次创建数据库：

```bash
npx wrangler login
npx wrangler d1 create biumbiu-views
npx wrangler d1 execute biumbiu-views --remote --file=migrations/0001_views.sql
```

在 Cloudflare Pages 项目的 `Settings -> Bindings` 中添加 D1 绑定：

| 配置 | 值 |
| --- | --- |
| Variable name | `DB` |
| D1 database | `biumbiu-views` |

保存后重新部署。Preview 环境建议使用单独数据库，避免预览访问写入正式统计。

验证 Pages Function 能否编译：

```bash
npm run check:functions
```

`npm run dev` 只启动 Astro，不提供 Pages Function 和 D1 绑定，因此本地访问量组件会自动隐藏。端到端计数需要在 Cloudflare Preview 或正式环境验证。

## 构建与部署

Cloudflare Pages 配置：

| 配置 | 值 |
| --- | --- |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

生产域名配置在 [astro.config.mjs](astro.config.mjs)。

发布前至少执行：

```bash
npm run build
npm run check:functions
git diff --check
```

然后检查首页、搜索、项目与笔记归档、详情页、图片、3D 模型以及移动端布局。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 按锁文件干净安装依赖 |
| `npm run dev` | 启动 Astro 开发服务器 |
| `npm run build` | 运行 Astro 检查并生成静态站点 |
| `npm run preview` | 预览 `dist/` |
| `npm run check:functions` | 编译 Cloudflare Pages Functions |
| `npm run image:add -- <path>` | 转换并导入 WebP 图片 |
| `npm run image:check` | 检查图片引用、损坏和优化建议 |
| `npm run new:note -- <slug>` | 新建笔记草稿 |
| `npm run new:project -- <slug>` | 新建项目草稿 |

## 维护原则

- 内容元数据只在 Markdown Frontmatter 中维护一次。
- 页面通过集合读取内容，不手工维护重复列表。
- 不提交生成目录、依赖目录、密钥或本机配置。
- 不在 Markdown 中保存 Token、私钥、数据库凭据或内部地址。
- 新增依赖使用 `npm install`，正常安装和 CI 使用 `npm ci`。
- 修改结构后同步更新本 README，并运行完整构建。

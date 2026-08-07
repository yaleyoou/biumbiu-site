# BiumBiu 网站使用手册

## 说明
这是我的一个个人博客网站：https://www.biumbiu.com

[BiumBiu](https://www.biumbiu.com) 是一个使用 [Astro](https://astro.build/) 构建的静态个人网站，用于展示个人近况、项目经历和技术笔记。

项目和笔记全部使用 Markdown 编写，由 Astro Content Collections 完成字段校验、列表读取和详情页生成。日常新增内容不需要编写 `.astro` 页面，也不需要手动修改首页、项目列表或笔记列表。

## 目录

- [核心工作方式](#核心工作方式)
- [环境要求](#环境要求)
- [首次安装与本地运行](#首次安装与本地运行)
- [项目目录结构](#项目目录结构)
- [新增一篇笔记](#新增一篇笔记)
- [新增一个项目](#新增一个项目)
- [Frontmatter 字段说明](#frontmatter-字段说明)
- [Markdown 正文写法](#markdown-正文写法)
- [图片使用规范](#图片使用规范)
- [内容如何自动出现在网站中](#内容如何自动出现在网站中)
- [草稿与发布机制](#草稿与发布机制)
- [修改、改名和删除内容](#修改改名和删除内容)
- [构建与发布](#构建与发布)
- [访问量与 Cloudflare D1](#访问量与-cloudflare-d1)
- [修改网站公共信息](#修改网站公共信息)
- [发布前检查清单](#发布前检查清单)
- [常见问题](#常见问题)

## 核心工作方式

日常写作只需要完成以下流程：

```text
运行内容生成命令
  -> 编辑生成的 Markdown
  -> 将图片放入 public/images
  -> npm run dev 本地预览
  -> draft 改为 false
  -> npm run build
  -> 提交并推送
```

内容与页面的关系如下：

```text
src/content/projects/*.md
  -> 首页精选项目
  -> /projects/ 项目归档
  -> /projects/<slug>/ 项目详情

src/content/notes/*.md
  -> 首页最新笔记
  -> /notes/ 笔记归档
  -> /notes/<slug>/ 笔记详情
```

标题、摘要、日期、标签和封面只在 Markdown 文件顶部填写一次。所有页面使用同一份数据，不需要重复维护。

## 环境要求

建议使用：

- Node.js 22 LTS 或更新的 LTS 版本；
- npm；
- Git；
- 一个现代浏览器。

检查环境：

```bash
node --version
npm --version
git --version
```

如果终端提示 `node: command not found` 或 `npm: command not found`，需要先安装 Node.js。

## 首次安装与本地运行

进入项目目录：

```bash
cd /Users/xingye/Desktop/study/mycode/biumbiu-site
```

安装依赖：

```bash
npm install
```

启动本地开发服务器：

```bash
npm run dev
```

终端会输出本地地址，默认通常是：

```text
http://localhost:4321/
```

如果默认端口已被占用，Astro 会选择其他端口，请以终端实际输出为准。

停止开发服务器时，在启动服务器的终端按：

```text
Control + C
```

### 让同一局域网的其他设备访问

需要在手机上测试时，可以使用：

```bash
npm run dev -- --host 0.0.0.0
```

然后访问终端显示的 Network 地址。电脑和手机需要位于同一网络，并确保系统防火墙允许访问。

## 项目目录结构

```text
biumbiu-site/
├── functions/
│   └── api/views.ts                    # Cloudflare Pages 访问量接口
├── migrations/
│   └── 0001_views.sql                  # D1 数据表迁移
├── public/
│   ├── favicon.svg
│   ├── robots.txt                      # 搜索引擎抓取与 sitemap 入口
│   └── images/                         # 网站图片
├── scripts/
│   └── new-content.mjs                 # 新建内容脚手架
├── src/
│   ├── components/                     # Header、Footer、文章头部等组件
│   ├── content/
│   │   ├── notes/                      # 笔记 Markdown
│   │   └── projects/                   # 项目 Markdown
│   ├── layouts/
│   │   └── SiteLayout.astro            # HTML、SEO 和公共页面结构
│   ├── lib/
│   │   └── content.ts                  # 排序、日期和 URL 工具
│   ├── pages/
│   │   ├── index.astro                 # 首页
│   │   ├── rss.xml.ts                  # 自动生成笔记 RSS
│   │   ├── notes/
│   │   │   ├── index.astro             # 笔记归档
│   │   │   └── [...id].astro           # 笔记动态详情页
│   │   └── projects/
│   │       ├── index.astro             # 项目归档
│   │       └── [...id].astro           # 项目动态详情页
│   ├── styles/
│   │   └── v2.css                      # 当前网站样式
│   └── content.config.ts               # 内容集合与字段定义
├── astro.config.mjs                    # Astro 与正式域名配置
├── package.json                        # 项目命令和依赖
└── README.md                           # 本使用手册
```

普通内容更新主要只会修改：

```text
src/content/
public/images/
```

## 新增一篇笔记

### 1. 选择 URL slug

slug 是文件名，也是最终 URL 的一部分。它只能包含：

- 小写英文字母；
- 数字；
- 连字符 `-`。

推荐：

```text
sglang-deployment
vllm-serving-notes
cloudflare-dns-debugging
```

不要使用：

```text
SGLang Deployment     # 包含大写字母和空格
我的笔记               # 包含中文
sglang_deployment     # 包含下划线
```

slug 一旦公开，尽量不要修改，否则原 URL 会失效。

### 2. 运行生成命令

```bash
npm run new:note -- sglang-deployment
```

命令会生成：

```text
src/content/notes/sglang-deployment.md
```

对应网页地址为：

```text
/notes/sglang-deployment/
```

### 3. 编辑生成的 Markdown

笔记模板如下：

```yaml
---
title: "SGLang 部署与性能测试记录"
cardTitle: "SGLang 部署记录"
description: "记录模型部署、基准测试、问题定位和参数调整过程。"
date: 2026-07-31
updated: 2026-08-02
image: "/images/sglang-deployment.webp"
imageAlt: "SGLang 推理服务的终端与监控界面"
tags: ["SGLang", "LLM Inference", "Benchmark"]
featured: true
order: 100
draft: true
category: "Field note"
---

这里开始写正文。

## 背景

说明为什么要做这件事。

## 实现过程

记录关键步骤、配置和判断。

## 结果与下一步

写清验证结果、限制和后续计划。
```

`cardTitle` 和 `updated` 都是可选字段。不需要时可以删除。

### 4. 本地预览

```bash
npm run dev
```

开发环境会显示草稿，可以直接访问：

```text
http://localhost:4321/notes/sglang-deployment/
```

### 5. 发布

确认内容完成后，把：

```yaml
draft: true
```

改成：

```yaml
draft: false
```

也可以删除 `draft` 字段，因为默认值是 `false`。

最后运行：

```bash
npm run build
```

## 新增一个项目

### 1. 运行生成命令

```bash
npm run new:project -- kimi-k3-inference
```

命令会生成：

```text
src/content/projects/kimi-k3-inference.md
```

对应网页地址为：

```text
/projects/kimi-k3-inference/
```

### 2. 填写项目 Frontmatter

项目模板如下：

```yaml
---
title: "Kimi K3 在 NVIDIA B300 上的部署与推理优化"
cardTitle: "Kimi K3 Inference Stack"
description: "将 Kimi K3 部署到 NVIDIA B300，并围绕吞吐、时延和显存利用率持续优化。"
date: 2026-07-31
updated: 2026-08-05
period: "2026 - Now"
role: "Deployment & Optimization"
status: "Ongoing"
stack: "B300 / SGLang"
image: "/images/kimi-k3.webp"
imageAlt: "Kimi K3 推理服务的部署与监控界面"
tags: ["Kimi K3", "NVIDIA B300", "SGLang", "Inference"]
featured: true
order: 1
draft: true
containImage: false
darkImage: false
---

先用一段话概括项目目标、当前状态和核心结果。

## 项目背景

说明问题、场景和约束。

## 系统设计

介绍架构、关键组件和设计选择。

## 当前进展

- 已完成的工作；
- 正在进行的工作；
- 下一阶段计划。

## 结果与复盘

记录数据、结论、边界和后续方向。
```

### 3. 推荐的项目正文结构

项目文章不必全部使用相同结构，但建议至少回答：

1. 为什么做这个项目；
2. 我的职责与贡献边界是什么；
3. 系统或流程如何运行；
4. 遇到了什么问题；
5. 做出了哪些关键选择；
6. 当前结果如何验证；
7. 项目仍有哪些限制；
8. 下一步准备做什么。

仍在进行中的项目不要编造最终结果。可以明确写出当前进展、待验证假设和下一阶段计划。

## Frontmatter 字段说明

Frontmatter 是 Markdown 文件最顶部两组 `---` 之间的 YAML 数据。

字段必须符合 [src/content.config.ts](src/content.config.ts) 中的定义。字段名拼错、类型错误或缺少必填字段时，`npm run build` 会失败并指出对应文件。

### 项目与笔记通用字段

| 字段 | 类型 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `title` | 字符串 | 是 | 无 | 详情页标题、浏览器标题和 SEO 标题 |
| `cardTitle` | 字符串 | 否 | 使用 `title` | 首页和归档中的短标题，适合缩短长标题 |
| `description` | 字符串 | 是 | 无 | 首页卡片、归档摘要和 SEO 描述 |
| `date` | 日期 | 是 | 无 | 发布日期与排序依据，推荐 `YYYY-MM-DD` |
| `updated` | 日期 | 否 | 无 | 最近更新日期，会显示在详情页头部 |
| `image` | 字符串 | 是 | 无 | 封面路径，例如 `/images/example.webp` |
| `imageAlt` | 字符串 | 是 | 无 | 封面的替代文本，用于无障碍和图片加载失败场景 |
| `tags` | 字符串数组 | 否 | `[]` | 技术或主题标签 |
| `featured` | 布尔值 | 否 | `false` | 是否进入首页精选内容 |
| `order` | 整数 | 否 | `100` | 项目排序权重，数字越小越靠前 |
| `draft` | 布尔值 | 否 | `false` | 是否为仅本地可见的草稿 |

YAML 类型必须正确：

```yaml
featured: true       # 正确：布尔值
order: 2             # 正确：整数
tags: ["Astro"]     # 正确：数组
```

不要写成：

```yaml
featured: "true"     # 错误：这是字符串
order: "2"           # 错误：这是字符串
tags: "Astro"        # 错误：这不是数组
```

### 项目专用字段

| 字段 | 类型 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `period` | 字符串 | 是 | 无 | 项目时间，例如 `2026.01 - 04` 或 `2026 - Now` |
| `role` | 字符串 | 是 | 无 | 个人角色或主要职责 |
| `status` | 枚举 | 否 | `Completed` | 项目状态 |
| `stack` | 字符串 | 否 | 无 | 详情页显示的核心技术栈摘要 |
| `containImage` | 布尔值 | 否 | `false` | 使用完整包含模式显示封面，适合 Logo、海报和流程图 |
| `darkImage` | 布尔值 | 否 | `false` | 为封面使用深色背景 |

`status` 只能使用以下三个值之一，大小写必须一致：

```yaml
status: "Ongoing"
status: "Completed"
status: "Maintained"
```

封面是照片时通常使用：

```yaml
containImage: false
darkImage: false
```

封面是带透明边距的 Logo 时可以使用：

```yaml
containImage: true
darkImage: true
```

### 笔记专用字段

| 字段 | 类型 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `category` | 字符串 | 否 | `Field note` | 笔记类型，例如 `Build log`、`Field note` 或 `Research note` |

## Markdown 正文写法

Frontmatter 下方使用普通 Markdown，不需要 Astro 语法。

### 标题

详情页主标题由 frontmatter 的 `title` 自动生成，正文从二级标题开始：

```markdown
## 二级标题

### 三级标题
```

不要在正文中再写一个 `# 一级标题`，否则页面会出现重复主标题。

### 段落、强调与行内代码

```markdown
这是一个普通段落。

这里是 **重点内容**，这里是 `inline code`。
```

### 无序列表

```markdown
- 第一项；
- 第二项；
- 第三项。
```

### 有序列表

```markdown
1. 准备环境；
2. 运行 baseline；
3. 收集数据；
4. 分析结果。
```

### 引用

```markdown
> 端口能够连接，不代表上层协议一定配置正确。
```

### 代码块

在三个反引号后注明语言，可以获得更准确的代码显示：

````markdown
```bash
npm run build
```

```python
def hello():
    print("hello")
```
````

### 表格

```markdown
| 指标 | 含义 | 结果 |
| --- | --- | ---: |
| TTFT | 首 Token 时延 | 120 ms |
| TPS | Token 吞吐 | 85 tok/s |
```

长表格在桌面端可以横向滚动，在移动端会自动压缩并换行。表格内容仍应尽量简洁，详细解释放在表格后的段落中。

### 链接

站内链接：

```markdown
[查看 Kimi K3 项目](/projects/kimi-k3/)
```

外部链接：

```markdown
[Astro 官方文档](https://docs.astro.build/)
```

发布前应实际点击重要链接，`npm run build` 不会自动发现所有普通 Markdown 链接对应的目标是否存在。

## 图片使用规范

### 图片存放位置

所有公开图片统一放在：

```text
public/images/
```

可以按项目建立子目录：

```text
public/images/kimi-k3/
public/images/ascend-competition/
public/images/survey-agent/
```

### 封面图片

Frontmatter 中使用从网站根目录开始的路径：

```yaml
image: "/images/kimi-k3/overview.webp"
imageAlt: "Kimi K3 推理服务的监控界面"
```

不要写本机绝对路径：

```yaml
image: "/Users/xingye/Desktop/example.png"
```

本机路径部署后无法访问。

### 正文图片

```markdown
![SGLang 推理服务架构](/images/kimi-k3/architecture.png)
```

方括号中的替代文本应说明图片展示的内容，不要只写“图片”“截图”或文件名。

### 推荐格式

- 照片和复杂截图优先使用 WebP；
- 需要透明背景的界面图可使用 PNG；
- Logo 或简单矢量图可使用 SVG；
- 避免直接上传体积很大的原始截图；
- 封面建议使用稳定的宽高比，常用 `16:9` 或 `4:3`；
- 文件名使用小写英文、数字和连字符。

示例：

```text
kimi-k3-overview.webp
survey-agent-workflow.png
vllm-ascend-logo.svg
```

## 内容如何自动出现在网站中

### 项目

生产环境会先排除 `draft: true` 的项目，然后：

- `/projects/` 展示全部已发布项目；
- 首页只展示 `featured: true` 的项目；
- 项目先按 `order` 从小到大排序；
- `order` 相同时，日期较新的项目靠前。

例如：

```yaml
featured: true
order: 1
```

表示该项目进入首页，并优先显示。

### 笔记

生产环境会先排除 `draft: true` 的笔记，然后：

- `/notes/` 展示全部已发布笔记；
- 笔记按 `date` 从新到旧排序；
- 首页只从 `featured: true` 的笔记中取最新 4 篇；
- 笔记的 `order` 当前不参与归档排序。

### URL 生成规则

Markdown 文件名会成为 URL slug：

```text
src/content/projects/kimi-k3.md
-> /projects/kimi-k3/

src/content/notes/website-launch.md
-> /notes/website-launch/
```

不需要创建同名 `.astro` 文件。

## 草稿与发布机制

新建内容命令默认生成：

```yaml
draft: true
```

草稿行为：

| 环境 | `draft: true` 是否可见 |
| --- | --- |
| `npm run dev` | 可见，便于本地预览 |
| `npm run build` | 不会生成对应生产页面 |
| Cloudflare Pages | 不会发布 |

因此可以在本地完整检查草稿，再把 `draft` 改为 `false`。

注意：草稿机制只控制是否进入生产构建，它不是权限系统。不要在草稿中保存密码、API Key、Token、真实服务器凭据或其他敏感信息，因为文件仍然存在于本地和 Git 历史中。

## 修改、改名和删除内容

### 修改正文或元数据

直接编辑对应 Markdown。例如：

```text
src/content/projects/kimi-k3.md
```

保存后，开发服务器会自动刷新。

### 修改封面

1. 将新图片放入 `public/images/`；
2. 修改 Markdown 中的 `image`；
3. 同步更新 `imageAlt`；
4. 本地检查首页、归档和详情页三个位置。

### 修改 slug

slug 来自文件名。将：

```text
kimi-k3.md
```

改成：

```text
kimi-k3-inference.md
```

URL 会从：

```text
/projects/kimi-k3/
```

变成：

```text
/projects/kimi-k3-inference/
```

这会使旧链接失效。公开内容原则上不要随意改名；确实需要修改时，应同时更新所有站内链接，并在部署平台配置重定向。

### 删除内容

删除对应 Markdown 即可。首页和归档入口会自动消失，不需要再修改列表数组。

删除前检查是否还有其他文章链接到它：

```bash
rg "/projects/kimi-k3/" src
```

图片不会随 Markdown 自动删除。如果图片不再被其他内容使用，可以在确认引用为空后单独删除。

## 构建与发布

### 生产构建

```bash
npm run build
```

该命令依次执行：

1. Astro 内容与类型检查；
2. 静态页面构建；
3. 输出生产文件到 `dist/`。

成功时应看到类似结果：

```text
Result: 0 errors
build Complete!
```

### 本地预览生产结果

先构建：

```bash
npm run build
```

再预览：

```bash
npm run preview
```

`preview` 展示的是 `dist/` 中的生产结果，适合确认草稿是否被排除、动态路由是否全部生成。

### Cloudflare Pages 配置

| 配置 | 值 |
| --- | --- |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 仓库根目录或留空 |
| Production branch | `main` |

正式站点域名在 [astro.config.mjs](astro.config.mjs) 中配置：

```js
site: "https://biumbiu.com"
```

如果更换域名，需要同步修改该配置，并重新构建。

### 推荐发布流程

```bash
git status
git diff
npm run build
git add <本次准备发布的文件>
git commit -m "content: add sglang deployment note"
git push
```

推送后等待 Cloudflare Pages 构建成功，再打开正式域名检查：

- 首页；
- 新增的详情页；
- 项目或笔记归档；
- 封面和正文图片；
- 桌面端和移动端；
- 重要站内链接。

## 访问量与 Cloudflare D1

网站通过 Cloudflare Pages Function 和 D1 记录访问量：

- 所有页面的页脚显示全站访问量；
- 项目详情显示当前项目的浏览量；
- 笔记详情显示当前笔记的阅读量；
- 每次完整打开或刷新页面计为一次 PV，不代表独立访客人数。

### 首次创建数据库

安装依赖后登录 Cloudflare，并创建数据库：

```bash
npx wrangler login
npx wrangler d1 create biumbiu-views
```

应用数据库表结构：

```bash
npx wrangler d1 execute biumbiu-views --remote --file=migrations/0001_views.sql
```

### 绑定 Pages 项目

在 Cloudflare 控制台打开当前 Pages 项目，进入 `Settings` → `Bindings`，添加 D1 database binding：

| 配置 | 值 |
| --- | --- |
| Variable name | `DB` |
| D1 database | `biumbiu-views` |

保存后重新部署。Preview 环境建议绑定单独的测试数据库，否则预览访问也会增加正式站点的计数。

### 检查访问量接口

```bash
npm run check:functions
```

普通的 `npm run dev` 只启动 Astro，不会提供 D1 绑定，因此本地开发时计数器会自动隐藏。完成 D1 绑定后，应在 Cloudflare Preview 或正式部署中进行端到端检查。

## 修改网站公共信息

### 首页个人介绍、近况与社交链接

文件：

```text
src/pages/index.astro
```

首页的个人介绍和近况不是文章内容，目前仍直接维护在该页面中。

### Now 页面

文件：

```text
src/pages/now.astro
```

这里记录当前人生阶段、长期学习地图、项目主线以及读博与就业等仍在形成中的判断。它不是周报；建议按学期、季度或阶段变化更新，而不是记录短期任务。

修改内容后，同时更新页面顶部的 `Updated` 日期。具体项目的短期进度应写进对应项目 Markdown，而不是不断扩充 Now 页面。

### 顶部导航

文件：

```text
src/components/Header.astro
```

### 页脚

文件：

```text
src/components/Footer.astro
```

### SEO、Open Graph、Twitter Card 和文章时间

文件：

```text
src/layouts/SiteLayout.astro
```

每篇项目或笔记会自动使用自己的 `title`、`description` 和 `image` 覆盖默认信息。项目与笔记的 `date`、`updated` 还会自动生成文章发布时间和更新时间元数据。

笔记 RSS 地址为：

```text
https://biumbiu.com/rss.xml
```

站点地图由 Astro 在生产构建时自动生成，入口为：

```text
https://biumbiu.com/sitemap-index.xml
```

### 正式域名与静态构建配置

文件：

```text
astro.config.mjs
```

### 全局样式

当前主要样式文件：

```text
src/styles/v2.css
```

普通内容更新不需要修改 CSS。

## 发布前检查清单

### 内容

- [ ] `title` 清楚且没有重复；
- [ ] `description` 能独立说明内容主题；
- [ ] 日期与项目时间正确；
- [ ] 项目贡献边界表达准确；
- [ ] 没有把计划中的结果写成已完成事实；
- [ ] 没有公开密码、Token、私钥、IP、UUID 或内部地址；
- [ ] 正文没有重复的一级标题；
- [ ] 代码、命令和技术名词格式统一。

### 图片

- [ ] `image` 指向真实存在的文件；
- [ ] `imageAlt` 能描述图片内容；
- [ ] 正文图片在本地能够加载；
- [ ] 图片尺寸和文件体积合理；
- [ ] 桌面端和手机端均没有拉伸或溢出。

### 发布

- [ ] 已将 `draft` 改为 `false`；
- [ ] `featured` 与首页展示意图一致；
- [ ] 项目 `order` 正确；
- [ ] `npm run build` 通过；
- [ ] `git diff` 中没有无关文件；
- [ ] 正式域名上的详情页和列表页均正常。

## 常见问题

### `astro: command not found`

原因通常是依赖尚未安装，或者当前终端不在项目目录。

先确认路径：

```bash
pwd
```

再安装依赖：

```bash
npm install
```

然后运行：

```bash
npm run dev
```

不要直接运行全局 `astro`，项目会使用 `node_modules` 中锁定的版本。

### 新内容没有出现在首页

检查 Markdown 是否包含：

```yaml
featured: true
```

同时确认：

- 文件位于正确集合目录；
- frontmatter 没有格式错误；
- 项目是否被较小的 `order` 排在后面；
- 笔记是否属于最新的 4 篇精选笔记。

### 本地能看到，部署后看不到

最常见原因是：

```yaml
draft: true
```

开发环境会显示草稿，生产构建会排除草稿。改为 `false` 后重新构建和部署。

### 构建提示内容字段错误

对照 [Frontmatter 字段说明](#frontmatter-字段说明) 检查：

- 是否缺少必填字段；
- `status` 是否使用允许值；
- 布尔值是否误写成字符串；
- `tags` 是否写成数组；
- YAML 引号是否成对；
- 开头和结尾是否都有 `---`。

### 图片加载失败

依次检查：

1. 文件是否真的位于 `public/images/`；
2. 路径是否以 `/images/` 开头；
3. 文件名大小写是否完全一致；
4. 文件扩展名是否正确；
5. 是否错误使用了本机绝对路径。

macOS 默认文件系统对大小写可能不敏感，但线上环境通常区分大小写。`Project.webp` 和 `project.webp` 应视为两个不同文件名。

### 新建命令提示 slug 不合法

slug 只能匹配以下形式：

```text
lowercase-words-123
```

只能使用小写英文字母、数字和连字符，不能以连字符开头或结尾，也不能包含连续的分隔符。

### 新建命令提示文件已经存在

脚手架不会覆盖现有内容。请：

- 换一个 slug；或
- 直接编辑已经存在的 Markdown。

不要为了重新生成模板而删除已有文章，避免误删正文。

### 修改 Markdown 后页面没有更新

可以按顺序尝试：

1. 保存文件；
2. 刷新浏览器；
3. 查看运行 `npm run dev` 的终端是否有报错；
4. 停止开发服务器后重新运行 `npm run dev`；
5. 最后运行 `npm run build` 获取更完整的诊断。

## 常用命令速查

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装项目依赖 |
| `npm run dev` | 启动开发服务器，草稿可见 |
| `npm run new:note -- <slug>` | 新建笔记 Markdown |
| `npm run new:project -- <slug>` | 新建项目 Markdown |
| `npm run build` | 检查并构建生产版本 |
| `npm run preview` | 本地预览生产构建结果 |
| `git status` | 查看工作区状态 |
| `git diff` | 检查尚未提交的改动 |

## 当前已有内容

项目位于 [src/content/projects](src/content/projects)：

- `kimi-k3.md`
- `auto-sci-find-multiagent.md`
- `ascend-kernel-to-serving.md`
- `biumbiu-site.md`

笔记位于 [src/content/notes](src/content/notes)：

- `website-launch.md`
- `personal-infrastructure.md`

新增内容时，优先使用脚手架命令生成文件，再参考已有 Markdown 的组织方式。

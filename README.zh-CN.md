# qitu

`qitu` 是一个业务中立、Cloudflare-first 的全栈应用种子项目。

它不是业务应用，也还不是一个已经定型的框架。它是一套可复用的架构与启动蓝图，面向内部工具、数据应用、人工 review 流程和 AI 辅助系统，从第一天起就把边界划清楚。

English version: [README.md](./README.md)

## 当前状态

状态：

```text
runnable kit baseline
```

当前仓库包含：

1. 架构与决策文档。
2. 面向 Codex、Claude Code 和规划型 agent 的入口说明。
3. 可运行的 React app shell。
4. 可运行的 Cloudflare Worker shell。
5. 通用核心 package 接口。
6. Worker 内两个 app-owned starter feature adapters。
7. 经过验证的 adoption script，用于重命名、裁剪并重新连接 cloned app。
8. `templates/*` 下可复制的 app 和 feature 模板。
9. `examples/*` 下用于证明边界的可执行可选示例。

成熟度以 [docs/capability-matrix.zh-CN.md](./docs/capability-matrix.zh-CN.md) 为准。

## 快速开始

```sh
vp run setup
vp run dev
vp run validate
```

`vp run dev` 会同时启动 React app 和 Worker API。本地 auth 提供开发用 demo users：

```text
reviewer@example.com
admin@example.com
correct horse battery staple
```

如果只想查看前端展示，不启动 Worker，也不使用 Cloudflare bindings：

```sh
vp run dev:demo
```

静态 demo 使用浏览器本地 mock 数据覆盖 auth、files、jobs、review、audit、email metadata 和 AI
advisory 状态。详见 [docs/demo.zh-CN.md](./docs/demo.zh-CN.md)。

未登录时 web app 会进入 `/login`；登录后默认进入 `/workspace`，并把受保护路由收进两个业务中立的 roots：

```text
Workspace：/workspace、/workspace/sources、/workspace/imports、/workspace/reviews
Settings：/settings、/settings/members、/settings/audit
```

公司网络可能会在 `vp install` 从 `registry.npmjs.org` 拉取 package manager 时阻断。排查方式见 `docs/troubleshooting.md`。

## 核心想法

```text
qitu owns reusable application infrastructure.
business features own business meaning.
```

核心 package 可以理解这些通用应用概念：

```text
users
sessions
files
jobs
imports
reviews
audits
emails
alerts
AI advisory records
UI shell
```

业务 feature 代码自己决定：

```text
文件意味着什么
如何解析
如何校验
写入哪些业务表
需要哪些图表或页面
哪些计算口径是正确的
```

`qitu` 不强制顶层 `domains/*` 目录。具体 app 可以按 feature、workflow、bounded context 或 vertical slice 组织业务代码。starter 只强制一件事：可复用 core package 不能依赖业务特定代码。

## Monorepo 结构

```text
apps/
  web/
  worker/

packages/
  auth/
  rbac/
  db/
  files/
  jobs/
  import-pipeline/
  i18n/
  audit/
  email/
  ai-advisory/
  ui/
  design-system/
  charts/
  config/
  testing/

examples/
  import-review/
  json-records/
  organization-access/

templates/
  app/
  feature/
```

`apps/*` 是可部署入口。

`apps/worker/src/*` 保持可部署 Worker wiring 的 app-owned 边界：thin route composition
entrypoints、HTTP route groups、auth route groups、Cloudflare binding adapters、source-file
intake、inbound email 的 MIME parsing、import job runner、import review routes、feature-owned
review stores 与 starter feature registration 都放在这里。可复用状态规则与 contracts 仍属于
`packages/*`。

`apps/web/src/*` 保持 React shell、route pages、page sections、workflow controllers 与 demo mock
API 的 app-owned 边界。可复用视觉 primitives 仍属于 `packages/ui`。

`packages/*` 是可复用基础设施与 UI package。

`examples/*` 是非生产示例，用来证明边界。

`templates/*` 是未来生成 app 或 feature slice 时可复制的起点。

## 目标能力

`qitu` 正在收束为这些可复用全栈能力：

1. App-managed authentication。
2. 邀请制开户。
3. Session 与密码重置流程。
4. RBAC 与权限守卫。
5. 基于 R2 的源文件存储。
6. 基于 Queue 的异步任务。
7. 带 staging 和人工 review 的 import pipeline。
8. Audit events、security events 和 alerts。
9. 事务邮件与 inbound email 能力。
10. 需要人工确认的 AI advisory artifacts。
11. 支持 locale 的 React app shell 与 design system。
12. 可恢复的 import execution 与 source lifecycle operations。
13. Accessible workbench layouts 与 interactive chart primitives。
14. 文档与 decision log 约定。

不是所有能力都 production-ready。成熟度以 `docs/capability-matrix.zh-CN.md` 为准。

Organization access 与 versioned derived artifact 是可选 example/recipe，不是默认 core
capability。只有具体 app 真实需要 tenant ownership 或 materialized business calculation 时才采用。

## qitu 不提供什么

`qitu` 不编码业务特定概念：

1. 业务指标。
2. 业务 parser。
3. 业务工作流。
4. 业务报表。
5. 业务数据模型。
6. 业务计算口径。

这些应该属于 app-owned feature code、examples 或 templates。

## 中文文档地图

先读：

1. [docs/zh-CN.md](./docs/zh-CN.md)
2. [docs/kit-completion.zh-CN.md](./docs/kit-completion.zh-CN.md)
3. [docs/setup.zh-CN.md](./docs/setup.zh-CN.md)
4. [docs/capability-matrix.zh-CN.md](./docs/capability-matrix.zh-CN.md)
5. [docs/architecture/overview.zh-CN.md](./docs/architecture/overview.zh-CN.md)
6. [docs/architecture/package-boundaries.zh-CN.md](./docs/architecture/package-boundaries.zh-CN.md)
7. [docs/architecture/data-model.zh-CN.md](./docs/architecture/data-model.zh-CN.md)
8. [docs/architecture/import-pipeline.zh-CN.md](./docs/architecture/import-pipeline.zh-CN.md)
9. [docs/architecture/auth-security.zh-CN.md](./docs/architecture/auth-security.zh-CN.md)
10. [docs/architecture/ai-advisory.zh-CN.md](./docs/architecture/ai-advisory.zh-CN.md)
11. [docs/architecture/ui-design-system.zh-CN.md](./docs/architecture/ui-design-system.zh-CN.md)
12. [docs/architecture/ui-component-provenance.zh-CN.md](./docs/architecture/ui-component-provenance.zh-CN.md)
13. [docs/architecture/dependencies.zh-CN.md](./docs/architecture/dependencies.zh-CN.md)
14. [docs/guides/create-app.zh-CN.md](./docs/guides/create-app.zh-CN.md)
15. [docs/guides/add-feature.zh-CN.md](./docs/guides/add-feature.zh-CN.md)
16. [docs/guides/first-vertical-slice.zh-CN.md](./docs/guides/first-vertical-slice.zh-CN.md)
17. [docs/guides/optional-organization-access.zh-CN.md](./docs/guides/optional-organization-access.zh-CN.md)
18. [docs/guides/versioned-derived-artifacts.zh-CN.md](./docs/guides/versioned-derived-artifacts.zh-CN.md)
19. [docs/operations/source-lifecycle.zh-CN.md](./docs/operations/source-lifecycle.zh-CN.md)
20. [docs/deployment.zh-CN.md](./docs/deployment.zh-CN.md)
21. [docs/demo.zh-CN.md](./docs/demo.zh-CN.md)
22. [docs/troubleshooting.zh-CN.md](./docs/troubleshooting.zh-CN.md)
23. [docs/release-notes.zh-CN.md](./docs/release-notes.zh-CN.md)
24. [docs/upgrade-notes.zh-CN.md](./docs/upgrade-notes.zh-CN.md)
25. [docs/operations/dlq-remediation.zh-CN.md](./docs/operations/dlq-remediation.zh-CN.md)
26. [docs/agents/agent-integration.zh-CN.md](./docs/agents/agent-integration.zh-CN.md)
27. [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
28. [docs/decisions/decision-log.zh-CN.md](./docs/decisions/decision-log.zh-CN.md)

Agent 入口：

1. `AGENTS.md` 给 Codex 和其他 agentic coding tools。
2. `CLAUDE.md` 给 Claude Code。
3. `PI.md` 给 Pi-style planning 或 conversational agents。

## 命名

项目 canonical name 是：

```text
qitu
```

`qitu` 来自《山海经》里的鵸鵌。多头同体、各司其职又协作的意象，很适合这个 starter：auth、data、jobs、review、email、AI advisory、UI、operations 等模块彼此分工，又组成一个完整应用种子。

中文谐音“歧途”的梗也可以保留：一个帮助项目少走歧途的 kit，知道这个词也挺合理。

统一使用小写：

1. Repository name: `qitu`
2. Package prefix: `@qitu/*`
3. CLI name, if added later: `qitu`
4. Documentation title: `qitu`

canonical name 不加 `kit`、`framework`、`starter` 等后缀。这些词可以出现在解释性文本里。

## 实现原则

先做真实 vertical slice，再抽象。

推荐第一条 vertical slice：

```text
invite -> register -> login -> upload file -> create import job -> queue parse -> staging -> review -> advisory -> approve -> commit -> audit
```

成功标准是：业务 feature 可以插入 parser、staging shape、validation、commit logic 和 UI，而不用重写 auth、files、jobs、audits、email 或 app shell。

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
7. `templates/*` 下可复制的 app 和 feature 模板。
8. `examples/*` 下用于证明边界的可选示例 feature package。

成熟度以 [docs/capability-matrix.zh-CN.md](./docs/capability-matrix.zh-CN.md) 为准。

## 快速开始

```sh
vp run setup
vp run dev
vp run validate
```

`vp run dev` 会同时启动 React app 和 Worker API。本地 auth 提供开发用 demo reviewer：

```text
reviewer@example.com
correct horse battery staple
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

templates/
  app/
  feature/
```

`apps/*` 是可部署入口。

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
9. 事务邮件与未来 inbound email 能力。
10. 需要人工确认的 AI advisory artifacts。
11. React app shell 与 design system。
12. 文档与 decision log 约定。

不是所有能力都 production-ready。成熟度以 `docs/capability-matrix.zh-CN.md` 为准。

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
7. [docs/architecture/import-pipeline.zh-CN.md](./docs/architecture/import-pipeline.zh-CN.md)
8. [docs/deployment.zh-CN.md](./docs/deployment.zh-CN.md)
9. [docs/operations/dlq-remediation.zh-CN.md](./docs/operations/dlq-remediation.zh-CN.md)
10. [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
11. [docs/decisions/decision-log.zh-CN.md](./docs/decisions/decision-log.zh-CN.md)

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

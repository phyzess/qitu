# 决策日志

本文记录 `qitu` 已接受的关键决策。完整英文版本见 `docs/decisions/decision-log.md`。

## 已接受

### App-Local Worker Runner Modules

Decision:

Cloudflare binding adapters 和 starter feature registration 留在 app-owned Worker modules：

1. `apps/worker/src/auth-routes.ts` 围绕 reusable auth/email/RBAC package rules 组合 auth、session、invitation、password-reset、RBAC denial、audit 和 email delivery routes。
2. `apps/worker/src/import-adapters.ts` 注册 app-owned starter import adapters。
3. `apps/worker/src/import-job-runner.ts` 把 generic import lifecycle rules 接到 D1、R2、Queue、audit 和 app-owned staging tables。
4. `apps/worker/src/import-review-routes.ts` 拥有 starter review/decision/commit route persistence，用于 app-owned staging 和 committed tables。
5. `apps/worker/src/audit-store.ts` 与 `apps/worker/src/email-delivery.ts` 把 audit/email package concepts 适配到 D1 与 Cloudflare Email。
6. `apps/worker/src/http-utils.ts` 拥有 shared route parsing 和 error response helpers。
7. `packages/import-pipeline` 拥有 generic review status helpers、staging key conventions 和 adapter contracts。

不要把 Cloudflare binding details 或 starter table writes 移进 reusable core packages。

原因：

这样 `apps/worker/src/index.ts` 保持 HTTP/handler wiring，core packages 继续 business-neutral。这个 seam 把 Worker persistence 和 queue behavior 的修改集中到 app-owned modules，同时避免在第二个真实 app 证明需求之前伪造 reusable storage adapter。

### Canonical Name

Decision:

```text
qitu
```

规则：

1. 全部使用小写。
2. canonical name 不加 `kit`、`framework`、`starter` 后缀。
3. package namespace 使用 `@qitu/*`。

原因：

`qitu` 来自《山海经》中的鵸鵌。多头协作的意象适合一个由 auth、data、jobs、review、email、AI advisory、UI、operations 等模块组成的 fullstack starter。ASCII 名短、可读、repo-friendly，也不绑定具体业务领域。中文谐音“歧途”可以作为内部梗，而不是命名阻碍。

### Business-Neutral Core

Decision:

`qitu` 提供可复用应用能力。业务含义属于 app-owned feature code、examples 或 templates。

Core 可以拥有 auth、RBAC、files、jobs、import pipeline、review workflow、audit events、email、AI advisory records、app shell。

Core 不拥有业务指标、业务计算、业务 parser fields、业务报表、feature commit logic。

原因：

第一版必须保持可复用。一个 reusable core 要通过第二个 feature 不改 core semantics 来证明。

### Examples And Features Instead Of Top-Level Domains

Decision:

不强制 reusable starter 拥有顶层 `domains/*` 目录。examples 放在 `examples/*`，templates 放在 `templates/*`，具体 app 可按 feature、workflow、bounded context 或 vertical slice 组织业务代码。

原因：

不同 app 在 web、API、database、jobs、AI code 上可能需要不同形态。强制 `domains/*` 对通用 starter 太窄。

### Cloudflare-First Runtime

Decision:

默认部署平台是 Cloudflare：

1. Workers for HTTP APIs。
2. Worker Static Assets 或 Pages for React app。
3. D1 for relational state。
4. R2 for source files。
5. Queues for async work。
6. Email Sending / Email Routing for email。
7. Workers AI 或 external providers 只作为 advisory services。

原因：

让部署面小、贴近 edge runtime、适合内部工具运维。

### Human Confirmation For AI

Decision:

AI output 默认是 advisory。它可以建议、分类、抽取、总结、解释，但不能静默 commit business-owned records。

原因：

早期版本里，可 review provenance 比自动化速度更重要。

### Agent Entry Points

Decision:

提供一等 agent guidance：

1. `AGENTS.md` 给 Codex 和 agentic coding tools。
2. `CLAUDE.md` 给 Claude Code。
3. `PI.md` 给 Pi-style planning agents。

原因：

不同 agent 需要不同 detail level。仓库应显式记录这些边界，而不是依赖对话记忆。

### Initial Toolchain Baseline

Decision:

依赖版本精确记录在 `docs/architecture/dependencies.md`。关键选择：

1. React for web app。
2. Vite+ as root toolchain surface。
3. `vp` / `vp run` as command surface。
4. 官方 TypeScript 7 RC：`typescript@7.0.1-rc`。
5. Valibot for runtime validation。
6. Hono for Worker routing。
7. shadcn/Base UI direction for UI primitives。
8. visx as chart primitive layer。
9. `vite` 只留在 web app 作为 plugin peer 和 client type provider。

原因：

项目需要可复现 baseline，不能依赖对话记忆或 floating latest。

### Vite+ Command Surface

Decision:

尽量使用 Vite+ commands：

1. `vp dev apps/web`
2. `vp build`
3. `vp check`
4. `vp run`
5. `tsc` from `typescript@7.0.1-rc`

例外：

`apps/web/vite.config.ts` 从 `vite` import `defineConfig`，因为当前 Vite plugins 的 peer types 来自 `vite`，不是 Vite+ fork types。执行仍由 Vite+ 驱动。

### Manual DLQ Recovery In Baseline

Decision:

Baseline 使用人工 DLQ 与 failed-job remediation：

1. `apps/worker/wrangler.jsonc` 配置 Queue DLQ。
2. `docs/operations/dlq-remediation.md` 记录 triage 和 retry rules。
3. `vp run ops:failed-jobs` 提供只读 D1 snapshot。
4. 已有 app/API retry routes 负责 audited requeue。

Baseline 不挂自动 DLQ consumer，也不 blind replay。

原因：

自动 DLQ replay 可能重建 retry loop，并绕过人工分类。通用 kit 应先证明安全运维路径；自动 replay 只有在真实生产队列证明人工路径不足后再加入。

## Pending

1. Code generation 应属于 core 还是独立 CLI。
2. React Fast Refresh 是否应通过 Vite+ compatible React plugin path 恢复。

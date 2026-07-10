# 能力矩阵

Status: draft  
Date: 2026-07-10

## 状态定义

| 状态             | 含义                                                |
| ---------------- | --------------------------------------------------- |
| Designed         | 架构与决策已记录。                                  |
| Scaffolded       | package 或 app shell 已存在。                       |
| Runnable         | 有本地命令路径。                                    |
| Verified         | 被 smoke、type、unit、integration 或 runtime 覆盖。 |
| Production-ready | 可以给真实用户使用，并有运维 runbook。              |

## 当前矩阵

| 能力                  | Designed | Scaffolded | Runnable | Verified | Production-ready | 说明                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------- | ---------- | -------- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React app shell       | Yes      | Yes        | Yes      | Partial  | No               | 已接入 API-backed auth、受保护的 Workspace/Settings routes、持久化中英文选择、role-aware controls、source/import/review/audit surfaces 与 frontend-only demo。`AppShell` 提供 skip navigation、document title、route-change focus、保留浏览器原生 modified-link 行为和可选且不重复的 route heading；shared workbench layouts 与 browser smoke 覆盖 responsive shell。 |
| Worker API shell      | Yes      | Yes        | Yes      | Partial  | No               | `apps/worker` 暴露 health/runtime primitives、HTTP/inbound-email source intake、Queue-backed processing、以 durable Queue 为兜底的 post-response fast path、显式 queued-job redispatch、processing/mutation leases、隔离的 Worker runtime config，以及 integration/runtime checks。                                                                                   |
| Auth                  | Yes      | Yes        | Partial  | Partial  | No               | Invite link、accept page、login、protected routing、account/logout、带 resend/revoke/delete-revoked 的 admin user/invitation management、member hard delete guards、reset page、session revocation、security events 和 audit 已集成。                                                                                                                                 |
| RBAC                  | Yes      | Partial    | Partial  | Partial  | No               | `@qitu/rbac` 定义 owner/admin/reviewer/viewer；Worker 写路由检查权限并写 audit/security-event `rbac.denied`；React shell 会把 viewer 写权限呈现为 read-only controls。Production multi-tenant scope 不属于默认 baseline；仓库提供隔离的可选 organization example。                                                                                                    |
| Files                 | Yes      | Yes        | Yes      | Partial  | No               | 鉴权 HTTP/email intake 会写 R2、D1 与 audit evidence。Raw download/preview、reparse、source deletion、UTF-8-safe filename、soft tombstone、compare-and-swap deletion claim、adapter-owned cleanup hook、结构化 retry stage 与 report-only retention 已实现并有 integration tests。                                                                                    |
| Jobs                  | Yes      | Partial    | Yes      | Partial  | No               | Upload 创建 durable queued job，并调度 best-effort fast path；ownership lease 防止重复 processor，Queue 保持 durable fallback，queued job 可 redispatch，failure class/reason 与恢复证据写入 `import_job_events`。Review mutation 使用独立 lease 和显式 `committing` 状态排除并发写入。                                                                               |
| Import pipeline       | Yes      | Partial    | Yes      | Partial  | No               | App-owned text/JSON adapters 使用 parse/stage/validate/`commitApproved`。Record 存在 open error 时会阻止 approve/commit，除非单条 action 显式接受本次观察到的 errors。Adapter 默认人工 review；确定性 clean import 可选择 `commitPolicy: "auto_when_clean"`，自动路径复用受保护的人工 review persistence path，并使用 system actor。                                  |
| Human review          | Yes      | Partial    | Yes      | Partial  | No               | Review、decision、confirmation、commit、retry、redispatch、void 和 staged-record adjustment routes 已接入。Compare-and-swap mutation claim 排除并发 decision/commit；adjustment 保留 before/after hashes，显式 error override 会审计，integration/browser checks 覆盖 approve、reject、recovery 与 commit。                                                           |
| Audit/security/alerts | Yes      | Partial    | Partial  | Partial  | No               | 敏感路径写 audit，包括 invitation lifecycle events；login attempts、security events、import job events、alert events、list API、server-backed audit filters 与 web timeline/detail views 已接入。                                                                                                                                                                     |
| Email                 | Yes      | Partial    | Partial  | Partial  | No               | Invitation/reset templates、`store` 与 `send` delivery modes、`email_messages` delivery ledger、可见 failed invite delivery 与 resend、Cloudflare `send_email`、React token landing pages、business-neutral inbound email handling 已接入。                                                                                                                           |
| AI advisory           | Yes      | Partial    | Partial  | Partial  | No               | 本地 deterministic import-review advisory artifacts、list/generate/confirm/dismiss routes、web panel、audit events，以及 generate/confirm 的 browser smoke 覆盖已接入。                                                                                                                                                                                               |
| Charts                | Yes      | Yes        | Yes      | Partial  | No               | `@qitu/charts` 暴露 responsive、token-driven 的 visx primitives，支持 loading/empty/error/partial 状态、package-owned styles、pointer/focus tooltip、interactive legend、键盘 time-series 检查、live announcement 与 reduced-motion；unit/browser checks 覆盖脆弱交互路径。                                                                                           |
| Design system         | Yes      | Yes        | Yes      | Partial  | No               | 已实现 business-neutral tokens、accessible shell、`WorkbenchPage`/`WorkbenchGrid`/`ContextPanel`、surfaces、metrics、data states、timeline、calendar/date-field localization 与 review compositions。Context layout 在 1180px 以下折叠，共享 motion 遵守 reduced-motion preference。                                                                                  |
| Internationalization  | Yes      | Yes        | Yes      | Partial  | No               | `@qitu/i18n` 提供 reusable locale primitives、plural/relative-time helpers 和 locale negotiation；`apps/web`、Worker auth routes 与 email templates 拥有各自 dictionaries 与 selection UX。                                                                                                                                                                           |
| Feature templates     | Yes      | Yes        | Yes      | Partial  | No               | `templates/app` 有 verified copy manifest 和 adoption commands；`templates/feature` 是 typechecked copyable adapter，带 migration、fixture、web-surface、registry replacement slots 与可选 versioned-derived-artifact recipe。业务公式和 artifact tables 仍属于 feature-owned。                                                                                       |
| Organization access   | Yes      | Yes        | Yes      | Partial  | No               | `examples/organization-access` 是隔离、可执行且 opt-in 的示例，覆盖 organization、membership、entitlement、限时只读 support access 与精确 resource grant；disabled organization 和 unknown action 均 fail closed。它不改变 starter 的单组织默认值，也不是 production tenant system。                                                                                  |
| Derived artifacts     | Yes      | Yes        | N/A      | Partial  | No               | 可选 guide 与 feature recipe 定义 calculation/source-data version 检查、确定性失效、rebuild trigger 和 golden-fixture 义务。Qitu 刻意不提供通用 metrics engine 或 core derived-artifact table。                                                                                                                                                                       |
| Agent docs            | Yes      | Yes        | N/A      | Partial  | No               | Codex、Claude Code、Pi entrypoints 已存在。                                                                                                                                                                                                                                                                                                                           |
| Cloudflare deployment | Yes      | Partial    | Partial  | Partial  | No               | Cloudflare Pages 静态 demo 命令已接入，用于 frontend-only review；local/preview/production binding stubs 已存在；dry-run preflight 检查 public origins、Email Sending config、D1 placeholders、static assets 和 queue DLQ；DLQ remediation、email deliverability 与 deployment runbooks 已接入；尚未 provision 真实 preview/production 账号。                         |

## 近期验证目标

按优先级增加验证：

1. Template invariant 的 static smoke checks。
2. 使用 local D1/R2/Queue fakes 的 Worker handler integration。
3. TypeScript 7 RC package type checks。
4. 超出当前最小 runtime smoke 的 Cloudflare Email Service、Queues、D1、R2 binding runtime tests。
5. 只有当新真实 adapter 带来 parser-specific risk 时，才增加更广的 adapter edge-case tests。

## Production Readiness Gate

某项能力只有满足以下条件才算 production-ready：

1. 有覆盖成功与失败路径的测试。
2. 敏感操作写 audit events。
3. 相关场景有 rate limit 或 abuse control。
4. 有运维恢复路径。
5. 不依赖 AI output 自动提交，必须有人确认。
6. Cloudflare bindings 与 secrets 已记录。

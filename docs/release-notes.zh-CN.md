# Release Notes

状态：draft
日期：2026-07-10

`qitu` 尚未按 npm publication 做版本发布。本文记录其他团队或 agent 可以 clone/adopt 的可复用
starter baseline。

## 基线：Runnable Kit

这一基线通过一个完整 vertical slice 与第二条 adapter path 证明可复用基础设施。

包含：

1. 带 auth、source files、import jobs、review、AI advisory、commit/retry 与 audit views 的 React app shell。
2. 带 D1、R2、Queue、Email 与 Static Assets 配置的 Cloudflare Worker API。
3. App-managed auth：invitation、accept、login、logout、`me`、password reset、session revocation 与 auth audit。
4. 最小 RBAC：`owner`、`admin`、`reviewer`、只读 `viewer`；拒绝写入会审计为 `rbac.denied`。
5. 带 content-hash idempotency、R2 object、D1 metadata、queue dispatch 与 audit 的 source intake。
6. Queue-backed import processing，以及 app-owned text/JSON starter adapters。
7. 带 approve/reject、AI advisory、人类确认、commit、retry 与 audit 的 human review。
8. 面向 auth、RBAC、files、jobs、import pipeline、audit、email、AI advisory、charts、UI、design system、config、db 与 testing 的业务中立 packages。
9. 可复制 app/feature templates，以及 Codex、Claude Code、Pi-style agent entrypoints。
10. Static smoke、Worker runtime/integration、browser smoke、local migration、deploy dry-run 与只读 failed-job operations 验证命令。

这一基线的已验证命令记录在 `docs/kit-completion.zh-CN.md`。

## 基线更新：可恢复运维与 Accessible Workbench

2026-07-10 baseline 吸收了下游应用的可复用经验，但没有把下游业务词汇移入 qitu core。

Import execution 与 review：

1. Source intake 持久化 queued job、dispatch 到 Cloudflare Queue，也可以调度 best-effort
   `ctx.waitUntil` fast path；Queue 始终是 durable fallback。
2. Processing ownership 与 review mutation 使用有时限的 compare-and-swap lease。Commit 有显式、
   可恢复的 `committing` 状态；仍为 queued 的 job 有 audited redispatch route。
3. Open record error 会阻止普通 approve/commit。单条 record action 可以显式接受本次观察到的
   errors；batch confirmation 绝不隐式接受。
4. Adapter 默认人工 review。确定性 adapter 可以选择 `commitPolicy: "auto_when_clean"`，并使用
   guarded commit path 与 system actor。AI advisory artifact 仍需要人工确认，也绝不授权业务写入。

Source lifecycle：

1. Raw download 与 bounded text preview 使用专用权限并写 audit evidence。
2. 已包含 reparse、queued-job redispatch、job void、staged-record adjustment、单个/批量 source
   deletion、soft tombstone，以及 UTF-8-safe upload/download filename。
3. Source deletion 使用 exclusive claim、结构化 retry stage、app-owned cleanup hook，并以
   report-only 方式保留 metadata/audit/job events。

UI 与验证：

1. `AppShell` 增加 skip navigation、document title、route-change focus 与原生 link semantics。
2. `WorkbenchPage`、`WorkbenchGrid`、`ContextPanel` 提供 responsive、业务中立 layout。
3. Chart 自带 styles，并增加 pointer/focus tooltip、键盘 time-series inspection、interactive
   legend、live announcement 与 reduced-motion handling。
4. Calendar/date field 接收 locale-aware accessible labels。Root unit tests、隔离的 Worker runtime
   config 与 PID-isolated browser persistence 已进入 `verify:kit`。
5. CI 不再要求 `setup-node` 在 Corepack 提供 pnpm 之前恢复 pnpm state；local Wrangler migration
   setup 会动态发现最新编号 migration，不再依赖固定 marker。

可选采用材料：

1. `examples/organization-access` 演示 fail-closed organization context、entitlement、限时只读
   support access 与精确 resource grant，但不改变 starter 的单组织默认值。
2. Versioned-derived-artifact guide/feature recipe 让公式、artifact table、source version、rebuild
   trigger 与 golden fixture 继续属于 app-owned code。

把这次更新应用到已有 cloned app 前，请阅读 `docs/upgrade-notes.zh-CN.md`。

## 不包含

这一基线刻意不包含：

1. Production Cloudflare account provisioning。
2. Public signup。
3. Social login 或 SSO。
4. Production tenant-aware resource scope system；仓库只有可选 executable organization-access
   example 与 migration runbook。
5. 真实 AI provider integration。
6. 完整 chart catalog。
7. 业务特定 parser、table、dashboard 或 calculation。
8. 真实 production queue 的 automatic DLQ consumer/replay automation。

## 兼容说明

固定 toolchain：

1. TypeScript `7.0.2`。
2. Vite+ `0.2.1`。
3. pnpm `11.5.2`。
4. Wrangler `4.103.0`。
5. React `19.2.7`。

除非 decision record 说明原因，否则保持 exact versions。

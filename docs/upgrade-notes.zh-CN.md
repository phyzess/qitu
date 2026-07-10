# Upgrade Notes

状态：draft
日期：2026-07-10

升级 cloned `qitu` project，或把后续 qitu change 应用到已经拥有业务 feature 的 app 时，使用本文。

## Upgrade 规则

升级可复用 infrastructure，但不能把业务含义移入 core packages。

Core package 可以演进 auth/session、RBAC、files/object metadata、jobs/queues、
import/review/commit interface、audit、email、AI advisory、UI primitive 与 design token contracts。

业务 app 继续拥有 feature adapter、staging table、committed business table、product-specific
screen/calculation/chart semantics。

## 安全 Upgrade Checklist

升级前：

1. 在源 baseline 执行 `vp run verify:kit`。
2. 阅读 `docs/release-notes.zh-CN.md` 与 `docs/decisions/decision-log.zh-CN.md`。
3. 识别影响 reusable tables 的 migrations。
4. 识别 `packages/*` API changes。
5. 确认 app-owned feature code 仍实现 `ImportFeatureAdapter`。
6. 确认 reusable package 不从 `apps/*` 或 `examples/*` import。

升级后：

1. 执行 `vp install`。
2. 执行 `vp check --fix`。
3. 执行 `vp run smoke`。
4. 执行 `vp run verify:kit`。
5. 执行 app 的 business-specific tests。
6. Remote migration/deployment 前执行对应 deploy dry-run。

## 2026-07-10 接入顺序

按以下顺序应用这一 baseline：

1. 备份 D1，并确认目标 Worker/environment。
2. 按 filename 顺序应用全部新 migrations。当前新增项引入 source tombstone、source-deletion
   claim，以及 import processing/mutation leases 和可恢复的 `committing` 状态。
3. 启用 source deletion 前，实现并测试每个 adopted adapter 的 source cleanup hook。
4. 让 `commitApproved` 对下文稳定的 `context.idempotencyKey` 幂等。
5. 在产品 UI 暴露 raw-source、reparse、redispatch、void、adjustment 或 deletion controls 前先部署 Worker。
6. 更新产品 status projection，把 `committing` 识别为进行中、不可编辑的 job。
7. Remote migration 前，在隔离 persistence directory 上执行 local migrations、Worker
   integration/runtime tests、unit tests 与 browser smoke。

不要只 backport routes。Migrations、claims、event/audit evidence、retry semantics 与 integration
checks 共同构成一个 recovery contract。

当前 migrations 的目的：

| Migration                        | 目的                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `0009_source_lifecycle.sql`      | Active-source uniqueness 与 soft tombstone。                                                       |
| `0010_source_deletion_claim.sql` | Exclusive deletion ownership、retry-stage evidence，以及 deletion 开始后禁止挂入新 job。           |
| `0011_import_commit_claim.sql`   | 业务中立的 import processing ownership、review/commit mutation lease，以及可恢复 previous status。 |

## Database Migrations

Migrations 只能 append。

应该：

1. 在 `apps/worker/migrations` 新增 migration files。
2. 保持 local、preview、production migration commands 显式。
3. Starter upgrade 优先使用 additive columns/indexes。
4. Production use 前记录 data backfill。

不要：

1. 在 cloned app 中修改已经应用的 migration。
2. 把业务特定 tables 当作 required core tables 写入 generic docs。
3. 在 D1 保存 plaintext token/password、raw email body 或 raw source file。

Source lifecycle migrations 刻意把 tombstoned source metadata 与历史 audit/job events 保留为
report-only evidence。Cloned app 在加入 destructive purge 前必须先定义 retention/compliance policy。

## RBAC 变化

Starter baseline 使用：

```text
owner
admin
reviewer
viewer
```

新增 permission 时：

1. 在 `packages/rbac` 增加 permission。
2. 用 `requirePermission` 保护 Worker write route。
3. 至少增加一个允许路径和一个拒绝路径 integration test。
4. 确保拒绝会写 `rbac.denied`。
5. 更新 `docs/architecture/auth-security.zh-CN.md`。

Tenant-aware scope 必须是有意的 app/platform decision，不能作为 starter role table 的隐藏变更。

## Feature Adapter 变化

Core import pipeline 保持以下稳定 seam：

```text
canHandle -> parse -> stage -> validate -> commitApproved
```

Feature 需要更丰富行为时，先放入 app-owned feature code，通过 vertical slice 证明，再只提取至少
两个 feature 都需要的 reusable contract，并让 example package 保持 optional。

当前 adapter contract 还包含以下接入规则：

1. `commitPolicy` 默认 `"manual"`。只有 clean result 不需要额外 product-specific decision 的
   deterministic adapter 才使用 `"auto_when_clean"`。`autoCommitCleanImports` 是兼容 alias；
   新代码使用 `commitPolicy`。
2. Open error 仍阻止 automatic path。AI advisory confirmation 是独立流程，绝不会让 adapter
   自动获得 commit 权限。
3. `commitApproved` 会收到稳定的 `context.idempotencyKey = commit:${jobId}`。Adapter 执行的任何
   external、remote 或 business-owned write 都必须使用该 key，或 deterministic child key，保证
   repeated execution 幂等。
4. Stale `committing` lease 会用相同 `commit:${jobId}` key 重放 adapter 来恢复。即使 qitu D1
   persistence 有 guard，忽略该 key 的 adapter 仍可能重复外部 side effect。
5. Source delete 与 job void 绝不能绕过 fresh/stale `committing` claim。必须先 resume/recover
   commit；只有非 committing 的 terminal/review state 才能继续 void 或 source cleanup。
6. 参与 source deletion 的 adapter 实现 `WorkerReviewStore.prepareDeleteSourceRecords`，并保证
   cleanup 幂等。Hook 负责该 source 贡献的 staged、committed、derived 与 report data；core 无法
   推断这些 tables。

## Queue 与 Runtime 变化

1. Starter Queue consumer 使用一秒 maximum batch timeout 降低 fallback latency。合并各环境
   `wrangler.jsonc` 时保留 binding name 与 dead-letter queue。
2. 合并 local、preview、production 的 `*/5 * * * *` Cron trigger 与 Worker `scheduled` handler。
   Wrangler 会注册该 trigger，无需单独创建 resource；它负责 durable recovery expired/failed
   source-deletion claim。
3. `ctx.waitUntil` fast path 是 optional latency work，不是 durable delivery；该路径不能删除或
   acknowledge Queue message。
4. Initial Queue send 在 source persistence 后失败时，使用 failed-job retry route；有审计的
   queued-job redispatch route 仅用于 send 已成功、但长期保持 queued 且没有 processing evidence
   的 job。
5. `apps/worker/wrangler.test.jsonc` 与 deploy config 保持隔离。Root unit tests 与 Worker runtime
   tests 使用独立 Vitest collection path；browser smoke 使用 per-process persistence directory。
   Workers-pool runtime suite 允许 30 秒 cold-start budget，避免 concurrent local build 误触
   Vitest 的 5 秒 unit-test default。
6. 保持 local migration discovery 动态化；新增 source、import 或 feature migrations 时，不要重新
   引入 hard-coded "latest migration" marker。

## UI 与 Chart 变化

1. `AppShell` 接受 `contentKey`、`contentTitle`、`documentTitle` 与 localized skip/navigation labels。
   Route change 后 focus main，initial mount 不抢 focus。通过 `contentTitle` 或 page content 提供唯一
   meaningful `h1`。
2. Link navigation item 可以带 `target`/`download`；不能用 unconditional router interception
   破坏原生 modified-link behavior。
3. 优先使用 `WorkbenchPage`、`WorkbenchGrid`、`ContextPanel`，不要继续写 page-local two-column recipe。
4. `DateField` locale dictionary 除 previous/next month copy 外，还应提供 month/year dropdown labels。
5. `@qitu/charts` 现在自带 stylesheet。Label 与 tooltip terminology 保持 app-owned；rich tooltip
   React content 不能还原成有意义 text 时，提供 explicit textual announcement callback。

## 可选示例

`examples/organization-access` 与 versioned-derived-artifact recipe 都是 opt-in material。不能因为
starter 包含它们就直接应用 organization migration、tenant ownership、support-access policy、
artifact schema 或 formula-version rules；只有经过 review 的 app-owned migration 才能采用，并应
使用对应 runbook/guide。

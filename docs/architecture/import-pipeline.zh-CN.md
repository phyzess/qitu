# Import Pipeline

Status: draft  
Date: 2026-06-27

Import pipeline 是 `qitu` 当前最重要的可复用工作流。它负责把上传的源文件变成可人工 review、可审计、可 commit 的记录。

## 目标

1. 上传 source file。
2. 保存原始文件和 metadata。
3. 创建 import job。
4. 通过 Queue 异步处理。
5. 选择合适 adapter。
6. parse/stage/validate records。
7. 生成 review issues。
8. 让 reviewer approve/reject。
9. 只 commit approved records。
10. 写 audit events。

## 核心 Contract

通用 adapter shape 位于 `@qitu/import-pipeline`：

```text
ImportFeatureAdapter
```

一个 adapter 负责：

1. 判断是否能处理 source。
2. parse 原始文件。
3. stage 业务记录。
4. validate staged record。
5. commit approved records。

Adapter 默认使用人工确认。Deployable app 可以为确定性 adapter 显式设置
`commitPolicy: "auto_when_clean"`；只有不存在 open `error` issue 时，系统才会自动确认并
commit，而且必须复用人工 review 使用的 audited confirmation 与 `commitApproved` 路径。
Worker adapter 暂时保留 `autoCommitCleanImports: true` 作为 downstream 接入的兼容别名。

Core 不知道业务字段。业务 payload 由 adapter 和 app-owned feature code 解释。

`packages/import-pipeline/src/index.ts` 是 package interface facade。Schemas、generic types、adapter
contract、manual review issue factory、staging key conventions、review/confirmation action aliases
和 job status derivation 放在 package-internal focused modules 中，调用方仍从
`@qitu/import-pipeline` 导入。

## 状态流

```text
uploaded source file
-> queued import job
-> processing
-> needs_review
-> approved / rejected records
-> committed approved records
```

失败路径：

```text
queued / processing
-> failed
-> retry
-> queued
```

失败会记录 `failure_class` 和 `failure_reason`，并写 audit event。

当前 Web starter 会在 Imports 路由暴露这些信息：选中 job 的 diagnostics panel 会显示 status、adapter、attempt count、failure class、failure reason、timestamps、source hash、recovery guidance、受 RBAC 控制的 retry action，以及进入 Review 路由前可见的 `import_job_events` stream。

## Review 模型

每条 staged record 可以有：

1. payload。
2. review status。
3. validation issues。
4. human decision。
5. committed record id。

即使 adapter validation 发现错误，记录也会进入 review，而不是静默丢弃。比如 starter text adapter 中非法数字会留下 `invalid_number` issue，并阻止直接 commit。

Job status 由 staged record 状态汇总推导：

1. 只要还有 approved 且未 committed 的 staged record，job 保持 `approved`，表示有可提交工作。
2. 没有 approved work 但仍有 pending staged records 时，job 保持 `needs_review`，包括 partial commit 之后。
3. approved rows 已提交且没有 pending/approved staged records 时，job 才进入 `committed`。
4. 全部 rejected 的 job 在中立 starter 中仍保持 `needs_review`，因为当前没有单独的 job-level rejected 状态。
5. `committing` 是 exclusive、可恢复的 in-progress state。Review mutation、job void 与 source
   deletion 不能绕过它；stale claim 必须使用相同 idempotency key 恢复 commit，之后其他 lifecycle
   action 才能继续。

Open-error 规则：

1. 存在 open `error` issue 的 staged record 不能被普通 approve。
2. Batch confirmation 不能隐式接受 open errors。
3. Approved record 自己仍有 open `error` 时不能 commit；rejected 或 pending row 上的 issue 不会
   阻断另一条已 approved 的 clean record。
4. Reviewer 可以只对单条记录显式提交 `overrideOpenErrors: true`；系统会在同一个 D1 batch
   中接受 issues、写 decision、更新 review status，并追加 audit/job events。
5. Staged adjustment 保持 app-owned：adapter 校验替换 payload，旧 open issues 变为
   `superseded`，record 回到 pending confirmation。

Source deletion 也通过 app-owned store boundary 实现。真实 review store 必须先实现
`prepareDeleteSourceRecords`，删除或重建该 source 贡献的全部 staged、committed 与 derived
rows。Worker 作废 jobs、删除 R2 object、执行 app cleanup、tombstone `source_files`，并把
metadata 与 audit/job events 作为 report-only evidence 保留。详见
`docs/operations/source-lifecycle.zh-CN.md`。

Source deletion 与 job void 在 commit claim fresh 或仍可恢复时必须 fail closed。Operation 必须先
resume/recover `committing`，不能把它重新解释成可以 void 或 cleanup 的 review work。

## AI Advisory

AI advisory 是建议，不是执行者。

规则：

1. AI 可以生成 summary、risk、suggestion。
2. AI output 会保存为 advisory artifact。
3. 人必须 confirm/dismiss advisory。
4. Commit 仍然只看 approved records。
5. AI 不直接写业务记录。

## Idempotency

Pipeline 在这些地方保持幂等：

1. Source file 使用 content hash 识别重复上传。
2. Staged records 使用 stable staged record key。
3. Review issues 使用 import job + staged key + issue code。
4. `commitApproved` 收到稳定的 `context.idempotencyKey = commit:${jobId}`。Adapter 的 external、
   remote 或 business-owned write 必须对这个 key，或 deterministic child key，保持幂等。
5. Stale `committing` recovery 会使用同一个 `commit:${jobId}` key 重放 adapter；即使第一次执行已
   完成外部 side effect、但 qitu 尚未持久化 local result，也不能重复产生副作用。
6. 第二次 commit 已提交 job 会返回 duplicate 结果。

## 何时新增 Adapter

新增 adapter 时，不要改 core contract。优先在 app-owned feature code 中：

1. 定义 source canHandle 规则。
2. 定义 payload schema。
3. 定义 validation issues。
4. 定义 commit output。
5. 在 app registry 注册 adapter。

只有当多个真实 adapter 共享同一能力时，才考虑抽回 core。

## 失败分类

可复用 pipeline 应能区分：

1. Unsupported source。
2. Parse error。
3. Missing required business fields。
4. Invalid business date or number。
5. Duplicate source。
6. Duplicate target record。
7. Commit conflict。
8. Infrastructure failure。

除非 adapter 标记为 terminal，失败应保持可见且可 retry。

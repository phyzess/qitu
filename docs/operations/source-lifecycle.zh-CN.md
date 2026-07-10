# Source 生命周期运维

状态：可运行基线
日期：2026-07-10

Source 运维由 app-owned Worker routes 实现，并复用 qitu 的通用权限与 import/review contracts。
原始内容保存在 R2；D1 保留 source metadata、jobs、review state 和 audit evidence。

## Route 基线

| 操作               | Route                                                    | 权限                  | 安全规则                                                           |
| ------------------ | -------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| 下载               | `GET /api/source-files/:sourceFileId/download`           | `source_file:raw`     | 从 R2 流式返回，设置 `nosniff` 与 UTF-8-safe attachment metadata。 |
| 预览               | `GET /api/source-files/:sourceFileId/preview`            | `source_file:raw`     | 只允许 text/JSON/XML；最多读取 64 KiB，并返回是否截断。            |
| 重新解析           | `POST /api/source-files/:sourceFileId/reparse`           | `source_file:reparse` | 针对已有不可变 source object 创建新的 queued job。                 |
| 重新分发           | `POST /api/import-jobs/:jobId/dispatch`                  | `import_job:retry`    | 只重新发送仍为 queued 的 job，并追加 dispatch evidence。           |
| 作废 job           | `POST /api/import-jobs/:jobId/void`                      | `review:decide`       | 幂等；committed job 必须改走 source cleanup。                      |
| 调整 staged record | `PATCH /api/import-jobs/:jobId/staged-records/:recordId` | `review:decide`       | App adapter 校验 payload；committed/voided work 不可修改。         |
| 删除 source        | `DELETE /api/source-files/:sourceFileId`                 | `source_file:delete`  | 先作废 jobs，再删 R2，执行 app cleanup，最后 tombstone metadata。  |
| 批量删除           | `POST /api/source-files/delete`                          | `source_file:delete`  | 去重、顺序执行，最多接受 50 个 source ids。                        |

Raw read 与生命周期写操作都会留下 audit evidence。Starter policy 中 viewer 既不能读取 raw
source content，也不能修改 source lifecycle state。

## 删除协议

真实 adapter 启用删除前，必须实现 `WorkerReviewStore.prepareDeleteSourceRecords`。该 hook
必须删除或重建这个 source 贡献的全部 app-owned staged、committed 与 derived data；Qitu 无法
推断业务表。

删除顺序是显式契约：

```text
通过 compare-and-swap claim source deletion
-> 确认所有 adapter cleanup hooks
-> 在每个 job void 前续租并校验精确 claim
-> 再次续租后删除 R2 object
-> R2 返回后再次续租并校验精确 claim
-> 每个 app-owned cleanup store 只处理属于自己的 job ids
-> 写入 source_files.deleted_at/deleted_by
-> 追加 audit 与 job events
```

Deletion claim 同时也是 durable recovery record。删除一旦开始，R2、job void 或 D1 cleanup
失败都会保留 claim 并记录 failure stage，不能重新开放 source。Claim 存在期间，普通 source list
与 raw read 都 fail closed。DELETE retry 可以立即 compare-and-swap 已记录的 failure stage，不必等待
普通 15 分钟 lease 过期。R2 已成功时仍可安全重试，因为重复删除缺失 object 会被容忍，而所有
cleanup hooks 都必须幂等。

并发 delete 会收到 `source_deletion_in_progress`；database trigger 会阻止 claim 之后的 reparse
或新 job insertion。Claim takeover 与 reclaim/resume audit 位于同一个 D1 transaction；破坏性
side effect 前以及 R2 返回后都必须续租并校验精确 token。每 5 分钟运行的 scheduled handler 会恢复
failure stage 与 expired claim，即使已经没有 import Queue message 也能继续。Queue delivery 对 fresh
claim 最多等待一次；expired/failed claim 交给同一 recovery path 后即 acknowledged，不消耗有限 retry
budget。持续失败只保留一个 open `source_file.deletion_stalled` alert，成功 cleanup 会 resolve 它。
Cleanup support 缺失时，只有全新且尚无 side effect 的 claim 可以 release；recovery claim 必须保持
fail closed 并告警 operator。Batch deletion 会逐项报告，因此单个失败不会掩盖之前的成功。

已删除 source 不再出现在普通 source/job list 中，但 metadata、audit events 和 job events 会作为
report-only evidence 保留。

Starter 不运行自动 retention purge。Cloned app 必须先确认合规策略，才能加入破坏性的 metadata
或 audit 清理；这类 job 还必须输出结构化 operator evidence。

## Review 安全

存在 open `error` issue 时，普通 approve 与 batch confirmation 会被阻断。Approved record 自己
仍有 open error 时不能 commit；rejected 或仍 pending 的 row 上的 open issue 不会阻断另一条已
approved 的 clean row。单条记录 approve 可以显式提交 `overrideOpenErrors: true`；系统会在同一个
D1 batch 中把该请求观察到的 open errors 标记为 `accepted`，写入 decision，并追加 audit/job
events。Batch confirmation 绝不隐式接受错误。

Adapter 默认需要人工确认。应用可以为确定性 adapter 显式设置
`commitPolicy: "auto_when_clean"`（或兼容字段 `autoCommitCleanImports: true`）。自动路径只会在
没有 open error 时运行，并复用人工 review 使用的 confirmation 与 `commitApproved` 持久化路径。

`committing` 是 exclusive、可恢复的状态。Job void 与 source deletion 必须拒绝 fresh 和 stale
commit claim，不能从提交过程下方删除 work。先用稳定的 `commit:${jobId}` idempotency key 重放
adapter、恢复 commit；之后的 lifecycle action 只能从恢复后的 non-committing state 继续。

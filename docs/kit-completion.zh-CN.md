# Kit 完成契约

Status: draft  
Date: 2026-06-29

本文定义 `qitu` 的“完成但不冗余”是什么意思。

## 目标

当另一个团队或 agent 可以 clone `qitu`，并在没有私有对话上下文的情况下，用它启动一个业务中立、Cloudflare-first 的内部数据应用时，`qitu` 就是完成的。

完成不等于实现所有可能功能。完成意味着：可复用基础已经被一条可工作的 vertical slice 证明，并且第二个 feature 可以在不改变 core semantics 的情况下加入。

## 非冗余原则

只有满足以下条件之一时才添加代码：

1. 第一条 vertical slice 必需。
2. 保护一个可复用边界。
3. 让 starter 更容易安全采用。
4. 证明一个否则会停留在猜测层面的决策。

不要添加：

1. 业务特定模型。
2. 没有使用者的抽象。
3. 没有本地实现路径的 provider adapter。
4. starter shell、review flow 或 templates 用不到的 UI 组件。
5. 已经记录决策后的平行技术选项。

## 完成范围

最终 kit 必须包括：

1. App-managed auth：invite、accept、login、protected routing、account/logout、admin user management、current user、password reset、session revocation 和 audit events。
2. 最小 RBAC：邀请时分配角色、写路由守卫、只读 viewer、拒绝访问写 audit。
3. Source file intake：鉴权上传、R2 存储、D1 元数据、import job 创建、audit。
4. Queue-backed import processing：幂等 job 状态、可见失败、失败分类、retry、audit。
5. 基于 `ImportFeatureAdapter` 的通用 import/review/commit workflow。
6. 一条完整 example feature，覆盖 parse、stage、review、approve、commit、audit。
7. React app shell：login、account、user management、source files、import jobs、review table、audit timeline。
8. 面向数据密集内部工具的业务中立 UI、design tokens 和 chart primitives。
9. Email abstraction，兼容 Cloudflare invite/reset delivery path。
10. AI advisory abstraction，存储 advisory output，commit 前需要人工确认。
11. Cloudflare binding docs 和本地 setup、migration、validation、deployment、DLQ/failed-job remediation 命令。
12. Codex、Claude Code、Pi-style planning agents 的 agent entrypoints。
13. 新 app 和新 feature slice 的 templates。

## 完成门禁

以下全部通过前，`qitu` 不算完成：

1. `vp run verify:kit` 通过。
2. 本地 D1 migrations 可从干净状态应用。
3. 第一条 vertical slice 可本地跑通，不需要手工改数据库。
4. Smoke tests 覆盖 invite、login、upload、import job creation、review approval、commit、audit visibility。
5. `docs/capability-matrix.md` 没有虚假的 production-ready 声明。
6. `docs/roadmap.md` 没有缺 owner path 的 P0/P1 项。
7. 可复用 package 不 import app-owned feature code。
8. core package 不包含业务特定词汇。
9. `.env.example`、`.dev.vars.example` 和 setup docs 列出所需 binding 或 secret name。
10. 新 feature 可以从 `templates/feature` 开始，不需要编辑已有 core package。

## 最近验证

Date: 2026-06-27

Workspace: local filesystem baseline；此证据不依赖 git metadata。

已通过命令：

1. `vp check --fix`
2. `vp run ops:failed-jobs -- local --limit 5`
3. `vp run smoke`
4. `vp run verify:kit`
5. `vp run deploy:dry-run`
6. `vp run deploy:preview:dry-run`
7. `vp run deploy:production:dry-run`

已验证覆盖：

1. Browser smoke 打开生成的 invite link，接受邀请，打开 password-reset link，确认重置，并用新密码登录。
2. `templates/feature` 是 workspace package，并由 `vp run verify:kit` typecheck。
3. Worker 使用 app-owned starter adapters，不再依赖可选 `examples/*` package。
4. RBAC baseline 覆盖 owner/admin/reviewer/viewer、邀请角色、viewer 写拒绝和 `rbac.denied` audit。
5. Release/upgrade notes 记录当前 baseline 和 cloned app 的安全采用路径。
6. DLQ remediation 已记录，`ops:failed-jobs` 提供只读 D1 恢复快照。
7. Audit filtering、selected-event details、invitation revocation、source/job diagnostics、recovery guidance 和 import-to-review route memory 已由 integration 或 browser smoke 覆盖。
8. Browser smoke 会在 approve/commit 前生成并确认 deterministic AI advisory，然后验证 job event stream 中的 `ai_advisory.confirmed`。

## 明确不在范围内

这些不是 kit 完成条件：

1. Multi-tenant billing。
2. Public user signup。
3. Social login。
4. 完整 design-system catalog。
5. 每一种 chart type。
6. 每一种 AI provider。
7. 每一种 file parser。
8. 真实 Cloudflare account production deployment。
9. 业务特定 dashboard。

## Review 节奏

每次 vertical slice 增量后：

1. 更新 `docs/capability-matrix.md`。
2. 更新 `docs/guides/first-vertical-slice.md`。
3. 当某个 invariant 变重要时，增加或更新 smoke check。
4. 运行 `vp run validate`。
5. 把技术或边界决策记录到 `docs/decisions/decision-log.md`。

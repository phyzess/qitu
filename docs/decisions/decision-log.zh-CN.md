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

### Full-Stack Local Dev Default

Decision:

`vp run dev` 同时启动 web app 和 Worker API。之前只启动 web 的命令保留为 `vp run dev:web`，`vp run dev:all` 继续作为完整本地栈 wrapper 的显式别名。

本地开发同时暴露 local-only demo user bootstraps：

```text
email: reviewer@example.com
email: admin@example.com
password: correct horse battery staple
```

这些 bootstrap route 只在 `APP_ENV=local` 下创建或重置用户；非本地环境仍默认 invitation-only onboarding。reviewer 账号用于体验 review workflow，admin 账号用于体验 user/invitation management。

原因：

React app 会把 `/api` 和 `/health` 代理到 Worker，所以 web-only default 会产生半启动应用和 proxy failure。full-stack default 给 cloned checkout 一个可运行的第一印象，同时把本地 demo identities 留在 app-owned/local-only 层，不进入 reusable packages 或部署环境。

### Workbench UI Baseline

Decision:

采用从 FOF 最终 UI 方向抽象出来的 business-neutral workbench baseline：

1. 暗色 tonal shell，包含 topbar 一级导航、二级 route tabs、main work surface、context inspector、event stream。
2. `packages/design-system` 提供字体、紧凑 type scale、semantic color、radius、spacing 与 surface shadow tokens。
3. `packages/ui` 提供 surface、data state、metric strip、file/import/review action、timeline 等业务中立组件。
4. `packages/charts` 作为 visx-only chart layer，app 页面只 import qitu chart components，不直接 import `@visx/*`。

原因：

FOF 最终接受的是偏 analytical workbench 的控制台方向，而不是浅色 generic admin shell。qitu 应保留这些可复用 UI 经验，但不能引入 FOF 的业务词汇或业务语义。

### Event Foundation Tables

Decision:

Baseline 增加通用运行事件基础：

1. `login_attempts`：记录 hash 后的登录尝试诊断信息。
2. `import_job_events`：记录 upload、queue、process、review、retry、advisory、commit 的 job-local timeline。
3. `security_events`：记录 auth/RBAC 安全信号。
4. `alert_events`：记录 failed jobs 等通用运维跟进事项。

这些表保持业务中立。app-owned feature 可以通过 metadata JSON 关联上下文，但 core packages 与 docs 不定义业务指标、parser fields 或业务 workflow 含义。

原因：

Startup kit 需要可复用的运行可见性，而不只是最终 audit rows。分离 event streams 能让 UI 展示 source/import/review provenance，同时让 `audit_events` 保持 compliance trail，安全与告警信号也可独立查询。

### Authenticated App Routes Baseline

Decision:

React starter shell 必须表达有登录态应用的路由结构，而不是只有一个 review-console demo state。

基线路由：

```text
/login
/overview
/sources
/imports
/reviews
/audit
/users
/account
```

规则：

1. 受保护路由要求当前 session，未登录用户跳转到 `/login`。
2. 登录、接受邀请、本地 reviewer bootstrap 成功后进入 authenticated workbench。
3. Account 入口必须出现在 authenticated topbar，并通过 user panel 暴露 Logout。
4. User/invitation management 是真实 app route，由 Worker API 与 RBAC 支撑，不只是测试能力。
5. 路由 shell 保持业务中立；具体业务 feature route 可以在 app-owned 层扩展业务含义。

原因：

面向登录态内部应用的 startup kit，需要在业务功能加入之前就有可信的登录后 shell。这样既保留 FOF 抽象出的 workbench UI baseline，也把用户管理留在 auth/RBAC infrastructure 中，而不是把业务 workflow 塞进 core packages。

### Oodon Shell Interaction Extraction

Decision:

以成熟的 oodon shell 作为交互结构参考，但不把它的 router、query、state 或 animation stack 迁移进 qitu。

提炼规则：

1. 一级导航保持少量业务中立分组。
2. 当前分组下的现有 route 作为二级导航展示。
3. 提供真实可用的 `Cmd/Ctrl+K` command search 入口。
4. 登录后的 user panel 承载 profile、RBAC role、允许时的 user management、theme 切换和 logout。
5. 通过 design tokens 支持 light、dark、system theme preference。
6. route memory 只存在 session 内，且只存 route id。
7. 桌面端 route navigation 不使用 side rail。
8. 桌面端一级 route control 采用 oodon 式纯 icon button + 相邻 live label，二级 route tab 使用 text-only，紧凑搜索和 theme 使用纯 icon，宽屏搜索使用 icon + text + shortcut，人员 trigger 使用 avatar/initial + chevron。

原因：

qitu 需要继承源产品里更成熟的 app-shell 行为，但不能继承产品词汇，也不应在 starter 尚未证明需要前引入更重的框架依赖。

### Oodon Visual Style Extraction

Decision:

以 oodon 作为 qitu 非业务视觉层参考，同时保留 qitu 自己的语义 token 名称和 reusable package 边界。

提炼规则：

1. 背景、surface、线条与文字使用 OKLCH 紫灰中性色。
2. 页面层优先使用 `--surface`、`--surface-glass`、`--surface-elevated`，不再散落 RGB 色值。
3. 控件保持 28/32/36px 紧凑尺度，并共享 radius、focus、motion tokens。
4. 状态色采用柔和 chroma lime/lilac/pink，而不是页面内一次性的高饱和 green/blue/amber。
5. shadow 主要用于 overlay 与 active affordance；普通 panel 依靠 tone、细线和克制 inset highlight 表达层级。
6. field、list action、icon chip、avatar trigger、overlay、table cell 等重复样式集中在 `packages/ui`。

原因：

qitu 应继承 oodon 更成熟的视觉质感，但不能复制业务语义，也不能让样式决策继续散落在 app 页面。保持 qitu token 名称稳定，可以让后续 app-owned feature 复用同一套视觉系统，而不依赖 oodon 内部实现。

### Shared Control Refinement Contract

Decision:

将 topbar action、keyboard shortcut、form field、avatar trigger 和只读 label/value row 的精修规则放进共享 UI utilities，而不是继续用页面级 Tailwind recipe 临时拼。

规则：

1. Topbar actions 共用 36px track；紧凑工具使用纯 icon，宽屏搜索使用 icon + label + shortcut。
2. Keyboard shortcut 使用共享 20px kbd primitive。
3. Form input 与 select 使用 32px control height、共享 radius、input tokens 与 focus ring。
4. Account/runtime 字段使用共享只读 label/value grid，并保持稳定截断与 tabular value styling。
5. User identity trigger 使用 36px button，包含 32px avatar/initial 与 chevron；logout 等账号动作留在 user panel 内。

原因：

第一版 qitu shell 在对齐、比例、阴影和 form row 上暴露了视觉漂移：同一套 oodon pattern 被页面内 ad hoc 重写后很难保持精修感。把 control contract 收进 `packages/ui`，可以保持 starter 可复用，也避免每个 app 页面重复近似同一套 primitive。

### Oodon Design System Parity

Decision:

将 oodon 的 design system 视为 qitu 非业务 UI 层的源系统，而不是继续局部参考、局部重写。

规则：

1. 在 `packages/design-system` 镜像 oodon 的 semantic color tree，并把 qitu 旧变量名保留为兼容别名。
2. 桌面端 topbar primary navigation 保持纯 icon route buttons，并保留 divider 与相邻 live label。
3. Topbar 一级和二级 tabs 使用 oodon 的 chroma active indicator token。
4. Topbar 不画底部分割线；内容区分依靠 spacing 和 surface tone。
5. 普通 panel 使用 card/surface tone 表达层级；除 overlay 或 active affordance 外，不再加页面级 panel border 或 shadow。
6. 所有迁移的 design-system 规则保持业务中立；不导入 oodon 的产品词汇、router、data fetching 或 animation stack。

原因：

之前“参考 oodon”的实现仍然允许 qitu 自己在色值、线条、阴影和 tab alignment 上发生漂移。作为 startup kit，qitu 应在视觉系统层完整保留已验证的源设计系统，只翻译命名、路由和产品语义。

### Surface Hierarchy Contract

Decision:

将 qitu 的 surface、shadow 与层级规则集中到 `packages/design-system` tokens 和 `packages/ui` utilities 中。

规则：

1. 普通页面 panel 使用 `.qitu-surface`，对应 `--surface-panel`、`--surface-panel-border` 与轻微 inset highlight。
2. 内嵌 row、metric、guardrail、timeline、empty/data state 使用 `.qitu-surface-subtle`，对应 `--surface-row` 与 `--surface-row-border`。
3. Hover 与 selected state 使用 `--surface-row-hover`、`--surface-row-active` 与 `--shadow-active-ring`；页面代码不再临时发明 active row shadow。
4. Form、只读 row、table cell、icon chip、badge、segment tab、skeleton 和 button 消费共享 row/control tokens，而不是直接选择 `surface-glass` 或 `surface-elevated`。
5. Search dialog、popover、user panel 额外使用 `.qitu-overlay-surface`，对应 `--popover` 与 `--shadow-overlay`；普通 panel 不使用 overlay shadow。
6. Shell 与 overlay 层级使用 `--z-shell`、`--z-shell-front`、`--z-overlay-backdrop` 与 `--z-overlay`，不使用页面内局部 z-index 数字。

原因：

第一轮 oodon parity 修正了 topbar 结构，但 card、row、field、shadow 和 overlay 仍然存在视觉漂移。Startup kit 需要可扫描、可复用、可执行的 UI 语义，而不是逐页近似同一套视觉效果。

### Tonal-First Surface Flattening

Decision:

收敛 qitu 的 surface contract：普通页面层级优先靠 tonal fill，而不是可见 border。

规则：

1. Light mode 在 app background、topbar、panel 和 row 之间使用统一的紫灰背景色系；避免 white 到 background 的页面渐变。
2. `.qitu-surface` 与 `.qitu-surface-subtle` 可以保留结构性 border 以稳定尺寸，但默认应为透明。
3. 可见线条只保留给 input、focus state、overlay 与 table separator 等真正承担交互或扫描结构的位置。
4. Overlay panel 因为浮在 workbench 上，可以保留很淡的 border 与 overlay shadow。
5. 页面代码不应通过新增局部 panel border 来补救对比不足；应调整共享 surface tokens。

原因：

第一轮 light/dark parity 之后仍然有过多可见描边，尤其在 light mode 中，panel、row 与 page background 都过于接近白色。业务中立 startup kit 应默认继承 oodon 式扁平层级模型，让后续 app-owned 页面自然复用同一套安静的层级，而不是逐页调 border。

## Pending

1. Code generation 应属于 core 还是独立 CLI。
2. React Fast Refresh 是否应通过 Vite+ compatible React plugin path 恢复。

# Roadmap

`qitu` 应通过真实 vertical slices 演进，而不是通过猜测式泛化扩张。

## Phase 0: Architecture Seed

状态：

```text
baseline complete
```

目标：

1. 建立项目身份。
2. 定义 package boundaries。
3. 定义 agent entrypoints。
4. 定义第一条 vertical slice。
5. 保持 core business-neutral。

退出标准：

1. `README.md` 清晰解释项目。
2. 架构文档描述 reusable core。
3. Agent docs 告诉 Codex、Claude Code 和 planning agents 如何工作。
4. 理解 core 不需要任何业务特定词汇。

## Phase 1: Skeleton App

状态：

```text
done
```

目标：

1. 创建 workspace structure。
2. 增加 React app shell。
3. 增加 Worker API shell。
4. 增加 shared config package。
5. 增加 DB migrations。
6. 增加 typecheck、tests、migrations 的本地命令。

当前状态：

1. App shell 可渲染，本地 reviewer setup/login UI 已接 Worker API。
2. 部署准备包含 local、preview、production binding stubs、same-origin Worker Static Assets 和 Queue DLQ config。

## Phase 2: First Vertical Slice

状态：

```text
baseline complete
```

目标：

1. Invite user。
2. 从 invite 注册。
3. 邮箱密码登录。
4. 上传 source file。
5. 存入 R2。
6. 创建 import job。
7. 异步处理 job。
8. 写 staging records。
9. Review 并 approve records。
10. Commit business-owned records。
11. 写 audit events。

已完成 P0 baseline：

1. Auth bootstrap。
2. Source file intake。
3. Import job state machine。
4. Review staging and approval。
5. Commit with audit。
6. Password reset and email delivery baseline。
7. Emailed invite 和 password-reset landing pages。
8. app-owned starter feature 的 adapter-driven parse/stage/validate/commit。
9. Failure visibility、failure classification、manual retry controls。
10. Browser coverage 覆盖 approved/commit 与 rejected review decisions。
11. 第二个 JSON records feature adapter，用来证明 registry path。
12. AI advisory artifacts、本地 deterministic generation、human confirm/dismiss、web panel、audit。
13. Minimal RBAC：邀请分配角色、写路由守卫、read-only viewer、audited denials。
14. Adapter validation edge-case：非法数字留在 review，并阻止 commit。
15. DLQ 与 failed-job remediation runbook，以及只读 D1 failed-job snapshot command。

剩余 P1 follow-up：

```text
None
```

未来 production hardening 可以在真实队列运行证明需要后，增加自动 DLQ consumer。

当前验证：

1. `vp run smoke` 覆盖从 invite 到 audit visibility 的 Worker handler path，使用 local D1/Email/R2/Queue fakes。
2. React console 调用 Worker API client 完成 setup/login/password reset、upload、source files、jobs、local queue drain、review decisions、AI advisory、commit、manual retry、audit。
3. `vp run test:worker-runtime` 使用官方 Cloudflare Vitest pool 验证 Workers runtime 中的 `/health` 和未登录上传拒绝。
4. `vp run smoke:browser` 启动本地 Web/Worker dev，并在 Chromium 中跑 invite、reset、login、upload、queue drain、approve、commit、reject、audit。
5. `vp run ops:failed-jobs` 提供 failed、queued、processing import jobs 的只读 operator snapshot。

## Phase 3: Second Feature Test

状态：

```text
baseline complete
```

目标：

1. `examples/json-records` 增加第二个 concrete feature。
2. 复用 auth、file、job、review、audit、email packages。
3. Worker registry 通过 `.json` filename 或 `application/json` content type 选择它。

退出标准：

1. 第二个 feature 不增加 core 概念。
2. Core package contracts 不变。
3. Smoke 和 Worker integration 独立验证 optional examples。

## Phase 4: Extraction Quality

状态：

```text
baseline complete; future extraction hardening tracked
```

目标：

1. 稳定 package APIs。
2. 维护 new apps 与 new feature slices 的 templates。
3. 增加 generated apps smoke tests。
4. 增加 release notes 和 upgrade notes。

当前验证：

1. `templates/app/manifest.json` 由 smoke 检查 missing copy paths。
2. `templates/feature` 是 workspace package，带 typechecked `ImportFeatureAdapter` 和 app-owned registry starter。
3. Release/upgrade notes 描述当前 starter baseline 和安全采用路径。

## Completion Gate

最终目标由 `docs/kit-completion.zh-CN.md` 定义。

项目只有在以下条件满足时才算完成：

1. Roadmap 中所有 P0 已实现。
2. `docs/capability-matrix.md` 与实际实现一致。
3. `vp run verify:kit` 通过。
4. 本地 clean D1 migration 可应用。
5. 第一条 vertical slice 不需要手工数据库编辑即可完成。

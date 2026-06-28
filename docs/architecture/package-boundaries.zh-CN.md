# Package 边界

Status: draft  
Date: 2026-06-27

本文定义 `qitu` 中 core package、app code、examples、templates 的边界。

## 总原则

```text
core owns reusable application capability.
features own business meaning.
```

Core package 只表达通用应用能力。业务术语、业务计算、业务表结构、业务报表不进入 core。

## Core 可以拥有

1. Auth primitives。
2. RBAC roles/permissions。
3. Source file metadata。
4. Import job lifecycle。
5. Import adapter contract。
6. Review issue/decision concepts。
7. Audit event shape。
8. Email message templates。
9. AI advisory artifact shape。
10. UI primitives、tokens、charts。
11. Runtime config parsing。

## Core 不应该拥有

1. 业务字段名。
2. 业务指标。
3. 业务 parser。
4. 业务计算。
5. 业务报表。
6. feature-specific commit semantics。
7. 某个行业的固定目录结构。

## App-Owned Feature Code

业务 feature 可以放在具体 app 内，例如：

```text
apps/worker/src/features/*
apps/web/src/features/*
```

也可以在未来真实需要时抽成 package。但抽 package 前，应先通过 app-local feature 证明边界稳定。

`qitu` 不强制顶层 `domains/*`。不同 app 可能更适合 feature、workflow、bounded context、vertical slice 或 route-based layout。

`apps/worker/src/*` 可以包含 app-local Worker modules，例如 auth route composition、import adapter registry、import job runner、import review routes、audit/email D1 adapters、HTTP route helpers 和 runtime config helpers。这些 Module 可以知道 D1/R2/Queue/Email bindings 与 starter tables，但不能把业务含义搬进 `packages/*`。

## Examples

`examples/*` 是非生产示例，用来证明边界：

1. `examples/import-review`
2. `examples/json-records`

Worker starter 不依赖这些 optional examples。它有自己的 app-owned starter adapters，避免 core 或 app shell 误依赖示例 package。

## Templates

`templates/app` 是 copy manifest，描述如何复制当前 runnable skeleton。

`templates/feature` 是可 typecheck 的 feature starter，包含：

1. `ImportFeatureAdapter` skeleton。
2. app-owned registry starter。
3. README。
4. package/tsconfig，用于在加入业务规则前验证 shape。

## Import 依赖方向

允许：

```text
apps/* -> packages/*
examples/* -> packages/*
templates/* -> packages/*
```

不允许：

```text
packages/* -> apps/*
packages/* -> examples/*
packages/* -> templates/*
core package -> business feature code
```

Worker app 可以注册 app-owned adapters，但 core import-pipeline package 只知道 contract。

## 判断一个能力是否应进入 Core

进入 core 前，至少回答：

1. 它是否业务中立？
2. 第二个 feature 是否也会用它？
3. 它是否减少真实重复，而不是制造抽象感？
4. 它是否可以用 smoke/type/runtime/browser checks 守住？
5. 它是否会让 cloned app 更安全或更容易启动？

如果答案不明确，先留在 app-owned feature code。

# 带版本的派生物

状态：可选配方
日期：2026-07-10

业务计算必须留在 app-owned feature code。当真实 feature 需要持久化计算成本较高的派生结果时，
应使用带版本的 artifact 记录，避免缓存结果在公式或源数据变化后继续被当作当前结果。

## 最小记录

```ts
type DerivedArtifact<T> = {
  artifactKind: string;
  calculationVersion: string;
  generatedAt: string;
  payload: T;
  scopeKey: string;
  sourceDataVersion: string;
  windowKey: string;
};
```

Feature-owned 表可以使用相同字段：

```sql
CREATE TABLE feature_derived_artifacts (
  id TEXT PRIMARY KEY,
  artifact_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  source_data_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  UNIQUE (artifact_kind, scope_key, window_key, calculation_version, source_data_version)
);
```

## 读取规则

1. 当前响应只能使用 `calculation_version` 等于 feature 当前计算版本，且
   `source_data_version` 等于当前已提交源数据版本的 artifact。
2. 旧记录可以为追溯保留，但绝不能作为当前结果返回。
3. 没有当前 artifact 时，可以实时计算并排队刷新，也可以返回显式 pending 状态；必须在
   app-owned feature contract 中选择并固定一种行为。
4. 不得静默回退到过期 artifact。

## 写入规则

1. 源数据版本应由已提交源数据的身份，或其他确定性的 feature-owned 规则生成。
2. Payload、计算版本、源数据版本、请求窗口和生成时间必须在一次写入中持久化。
3. Import commit、source 删除或重放，以及公式版本变化都必须执行或排队一次刷新。

## 公式契约

任何业务公式变更都必须在同一个改动中更新：

1. Feature 的规范计算说明。
2. 可执行 golden fixtures。
3. 计算版本常量。
4. 已存 artifact 的兼容或重建说明。

这是 feature 配方，不是通用 qitu metrics package。把
`templates/feature/derived-artifact-recipe.md` 复制到具体 feature 后，使用 domain-owned
术语替换所有占位名称。

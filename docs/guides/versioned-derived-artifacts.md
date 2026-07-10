# Versioned Derived Artifacts

Status: optional recipe
Date: 2026-07-10

Business calculations belong in app-owned feature code. When a real feature materializes expensive
derived output, use a versioned artifact record so cached results cannot outlive the formula or source
data that produced them.

## Minimum Record

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

A feature-owned table can use the same fields:

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

## Read Rule

1. A current response may use only an artifact whose `calculation_version` equals the active feature
   calculation version and whose `source_data_version` equals the current committed-source version.
2. Older rows remain available for traceability but are never returned as current.
3. When no current artifact exists, either calculate live and enqueue refresh, or return an explicit
   pending state. Choose one behavior in the app-owned feature contract.
4. Do not silently fall back to a stale artifact.

## Write Rule

1. Derive the source-data version from committed source identities or another deterministic feature
   rule.
2. Persist payload, calculation version, source-data version, requested window, and generation time
   in one write.
3. Import commit, source deletion/replay, and formula-version changes must enqueue or perform refresh.

## Formula Contract

Any business-formula change updates these artifacts in the same change:

1. The feature's normative calculation specification.
2. Executable golden fixtures.
3. The calculation-version constant.
4. Compatibility or rebuild notes for stored artifacts.

This is a feature recipe, not a generic qitu metrics package. Copy
`templates/feature/derived-artifact-recipe.md` into the concrete feature and replace all placeholder
names with domain-owned terminology.

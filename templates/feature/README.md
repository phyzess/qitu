# Feature Template

This directory is a copyable, typechecked skeleton for app-owned feature code.

It is intentionally business-neutral. Rename folders, package name, types, and UI labels when a real application adopts it.

## Suggested Shape

```text
feature-name/
  src/
    import-feature.ts
    routes.ts
    review-ui.tsx
    schema.ts
    tests/
```

Use this only as a starting point. A real app may organize feature code under `apps/web/src/features`, `apps/worker/src/features`, `modules`, `workflows`, or another structure that fits the product.

## Boundary

Feature code may depend on core packages:

```text
@qitu/import-pipeline
@qitu/files
@qitu/jobs
@qitu/audit
@qitu/ui
```

Core packages must not import this feature code.

## First Adapter

Start by copying this directory to the destination feature module, then replace the neutral parsing and commit output with app-owned rules.

The template is deliberately runnable:

1. `src/import-feature.ts` implements `ImportFeatureAdapter`.
2. `src/registry.ts` exports an app-owned adapter registry.
3. `vp run --filter @qitu/template-feature typecheck` verifies the copied shape before business rules are added.

The adapter owns:

1. File recognition.
2. Parsing.
3. Staging shape.
4. Validation.
5. Commit rules.

The reusable import pipeline owns:

1. Job lifecycle.
2. Review issue lifecycle.
3. Approve/reject/void flow.
4. Audit handoff.

## Register In An App

Keep registration app-owned. A Worker app can import the copied registry and merge it with any other app-local feature adapters:

```ts
import { featureImportAdapters } from "./features/example/registry";

export const appImportAdapters = [...featureImportAdapters] as const;
```

Do not import the copied feature from `packages/*`. Core packages should stay business-neutral.

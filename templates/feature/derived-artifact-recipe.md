# Derived Artifact Recipe

Use this optional recipe only after the copied feature has a real derived output worth materializing.

- Artifact kind: `<feature-owned kind>`
- Scope key: `<feature-owned identity>`
- Window key: `<bounded calculation window>`
- Calculation version constant: `<version>`
- Source-data version rule: `<deterministic committed-source rule>`
- Missing-current behavior: `<live fallback | enqueue and pending>`
- Golden fixture path: `<path>`
- Rebuild trigger: `<commit/source deletion/version change>`

Invariant: an artifact is current only when both calculation and source-data versions match. Never
serve an older artifact merely because it is the newest stored row.

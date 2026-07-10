# Organization Migration Runbook

Status: template

Owner: `<operator>`

Target: `<preview|production>`
Maintenance window: `<start/end>`

## Inputs

- D1 database: `<database>`
- Migration range: `<from> -> <to>`
- Classification input source: `<secret/env/reviewed artifact>`
- Backup/export location: `<restricted location>`
- Expected organization count: `<count>`
- Expected platform membership count: `<count>`
- Expected organization membership count: `<count>`

Do not paste real account emails, access tokens, or customer identifiers into this document.

## Dry Run

1. Confirm the current Worker version and database target.
2. Export D1 before any persistent write.
3. Apply schema migrations in preview or a restored copy.
4. Run the classification command in dry-run mode.
5. Review proposed organization ownership, platform memberships, organization memberships, and
   rows that cannot be classified.
6. Stop if any row is unclassified or assigned to more than one owner unexpectedly.

Dry-run evidence: `<artifact/link>`

## Apply

1. Apply the schema migration.
2. Deploy code that understands organization and platform memberships.
3. Apply reviewed account/data classification.
4. Do not rewrite historical actor ids; add organization ownership separately.

Apply evidence: `<artifact/link>`

## Read-Only Checks

- [ ] Every tenant-owned row has one valid organization owner.
- [ ] Every active organization has at least one active owner/admin membership.
- [ ] Platform-only accounts are not customer members unless explicitly intended.
- [ ] Support grants are read-only and have a future expiry, reason, and grantor.
- [ ] Disabled/revoked/expired access is rejected.
- [ ] Cross-organization reads require a matching resource grant.
- [ ] Existing auth, source intake, review, commit, and audit smoke paths pass.

Post-apply evidence: `<artifact/link>`

## Rollback

Prepare exact rollback SQL before apply, but prefer restoring the pre-migration D1 export when data
ownership writes cannot be reversed without ambiguity.

Rollback artifact: `<restricted artifact/link>`

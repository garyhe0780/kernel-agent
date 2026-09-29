# Kernel production acceptance report

Status: **Schema incident repaired; authenticated browser and pilot workflow acceptance remain pending.**

Production origin: https://www.fluxuslab.org

## Workspace incident and repair

After BETTER_AUTH_URL was updated to the www origin, unauthenticated MCP discovery correctly returned 401. Workspace loading still failed with Prisma P2022. Sanitized diagnostics were deployed as Worker version `0142d68e-1888-4938-933b-256697cbb84a`.

Production was six migrations behind. The schema lacked six tables and `ChangeSet.kind` / `ChangeSet.executionMode`. Although Prisma attributed the failed query to BusinessRecord, schema inspection identified the missing ChangeSet columns.

All existing migration checksums matched repository SQL. Prisma migrate deploy failed with a generic schema-engine error. The same six reviewed additive migration files were then applied with their migration-history entries in one PostgreSQL transaction using scripts/apply-production-migrations.ts. The transaction committed successfully; no records were deleted.

Evidence:

- `schema-before-repair.json`: missing tables, columns, and migration names.
- `migration-repair.json`: committed migration list.
- `schema-check.json`: no missing expected tables/columns or unapplied migrations.
- `workspace-snapshot.json`: real Kernel owner workspace snapshot loaded successfully against production with database writes disabled. This verifies the database and Kernel query path, not the browser session or deployed HTTP path.

The direct Hyperdrive origin `db.prisma.io` was used with the supplied credentials because the pooled endpoint returned an upstream connection failure. No credentials or record contents are included in these reports. `.env.deploy` is ignored by Git.

The existing `*.fluxuslab.org/*` route was recorded in wrangler.jsonc and confirmed deployed. It has since been narrowed to `www.fluxuslab.org/*`, the configured `BETTER_AUTH_URL` host; the next deployment replaces the wildcard route.

## Remaining acceptance gates

See `fluxuslab-smoke.json` for current timestamped public checks and `fluxuslab-smoke-initial.json` for the original run. These checks do not establish authenticated workflow acceptance.

- Confirm the user's browser workspace reload succeeds.
- Verify owner and scoped agent access, including authenticated MCP discovery.
- Verify worker health and scheduling; distinguish manual advancement from background execution.
- Exercise CRM and project issue journeys, cancellation, rejection, and recovery using docs/PRODUCTION_ACCEPTANCE.md.
- Complete desktop/mobile browser checks and observe pilot participants.

No production accounts, business records, runs, proposals, or model calls were created by verification. Database schema and migration history were changed by the authorized repair.

# Production acceptance pilot

Use this checklist for each release candidate. Public HTTP success does not establish authenticated workflows, migrations, model reliability, or production readiness. Record passed, failed, or not tested for each gate. Do not turn missing evidence into a pass.

## Release record

- Production origin:
- Release commit / Cloudflare version:
- Test date and operator:
- Dedicated pilot workspace ID:
- CRM and project application IDs:
- Smoke report path:
- Workflow evidence paths (no credentials or customer data):
- Open failures / owner / follow-up:
- Decision: not assessed / hold / ready for limited pilot

## Prepare an isolated pilot

1. Create a dedicated workspace named `Kernel production acceptance`. Use synthetic records only. Do not reuse a normal business application or change a real customer's records.
2. Record the release commit and deployed Worker version. Confirm the configured public origin matches BETTER_AUTH_URL.
3. Run `prisma migrate status` against the production database from an authorized environment. Record migration names and status, never the connection string. Confirm all repository migrations, including `202609280001_agent_limits`, are applied. A working landing page cannot verify the database schema.
4. Sign in as the pilot workspace owner. Use separate short-lived operating credentials for CRM and project applications. Do not share secrets in a report, chat, screenshot, or Git commit.
5. Establish how runs will advance. On Cloudflare a dedicated operation worker or explicit advancement is required. Manual advancement demonstrates execution only; it does not pass background-worker readiness.

## Run the read-only smoke checks

From the repository root:

```sh
pnpm accept:production --origin https://YOUR_KERNEL_HOST
```

The command checks public HTML and referenced local assets, missing-guide behavior, legacy workspace redirects, anonymous auth state, and unauthenticated rejection on the session, agent, and MCP surfaces. It does not create an account, record, proposal, run, or model request. MCP `tools/list` uses POST but is read-only.

Reports are written to a timestamped `validation/production/smoke-*.json`. Override with `--report PATH`. A failed automated check exits 1. Exit 0 means the checks that ran passed; the report still marks overall acceptance incomplete until the manual gates are recorded. `skipped` is not passed.

Optional authenticated read-only checks:

- Set `KERNEL_SMOKE_AGENT_TOKEN` in the process environment to a pilot operating credential. The runner checks HTTP discovery and MCP tools; it does not execute them. Run once for each pilot application.
- Put a short-lived owner Cookie header value in a permission-restricted file outside the repository. Pass `--session-file /private/path/cookie.txt --workspace PILOT_WORKSPACE_ID`. Never put a cookie on the command line. Delete the file when finished and sign out of that test session.
- The owner check verifies the selected workspace and requires a healthy worker with zero stalled runs. A missing Cloudflare operation scheduler will fail this gate rather than being silently accepted.

```sh
pnpm accept:production --origin https://YOUR_KERNEL_HOST \
  --session-file /private/path/cookie.txt --workspace PILOT_WORKSPACE_ID
```

The runner does not load `.env` or follow redirects carrying credentials. Reports omit response bodies, credentials, record content, and raw error messages. It checks only the explicitly supplied origin, using HTTPS except for localhost testing. It is not a load test or a security audit.

## Human browser checks

At desktop and approximately 390px mobile width, record:

- Landing architecture and CRM/project walkthrough render; switching the example and walkthrough stage works.
- Docs search finds relevant guides, shows no-results feedback, and mobile Browse guides opens/closes with keyboard and touch. Focus indicators and code scrolling work.
- Open workspace leads to sign-in when logged out. Successful sign-in opens `/workspace`; workspace switching and invitation return links preserve the selected workspace.
- Public pages and docs remain usable when logged out; protected records are not exposed.
- Application assistant, review Inbox, run inspection, and errors fit without horizontal page overflow.

Record actual device/browser and screenshot paths. HTTP/server-render tests do not pass these interaction checks.

## CRM journey

1. Publish a CRM application in the pilot workspace. Verify it starts with no preview records.
2. Create a customer titled `Synthetic acceptance customer`.
3. Issue an operating credential for opportunities: `$create` review, `open` automatic, `convert` review, pinned to the current capability version, expiring in one day.
4. Select that credential in the built-in assistant, opt into granted automatic operations, and request: create exactly one opportunity titled `Synthetic acceptance opportunity`, source `Inbound`, linked to that customer; open it, then convert it. Ask for all three steps with creation and conversion reviewed.
5. Confirm creation pauses for review and no opportunity exists yet. Apply the creation proposal. Confirm the record enters `draft` with the correct customer.
6. Observe automatic `open`; confirm state `open`, no fake human reviewer, and attributable agent history.
7. Confirm conversion pauses for review. Apply it and verify `converted`, a completed 3/3 run, and exactly one opportunity.
8. Repeat the same saved request/idempotency key through the same client. Confirm the same run and no duplicate records. Reload the page; progress persists.

Record the run ID, proposal IDs, terminal record ID, review/automatic/review modes, and attributable actor sequence. Do not record the credential.

## Project journey

Repeat the CRM sequence with a team-issues application:

- Parent: `Synthetic acceptance project`.
- Issue: `Synthetic acceptance issue`, priority `high`, linked to that project.
- Grants: `$create` review, `start` automatic, `complete` review.
- Expected states: `backlog` → `started` → `done`.
- Final evidence: one issue, three applied steps, correct parent reference, and human/agent/human attribution.

## Cancellation and recovery

- Start a separate synthetic reviewed creation and cancel while it waits. Verify the proposal is rejected, the record does not exist, and later steps do not run.
- Cancel a run after one applied step and before the next review. Confirm the applied record remains; cancellation is not rollback.
- Reject a proposal. Confirm later steps stop and Retry cannot overturn rejection; a revised task is required.
- Refresh/reconnect during a run and inspect it through a fresh session. Verify persisted checkpoints and no repeated effects.
- Revoke a dedicated test credential, then retry discovery with that credential. Verify rejection; leave other pilot credentials intact.
- Observe the worker heartbeat from two requests separated by a poll interval. Record the last success time, stalled count, and whether advancement was automatic or manual.

Do not stop production workers, alter production clocks, or generate excess model traffic to force faults. Rate, timeout, and race behavior has isolated automated coverage; any production fault injection needs its own controlled plan.

## Pilot observation

Invite participants through your normal process; this checklist sends no invitations. Ask a builder to publish a supported app and an operator to complete one task with an agent. Observe without coaching first. Record:

- Intended task and whether they completed it.
- Where they hesitated, needed help, or misunderstood an action.
- Whether they understood what was automatic, pending review, failed, or cancelled.
- Whether run evidence gave them enough information to decide.
- Concrete defects, reproduction steps, and severity; avoid invented satisfaction scores.

## Exit criteria and cleanup

Ready for a limited pilot only when required migrations, public/authenticated checks, both synthetic journeys, cancellation/recovery, background operation scheduling (if promised), and browser interaction gates have evidence. Unresolved blocking failures mean hold. An explicitly manual-advance evaluation must be labeled as such.

Revoke test credentials, remove local cookie files, and retain the labeled pilot workspace for audit evidence unless its deletion is separately authorized. Do not delete records or workspaces from a generic smoke runner. Record remaining limitations and the next fixes before expanding the audience.

### Diagnose a schema mismatch

If a sanitized production log reports Prisma `P2022`, configure the production connection string in gitignored `.env.deploy` as `DATABASE_URL="..."`, then run `node --import tsx scripts/check-production-schema.ts` from an authorized environment. The script opens a read-only transaction and reports missing expected tables/columns and unapplied migration names, without logging connection details or data. It does not repair the schema or validate types, indexes, constraints, or migration checksums. Review the report before selecting a migration or repair; do not reset the production database.

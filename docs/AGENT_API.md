# Connect an external agent

Kernel issues two credential kinds. Both use Streamable HTTP at `/api/mcp` with `Authorization: Bearer <credential>`. Clients must support a configured bearer header; OAuth is not available. Use the same server origin as the workspace. Locally this preview is http://127.0.0.1:3002; use HTTPS when deploying remotely. Never place the secret in a URL, commit it, or pass a human session cookie to an external agent.

## Create applications (builder)

From Agents, connect a builder. Name the agent, set expiry (1–90 days), and copy the one-time secret into Cursor, Claude, or another MCP client. The credential is workspace-wide. It does not select an application or operator actions. It cannot call `/api/agent`, read records, or stage operational changes.

Construction tools: `get_application_contract`, `list_blocks`, `list_grammars`, `list_modules`, `list_patterns`, `list_applications`, `list_drafts`, `get_draft`, `save_draft`, `edit_project`, `preview_migration`, `publish_draft`. For a new application, `list_patterns` then `save_draft` with a pattern id, then `publish_draft` without `previewToken`. Listed patterns are purchasing, crm, issues, payments, and support. Pass exactly one of `pattern`, `assembly`, or `definition` to `save_draft`. For assemblies, use the exact module `version` and port `targetVersion` advertised by `list_modules`; omitted versions mean release 1. See [Module extensions](MODULE_EXTENSIONS.md). For a custom application, first call `get_application_contract`; it returns contract version 3, the input JSON Schema, semantic constraints, limits, and the publication workflow. Author new entities and actions within that contract. Unsupported field types, executable code, and unwired blocks remain unavailable. To change a published application, call `edit_project`, `save_draft` with a pattern, revised assembly, or custom definition plus the draft `id` and `expectedVersion`, `preview_migration`, then `publish_draft` with that token. Publishing does not install sample records. Kernel compiles patterns/assemblies and validates custom definitions through the same publication and migration engine. The built-in planner remains catalog-based. Validation errors use `INVALID_INPUT`, with semantic guidance or an `issues` array containing paths, codes and messages (up to 20 issues). Invalid saves do not replace the existing draft.

## Operate a published application

Open a published application → Configure → Agents. Enter an agent name, choose the actions it may propose, and set expiry (1–90 days). Create the credential and copy its secret once into your agent’s secret configuration. It can read every record in this application. It cannot review proposals or publish application changes. An explicit automatic execution grant exposes separate tools that apply selected operations without human review.

## Discover and read

Send `GET /api/agent` with `Authorization: Bearer <credential>`. The credential chooses the application; do not pass a project or workspace. The response includes project metadata, entity fields, scoped action tools, up to 100 records, `nextCursor`, and `staleActions`. Tool `inputSchema` describes the exact staging request body. Follow `GET /api/agent?cursor=<nextCursor>` until nextCursor is null. This is ID pagination over current data, not a frozen snapshot.

## Propose an action

Send `POST /api/agent` with the same Authorization header and `Content-Type: application/json`:

```json
{
  "type": "stage",
  "recordId": "<ID returned by discovery>",
  "action": "<selected action name>",
  "input": {},
  "idempotencyKey": "<unique request key of 8–100 characters>"
}
```

Fill `input` from the discovered action schema. A successful proposal returns `status: staged` and a change object; policy failure returns `status: blocked`, null change, and failed checks. No business record is changed by staging. Reuse the identical key and body for retries. Changing the request or credential under an existing key returns IDEMPOTENCY_CONFLICT.

Poll `GET /api/agent?change=<change.id>` for pending/applied/rejected status. Only the credential that made the proposal can retrieve it here. An owner reviews proposals in the normal application queue.

## Access changes

Scopes pin each selected capability version. After a definition changes, its actions become unavailable; the owner must review and issue a new credential. Invalid, expired, revoked credentials, or an issuing owner’s lost access, block both future use and application of pending proposals. An owner can still reject them. Revoke unused credentials from Configure → Agents. Tokens cannot be recovered; if the creation response is lost, find and revoke the listed credential before creating a replacement.

Common errors: INVALID_CREDENTIAL (401), AGENT_SCOPE (403), STALE_AGENT_SCOPE (409), IDEMPOTENCY_CONFLICT (409), STALE_PROPOSAL (409 during human review). Bearer credentials are refused on `/api/kernel`.

Explicitly granted automatic single-operation execution is supported. Durable, bounded operation runs are supported through `start_run` and `manage_run`. Scoped creation proposals, targeted queries and durable runs are shared by external agents and the built-in application assistant.

## Connect over MCP

Kernel also serves MCP at `/api/mcp` using stateless Streamable HTTP with JSON responses. The credential kind selects the tool set: builder credentials expose construction tools; operate credentials expose `list_records`, `query_records`, `get_proposal`, and scoped `stage_*` tools. The client must support a configured bearer header; OAuth discovery, legacy SSE and stdio transport are not implemented.

Configure these values in your MCP client (the exact configuration file format depends on the client):

| Setting | Value for this local preview |
| --- | --- |
| Transport | Streamable HTTP |
| URL | `http://127.0.0.1:3002/api/mcp` |
| Authorization header | `Bearer <agent credential>` |

Keep the real secret in the client’s secret/environment facility. Set `BETTER_AUTH_URL` to the exact workspace origin when starting the server; MCP validates the request host and any supplied Origin against it. The current preview starts with `BETTER_AUTH_URL=http://127.0.0.1:3002`. A remote client cannot reach another machine’s loopback address; remote deployment is a separate step.

The official TypeScript SDK client can connect with:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const token = process.env.KERNEL_AGENT_TOKEN
if (!token) throw new Error('Set KERNEL_AGENT_TOKEN')
const client = new Client({ name: 'business-assistant', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(
  new URL('http://127.0.0.1:3002/api/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
))
const tools = await client.listTools()
const page = await client.callTool({ name: 'list_records', arguments: {} })
// Inspect records and the discovered action schemas before proposing a change.
await client.close()
```

`list_records` returns entity fields and up to 100 application records; pass its nextCursor as cursor to continue. `get_proposal` takes changeId and returns only proposals made with this credential. Each currently permitted action is a separate `stage_<stable identifier>` tool with a readable title and input schema. Discover the name rather than constructing it. These tools take recordId, input, and idempotencyKey; their entity and action are fixed by the server. They stage a proposal and never apply it. Business-rule failures return an MCP tool error with the failed checks; other failures include a structured code and recovery message.

Every request authenticates independently. There is no MCP session ID, event stream, tool-change notification, or session termination operation. Refresh the tool list after application changes; outdated action tools disappear, and calls to them fail without staging. Credential revocation takes effect on subsequent requests and still prevents pending proposals being applied by the human reviewer.

Implementation references: [official SDK server guide](https://ts.sdk.modelcontextprotocol.io/server) and [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).


## Propose a new record

For an application published through the builder, an owner can select **Create <entity>** in Configure → Agents. This adds an explicit version-pinned `$create` scope for that entity; existing action grants do not gain creation access. Legacy fixed-template applications do not expose creation grants.

MCP discovery then includes a `stage_create_*` tool with the editable fields, defaults and required inputs. Discover its name; do not construct it. Submit `input` and `idempotencyKey`. Kernel-owned fields such as status cannot be supplied. Alternatively:

```json
{
  "type": "stage_create",
  "capability": "<entity capability returned by discovery>",
  "input": { "title": "New opportunity", "source": "Inbound", "customer": "<authorized customer record ID>" },
  "idempotencyKey": "new-opportunity-request-001"
}
```

POST this to `/api/agent` using the bearer credential. The result includes `change.kind: "create"`, a reserved record ID and proposed values. No live record exists until approval. The proposal appears in Inbox and under **New records awaiting review** in the target entity's application view. An owner reviews the fields and relationships, then creates the record or rejects the proposal.

Creation uses the same field/default/reference validation as human record creation. It does not execute lifecycle actions or their transition policies. Approval rechecks the credential, its issuing owner's access, the definition version, and all references. Revocation, expiry, incompatible changes or missing referenced records prevent approval. Rejection remains available. Identical retries return the same proposal, including its applied/rejected state; a different normalized payload or credential under the same key fails. Concurrent approvals cannot create a second record.

## Query relevant records

Call MCP `query_records`, or POST the same fields plus `"type": "query_records"` to `/api/agent`:

```json
{
  "capability": "<entity capability returned by discovery>",
  "filters": [{ "field": "status", "value": "open" }],
  "title": "Acme",
  "limit": 50
}
```

Queries accept up to six typed equality filters combined with AND, including relationship IDs, and an optional case-sensitive title substring. Page size is 1–100 (default 50). Filtering happens in the database; only matching records are returned. Results contain `records`, `definitionVersion`, and `nextCursor`. Pass that cursor with the same query to continue. Cursors are bound to the credential, entity, filter values and definition version. These are live pages, not a frozen snapshot. JSON queries may still scan data; this is not a large-dataset performance guarantee.

## Schema upgrade

Generate the Prisma client and apply migrations before restarting an existing server: `pnpm db:generate` and `pnpm db:migrate`. Migration `202609270001_creation_proposals` adds `ChangeSet.kind` with `action` as the default for existing rows. Creation proposals use `kind: create`, an empty before-state, and record version 0 until approval.


## Owner-controlled automatic execution

Existing credentials and omitted `execution` fields require human review. When issuing an operate credential for a managed application, the owner can choose **Allow <operation> without human review** separately for each selected operation. The credential form shows a warning and identifies automatic access before issuance. No existing grant is upgraded.

The owner API expresses this as an action scope:

```json
{ "capability": "<published capability>", "action": "open", "version": 1, "execution": "automatic" }
```

Use `action: "$create"` for creation. Modes are `review` and `automatic`; omitted means `review`. Duplicate operation scopes are rejected. Modes are immutable with the credential: revoke and reissue to change them. Revocation, expiration, the issuing owner's lost access, and definition changes disable automatic tools just as they disable staging scopes.

MCP advertises `execute_*` tools only for automatic scopes. Their inputs match the corresponding stage tools. **Stage tools always stage for review**, even on automatic credentials. Execute tools immediately apply permitted operations, preserving field, relationship, precondition and business-policy checks. A policy failure returns `blocked` without changing the record. No automatic tool can approve an arbitrary pending proposal or grant further authority.

For direct HTTP, POST to `/api/agent`:

```json
{
  "type": "execute",
  "operation": "action",
  "capability": "<published capability>",
  "recordId": "<record ID>",
  "action": "open",
  "input": {},
  "idempotencyKey": "open-opportunity-001"
}
```

For creation use `operation: "create"`, editable fields in `input`, and omit `recordId` and `action`. The server obtains execution permission from the credential; callers cannot supply or override it. Reusing a review request's key for automatic execution is a conflict.

Successful responses contain `status: applied` and an audited change receipt with `executionMode: automatic`. `reviewedBy` and `reviewedAt` remain null because no person reviewed the operation. Audit events identify the agent and credential. Staging, application, and audit writes share one transaction; failure rolls everything back. Identical authorized retries return the original receipt and do not repeat effects.

Single-operation execution also powers the durable runs below. There are no per-run spending budgets, schedules or external integration effects. The built-in assistant defaults to review and can use automatic scopes only when the owner explicitly enables them for the task. Apply migration `202609270002_agent_execution_policy` and regenerate the Prisma client before restarting existing servers.


## Durable operation runs

`start_run` persists 1–25 ordered steps under this operate credential. Each step defaults to `execution: "review"`; `automatic` requires that operation’s owner-issued automatic scope. No token or model prompt is stored. Steps are deterministic record operations, not a model reasoning loop.

Example MCP `start_run` arguments (HTTP uses the same body plus `type: "start_run"`):

```json
{
  "idempotencyKey": "sales-followup-001",
  "steps": [
    {
      "operation": "create",
      "capability": "<application>__opportunities",
      "input": {"title": "Renewal", "source": "Inbound", "customer": "<customer ID>"},
      "execution": "review"
    },
    {
      "operation": "action",
      "capability": "<application>__opportunities",
      "record": {"step": 0},
      "action": "open",
      "input": {},
      "execution": "automatic"
    }
  ]
}
```

Action `record` accepts either an existing record ID or `{ "step": 0 }` referencing an earlier step’s record. References are zero-based and cannot point forward. All steps must fall within the same credential’s scope. Reusing the submission key with identical steps returns the existing run; different steps conflict.

Use `manage_run` with `{ "runId": "…", "command": "get" }` to inspect `status`, `nextStep`, `receipts`, and `error`. Commands are `get` (default), `advance` (one step), `retry` (failed runs), and `cancel`. HTTP uses `type: "manage_run"`. Only the originating credential can use these agent tools; workspace owners can manage runs through the first-party command endpoint.

Statuses are `queued`, `waiting`, `completed`, `failed`, and `cancelled`. Review steps create ordinary Inbox proposals and wait until applied; rejection fails the run. Retry preserves completed steps and their receipts. Rejected proposals remain rejected, so revise those workflows in a new run. Cancellation rejects outstanding run proposals and stops future steps; already applied records remain. Concurrent changes may return a conflict; retry cancellation in that case.

Each step’s mutation, audit receipt, and checkpoint commit together. The stable operation key is `run:<run ID>:<step index>`. Database rollback leaves a failed step safe to retry. Every execution revalidates current credential, owner membership, definition version, relationships and domain rules. Revocation or expiration stops further work; an owner can still inspect and cancel the run.

Long-lived local servers poll persisted runs automatically, including after restart. `pnpm worker` polls both construction jobs and operation runs against its configured database. Cloudflare request runtimes do not start an in-process poller: call `manage_run` with `advance` or run a dedicated worker against the same database. No automatic Cloudflare workflow dispatch is provided for operation runs yet. A waiting run resumes on the next poll/advance after review.

Apply migration `202609270003_agent_runs` and regenerate Prisma before restarting existing servers. Run definitions and receipts are persisted in `AgentRun`; no provider calls or external effects occur inside the step transaction.


## Built-in application assistant

Workspace owners open the application assistant and choose an existing operate credential from Configure → Agents. The server resolves the credential by ID after checking the owner session and application; its bearer secret is neither required nor sent to the model. Operators and application members cannot impersonate owner-issued credentials through this UI.

The assistant receives `agentSnapshot` with the same scoped creation/action schemas as MCP. It can request up to two `queryRecords` queries per round, for two rounds, followed by a final plan (at most three model calls). It must use observed record IDs or earlier-step references. Unsupported, ambiguous or incomplete tasks can return a persisted `no_action` explanation. Model output is schema-validated; authority, relationships and business policies remain enforced by the runtime.

Submit to the session-authenticated `/api/kernel` endpoint:

```json
{
  "type": "operate",
  "project": "<application slug>",
  "credentialId": "<operate credential ID>",
  "instruction": "Find the customer and create an opportunity",
  "idempotencyKey": "assistant-task-001",
  "allowAutomatic": false
}
```

`credentialId` is now required; the former session-only one-action path has been replaced. `allowAutomatic` defaults to false. Setting it true permits only automatic operations already allowed by the selected credential. It never broadens the grant. The model submits an ordered plan into `startAgentRun`, then normal worker/review behavior applies. The response contains `explanation`, `status`, and `run` (null for no action). The assistant shows the latest ten application runs with progress, errors, advance, retry and cancel controls. Owners can fetch the same list using `GET /api/kernel?operationRuns=<application slug>`.

`EmbeddedOperation` binds a request key to its workspace, owner and exact request. The selected plan is saved before run submission, including no-action outcomes. Retrying a saved plan bypasses the model and uses a stable run key. A changed request with the same key conflicts. Concurrent planners are fenced by a fixed five-minute lease per planning attempt. Provider requests share that deadline even when the general model timeout is configured longer. Only one planning attempt per credential can hold a live lease. After a crash, the same request can recover when the lease expires. A superseded planner cannot save or submit a different plan. Provider calls and queries remain outside the checkpoint transaction. A retry may repeat uncommitted model calls within the durable three-call task budget, but cannot duplicate a committed run.

Owner and credential validity are checked before planning, after model calls, and before run submission. Run execution checks the credential again. Removing owner access or revoking the credential while the model is working prevents submission. The assistant is a bounded planner; it does not schedule tasks or run an open-ended model loop.

Apply migration `202609270004_embedded_operations`, regenerate Prisma, and restart existing servers. Provider behavior is covered with deterministic test responses; this milestone does not establish live-model task accuracy. The prompt keeps untrusted records in the input context and uses a validated output schema, following [official OpenAI agent safety guidance](https://developers.openai.com/api/docs/guides/agent-builder-safety).

### Run inspection and recovery

`manage_run` responses now include `inspection`, `history`, and `recovery` alongside the existing run fields. Each inspected step contains its planned operation/input, execution mode, derived status, an existing record ID when available, and its proposal evidence (`input`, `before`, `after`, checks, review identity/time). Proposal `after` is the proposed result at that step, not the current record state. Applied steps remain applied after cancellation. History contains the latest 50 run start/retry/cancel and receipt audit events, newest first.

Reads retain the existing workspace-owner or originating-credential authorization and current credential checks. Receipt joins also require the run's workspace and credential. The embedded assistant's recent-run list uses this same authorized projection; owners can inspect runs even when their original credential has expired or been revoked.

`recovery` supplies `canRetry` and a human-readable message. Rejected proposals and invalid/stale agent access require a revised task; retry requests for those failures return `RUN_REPLAN_REQUIRED` (409). Other failures may be retried after resolving the cause, using the saved checkpoint and step idempotency keys. Cancellation never undoes applied effects.

The assistant exposes expandable step evidence and history, a review-inbox link, and navigation to existing records. Review links open the workspace inbox; the displayed proposal ID identifies the relevant review. No new database migration is required for inspection.


### Execution limits and worker monitoring

The shared runtime enforces these defaults for embedded and external operate agents:

| Limit | Default | Recovery |
| --- | --- | --- |
| Active runs per credential | 5 queued/waiting runs | Finish or cancel one; failed-run retry also checks capacity |
| New operation proposals per credential | 60 in a rolling minute | Retry the same key later; run workers leave the step queued |
| Run lifetime | 7 days from creation, including human review | Pending proposals are rejected on the next worker poll; start a revised task |
| Concurrent planning per credential | 1 live planning lease | Wait for completion or lease expiry |
| Model requests per task | 3 across all retries, including failures | Start a smaller new task |
| Model requests per credential | 30 in a rolling hour | Retry after older reservations leave the window |
| Planning duration | 5 minutes per attempt | Provider request aborted; attempted calls remain charged |
| Planning context | 200,000 UTF-8 bytes per call | Narrow the scope or use targeted external tools |
| Scoped planner output | 4,096 output tokens per call | Shorten the task if the provider reports truncation |

These are server defaults in `agent-limits.server.ts`, not editable credential permissions. Credential-row locks serialize quota admission across processes. Replayed proposals/runs return their prior result without consuming additional capacity. Human operations are outside the agent operation quota. Read requests and rejected policy checks are not request-rate-limited by this mechanism. The model budget applies to the embedded operational planner, not application construction or externally hosted agents. Counts and payload/output bounds are resource limits, not a currency spending guarantee.

Run expiry is checked before each worker step and before applying an outstanding run proposal; manual approval cannot bypass a passed deadline while a worker is offline. Applied changes remain. An already-applied receipt can still be read or replayed. Review-waiting runs are not labeled stalled. A queued run with no update for 60 seconds is marked `stalled` in inspection and includes `deadlineAt`.

`GET /api/kernel?operationHealth=1` requires an authenticated workspace owner and returns shared worker status (`healthy`, `degraded`, `unavailable`), last successful/failed poll times, this workspace's stalled count, and defaults. It exposes no other workspace's run information or error content. The assistant displays heartbeat status and run deadlines. Both the local runtime and `scripts/build-worker.ts` persist heartbeats after polling; a successful poll clears degraded status. A healthy heartbeat means the polling loop is alive, not that every run succeeded. Explicit `manage_run: advance` does not claim a background worker is connected.

Deploy migration `202609280001_agent_limits` and regenerate Prisma before restarting web/worker processes. Embedded PGlite applies pending migrations through the existing database opener; PostgreSQL uses `prisma migrate deploy`. No running user database was migrated during this implementation. Cloudflare still needs a dedicated operations worker or explicit advancement; this milestone does not add a Cloudflare scheduler. Reservation rows are retained; production retention/cleanup remains a separate task.

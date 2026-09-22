# Connect an external agent

Kernel issues two credential kinds. Both use Streamable HTTP at `/api/mcp` with `Authorization: Bearer <credential>`. Clients must support a configured bearer header; OAuth is not available. Use the same server origin as the workspace. Locally this preview is http://127.0.0.1:3002; use HTTPS when deploying remotely. Never place the secret in a URL, commit it, or pass a human session cookie to an external agent.

## Create applications (builder)

From Agents, connect a builder. Name the agent, set expiry (1–90 days), and copy the one-time secret into Cursor, Claude, or another MCP client. The credential is workspace-wide. It does not select an application or operator actions. It cannot call `/api/agent`, read records, or stage operational changes.

Construction tools: `list_blocks`, `list_grammars`, `list_modules`, `list_patterns`, `list_applications`, `list_drafts`, `get_draft`, `save_draft`, `edit_project`, `preview_migration`, `publish_draft`. For a new application, `list_patterns` then `save_draft` with a pattern id, then `publish_draft` without `previewToken`. Listed patterns are purchasing, crm, issues, payments, and support. You may pass a catalog assembly instead when no pattern fits. Do not invent entities or unwired blocks. To change a published application, call `edit_project`, `save_draft` with a pattern or revised assembly, `preview_migration`, then `publish_draft` with that token. Publishing does not install sample records. Kernel compiles the pattern or assembly; the favorite agent is the assembler.

## Operate a published application

Open a published application → Configure → Agents. Enter an agent name, choose the actions it may propose, and set expiry (1–90 days). Create the credential and copy its secret once into your agent’s secret configuration. It can read every record in this application. It cannot apply proposals or publish application changes.

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

Automatic application, record-creation proposals and multi-step jobs remain future work.

## Connect over MCP

Kernel also serves MCP at `/api/mcp` using stateless Streamable HTTP with JSON responses. The credential kind selects the tool set: builder credentials expose construction tools; operate credentials expose `list_records`, `get_proposal`, and scoped `stage_*` tools. The client must support a configured bearer header; OAuth discovery, legacy SSE and stdio transport are not implemented.

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

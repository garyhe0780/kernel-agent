# Implementation architecture

## Stack and boundaries

TanStack Start serves the React workspace and API routes. Tailwind semantic tokens style shadcn components backed by React Aria. Better Auth authenticates email/password sessions through its Prisma adapter. Prisma persists the kernel and account models in local SQLite. pnpm is the package manager.

`src/kernel/definition.ts` defines and evaluates declarative contracts with no framework or database dependency. `src/kernel/engine.server.ts` owns tenant authorization, persistence, transactions, proposal lifecycle, and publication. `src/lib/api.server.ts` binds trusted sessions to principals and translates HTTP commands. React consumes serialized snapshots; it does not import database or authentication secrets.

## Data strategy

Prisma models platform-owned objects. Customer-defined entity data is stored as validated JSON in BusinessRecord, paired with a capability name, entity name, tenant, and version. Changing policy settings requires no Prisma generation. This is a deliberate first-version storage choice. Large indexed customer datasets will require typed projected columns or dedicated tables and a migration engine; JSON storage is not a claim of unlimited query performance.

## Transactions and versions

Every apply executes in one database transaction: verify membership and review role, load the pending proposal, compare the record and definition versions, recheck the original proposer's current role, reevaluate rules/effects, conditionally update the record and proposal, and insert an execution event. An exact repeat returns the applied proposal without repeating effects. Conflicting proposals remain pending so the reviewer can reject and replace them.

Staging keys are unique per workspace and bound to proposer, actor kind, action, record, and normalized input. Clients must retain the key when retrying an uncertain response. Validation failures do not reserve the key. SQLite serializes local writes; a production multi-instance deployment should use PostgreSQL and a tested retry strategy for transient transaction errors.

Capability changes publish a new immutable version plus an audit event. Existing proposals cannot apply under a different definition version. This simple policy is conservative and explicit. Schema migration, running-workflow migration, and undo of external side effects are separate future concerns.

## Identity and agent boundary

The server obtains user ID and workspace membership from the Better Auth session. Request input cannot select a workspace or actor. `/api/agent` assigns actor kind `agent` and accepts staging only. `/api/kernel` is the first-party human surface. Both use the same kernel methods. Cookie writes require an allowed Origin.

This is a local trusted-client boundary, not cryptographic proof that a person clicked a button: code with a human session can call human routes. Production external agents need separate scoped credentials that cannot access host review endpoints; stronger approval can use reauthentication or signed approval challenges. Do not give an external agent the human session cookie and expect route naming to isolate it.

The first version gives each account a private workspace and owner role. The database model intentionally permits only one membership per user until explicit workspace selection and invitation flows are implemented. Agent approvals are always staged; configuration changes are direct owner publication after an explicit UI action.

## Extension seams

The evaluator consumes a Definition rather than procurement constants. Procurement bootstrap and the initial settings editor are product-specific. To add a second capability, move bootstrap into a package registry and make capability selection explicit in the human API and UI. Keep the generic evaluator free of vertical-specific conditions.

A future model adapter discovers contracts, reads authorized records, and invokes the agent staging endpoint. The first UI uses a deterministic simulator so model credentials are not needed. Nothing in this version performs external purchasing or executes arbitrary configuration code.

## Verification

The integration suite creates an isolated SQLite database from the committed migration. It tests policies, identity boundaries, idempotency, stale definitions/records, rejected changes, reserved-field injection, and execution history. App HTTP verification covers real sign-up/session cookies and protected endpoints. UI accessibility comes from React Aria primitives and semantic composition; that does not replace a full browser and assistive-technology audit.

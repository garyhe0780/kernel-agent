# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user (hypothesis, not validated market research): a small operations team running an internal purchasing process. People and agents both act on the same purchase requests. Other audiences are not confirmed.

## Product Purpose

Kernel is a configurable business platform where people and agents use the same domain actions. A versioned business definition describes entities, actions, policies, and lifecycle rules. The server interprets that definition, enforces permissions, stages consequential changes, and records execution.

Success: a new user can create a request and review an agent-proposed change with no setup beyond starting the app; changing a configured approval limit changes the policy outcome without editing application code.

## Positioning

The kernel is a generic evaluator of a versioned definition, not a procurement app with hardcoded rules. Neighboring tools that execute agent actions immediately, or that bake vertical conditions into the runtime, cannot truthfully claim this: Kernel stages effects, requires a human apply that rechecks definition and record versions, and keeps tenant boundaries in the transaction.

## Operating Context

Local development: TanStack Start, Better Auth email/password, Prisma + SQLite. `pnpm setup` then `pnpm dev` on `http://127.0.0.1:3000`.

Workflow:

1. Create an account and a private workspace with example procurement data.
2. Inspect requests in the operations workspace.
3. A person or an agent proposes an action on a request.
4. The kernel validates the actor, current state, input, and business policies.
5. A persistent change proposal shows before/after values and validation results.
6. An authorized human applies or rejects the exact proposal. Apply rechecks the current definition and record version, and writes the record, proposal status, and execution event transactionally.
7. Edit policy configuration as a new definition version. Prior proposals cannot silently adopt a new definition.

Screens that exist: login (create account / sign in); Workspace (search, status filters, new request, detail/action); Review queue (diff, checks, apply, reject); Capability (policy configuration, contracts, JSON definition); Activity (execution outcome, actor, record, time). Each account owns its own workspace; records are not shared across accounts by default.

## Capabilities and Constraints

Included in the first version: Better Auth email/password sessions; private workspaces; versioned JSON capability definitions; validated entity creation; data table and record detail; shared action engine; persistent proposals; approval/rejection; optimistic concurrency; action idempotency; policy editor; definition inspector; execution history; agent tool contract discovery and execution via authenticated HTTP; deterministic agent simulator; SQLite through Prisma.

The simulator is labeled as not a live model. It selects and stages a defined action. It does not call a language model or claim to interpret arbitrary language. No purchase order is sent, money moved, or external supplier contacted.

Deferred: live LLM orchestration, external machine credentials/MCP transport, organization invitations and role-management UI, arbitrary visual schema building, durable multi-step jobs, third-party integrations, field-level authorization, deployment hardening, and a marketplace. The MVP is not a completed general-purpose NocoBase replacement.

Terminology: Entity (fields, validation, versioned records); Action (input schema, roles, preconditions, policies, effects); Policy (declarative comparison over record data and capability settings); ChangeSet (immutable proposed effects, versions, proposer, actor kind, validation snapshot, lifecycle); Execution (append-only events written with the transaction). Skills describe how to choose actions; they do not grant permission. The model never supplies the authenticated user or workspace. Agents may stage; they cannot invoke the host approval endpoint as an agent transport. Outcomes: blocked, staged, applied, rejected, conflict.

Undecided: whether Kernel remains the lasting product name (current working name, September 2026); whether the first customer hypothesis will hold after operator validation.

## Brand Commitments

Working name: Kernel. Voice: precise, operational, non-theatrical. Binding interface constraint already stated by the product record, recorded without expansion: a quiet operations workbench with dark ink navigation, cool white working surfaces, cobalt actions, amber review states; dense enough for actual work; a persistent indication that distinguishes the simulator from a live agent.

## Evidence on Hand

Seeded example purchase requests in workspace bootstrap (`src/kernel/engine.server.ts`). Kernel integration tests in `tests/kernel.test.ts`. No operator interviews, customer testimonials, press, or production usage data. Future work must not fabricate those.

## Product Principles

- People and agents share the same actions and the same validation result.
- Consequential writes are staged; only a human apply commits them, and apply rechecks versions.
- Policy is data: publishing creates an immutable definition version; old proposals cannot silently adopt it.
- Isolation is default: another workspace cannot read or mutate records, including via direct API calls.
- The first vertical (procurement) must not leak conditions into the execution engine.

## Accessibility & Inclusion

No product-specific accessibility standard has been established. Undecided.

## Success criteria

- A new user can create a request and review an agent-proposed change without setup beyond starting the app.
- Editing a configured approval limit changes the policy outcome without editing application code.
- Requests from another workspace cannot be read or mutated, including direct API calls.
- A duplicate apply cannot duplicate effects; a changed record or capability produces a conflict.
- Every successful state transition has an attributable execution event.
- UI and agent calls to the same action produce the same validation result.

## Roadmap

1. Validate the local procurement loop and policy model with real operators.
2. Add one live model adapter, scoped machine credentials, and a second capability (e.g. expense reimbursement) to test the abstraction.
3. Add invitations, separation-of-duties policies, durable execution, and external adapters.
4. Build the visual capability editor on the validated definition format; introduce package versioning and migration previews.

## Reference lessons

Anthropic commerce-agents separates runtime adapters from action execution, stages merchant changes, keeps authoritative UI data server-side, and treats deployment authorization as the implementer's responsibility. Kernel generalizes those patterns into configurable product primitives. It adds persisted definition versions, tenant boundaries, and transactional conflict checks rather than claiming these come ready-made from the reference.

References: https://github.com/anthropics/commerce-agents, https://github.com/anthropics/commerce-agents/blob/main/docs/safety.md, https://github.com/anthropics/commerce-agents/blob/main/docs/backends.md

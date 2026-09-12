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

1. Create an account and a private workspace with Site, Procurement, operations, and Audit projects.
2. Open a project to do the work: Procurement for purchase requests; Site for the journal; CRM, Orders, Help desk, Project management, IT assets, or HR for those queues; Audit for findings and staged assessments. Drafts stay in the project until apply commits them.
3. Open the live journal at `/s/:workspaceId`: published pages and notes only.
4. A person or an agent proposes an action on a record in that project.
5. The kernel validates the actor, current state, input, and business policies.
6. A pending change sits on the record. An authorized human applies or rejects it. Apply rechecks the current definition and record version, and writes the record, proposal status, and execution event transactionally.
7. Owners configure packages, policies, and the simulator at `/p/:projectSlug/build`. Publishing a policy creates a new definition version. Prior proposals cannot silently adopt it.

Screens that exist: login (create account / sign in); workspace home (project list); Procurement queue at `/p/procurement`; Site journal at `/p/site` (editorial, including drafts); CRM, Orders, Help desk, Project management, IT assets, and HR queues at `/p/crm`, `/p/orders`, `/p/helpdesk`, `/p/projects`, `/p/assets`, `/p/hr`; Audit register at `/p/audit`; owner configure at `/p/:projectSlug/build`; public site at `/s/:workspaceId` (published Site hero and Blog notes only). Each account owns its own workspace; records are not shared across accounts by default. The public site is labeled as seeded example data.

## Capabilities and Constraints

Included in the first version: Better Auth email/password sessions; private workspaces; projects that own an app shell and a package list (Site, Procurement, CRM, Orders, Help desk, Project management, IT assets, HR, Audit); a package catalog (Procurement, Site, Blog, the six operations packages, and Audit) that installs as versioned JSON capability definitions; public composition of the Site project's packages that declare a view (`hero`, `article-list`, or `none`); validated entity creation; data table and record detail; shared action engine; persistent proposals; approval/rejection; optimistic concurrency; action idempotency; policy editor; definition inspector; execution history; agent tool contract discovery and execution via authenticated HTTP; deterministic agent simulator; SQLite through Prisma.

The simulator is labeled as not a live model. It selects and stages a defined action. It does not call a language model or claim to interpret arbitrary language. No purchase order is sent, money moved, or external supplier contacted. Audit assessments are the same class of staged action; they are not live evidence analysis.

Deferred: live LLM orchestration, external machine credentials/MCP transport, organization invitations and role-management UI, arbitrary visual schema building, durable multi-step jobs, third-party integrations, field-level authorization, deployment hardening, and a marketplace. The MVP is not a completed general-purpose NocoBase replacement.

Terminology: Project (an app shell plus the packages installed in it); Package (a capability definition plus a public view kind; an element of a project); Entity (fields, validation, versioned records); Action (input schema, roles, preconditions, policies, effects); Policy (declarative comparison over record data and capability settings); ChangeSet (immutable proposed effects, versions, proposer, actor kind, validation snapshot, lifecycle); Execution (append-only events written with the transaction). Skills describe how to choose actions; they do not grant permission. The model never supplies the authenticated user or workspace. Agents may stage; they cannot invoke the host approval endpoint as an agent transport. Outcomes: blocked, staged, applied, rejected, conflict. The public site reads published records from the Site project only; it cannot stage or apply.

Undecided: whether Kernel remains the lasting product name (current working name, September 2026); whether the first customer hypothesis will hold after operator validation.

## Brand Commitments

Working name: Kernel. Voice: precise, operational, non-theatrical. Binding interface constraint already stated by the product record, recorded without expansion: a quiet operations workbench with dark ink navigation, cool white working surfaces, cobalt actions, amber review states; dense enough for actual work; a persistent indication that distinguishes the simulator from a live agent.

## Evidence on Hand

Seeded example purchase requests, site page, blog notes, and operations-queue records in workspace bootstrap (`src/kernel/engine.server.ts`, `src/kernel/packages.ts`, `src/kernel/suite.ts`). Kernel integration tests in `tests/kernel.test.ts`. No operator interviews, customer testimonials, press, or production usage data. Future work must not fabricate those.

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
- Published Site and Blog records appear on `/s/:workspaceId`; drafts and procurement records do not.

## Roadmap

1. Validate the local procurement loop and policy model with real operators.
2. Add one live model adapter, scoped machine credentials, and a second capability (e.g. expense reimbursement) to test the abstraction.
3. Add invitations, separation-of-duties policies, durable execution, and external adapters.
4. Build the visual capability editor on the validated definition format; introduce package versioning and migration previews.

## Reference lessons

Anthropic commerce-agents separates runtime adapters from action execution, stages merchant changes, keeps authoritative UI data server-side, and treats deployment authorization as the implementer's responsibility. Kernel generalizes those patterns into configurable product primitives. It adds persisted definition versions, tenant boundaries, and transactional conflict checks rather than claiming these come ready-made from the reference.

References: https://github.com/anthropics/commerce-agents, https://github.com/anthropics/commerce-agents/blob/main/docs/safety.md, https://github.com/anthropics/commerce-agents/blob/main/docs/backends.md

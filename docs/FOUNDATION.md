# Foundation direction

Status: architectural direction recorded on 2026-09-27. Milestones 1, 2 and 3 are implemented; later milestones remain planned work. Verification evidence is recorded below.

## Purpose

Kernel supplies the reusable structure and runtime for agents to create business applications and work inside them. Each published application exposes a human interface and structured agent capabilities over the same business definitions. CRM and project management exercise that contract across different domains.

An application is a versioned definition running on Kernel. The foundation owns identity, validation, persistence, execution, and history. Business modules describe domain behavior. Agents assemble applications and choose permitted operations; the runtime remains responsible for accepting and executing those operations.

## Boundaries

| Boundary | Responsibility | Existing starting point |
| --- | --- | --- |
| Application contract | Entities, typed fields, relationships, actions, policies, views, and layouts | `src/kernel/definition.ts`, `application.ts`, `application-views.ts`, `application-layouts.ts` |
| Business modules | Reusable domain definitions, link ports, and default surfaces | `src/kernel/modules.ts`, `patterns.ts`, `assembly.ts`, `compile.ts` |
| Construction | Plan, assemble, validate, preview, publish, and evolve definitions | `src/kernel/build-workflow.server.ts`, `build-pipeline.server.ts`, `migration.ts`, draft/publication methods in `engine.server.ts` |
| Runtime | Resolve identity and scope; validate, persist, stage, review, and audit operations | `src/kernel/engine.server.ts`, `agent-access.server.ts`, `commands.ts` |
| Human interface | Render the published contract and submit domain operations | `src/components`, `src/routes`, `src/lib/api.server.ts` |
| Agent adapters | Discover capabilities, read authorized context, submit operations, and inspect outcomes | `src/lib/agent-api.server.ts`, `mcp.server.ts`, `src/kernel/model.server.ts` |

Dependency direction: modules supply declarative definitions to construction; construction publishes validated definitions to the runtime; human and agent adapters invoke that runtime. The pure contract and evaluator must remain independent of React, HTTP, MCP, model providers, and database clients.

Transport schemas can differ, but they must preserve action identity, input meaning, version requirements, and authorization. A model response, UI control, or discovered tool never replaces server-side validation.

## Current foundation and gaps

| Area | Implemented | Extension needed |
| --- | --- | --- |
| Application construction | Catalog-based planner; MCP contract discovery and custom validated definitions | Additional business modules driven by operator workflows |
| Data model | 1–8 entities; string, integer, boolean, and enum fields; same-application references | Dates, richer relationships, and bounded queries driven by reference workflows |
| Business behavior | Declarative actions, equality/upper-bound checks, input/literal effects | Additional declarative operations where workflows demonstrate a need |
| Human operation | Record creation, generated views/forms, staged actions, and review | Consistent capability discovery across presentation and agent adapters |
| External agents | Builder/operate credentials, scoped creation/actions, bounded queries and durable runs | Deployment hardening and richer run inspection |
| Embedded agent | Scoped discovery, bounded queries, persisted plans and durable operation runs | Live-model acceptance and richer run inspection |
| Evolution | Versioned drafts, additive migration preview, concurrency checks, publication history | Module version pinning and compatibility handling; later restoration/destructive migrations |
| Execution | Reviewed or explicitly authorized automatic changes, retry keys, concurrency checks, and attributable events | Durable operational jobs and integration effects |

Persisted build jobs already support resumable application construction. Operational execution now has a separate bounded AgentRun queue.

## Design rules

1. Define business meaning once. Human controls, embedded-agent context, and external tools derive their action contracts from the published definition.
2. Keep application-specific behavior in modules. Adding a CRM action or issue workflow must not introduce a domain-name switch in authorization or the evaluator.
3. Separate construction rights from operation rights. Publishing definitions must not implicitly grant access to application records or operational review.
4. Resolve actor identity and scope on the server. Embedded agents should eventually use the same scoped capability model as external agents; existing session-backed behavior must be migrated explicitly.
5. Preserve transactional checks. Every mutation validates current authorization, relevant versions, domain rules, and references at execution time.
6. Make results usable by agents. Discovery and outcomes should expose structured identifiers, schemas, version information, checks, and actionable error codes.
7. Evolve definitions explicitly. Persist the reviewed definition and migration evidence; do not silently reinterpret old applications using changed module defaults.
8. Add extensibility incrementally. Begin with repository-authored, reviewed declarative modules. Downloaded executable plugins and arbitrary generated code require a separate design.

## Architecture opportunities

Three existing clusters are candidates for clearer boundaries. They are ordered by immediate value to the foundation.

1. **Action discovery and transport adaptation.** `definition.ts` generates flat tool schemas; `engine.server.ts` reconstructs nested HTTP schemas; `mcp.server.ts` adapts those schemas again. These modules jointly own one action contract. A shared semantic descriptor can hide schema construction while each adapter owns only its request envelope. The descriptor is pure; authentication and capability loading remain database-backed runtime responsibilities. Verify schema parity at the adapters and retain engine authorization tests.
2. **Catalog resolution and compilation.** `modules.ts`, `patterns.ts`, `assembly.ts`, and `compile.ts` share module identifiers, ports, views, and defaults. A cohesive catalog boundary should own lookup, compatibility, and materialization so a new reviewed module does not require updating scattered lookup assumptions. This is currently an in-process dependency. Verify complete assembly-to-definition behavior, including broken links and old-definition compatibility.
3. **Agent context and permitted operations.** The operational model path and external-agent discovery acquire context differently. A runtime capability boundary should centralize which records and actions an agent may access, with model-provider and transport adapters consuming it. This boundary relies on persistence and current credential state; provider calls remain outside transactions. Verify tenant isolation, revoked credentials, stale versions, and bounded context through integration tests.

## Milestone 1: builder agents can define a new application

`Kernel.compileSave` already accepts a custom definition and validates it through `validateApplication`; `saveDraft`, publication, and migration share that path. MCP previously exposed only patterns and assemblies. The implemented slice exposes this existing declarative capability through `get_application_contract` and the `definition` input to MCP `save_draft`, allowing an agent to build beyond the catalog.

Scope:

- Add a builder-only discovery tool returning a versioned application schema, semantic constraints, supported features, and current limits. Generate structural schema from the existing validator where possible and describe semantic rules explicitly.
- Extend MCP `save_draft` to accept exactly one of pattern, assembly, or custom definition. Keep valid existing pattern/assembly requests compatible and reject ambiguous requests clearly.
- Reuse `Kernel.saveDraft`, validation, publication, and migration. Convert definition-validation failures into structured, actionable client errors without persisting invalid drafts.
- Keep built-in planner generation catalog-based for this milestone. External construction agents can choose a catalog starting point or provide a definition within the discovered contract.
- Preserve grant separation, operational human review, and existing stored application definitions. Custom definitions cannot execute arbitrary code, SQL, or external integrations.

Acceptance criteria:

- Through the MCP client, discover the contract and publish a small noncatalog application with custom entities/actions. Publication creates no example records.
- A human creates a valid record; an application-scoped operate credential discovers and stages its custom action; human review applies the result with an execution event.
- Revise the custom application through an additive change draft and migration preview; existing record values survive publication.
- Invalid relationships, unsupported field types, invalid effect mappings, and ambiguous definition sources return useful errors and cannot publish.
- Operate credentials cannot discover builder-only tools or publish definitions; builder credentials still cannot read business records, stage operational changes, or review proposals.
- Existing catalog construction, stale-draft/preview rejection, idempotent publication, and revoked-credential checks continue to pass.
- Integration coverage exercises MCP and engine behavior with a noncatalog definition, rather than merely snapshotting a schema.
- `pnpm check` passes. No new live model dependency is required for this deterministic milestone.

### Supporting action-contract work

As the custom-definition path exposes more action shapes, consolidate repeated schema adaptation into a semantic action descriptor. HTTP and MCP can retain their public envelopes while sharing business input metadata with embedded-agent discovery. Verify enum choices, integer/string limits, defaults, required fields, and relationship meaning across adapters. The engine still enforces all validation and authorization; discovery must never widen access. This consolidation supports the milestones without requiring a runtime rewrite.

## Following milestones

### 2. Reviewed module extension contract — implemented

Implemented a local module registry with module identity/version, exact port dependencies, entity/actions, presentation defaults, and compatibility checks. Saved assemblies pin versions; legacy omitted versions resolve to release 1. New selections choose current releases. The `work.milestone` extension composes existing project and directory modules. A change to an installed module still requires a draft and migration preview. See [Module extensions](MODULE_EXTENSIONS.md) for authoring, registration, upgrade rules, and validation limits.

Acceptance: add a small business module and compose it with existing directory/project modules without changing the generic evaluator, engine authorization, or transport adapters. Invalid ports, unsupported features, and incompatible versions fail before publication.

### 3. Complete agent record operations — implemented

Implemented external-agent creation proposals for managed builder applications with an explicit per-entity grant and proposal kind, default/relationship validation, retry handling, transactional human approval, and attributable events. Targeted queries support typed equality filters, title matching and bounded pages. The application review surface handles proposals without an existing record. See [Agent API](AGENT_API.md) for the contract and schema upgrade. The built-in assistant now shares these operations via scoped run planning.

Acceptance: an agent can propose a new CRM opportunity or project issue, a reviewer can approve it once, and retries cannot create duplicates. Unauthorized relationships and revoked credentials fail at review as well as staging.

### 4. Embedded agent execution and autonomy — scoped embedded/external operations and durable runs implemented

Explicit owner-controlled execution modes are implemented per credential operation, with review as the default and separate automatic tools. Bounded operational runs now persist steps and receipts, resume atomically, support retries and cancellation, and suspend for human review. The built-in assistant now selects an owner-issued credential, consumes shared scoped discovery and targeted queries, and submits persisted plans to that same run engine. Keep provider calls and external side effects outside database transactions; integrations need their own idempotency and recovery contracts.

Acceptance: the same scoped operation has the same domain result and audit attribution regardless of adapter. Automatic execution is available only where an owner has configured a supported policy. Interrupted runs resume without duplicating committed operations.

## Reference application acceptance

Use the existing `crm` and `issues` patterns as starting points. The issues pattern is an initial project-management example, not a complete project-management product.

| Journey | CRM | Project management |
| --- | --- | --- |
| Build | Assemble parties and opportunities | Assemble projects, issues, and optional assignees |
| Human operation | Create linked records and review pipeline transitions | Create linked work and review lifecycle transitions |
| Agent operation today | Discover scoped actions and propose an opportunity transition | Discover scoped actions and propose an issue transition |
| Agent operation after milestone 3 | Propose a new opportunity linked to an authorized party | Propose a new issue linked to an authorized project |
| Evolution | Publish a supported additive revision without losing existing records | Publish a supported additive revision without losing existing records |

Each journey should use shared runtime behavior. Record gaps such as dates, task dependencies, or richer pipeline configuration as missing primitives; do not claim those workflows are supported merely because a UI can display a label.

## Verification and evidence

Existing starting points include `tests/assembly.test.ts`, `tests/kernel.test.ts`, `tests/model.test.ts`, `tests/views.test.ts`, and `tests/layouts.test.ts`. Consult [milestone acceptance](MILESTONE_ACCEPTANCE.md) for prior validation and remaining operator work.

Milestone 1 has deterministic MCP integration coverage in `tests/kernel.test.ts`: discover the schema, reject invalid or ambiguous definitions without saving, publish a noncatalog equipment-inspection application, stage and review a custom action, preserve records through additive revision, and retain grant/revocation boundaries. This synthetic test does not establish live-model quality or production readiness. Later milestone acceptance criteria remain targets.

Verification on 2026-09-27: TypeScript checking passed, all 121 tests passed, and the Vite production build completed. These were run directly using the installed binaries because the pnpm launcher stalled. The build reported a sandbox restriction on Wrangler’s optional log file outside the workspace; compilation completed successfully.

Milestone 2 verification on 2026-09-27: all 125 tests passed. After preserving module versions in the draft editor and picker, type checking, 38 focused assembly/model/rendering tests, and the production build passed again. The versioned registry tests cover legacy release-1 interpretation, pinned assembly stability when new releases are added, dependency mismatches, and the milestone extension’s shared runtime lifecycle.

Milestone 3 verification on 2026-09-27: all 132 tests, TypeScript checking, and the production build passed. CRM and project-issue MCP tests cover creation without a live record, one-time approval, concurrent staging/review retries, rejection, grant isolation, invalid fields/references, revocation/expiry, definition changes, and targeted query pagination. Render tests cover creation review and stale-definition controls. Tests applied the new migration only to isolated databases; existing installations still need the documented migration and server restart.

Automatic-execution slice verification on 2026-09-27: all 137 tests, TypeScript checking, and the production build passed. New coverage exercises MCP/HTTP automatic creation and actions, concurrent retries, review-only defaults, separate staging semantics, audit attribution, blocked business policies, invalid scopes/references, revoked/expired/stale grants, and transaction rollback after an injected database constraint failure. Migration `202609270002_agent_execution_policy` was tested on isolated databases; existing servers need migration and restart. Durable runs and embedded-agent parity remain pending.


Embedded parity slice (2026-09-27): replaced the session-only UI operation path with owner-selected credentials and a bounded planner that uses shared discovery, queries and runs. Persisted plan checkpoints prevent model re-selection on successful retries; leases fence concurrent and superseded planners. Automatic operations require both task opt-in and an existing grant. Live-model accuracy and full browser acceptance remain separate from deterministic runtime verification.

Verification: all 151 tests passed, including eight embedded-assistant tests for scoped discovery, queries, review/automatic boundaries, revocation during planning, stable retries, concurrent planning, lease recovery and stale-planner fencing. TypeScript checking, diff whitespace checks and the production build passed. Migration `202609270004_embedded_operations` was exercised in isolated test databases; the existing server database was not migrated. Live-provider task accuracy and browser interaction were not tested in this slice.

Live scoped acceptance follow-up: CRM and issues journeys passed with the configured MiniMax-M3 provider after clarifying action names, explanation length and business-only action inputs. Both runs used isolated synthetic databases. Scope/input validation rejected earlier malformed plans without bypasses. All 153 tests, type checking and production build passed; see `validation/agent-acceptance/live.json`. This establishes one live pass for each journey, not broad model reliability or authenticated browser acceptance.

Signed-in browser acceptance follow-up: CRM and issues passed through real session authentication, live scoped planning, reviewed creation, automatic middle action, reviewed final action and completed 3/3 run visibility. Post-run database checks confirmed exactly one record/run per application and correct human/agent audit attribution. Fixed overview assistant visibility and Node production packaging for TanStack dependencies and SQL migrations. See `docs/MILESTONE_ACCEPTANCE.md` and `validation/agent-acceptance/signed-in-database.json`. Real-operator trials and Cloudflare deployment remain unverified.

Execution safeguards (2026-09-28): shared credential quotas, durable embedded-model budgets, planning/run deadlines, and owner-visible worker/stalled-run health are implemented. See AGENT_API.md for defaults and deployment migration, and MILESTONE_ACCEPTANCE.md for test evidence and remaining browser/provider/deployment checks. Real-operator trials remain outstanding.

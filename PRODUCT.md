# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web.

## Users

Small operations teams that need business applications such as purchasing, CRM, support, and order management. This audience is a product hypothesis; no customer validation has been recorded.

## Product Purpose

Kernel provides the reusable structure and runtime for agents to create and operate business applications, including CRM and project management. Each application should provide both a usable human interface and structured capabilities for embedded and external agents. Describe how the business works, review a working project preview, and publish it. People and agents then use the same validated domain actions.

A project means a business application, not an arbitrary generated software repository. The built-in planner assembles applications from Kernel’s closed catalog of modules. MCP builder agents can also discover the application contract and submit custom validated definitions when the catalog does not fit. Compiled definitions describe entities, fields, relationships, actions, and policies. The kernel owns validation, authorization, persistence, execution, and history; the built-in model proposes catalog assemblies, not invented schemas.

The built-in planner remains catalog-based; external builders can use the supported declarative definition contract. Repository-authored business modules now use a versioned extension contract with exact dependency checks and assembly version pinning, without application-specific branches in the runtime. See [Module extensions](docs/MODULE_EXTENSIONS.md). CRM and project management are reference applications that test whether this foundation is reusable. See [Foundation direction](docs/FOUNDATION.md) for the target boundaries, implementation gaps, and milestone acceptance criteria. Target capabilities there are not claims of shipped behavior.

## Positioning

The runtime for your whole team — including agents.

Define your business once. Give people and agents the interfaces, rules, and workflows to run it together.

NocoBase is a competitive reference, not a feature-parity claim. The intended differentiation is one connected experience for creating, operating, and evolving a business application. Agent access alone is not unique: NocoBase also supports AI-assisted building and operational agents.

## Operating Context

TanStack Start, Better Auth email/password sessions, Prisma, and PostgreSQL (embedded PGlite locally; Hyperdrive on Cloudflare). Run `pnpm setup`, then `pnpm dev`. New accounts require the configured `KERNEL_SIGNUP_CODE` and start with a private workspace that includes a labeled purchasing demo and sample records. Extra workspaces stay empty. Owners can remove or reinstall the demo. Local SQLite files from earlier builds are not migrated. See `docs/CLOUDFLARE.md` for Workers deployment.

1. Open the purchasing demo to try queues, actions, and review, or from Projects choose Create application and assemble catalog modules or describe the business process.
2. A connected planner saves the request, asks up to three focused questions when needed, and proposes an editable business plan that names catalog modules rather than invented entities. Save for later preserves conversation, answers and plan. Explicitly review and confirm the current plan before generating a validated application draft. Without model credentials, assemble modules yourself or use the labeled purchasing example.
3. Inspect the selected modules, compiled preview, actions, rules, and assumptions. Try forms and lifecycle actions on local example records. Edit the name, aliases or module settings, or ask the connected builder to revise the assembly. Field-level schema editing is not the creation path for assembled drafts.
4. Save the draft or publish the reviewed version. Publication atomically creates the project and its entity capabilities, without preview records.
5. Open an entity queue, create real records, and use generated forms, relationship selectors, detail views, and actions.
6. From Configure, choose Change application to revise a published application. Preview definition changes and their effect on existing records, then publish a new version. Versions retains publication history.
7. From Agents, an owner can issue a workspace builder credential. Favorite agents (Cursor, Claude, and other MCP clients that support a bearer header) connect to `/api/mcp` to assemble catalog modules or author custom validated definitions, save drafts, and publish applications. Operate credentials remain application-scoped: they query records and stage selected operator actions or explicitly granted creation proposals; they cannot publish. Human review is the default; owners can explicitly grant automatic execution for selected operations.
8. As an owner, select a scoped agent credential and ask the application assistant to perform a task. It queries records, persists a bounded plan and submits a durable run. Review is the default; automatic operations need both an owner-issued grant and task opt-in.

Routes: public landing `/`; documentation `/docs` and `/docs/:slug`; workspace and draft builder `/workspace`; catalog `/catalog`; application queues `/p/:projectSlug`; configuration and execution history `/p/:projectSlug/build`; legacy public journal `/s/:workspaceId`; sign-in `/login`; invite-only signup `/login?mode=signup` or `/login?code=`.

## Capabilities and Constraints

Implemented: reviewed agent record-creation proposals for managed applications, typed entity queries with bounded pagination, MCP Streamable HTTP construction and operation tools, workspace builder credentials that discover a versioned application contract, assemble catalog patterns or author validated custom definitions, and publish application drafts, a workspace Catalog page that lists generic blocks, grammars, business modules, and patterns, a human catalog picker that saves the same pattern or assembly document, purchasing, CRM, team-issues, payments, and support catalog patterns, application-scoped operate credentials with selected actions, expiry and revocation, paginated agent discovery and proposal status, published application change drafts, live-data migration previews, project version history, additive field defaults, persistent draft revisions, natural-language catalog assembly through an optional server-side Responses-compatible adapter, semantic definition validation, interactive sample preview, version-checked and idempotent publication, multiple entity queues per application, same-project record relationships, generated forms and details, owner/operator action contracts, policy evaluation, persistent proposals, human review, idempotency, optimistic concurrency, tenant isolation, execution history, and scoped embedded-agent planning with durable run progress and controls.

Applications compile from catalog modules or validate custom definitions with 1–8 entities with string/integer/boolean/enum fields. Each entity has a title and lifecycle status. Relationships store a record ID, checked against the referenced entity and workspace. They do not provide joins, cascades, or cross-record policy evaluation. Rules support equality and numeric upper bounds; effects support literals and required action inputs. Assemblies cannot invent entities, execute arbitrary code, SQL, or external integrations. Payments uses unsigned integer cents plus an inbound/outbound direction; Kernel does not convert currency. Support tickets require a requester and do not require a project.

The live builder requires `KERNEL_API_KEY` (with `OPENAI_API_KEY` as a fallback) and `KERNEL_MODEL` on the server. `KERNEL_API_BASE_URL` selects a Responses-compatible endpoint and defaults to OpenAI; provider configuration and limits are documented in `docs/MODEL_PROVIDERS.md`. The UI accurately shows when no model is configured. The purchasing example is a predefined catalog assembly, not natural-language generation. Model adapter transport tests use mocked responses; one isolated MiniMax-M3 live workflow passed with medium reasoning on 2026-09-12 (clarification, generation, publication, reviewed operation and additive revision). This does not establish reliability across models/providers or replace operator acceptance.

The built-in operational model plans bounded multi-step runs using scoped discovery and targeted queries. The operational planner has durable call budgets, context/output bounds, and a planning deadline. Builder credentials are workspace-wide and can save and publish application drafts over MCP; they cannot stage or apply record changes. Operate credentials can read all records in their application in pages of 100, and propose selected operator actions pinned to capability versions; they cannot publish definitions. Secrets expire after 1–90 days and are stored only as hashes. Revoked or expired credentials, or credentials whose issuing owner lost owner access, cannot be used or have pending proposals applied. Owners can still reject those proposals. Session simulators without a builder credential cannot publish. Stage tools always require human review. Owners can grant version-pinned automatic execution for individual operations on managed applications. Separate execute tools apply those operations transactionally with the same validation and policies; old grants remain review-only. The legacy configuration simulator remains explicitly labeled as a simulator.

Published applications created through the builder can add entities and fields, update labels and policies, and fill absent values from explicit defaults. Preview validates every existing record and shows before/after changes. Publication rejects stale previews or application versions, incompatible records, entity/field removals, field type changes, and relationship retargeting. Existing values are never overwritten by defaults. Affected pending proposals require fresh staging and review. Legacy fixed-template projects do not support this change flow. Version history retains definitions; it does not restore data or roll back publication.

Deferred: destructive schema migrations, version restoration, general visual schema editing, relationship-aware view filters and server-side view pagination, OAuth client onboarding, invitations and role-management UI, field-level permissions, conditional execution budgets, integrations, production hardening, and marketplace distribution. The application builder and additive evolution flow are early milestones, not a complete NocoBase replacement.

## Terminology

Project: a business application with its own entity capabilities and working interface. Block: a generic UI unit that takes a data binding (a saved view or a record) and does not carry business meaning. Wired blocks are filters, table, record card, board, stats, and chart; chat and email blocks are listed without a runtime. Grammar: a working design that chooses wired blocks, starting layout, and density (overview, board, ledger, directory, detail). Pattern: a typical application type that names modules, links, a shell, grammar per surface, and the home surface. Shell is the application frame: inbox, dashboard, ledger, or tracker. Apps without a pattern keep the shared Operations desk. Module: a catalog unit Kernel can assemble (Object/Link/Action plus bound surfaces). Assembly: selected modules, links, settings and surfaces. Package: reusable capability definition kept as a fixture. Entity: compiled fields, validation, relationships, and versioned records. Action: input, authorized roles, preconditions, policies, and effects. Draft: a saved, versioned proposed application. Proposal/ChangeSet: an operational record change awaiting human review. Execution: an attributable append-only event.

## Brand Commitments

Working name: Kernel. Precise operational voice. Business applications use the user-approved Operations desk: shared light navigation and working surfaces, compact sans typography, blue primary actions, application-specific sections, continuous records, and a persistent details/review panel. Kernel is secondary application-switching infrastructure. Existing workspace creation surfaces retain their prior presentation until redesigned. Sample previews and disconnected models must be clear.

## Evidence on Hand

Kernel integration tests, mocked model transport tests, a purchasing example, and legacy example packages. No interviews, testimonials, production deployment, or market validation. Do not invent them.

## Product Principles

- People and agents share definitions and action validation.
- Model output is a proposal; the server owns identity and permission.
- Publishing a reviewed draft never installs sample records. Signup may seed a separate labeled demo.
- Projects own their entity namespaces; relationships cannot cross project or workspace boundaries.
- Operational apply rechecks the record, definition, proposer authorization, policy, and relationship references transactionally.
- Domain-specific logic belongs in definitions, not the generic evaluator.
- Every supported business capability should have a structured agent contract alongside its human interaction; adapters must preserve the same domain rules.
- Embedded agents and external agents should share scoped runtime capabilities. Model prompts do not grant permission.
- New application types should primarily add definitions, modules, and presentation configuration rather than new runtime branches.
- Agent execution requires an explicit owner policy per operation. Review is the default; automatic execution retains validation, scope checks and audit attribution.

## Accessibility & Inclusion

Use the existing React Aria controls, visible labels, keyboard-operable entity selection and actions, explicit loading/errors, and responsive workspace layouts. No formal accessibility certification is claimed.

## Success criteria

- A new account can open the labeled purchasing demo, operate its sample records, then publish their own application without handwritten purchasing UI.
- With credentials configured, a description can produce a validated application draft and follow-up requests can revise it.
- Drafts survive reloads; concurrent stale saves or publishes fail clearly.
- Repeated publication creates one project and one publication event.
- Preview records never enter the published application.
- Published application changes preserve existing values; defaults fill only absent fields.
- Concurrent record, proposal, or definition changes require a fresh migration preview.
- Every application publication retains its versioned definition and migration summary.
- Relationships and proposals cannot access other projects' or workspaces' records.
- Existing seeded projects continue to function.
- An owner can issue a builder credential and an MCP client can assemble catalog modules and publish a validated application without using Kernel’s planner.

## Roadmap

The foundation workstream is defined in [Foundation direction](docs/FOUNDATION.md): validated custom definitions are now exposed to builder agents; versioned repository module extensions are implemented; scoped creation proposals and targeted queries are implemented; policy-controlled single-operation execution is implemented; bounded durable runs and embedded-agent capability parity are implemented; live-model acceptance and operational hardening are next. Shared action discovery should evolve alongside these capabilities. Existing acceptance and hardening work below remains necessary before production use.

1. Complete real-operator acceptance of describe → preview → publish → operate. The isolated MiniMax-M3 run, authenticated live-model browser happy path, deterministic browser recovery, and synthetic CRM integration journey have passed; see `docs/MILESTONE_ACCEPTANCE.md` for evidence and remaining operator scenarios.
2. Validate the shipped clarification flow with operators and validate the shipped conditional layouts; extend the shipped saved-view/navigation editor based on operator feedback.
3. Extend additive application evolution with a tested restoration and destructive-migration strategy.
4. Extend scoped agent access with OAuth client onboarding, role management, policy-controlled autonomy, and durable execution.
5. Add integrations and production deployment hardening based on validated workflows.

## Application navigation and saved views

Generated definitions now include editable business-section labels/order, named filtered views, table columns, sort order and a starting view. The builder previews these settings with example data; publication versions them without changing records or invalidating pending actions when only presentation changes. Purchasing and CRM exercise the shared definition contract. Saved views organize work and do not grant or restrict access. See `docs/APPLICATION_VIEWS.md` for the supported contract and limits.

## Record detail layouts

Application definitions include per-entity named sections with ordered field assignments and optional typed same-record display conditions. Users can reveal all sections at any time. The builder edits and previews these layouts; published records render the same structure. Unassigned/new fields remain under Other details. Default layouts, actions, activity and proposal review remain compatible. See `docs/RECORD_LAYOUTS.md` for the supported contract.

## Conversational clarification

The connected builder asks up to three consequential workflow questions before generation, skips questions for clear requests, and distinguishes explicit answers from unconfirmed suggestions. Answers become part of the successful draft brief. Failed builds preserve unsaved answers and block publication of the unchanged definition until retry or discard. This is a single clarification round; questions are not a persisted chat. See `docs/BUILDER_CLARIFICATION.md`.


## Confirmed application plans

ApplicationStudio now owns creation and model-assisted revision. BuilderPlan stores versioned planning content separately from ProjectDraft. Saved changes to the conversation or answers invalidate confirmation until a new proposal incorporates them. Generation claims a confirmed version and rejects late results after edits; publication rejects a linked draft when its current plan has not been built. The legacy direct build command now requires using the planner. Manual preview editing and the predefined example remain supported.

Planning uses the existing Operations desk identity: focused entry, conversation beside editable plan, mobile panel switching, and secondary model connection details. Unsaved typing requires Save for later and is protected by navigation warnings; it is not automatic crash persistence. The existing sample preview is reused, not yet the published application shell. Provider generation can still time out; saved plans can be reopened and an interrupted build checked or recovered.

## Resumable builds

Application creation enqueues a persisted job after explicit plan confirmation. A leased background worker saves validated structure, entity fields, entity behavior, and default presentation checkpoints. Failed tasks resume without regenerating completed tasks; reconnecting retrieves saved progress. Final assembly checks plan/draft versions atomically. See docs/RESUMABLE_BUILDS.md for worker operation and provider-test limits.

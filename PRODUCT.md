# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web.

## Users

Small operations teams that need business applications such as purchasing, CRM, support, and order management. This audience is a product hypothesis; no customer validation has been recorded.

## Product Purpose

Kernel is an agent-first platform for creating and running business applications. Describe how the business works, review a working project preview, and publish it. People and agents then use the same validated domain actions.

A project means a business application, not an arbitrary generated software repository. Its versioned definitions describe entities, fields, relationships, actions, and policies. The kernel owns validation, authorization, persistence, execution, and history; the model proposes definitions and actions.

## Positioning

Build the tools your business needs. Let agents help run them.

NocoBase is a competitive reference, not a feature-parity claim. The intended differentiation is one connected experience for creating, operating, and evolving a business application. Agent access alone is not unique: NocoBase also supports AI-assisted building and operational agents.

## Operating Context

TanStack Start, Better Auth email/password sessions, Prisma, and local SQLite. Run `pnpm setup`, then `pnpm dev`. New accounts start with an empty private workspace. Existing projects and records remain available.

1. From Projects, choose Create application and describe the business process.
2. A connected planner saves the request, asks up to three focused questions when needed, and proposes an editable business plan. Save for later preserves conversation, answers and plan. Explicitly review and confirm the current plan before generating a validated application draft. Without model credentials, use the explicitly labeled purchasing example.
3. Inspect entities, relationships, fields, actions, rules, and assumptions. Try forms and lifecycle actions on local example records. Edit the name or numeric settings, add fields, or ask the connected builder to revise the draft.
4. Save the draft or publish the reviewed version. Publication atomically creates the project and its entity capabilities, without preview records.
5. Open an entity queue, create real records, and use generated forms, relationship selectors, detail views, and actions.
6. From Configure, choose Change application to revise a published application. Preview definition changes and their effect on existing records, then publish a new version. Versions retains publication history.
7. In Configure → Agents, an owner can issue a credential for one application and selected operator actions, save the one-time secret, and revoke access. External agents use the bearer HTTP API or MCP endpoint to read application records, stage proposals, and check their status. MCP clients must support a configured bearer header.
8. Ask the project agent for one action. It reads bounded project context, selects an existing action, and stages a proposal. An owner applies or rejects the proposed change.

Routes: workspace and draft builder `/`; application queues `/p/:projectSlug`; configuration and execution history `/p/:projectSlug/build`; legacy public journal `/s/:workspaceId`; sign-in `/login`.

## Capabilities and Constraints

Implemented: MCP Streamable HTTP discovery and scoped action tools, application-scoped agent credentials with selected actions, expiry and revocation, paginated agent discovery and proposal status, published application change drafts, live-data migration previews, project version history, additive field defaults, persistent draft revisions, natural-language draft generation and revision through an optional server-side Responses-compatible adapter, semantic definition validation, interactive sample preview, version-checked and idempotent publication, multiple entity queues per application, same-project record relationships, generated forms and details, owner/operator action contracts, policy evaluation, persistent proposals, human review, idempotency, optimistic concurrency, tenant isolation, execution history, and one-action operational model requests.

Applications support 1–8 entities with string/integer/boolean/enum fields. Each entity has a title and lifecycle status. Relationships store a record ID, checked against the referenced entity and workspace. They do not provide joins, cascades, or cross-record policy evaluation. Rules support equality and numeric upper bounds; effects support literals and required action inputs. Generated definitions cannot execute arbitrary code, SQL, or external integrations.

The live builder requires `KERNEL_API_KEY` (with `OPENAI_API_KEY` as a fallback) and `KERNEL_MODEL` on the server. `KERNEL_API_BASE_URL` selects a Responses-compatible endpoint and defaults to OpenAI; provider configuration and limits are documented in `docs/MODEL_PROVIDERS.md`. The UI accurately shows when no model is configured. The purchasing example is a predefined editable definition, not natural-language generation. Model adapter transport tests use mocked responses; one isolated MiniMax-M3 live workflow passed with medium reasoning on 2026-09-12 (clarification, generation, publication, reviewed operation and additive revision). This does not establish reliability across models/providers or replace operator acceptance.

The built-in operational model makes at most one proposal per request, using up to 100 records. External agent credentials can read all records in their application in pages of 100, and propose selected operator actions pinned to capability versions. Secrets expire after 1–90 days and are stored only as hashes. Revoked or expired credentials, or credentials whose issuing owner lost owner access, cannot be used or have pending proposals applied. Owners can still reject those proposals. They cannot publish projects or apply changes. All operational proposals still require human review. Configurable automatic execution is a future milestone, not shipped behavior. The legacy configuration simulator remains explicitly labeled as a simulator.

Published applications created through the builder can add entities and fields, update labels and policies, and fill absent values from explicit defaults. Preview validates every existing record and shows before/after changes. Publication rejects stale previews or application versions, incompatible records, entity/field removals, field type changes, and relationship retargeting. Existing values are never overwritten by defaults. Affected pending proposals require fresh staging and review. Legacy fixed-template projects do not support this change flow. Version history retains definitions; it does not restore data or roll back publication.

Deferred: destructive schema migrations, version restoration, general visual schema editing, relationship-aware view filters and server-side view pagination, OAuth client onboarding, invitations and role-management UI, field-level permissions, autonomous execution policies, durable multi-step jobs, integrations, production hardening, and marketplace distribution. The application builder and additive evolution flow are early milestones, not a complete NocoBase replacement.

## Terminology

Project: a business application with its own entity capabilities and working interface. Package: reusable capability definition. Entity: fields, validation, relationships, and versioned records. Action: input, authorized roles, preconditions, policies, and effects. Draft: a saved, versioned proposed application. Proposal/ChangeSet: an operational record change awaiting human review. Execution: an attributable append-only event.

## Brand Commitments

Working name: Kernel. Precise operational voice. Business applications use the user-approved Operations desk: shared light navigation and working surfaces, compact sans typography, blue primary actions, application-specific sections, continuous records, and a persistent details/review panel. Kernel is secondary application-switching infrastructure. Existing workspace creation surfaces retain their prior presentation until redesigned. Sample previews and disconnected models must be clear.

## Evidence on Hand

Kernel integration tests, mocked model transport tests, a purchasing example, and legacy example packages. No interviews, testimonials, production deployment, or market validation. Do not invent them.

## Product Principles

- People and agents share definitions and action validation.
- Model output is a proposal; the server owns identity and permission.
- Publishing rechecks the reviewed draft version and never installs sample records.
- Projects own their entity namespaces; relationships cannot cross project or workspace boundaries.
- Operational apply rechecks the record, definition, proposer authorization, policy, and relationship references transactionally.
- Domain-specific logic belongs in definitions, not the generic evaluator.
- Agent autonomy should eventually be policy-controlled; the current milestone requires human review.

## Accessibility & Inclusion

Use the existing React Aria controls, visible labels, keyboard-operable entity selection and actions, explicit loading/errors, and responsive workspace layouts. No formal accessibility certification is claimed.

## Success criteria

- A new account can publish the purchasing example and operate it without handwritten purchasing UI.
- With credentials configured, a description can produce a validated application draft and follow-up requests can revise it.
- Drafts survive reloads; concurrent stale saves or publishes fail clearly.
- Repeated publication creates one project and one publication event.
- Preview records never enter the published application.
- Published application changes preserve existing values; defaults fill only absent fields.
- Concurrent record, proposal, or definition changes require a fresh migration preview.
- Every application publication retains its versioned definition and migration summary.
- Relationships and proposals cannot access other projects' or workspaces' records.
- Existing seeded projects continue to function.

## Roadmap

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

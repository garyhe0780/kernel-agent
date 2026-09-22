# Implementation architecture

## Stack and boundaries

TanStack Start serves the React workspace and API routes. Tailwind semantic tokens style shadcn components backed by React Aria. Better Auth authenticates email/password sessions through its Prisma adapter. Prisma persists the kernel and account models in PostgreSQL: embedded PGlite for local Node and tests, Hyperdrive (or `DATABASE_URL`) on Cloudflare Workers. pnpm is the package manager.

`src/kernel/definition.ts` defines and evaluates declarative contracts with no framework or database dependency. `src/kernel/engine.server.ts` owns tenant authorization, persistence, transactions, proposal lifecycle, and publication. `src/lib/api.server.ts` binds trusted sessions to principals and translates HTTP commands. React consumes serialized snapshots; it does not import database or authentication secrets.

## Data strategy

Prisma models platform-owned objects. Customer-defined entity data is stored as validated JSON in BusinessRecord, paired with a capability name, entity name, tenant, and version. Changing policy settings requires no Prisma generation. This is a deliberate first-version storage choice. Large indexed customer datasets will require typed projected columns or dedicated tables and a migration engine; JSON storage is not a claim of unlimited query performance.

## Transactions and versions

Every apply executes in one database transaction: verify membership and review role, load the pending proposal, compare the record and definition versions, recheck the original proposer's current role, reevaluate rules/effects, conditionally update the record and proposal, and insert an execution event. An exact repeat returns the applied proposal without repeating effects. Conflicting proposals remain pending so the reviewer can reject and replace them.

Staging keys are unique per workspace and bound to proposer, actor kind, action, record, and normalized input. Clients must retain the key when retrying an uncertain response. Validation failures do not reserve the key. PostgreSQL is the production database. Cloudflare Workers use Hyperdrive so apply and publish keep Prisma interactive transactions. See `docs/CLOUDFLARE.md`.

Capability changes publish a new immutable version plus an audit event. Existing proposals cannot apply under a different definition version. This simple policy is conservative and explicit. Additive application migrations are described below. Destructive migrations, running-workflow migration, and undo of external side effects remain separate future concerns.

## Identity and agent boundary

The server obtains user ID and workspace membership from the Better Auth session. Request input cannot select a workspace or actor. `/api/agent` assigns actor kind `agent` and accepts staging only. `/api/kernel` is the first-party human surface. Both use the same kernel methods. Cookie writes require an allowed Origin.

Email/password signup is invite-only. `/sign-up/email` is rejected unless the body includes `invitationCode` matching `KERNEL_SIGNUP_CODE`. An unset code refuses every new account. Existing sessions and `/sign-in/email` are unchanged. Workspace invitation links still add members after sign-in; they do not replace the signup code.

This is a local trusted-client boundary, not cryptographic proof that a person clicked a button: code with a human session can call human routes. External agents now have separate application-scoped bearer credentials that cannot access host review endpoints; stronger approval can use reauthentication or signed approval challenges. Do not give an external agent the human session cookie and expect route naming to isolate it.

The first version gives each account a private workspace and owner role. The database model intentionally permits only one membership per user until explicit workspace selection and invitation flows are implemented. Agent approvals are always staged; configuration changes are direct owner publication after an explicit UI action.

## Extension seams

`src/kernel/commands.ts` is the closed write catalog. Core commands cover identity, records, stage/review, drafts, settings publication, migration, and agent grants. Host commands cover the planner and model adapter. Fixture commands install or remove demo data. Current agent credentials are operate-only (`stage`); construction uses the same Kernel methods through the human owner surface.

`src/kernel/definition.ts` evaluates a Definition. Settings are keys already declared on that definition; `publishSettings` versions those values and does not add purchasing-shaped fields. Managed applications change settings through `saveDraft` / `previewMigration` / `publishDraft` so the published application document stays the source of truth.

`src/kernel/blocks.ts` is the closed catalog of generic blocks. Wired blocks are `filters`, `table`, `details` (record card), `board`, `stats`, and `chart`; they bind to a saved view or a record and compile onto grammars. `chat`, `email.compose`, and `email.inbox` are listed without a runtime. `src/kernel/grammars.ts` is the closed catalog of working designs: overview, board, ledger, directory, and detail. `composeSurface` keys off grammar. `src/kernel/patterns.ts` is the closed catalog of typical applications (purchasing, CRM, issues, payments, support). A pattern names modules, links, a shell (inbox, dashboard, ledger, or tracker), grammar per surface, and the home surface, then compiles to an assembly. The published workbench reads that shell from the stored assembly. `src/kernel/modules.ts` is the Core catalog of assemblable modules. Current modules are `purchasing.request`, `sales.opportunity`, `directory.party`, `work.project`, `work.issue`, `finance.movement`, and `support.ticket`. Issue assignee is an optional port onto `directory.party`; project is required. Movement counterparty and ticket requester are required ports onto `directory.party`; tickets do not use `work.project`. Payments home is a dense ledger; support home is a board of open, waiting, and resolved tickets. The workspace Catalog page (`/catalog`) shows blocks, grammars, modules, and patterns in one namespace. Humans and builder credentials share `list_blocks`, `list_grammars`, `list_modules`, and `list_patterns`. `save_draft` prefers a pattern id. An application is compiled Pattern → Assembly (surfaces carry a grammar) → Definition. The package catalog (`src/kernel/packages.ts`) and project templates remain an example fixture path for tests and the public journal; ordinary workspaces do not install them. Keep the generic evaluator free of vertical-specific conditions. New business behavior is a catalog module, not a generated entity schema or a new shared evaluator branch. Overview stats use record counts, status breakdown, integer sums where present, and `$createdAt` trend only. There is no date field type, hospitality pattern, FX conversion, or arbitrary SQL chart.

The optional model adapter discovers contracts and reads authorized project records before staging a proposal. A separately labeled deterministic simulator is also available without model credentials. Nothing in this version performs external purchasing or executes arbitrary configuration code.

## Verification

The integration suite creates an isolated embedded Postgres database from the committed migrations. It tests policies, identity boundaries, idempotency, stale definitions/records, rejected changes, reserved-field injection, execution history, and project-scoped snapshots. App HTTP verification covers real sign-up/session cookies and protected endpoints. UI accessibility comes from React Aria primitives and semantic composition; that does not replace a full browser and assistive-technology audit.

## Agent-first application builder (September 12, 2026)

New workspaces created at signup receive a labeled purchasing demo with sample records. Additional workspaces stay empty. Catalog bootstrapping remains an explicit example fixture path; ordinary snapshots no longer reinstall templates. Existing installations are preserved. Publication of a reviewed draft still never installs preview records.

`application.ts` defines the multi-entity application contract and semantic validation: identifiers, roles, relationships, initial states, comparison values, and action input/effect mappings. Each entity reuses the existing pure Definition evaluator. `ProjectDraft` persists the brief, source, revision, compiled definition, and optional assembly. Save uses optimistic concurrency. Publish checks the exact reviewed version, transitions the draft and creates Project/Capability/CapabilityVersion rows plus an audit event in one transaction. Retrying the same published draft revision returns its existing project.

Publication assigns each entity a namespace under the new project and rewrites both field and action-input relationship targets. Linked IDs are validated at record creation, stage, and apply against workspace and target capability. Preview data lives only in browser memory and is never part of publication. The generated workbench filters each entity's queue while retaining other project entities for relationship selectors.

`model.server.ts` calls a configurable OpenAI Responses-compatible API with a server-only credential, explicit configured model, store:false, JSON output, timeout, and bounded output tokens. Optional KERNEL_REASONING_EFFORT is forwarded when configured. Single complete Markdown JSON fences are unwrapped, while prose and malformed JSON remain invalid. JSON mode is used because application definitions include dynamic field maps; runtime semantic validation remains authoritative. Schema-invalid assemblies and clarifications get one repair request, then fail without replacing the saved draft. No arbitrary generated code executes. API credentials and provider error payloads are not returned to the browser. Model calls occur outside database transactions; saving rechecks the expected draft version afterward.

The optional operational agent receives the selected project's definitions, up to 100 records, and pending record IDs. It may select one record/action/input. The server checks project membership of that record and stages as actor kind agent, through the same engine as other actions. No external tools or direct applies are available. This is not a durable agent runner; retries can encounter idempotency conflicts if a new model choice differs from the original one.

## Local model configuration

Set KERNEL_API_KEY and KERNEL_MODEL in `.env`, with KERNEL_API_BASE_URL for a Responses-compatible provider, then restart the server. The default base is https://api.openai.com/v1; OPENAI_API_KEY remains a fallback when KERNEL_API_KEY is empty. The base includes any API path prefix and omits /responses. Requests do not follow redirects. See `MODEL_PROVIDERS.md` for examples and protocol limits. The purchasing example and preview require neither. Builder descriptions and current draft definitions are sent to the provider; operating requests send the selected project context described above. Credentials remain server-side.

Run `pnpm db:generate` and `pnpm db:migrate` after pulling schema changes, then restart any existing dev server so its Prisma client includes the latest project and draft models. Use `pnpm check` for types, integration/transport tests, and production build. Tests use isolated temporary databases. Provider-backed end-to-end behavior still requires configured credentials; mocked transport tests do not establish model quality.

## Published application evolution

Managed projects retain their current application definition and version. ProjectVersion stores immutable definition snapshots and migration reports. The additive database migration backfills version 1 from previously published builder drafts. Legacy fixed-template projects have no managed application definition and remain outside this flow.

An owner opens a change draft from Configure. It records its base project version and uses the same validated application editor and optional model revision adapter. The visual field editor adds text, integer, or boolean fields with optional required/default settings. Saving any edit clears the prior migration receipt.

`migration.ts` is a pure planner. It namespaces definitions, compares entities/fields/actions/policies, applies defaults only to absent values, validates existing records and relationships, and reports changes, blockers, counts, and up to five affected record examples. It blocks entity/field removals, stored entity renames, field type changes, and relationship retargeting. Additional entities start empty. New required fields need values compatible with every existing record; explicit defaults can provide them.

Preview checks the draft and base version, compares installed capabilities with the managed definition, and stores an opaque token plus a SHA-256 fingerprint of the current project version, capabilities, records, and pending proposals. Publication requires that receipt and repeats all checks in one transaction. Concurrent changes reject publication with STALE_PREVIEW or STALE_PROJECT, requiring a new preview or draft. A definition edited outside the managed flow is rejected as DEFINITION_DRIFT.

Successful publication conditionally increments the project version, publishes only changed capability versions, fills missing defaults with record-version checks, saves the immutable ProjectVersion and audit event, and marks the draft published. An exact retry returns the existing publication. Pending proposals against changed capabilities remain pending but fail the existing definition-version check; reviewers must reject and restage them. Proposals against unchanged capabilities keep their validity.

The Versions tab exposes publication history and before/after summaries. Retained definitions are evidence, not a rollback mechanism: data restoration, destructive migrations, and configurable automatic apply remain unimplemented.

Verification: 30 integration/transport tests pass, including additive defaults, blocked incompatible changes, stale preview receipts, competing application drafts, tenant/role checks, and retry idempotency. Browser verification upgraded the existing synthetic purchasing application from version 1 to 2 by adding required Department with default General. Its request retained the supplier, submitted status, and $120 amount, and version history retained both publications. Desktop and mobile migration review captures are under `.impeccable/review/evolution/`.


API reference used for the adapter: https://developers.openai.com/api/docs/guides/text

## External agent credentials

AgentCredential persists a SHA-256 digest of a 256-bit random token, a non-secret display prefix, issuing owner, application slug, selected capability/action/version triples, expiry and revocation time. Creation and revocation require a current human owner and generate audit events. The full token is returned only at creation and is never included in lists or audit details.

`agent-access.server.ts` owns grants and their resolution. Every credential operation rechecks its lifetime, current issuing-owner membership and application existence. Kernel authorization rejects credential principals on all general methods; only scoped discovery, own-proposal reads and staging opt in. Staging rechecks selected action and current capability version inside its transaction and evaluates as operator. Each ChangeSet stores the credential ID, and idempotency comparisons include it. Execution events attribute machine proposals to the credential ID and name. Human apply repeats grant validation and operator evaluation; expired/revoked access cannot be rescued by the issuer’s owner role. Reject remains available.

`agent-api.server.ts` serves bearer GET/POST at `/api/agent`. Discovery queries only the credential application’s capabilities and records, with ID cursor pagination of 100 records. Returned tool input schemas describe the actual POST envelope, including nested action input. Definition changes omit outdated tools and return staleActions; create a new reviewed credential to regain access. GET with `change` returns only proposals from that credential. Read access covers the entire application and is not field-level authorization.

`/api/kernel` rejects any Authorization header; bearer credentials never fall back to cookies. `/api/agent` retains its existing session-based path for the local simulator, protected by session and Origin checks. A present bearer header always selects the credential path, including invalid/expired tokens. The credential path is independent of browser sessions and accepts no workspace, project, identity or role overrides. No credential can create records, apply/reject proposals, publish definitions, or delegate another credential.

The Agents tab supports issuance, one-time secret copying, status and revocation. Both the HTTP API and the MCP transport below use these grants; neither is a durable agent runner. HTTPS deployment, rate limiting and production operational controls remain deployment work; the current server listens on loopback. See `docs/AGENT_API.md` for integration.

Credential milestone verification: `pnpm check` passes with 37 tests. Isolated database tests cover credential lifecycle and the actual bearer handler. The local human API rejects Authorization headers with HTTP403. Browser validation covers the empty/form states and missing-scope recovery at desktop and mobile sizes; one-time-secret and populated-list UI states were source-reviewed, with lifecycle behavior verified through integration tests. No live external credential was issued in the existing workspace during verification.

## MCP transport

`src/lib/mcp.server.ts` uses the official `@modelcontextprotocol/sdk` 1.30.0 Server and WebStandardStreamableHTTPServerTransport. `/api/mcp` accepts authenticated JSON-RPC POST requests and returns JSON; a fresh server/transport is created and closed for every request. No authentication session is cached. GET and DELETE return 405 after authentication because event streams and server sessions are not provided.

The route requires a bearer agent credential, ignores human cookies, rejects query parameters, checks request host and supplied Origin against BETTER_AUTH_URL, and bounds streamed request bodies to 128 KB before parsing. The SDK owns protocol negotiation, JSON-RPC validation and method dispatch. Authentication and all domain checks still belong to AgentAccess and Kernel.

Operate credentials expose list_records, get_proposal, and one stable SHA-256-derived name per allowed action. Generated schemas take nested action input. Action tools fix the capability and action server-side; Kernel.stage checks the selected entity against the record inside its transaction, then repeats the existing scope/version checks. Builder credentials expose list_blocks, list_grammars, list_modules, list_patterns, list_applications, list_drafts, get_draft, save_draft, edit_project, preview_migration and publish_draft, and are refused on `/api/agent`. `save_draft` prefers a pattern id and still accepts a catalog assembly. Unavailable or stale tools and policy failures return MCP tool errors. Structured results are also serialized as text for clients without structured-output rendering.

Verification uses the official SDK Client and StreamableHTTPClientTransport against the real handler through an injected Fetch adapter, with isolated Postgres data. It covers initialization, discovery, records, staging, retries, human apply, proposal status, revocation, hostile origins/hosts, oversized/malformed bodies, unknown methods, notifications, scope violations and stale tools. All 40 tests pass. This does not establish compatibility with every desktop client or OAuth-based onboarding. Protocol references are recorded in AGENT_API.md.

Local route smoke check: after restarting the preview to load the new SDK dependency, POST /api/mcp returned HTTP 401 for a dummy bearer token. No live credential was issued or external client connected during this check. `pnpm check` and `git diff --check` passed.

## Application presentation metadata

`application-views.ts` defines validated saved-view metadata and the shared typed filter/sort functions used by builder preview and workbench. Application validation checks referenced entities/fields, complete unique navigation, title-bearing custom columns and valid starting views. Project snapshots namespace entity references; draft reads normalize older persisted definitions. Metadata stays in versioned application JSON and needs no database migration. Migration previews describe presentation changes without incrementing capability versions or invalidating pending proposals. The model prompt proposes a catalog assembly rather than generating entity schemas, with repair tested through an injected Fetch adapter. See `APPLICATION_VIEWS.md` for limits and verification.

## Record detail layouts

`application-layouts.ts` validates per-entity section metadata and resolves field groups with an automatic unassigned/new-field fallback. Typed optional section conditions are validated against non-relationship fields; the shared matcher handles equality, inequality and integer bounds, treating absent values as non-matches. The renderer offers a reveal-all override without affecting action evaluation. `RecordDetail` composes the existing field formatter, shared by builder preview and workbench. Presentation snapshots namespace layout entity IDs. Layout metadata remains versioned application JSON; migration previews describe it without changing capability versions or pending proposal validity. Old definitions and cached snapshots fall back to the existing detail order. See `RECORD_LAYOUTS.md`.

## Builder clarification

`clarifyApplication` returns bounded, validated questions rather than definitions. The human `clarify` command shares the build route's owner, draft-scope and version checks. Client clarification composes explicit answers and labeled unconfirmed assumptions into a bounded brief, then uses the existing validated build transaction. Pending questions/build requests block publishing; failure retains unsaved composed text without persisting it against an old definition. Manual definition edits are saved with the previous brief before clarification. `ProjectBuilder` accepts an optional transport solely for component verification; production uses the existing HTTP request function. See `BUILDER_CLARIFICATION.md`.

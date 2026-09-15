# Application creation journey — proposed redesign

Status: the confirmed-plan foundation and planning UI are implemented. The original journey below remains the design target; shipped behavior and remaining scope are distinguished here.

Implemented: versioned BuilderPlan persistence, conversation and editable plan, focused initial screen, mobile Conversation/Plan switching, explicit confirmation before generation, pending-change confirmation guard, stale-result rejection, saved-plan resumption, and publication guard. Save for later explicitly persists edits; no automatic unsaved crash persistence. Existing preview edits must be saved before switching back to the plan.

Still open: replacing the reused sample preview with the published application shell, richer field-level progressive disclosure, and live end-to-end provider reliability. The plan's natural language is reviewed by the owner; semantic equivalence between a plan and model-generated runtime definition is not formally verified. Sample preview and server definition validation remain necessary.

Validation: 67 tests plus type checking/build passed during implementation. Live planning produced a plan; corrected decisions survived save/reopen. Confirmation started generation but that attempt did not yield a preview. Browser checks verified pending saved follow-ups hide confirmation and unsaved preview edits disable switching. Independent finish review scored both material fixes resolved in code; main browser checks supplied interaction evidence. See `.impeccable/review/planner/`.

## Job

Help a business owner turn an incomplete description of work into a usable application without writing a technical specification. Preserve the shared Operations desk identity. The creation flow is an Operate surface; comprehension, recoverability and control matter more than decorative presentation.

## Current friction

The initial screen repeats its purpose in two headings, gives a large empty preview equal weight to the only available action, and treats the description as a form submission. Clarification answers become a long replacement prompt. Generation hides consequential decisions until after the expensive call. A failed request leaves the user with a retry button instead of a durable piece of completed work. Saved definitions are durable, but unfinished conversations are not.

## Proposed journey

1. **Describe the work.** One heading and a focused composer: “What would you like to manage?” A few brief example prompts help people begin. Examples fill the composer; they do not silently create applications. Keep the existing editable purchasing example explicitly separate from model generation. Do not reserve half the page for an empty preview.
2. **Shape the application.** Preserve the user's message and subsequent answers in a conversation. Ask focused questions with editable suggestions. Alongside it, show a business plan: what is tracked, who acts, lifecycle, approval rules and open decisions. Mark confirmed decisions, assumptions and unsupported requirements distinctly. Use progressive disclosure for field-level detail.
3. **Confirm the plan.** Required checkpoint before generation: users can edit decisions or ask for changes, then choose “Build this application.” Unsupported requirements must name the limitation and a concrete alternative; never silently replace the intended rule. A business plan is not a validated runtime definition and must not be labeled as one.
4. **Build and try.** Show actual request stages such as generating and validating, without fabricated percentages or activity. On success, give the working application preview the main canvas, with conversation/refinement adjacent. Use the same application shell as the published app and label sample data. Users should try a record and an action before considering publication.
5. **Publish.** Summarize the application being published and the fact that sample records remain in preview. For revisions, show definition and live-data migration impact, preserving the existing version checks and owner-only publication.

## Recovery is part of the flow

- Persist conversation, confirmed answers and plan before generating a runtime definition. Returning later should recover the completed planning work.
- Keep the latest usable preview while a revision runs, clearly labeled as the previous saved version.
- Retry only the failed stage. Editing a confirmed decision invalidates downstream confirmation and generated output; publication requires the current validated version.
- Distinguish connection failure, validation failure and unsupported requirements. Explain what was saved and what remains to do using actual state.
- Cancellation must be honest: stopping a browser wait alone is not cancellation of a running model request or prevention of a late save.

## Layout and controls

Use one workspace header with application name (when known), accurate save state and an exit back to applications. On desktop, introduce the conversation/plan split only after there is content to compare; the preview becomes the dominant pane after generation. On narrow screens, switch between Conversation, Plan and Preview with clear pending-decision counts rather than stacking two long columns. Retain keyboard access, visible labels, focus after questions/errors and restrained live-region announcements.

## Implementation boundaries

This is a flow redesign, not a new visual identity. Existing applications, authorization, staged actions, migration validation and publication semantics remain authoritative. Durable planning needs server persistence and a versioned plan/definition relationship; changing only the JSX would not deliver this proposal. Model-provider details belong in secondary connection information. The flow must still explain when a description is sent to the connected model.

## Acceptance

- A short nontechnical request can reach a reviewable plan without requiring field names or schema syntax.
- An unsupported threshold rule is disclosed before runtime generation, with no silent semantic substitution.
- Confirmed decisions survive reload and a failed model call.
- An edited plan cannot publish an older generated definition.
- Preview and published application share the same interaction structure; example records never become business records.
- Real operators can explain what Kernel understood, what remains uncertain, and what publishing will do.

## Streaming build feedback (2026-09-13)

Planning and confirmed builds use POST server-sent events on the authenticated kernel endpoint. Activity reflects actual server stages: planning, generation, validation, bounded repair when needed, and saving. The waiting panel shows elapsed time, completed stages, a current activity indicator, and longer-wait reassurance; it respects reduced motion and uses a polite live region. It does not invent percentage completion or stream private model reasoning.

Ten-second heartbeats keep the connection active; they are not evidence of model progress. A disconnected client does not cancel or automatically repeat the claimed build. The client checks saved plan state and opens an already committed draft, including when the final result frame was lost. Check build status remains available if recovery cannot load the preview. A server restart can still interrupt work: this is not a durable job queue or event replay service. Deployment proxies must permit unbuffered streaming. SSE improves feedback, not provider generation speed.

## Workspace navigation foundation (2026-09-13)

Kernel is the workspace context; Applications is its current destination. Published applications sit in a collapsible, indented Your applications section. The workspace brand no longer presents Kernel as an application in the switcher. Within an application, local records, views and reviews remain primary, with Back to workspace at the top. The application switcher remains available there. The directory heading is Applications, matching the navigation.

Overview, Agents, Inbox, Activity and Settings are future workspace destinations, to be added with working functionality. This first phase adds no placeholder destinations or pinning claims. Verified live on desktop and 390px mobile: collapse/expand, application entry, and return to workspace. Typecheck passes.

### Overview destination

The workspace home `/` now shows Overview: saved plans, drafts to continue, and compact links to published applications. `/applications` keeps the full directory. Both destinations use the existing authorized workspace data; owner-only planning and creation controls stay owner-only. Overview does not claim workspace-wide activity or approval totals from a project-scoped snapshot. Empty saved-work messaging waits for the owner data to load. Desktop/mobile layouts and the separate route were checked; typecheck and independent source review passed. Existing design tokens and shell remain authoritative.

### Workspace Inbox

`/inbox` lists pending proposals across the authenticated workspace, oldest first, with application, record title, action, human/agent source, timestamp and changed-record warning. Refresh reloads the queue; failures preserve the previous list with a stale-data warning. Application links lead to the existing review flow; Inbox itself cannot apply or reject proposals. Operators can inspect the queue under existing workspace visibility rules; owners perform review.

The dedicated pending query has no recent-history cutoff. Application snapshots now also retain all pending changes alongside 100 reviewed history entries, so an older Inbox item remains available at its destination. Regression coverage checks tenant isolation, more than 100 newer reviewed changes, destination visibility, changed records and removal after rejection. Typecheck and 73 tests pass. Live desktop/mobile verification covered the empty Inbox in Builder QA; populated queue behavior was exercised in automated tests, not live browser testing. No sample proposals were added to the user's workspace.

### Workspace Activity

`/activity` shows recorded events across the authenticated workspace, newest first. Each summary includes time, actor, action, outcome and an application link when resolvable. Raw execution details are omitted. Refresh returns to the newest page; Load older activity uses a workspace-validated cursor with deterministic date/ID ordering, 50 events per page. It is recorded action history, not a live run monitor. Draft events without a published application remain workspace entries.

Typecheck and 74 tests pass; regression coverage includes timestamp ties, nonoverlapping pages, foreign-workspace cursors and omitted raw details. Populated desktop/mobile feeds were inspected against local QA history. Independent source review found no material issue. Existing desk design and flat rows are preserved.

### Workspace Agents

`/agents` is an owner-only directory of external agent connections across applications. The server summary omits tokens and hashes and reports Active, Expired, Revoked or Needs review (changed definitions, missing application or missing credential owner). Status is refreshed explicitly. Management links lead to the existing application configuration, where owners select the Agents tab to issue/revoke credentials. No access is created by opening the directory. Operators see an access explanation on direct navigation and no sidebar management entry.

Typecheck and 75 tests pass, including owner enforcement, tenant isolation, secret exclusion and credential lifecycle states. Desktop/mobile empty directory and application links inspected; populated states tested automatically. Existing design language retained; no new design tokens.

### Workspace Settings

`/settings` provides owner-only workspace renaming, a read-only membership list, and model configuration status. Renames validate a trimmed 1–80 character name, compare the previously loaded name atomically, and create an Activity event. Unsaved edits block navigation and disable refresh until saved/discarded. Conflict recovery explicitly instructs discard then refresh. Membership changes/invitations and browser-based provider editing are not implemented. Model status means configured, not verified connectivity; no API key or provider URL is returned.

Typecheck and 76 tests pass, covering tenant isolation, owner enforcement, name validation, concurrent edits and audit history. Desktop/mobile settings were inspected; dirty/discard behavior was verified without modifying the live workspace name. Actual rename persistence was exercised in isolated automated tests. Independent review found no material issue after clarifying conflict recovery text. Existing desk styles retained.

### Sidebar polish

Navigation density is reduced to 32px desktop rows with 16px SVG icons and a quieter application disclosure. Desktop navigation scrolls independently above persistent Settings/account controls; mobile retains 44px targets and a whole-menu scroll region capped at 55dvh. Long application names truncate visually with full title text available. No destination, access policy or application workflow changed. Linear's documented separation of favorites/team groups informed the hierarchy (https://linear.app/docs/favorites), while Kernel retains its existing design.

Verified desktop, 1024×600 and 390px mobile layout, disclosure collapse and visible account controls. Typecheck and source review passed. No new behavior tests added for this presentation-only change.

### Multiple workspaces and header context

Users can create an empty workspace and select any workspace they belong to from the header. The header pairs the active workspace with the current destination; mobile retains this context on a second row. Creation grants the creator ownership only, without copying applications, records, members or agent credentials. Existing membership rows/data remain intact under a composite user/workspace uniqueness constraint.

The browser retains active selection per tab in sessionStorage; each kernel request, including SSE, sends an explicit workspace header when selected. The server rechecks membership and uses that workspace's role. Selection changes use full navigation so existing unsaved-work guards run before the next page chooses its workspace. An explicit Return to default workspace action clears invalid/revoked selection; writes never silently fall back. External agent credentials retain their original workspace/application scope. API provider configuration remains server-wide.

Verification: typecheck, 77 tests and production build. Tests include empty creation, per-workspace roles, forbidden cross-workspace records, invalid/revoked membership and fallback to existing initial membership. Browser created QA Workspace Switching, selected its empty overview, then tested an invalid selection and recovered to Builder's workspace with prior applications/plans intact. Desktop/mobile header inspected. QA Workspace Switching remains as an empty test workspace; no live membership was removed. Workspace search, invitations and cross-device active-workspace sync are not part of this change.

### Workspace administration settings

Settings now uses four local sections inside the shared desk shell: General, Members & access, Models & providers, and Agents & permissions. Desktop sections sit beside a constrained content column; mobile sections wrap above the content. Section links persist in the URL hash. Unsaved workspace names retain navigation protection.

Owners can generate seven-day invitation links for a specific email and owner/operator role. Links are shared manually; no email is sent. Only a token hash is stored in the database. Acceptance previews the workspace and role, requires the signed-in account to match the email, consumes the invite, and preserves any existing membership role. Pending invitations can be revoked; issuing another for the same email replaces the old link. Demotion/removal invalidates invitations created by that member. Role changes use the expected current role and cannot target the acting owner. Membership edits and invitations produce workspace activity events. No live invitations or permissions were created during verification.

Models show installation-managed host, model, Responses API compatibility and timeout. The optional test sends a synthetic short prompt (no workspace data), times out after 15 seconds, reports sanitized errors and does not establish full-build reliability. Keys remain server-only. Native Bedrock support still requires an adapter or compatible gateway; per-workspace provider credentials are not implemented.

Agent settings list actual connections with state, expiry and action count, allow revocation, and link to existing application configuration for scoped credential issuance. Human review remains required. Regional defaults, billing, workspace deletion, notifications and integrations remain outside this implementation.

Validation: 80 tests pass, including recipient binding, expired/revoked/replaced invitations, cross-workspace membership protection, inviter demotion, safe model status and synthetic connection probing. Desktop settings sections and mobile layout inspected. Paid live model probes and real access grants were not executed.


### Dedicated settings sidebar

Settings now replaces the workspace sidebar with Back to workspace, searchable settings sections grouped under Workspace and Intelligence, and the existing account footer. The inner section directory is removed; the header shows the selected settings section beside the workspace switcher. Search filters section names and relevant keywords without changing the active page. Mobile uses the same navigation disclosure and closes on selection. Verified search, desktop/mobile layout, and Back to workspace unsaved-name protection; the test edit was discarded without saving.

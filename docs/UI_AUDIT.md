# Business application journey audit — 12 September 2026

Two independent Impeccable assessments covered Projects → draft/preview → published queue → proposal review → Configure/Versions/Agents. The existing visual identity was retained. Baseline scores are **24/40 design** and **10/20 technical**; these are pre-fix scores, not a post-fix certification.

## Implemented corrections

| Finding | Correction |
| --- | --- |
| P1: approval without evidence | Proposal review shows changed fields before/after, proposer, date, supplied inputs, policy checks, and commit consequence. Stale record proposals cannot be applied in the UI; the server remains authoritative for access, version and policy checks. |
| P1: unsaved edits lost on navigation | Route navigation offers Keep editing or Leave without saving; browser unload protection is enabled while dirty. |
| P1: long mobile form clipped | Dialog wrapper stays within the viewport and scrolls to all fields and submission. |
| P1: Configure hierarchy confusing | Application overview is the default, entity selectors are contextual, and the simulator is a secondary disclosure. |
| P2: draft/application confusion | Home separates drafts from published applications and shows application versions. |
| P2: preview resets on name/settings edits | Samples persist for non-schema changes; schema changes explicitly announce a reset. |
| P2: raw agent onboarding | MCP instructions, secure bearer-header guidance, and a one-time-secret read-access test are provided; direct HTTP details are collapsed. |
| P2: landmarks and narrow-screen overflow | Main landmarks, skip links, keyboard record buttons, contained table scrolling, wrapping, and larger small-screen/coarse-pointer controls. |
| Minor clarity | Monetary limits display dollars, empty queues distinguish filters from absent records, review badges are amber, and disconnected built-in agents are explained and disabled. |

## Verification

- `pnpm check`: 42 tests passed, TypeScript passed, production build passed. Added rendering tests cover proposal evidence and stale-record Apply protection.
- Desktop and 375×667 emulation: dirty navigation guard retains edited name when cancelled; leaving discards only temporary unsaved changes. A submitted preview record remained submitted after renaming.
- Synthetic QA proposal displayed author, submitted → approved diff and four policy checks. It was rejected after inspection; the live QA record remains submitted. No purchase transaction, publication or credential issuance occurred in this audit pass.
- Mobile queue had no document horizontal overflow. Dialog wrapper was 644.5px high at y=11.25 in a 667px viewport; scrolling exposed the submit button. Escape restored focus to New purchase request.
- Configure displayed the application version and policy summary with its simulator collapsed. MCP guidance and disconnected-model state were inspected.
- Detector ran once, reporting no findings (`[]`). This is not proof of overall accessibility or design quality.
- Independent finish reviewer disposition: **ship** for the scoped journey refinement, with no material fixes remaining. Captures and finish-review evidence live in `.impeccable/review/journey/`.

## Remaining work and limits

- Validate the complete journey with purchasing operators and a second business process; a fuller step-based builder may follow that evidence.
- Versions still uses a manual load action. Agent last-use/connection telemetry and OAuth onboarding remain future work.
- Schema changes reset preview examples with an explicit message rather than reconciling arbitrary preview records.
- No physical-device touch/virtual-keyboard or screen-reader session, exhaustive contrast audit, or large-dataset performance stress test was performed. No live model was configured. The new credential read-test UI was source-reviewed; credential authentication/lifecycle is covered by isolated server tests, not newly issued browser credentials.
- Existing design documentation drift was not repaired as part of this refinement; the documenter preserved DESIGN.md and its sidecar. The critique snapshot remains open for broader lower-priority follow-ups, rather than implying every baseline observation is closed.

## Independent baseline reports

# Assessment A — independent design review

Target: src/components/workspace-home.tsx, journey Projects → builder → purchasing queue/proposal → Configure/Versions/Agents. Reviewed PRODUCT.md, DESIGN.md and source. Browser: own new hidden in-app tab at http://127.0.0.1:3002; default 1280×720 viewport; tab closed. No detector inputs received. No saved changes, credentials, proposals, or publications created. No screenshot files persisted; visual screenshots inspected through native browser output. Live migration edit was not opened because Change application creates a persisted draft; migration component assessed in source and existing v2 history read live. No root AGENTS.md exists, so no project-specific personas invented. Ignore file was absent.

## Design specificity verdict

Authored and coherent at the visual-system level: the ink rail, paper canvas, square edges and serif job titles establish a quiet operational instrument. The purchasing queue is the strongest expression: records and their inspector share a single working surface, without decorative analytics. Composition becomes category-interchangeable in Configure, where simulator, package selector, five tabs and empty policy card feel like accumulated admin features rather than one connected application lifecycle. Product character should come from explaining what agents propose and humans commit, but the pivotal proposal review currently carries less evidence than the schema migration review.

## Heuristics

| # | Heuristic | Score | Evidence |
|---|---|---:|---|
|1|Visibility of system status|3|Saved draft, example data, model disconnection and current version are explicit; no connected-model state in operational agent disclosure.|
|2|Match to real world|2|Purchase request language is accessible; entity/package/project and cents-based rules require translation.|
|3|User control and freedom|3|Clear exits, draft discard/save; Escape closes approval dialog and restores button focus. Version restoration explicitly unavailable.|
|4|Consistency and standards|3|Very cohesive tokens and controls; entity becomes Package in Configure and operational labels diverge from configuration concepts.|
|5|Error prevention|2|Server checks and staged model are strong, but Apply surface lacks proposed values and attributable actor evidence.|
|6|Recognition rather than recall|2|Visible queue/detail works; proposal action lacks record context in modal and review lacks diff; Projects visually mixes saved drafts and running apps.|
|7|Flexibility and efficiency|2|Search/status filters, keyboard controls and entity switching present; no bulk review or common task accelerators found.|
|8|Aesthetic and minimalist design|3|Restrained palette, purposeful hierarchy; simulator and irrelevant package selector dominate global Configure tabs.|
|9|Error recovery|2|Specific stale-preview and blocker guidance in migration source; no recovery control in workspace fatal-error branch, and general errors simply expose caught messages.|
|10|Help and documentation|2|Contextual caveats and raw HTTP example exist; external-agent connection journey ends before a clear connection test or MCP setup guidance.|
|Total||24/40|Acceptable, significant improvement needed.|

## Strengths

1. Queue/inspector keeps record selection, business details and available actions together. At 1280×720 the submitted purchase can be understood without opening another page.
2. Sample and production boundaries are stated honestly: amber Example draft and Interactive preview labels; disconnected builder explanation; publication warning that sample records stay behind. Migration source gives affected record counts, before/after values and explicit stale preview/blocker states.
3. Visual language is coherent, and native keyboard mechanics work: approval dialog Escape closes and returns focus to Approve purchase; tabs have selected state and form inputs visible labels.

## Ranked issues

### 1. [P1] Human review does not show the change the human is authorizing

Evidence: src/components/kernel-dialogs.tsx:230–247 receives only record, action and booleans, then renders Pending action / generic waiting sentence / Reject / Apply. src/components/workbench-app.tsx:178 passes neither proposal input, actor, checks nor before/after effects. Source-confirmed; no live pending proposal was created for review. Live approval dialog also omits the selected record title/amount (kernel-dialogs.tsx:130 onward) and shows only generic Stage language.

Why: The product's core promise is reviewable agent actions. A reviewer must infer consequences from a raw action name and current record; they cannot inspect a decision note or attribution before committing. This is a consequential missing decision context, not a stylistic preference.

Fix: Pass the proposal to the reviewer. Show proposer, proposed action label, submitted inputs, field-level before → after changes, policy results and current/stale version state adjacent to Apply. Make the modal's call to action “Propose approval” and repeat the selected request name and amount. Keep one final clearly named commit control.

Suggested command: $impeccable harden (review completeness), then $impeccable clarify.

### 2. [P1] Configure leads users into a dead-end policy page and puts simulation above real administration

Evidence: live v2 application opens Configure with a 136px Simulator card, then entity/package toggle, five tabs, and “No policy settings.” Actual modification lives in Change application at the far upper right. Source src/components/project-build.tsx:66,84,91,117,159–160. The Package selector stays above Versions/Agents although these are application-scoped, and Agents shows both Procurement and Suppliers regardless of selected package.

Why: Users hunting policy edits are told the correct-looking tab has no settings. People connecting an agent first encounter an unrelated action that can stage business changes. The selector's apparent scope contradicts the content, increasing uncertainty about which application data access applies to.

Fix: Default editable apps to an Application overview with current version and Change application, recent publications and connected-agent state. Keep entity selection only inside entity-specific panels. Move simulator to an explicitly opened testing section. Omit the empty Policies tab for editable apps or replace it with policy summary and the direct edit path.

Suggested command: $impeccable distill.

### 3. [P2] Builder review is a long parallel document, and monetary rules expose storage units

Evidence: live builder shows description/editing in left column and interactive preview plus eight fields, three actions/rules and settings in right. Save/Publish sits midway down the left while the approval setting sits at the bottom of the right. Source src/components/project-builder.tsx:71,93,123–128. Actual display: “Approval ceiling (USD cents)” = 1000000; rule text “Amount (USD cents) ≤ 1000000” whereas preview amount is $1.00.

Why: Review requires cross-column scrolling and context retention. A business owner changes money in dollars elsewhere but must calculate cents here, making a spending constraint harder to verify. The disabled Revise with agent control retains prime placement when disconnected.

Fix: Provide clearly separated Preview / Fields & rules / Publish review sections with a persistent saved/unsaved indicator and final action area. Format monetary settings in dollars and convert at the storage boundary. Surface policy limits in the publishing summary in business units. When disconnected, emphasize available manual edits and example preview.

Suggested command: $impeccable clarify, then $impeccable layout.

### 4. [P2] Projects does not clearly separate running applications from saved drafts

Evidence: live home “Continue building” section is immediately followed by a Team purchasing live card bearing the same name as the draft; live card has no enclosing “Applications” heading or live/version marker. Source src/components/workspace-home.tsx:116,125–133.

Why: On a small workspace the almost-empty page makes the live card look subordinate to Continue building. The user must learn that Open draft edits a separate artifact while the unlabeled card opens business operations; accidental reopening of the wrong context is easy as drafts accumulate.

Fix: Add “Applications” heading with live version and “Open application” affordance; keep draft group separately bounded and label change drafts by their parent application/version. Preserve compact density rather than adding decorative cards.

Suggested command: $impeccable clarify.

### 5. [P2] Agent setup hands off to a raw HTTP example instead of a complete connection task

Evidence: src/components/agent-access.tsx:62; live Agents shows credential creation, credential list and Use the agent API with POST /api/agent and bearer placeholder. No MCP endpoint/configuration guidance or connection verification is present in this panel despite MCP being a shipped product capability. This was reviewed without issuing a credential.

Why: A small-team owner reaches the endpoint of “Connect an agent” with an API secret but no concrete path for configuring their client or verifying that it can read/propose. Safety caveats are useful, but the successful ending is missing.

Fix: Add expandable HTTP / MCP connection instructions with explicit server URL, bearer-header configuration and a safe read-only test. Show last connection/use and a next step to review a proposal. Keep action scope and all-record read scope visible before creation.

Suggested command: $impeccable onboard.

## Cognitive load

Overall moderate; builder and Configure local hotspots high. Checklist passes grouping and basic visual hierarchy. Failures: single focus (simulator competes with configuration), one thing at a time (builder edits/preview/rules/publish in parallel), working memory (proposal consequences and builder constraints), progressive disclosure (field/rule catalogue always expanded). Chunking and minimal-choice also fail locally: five status options in queue (six if pending exists); five peer Configure tabs; builder eight ungrouped field facts and preview actions; maximum supported eight entities renders peer toggles. Five tabs alone are not severe; mismatched scope makes this particular choice set harder.

Intrinsic load is real: defining and operating a business process requires understanding relationships, policies and approval. Germane learning is supported by an interactive example and repeatable entity controls. Extraneous load comes from terminology switches, cents arithmetic, draft/live ambiguity and missing review evidence.

## Emotional journey

Projects begins calmly but leaves draft vs live ambiguous. Opening the example creates the high point: a tangible queue makes the application understandable. Scrolling into rules and integer monetary settings creates a valley. Queue operation restores confidence with close record/action proximity, then the generic Stage dialog and thin pending review weaken the moment of commitment. Configure introduces another valley by displaying No policy settings. Agent setup ends on protocol instructions rather than a verified connection. The end state should reinforce “I know what this agent can do and where its proposal will appear.”

## Persona red flags

- Jordan, first-time business owner: Open draft vs live Team purchasing card looks like one group; Configure → Policies says no settings; cents-based approval ceiling requires calculation; entity/package terminology feels like implementation structure.
- Alex, frequent operator: every action goes through stage/apply; no bulk review or accelerators found. More importantly, proposal identity, actor and effect are not co-located, so deliberate review requires investigation elsewhere. Explicitly preserve review rather than remove it for speed.
- Sam, keyboard/screen-reader user: approval dialog dismissal/focus return passed. Generated live queue rows use tabIndex and key handlers on tr with aria-selected (workbench-app.tsx:152) but no explicit button/link; AX exposes ordinary row/cells instead of an action label. Preview uses a titled button, so the selection interaction is inconsistent. No broader accessibility certification claimed.

## Minor observations

- Versions requires Load version history after choosing Versions; load on entry would remove an unnecessary read-only step (project-build.tsx:159).
- The queue's zero-record state always says “match these filters,” including a freshly published empty application (workbench-app.tsx:139); distinguish empty from filtered-out and cue the first needed related record.
- Migration “Ready for review” renders success green before human review is complete (migration-review.tsx:8); neutral/amber would better match DESIGN's review semantics.
- Ask the project agent has no visible model-connected/disconnected state unlike the builder (workbench-app.tsx:109); this is source-backed absence, not a live model request test.

## Questions for synthesis

- What evidence should an owner be able to cite after pressing Apply to explain exactly what they authorized?
- Can Configure begin with the running application's lifecycle rather than the implementation's feature inventory?
- What is the success screen for connecting an agent: a secret issued, or a verified client with a clear path to review its first proposal?


# Assessment B — technical baseline

Independent source + CLI detector + fresh CUA in-app browser tab. No Assessment A findings were received. Target src/components main journey and shared UI/styles. Inspected signed-in QA application app-cmtxp8rsb0006ufvtyzxy1p5y at http://127.0.0.1:3002.

## Scores
| Dimension | Score / 4 | Evidence |
|---|---:|---|
| Accessibility | 2 | React Aria labels/dialog/tabs work, but populated routes lack main landmark and short-screen dialog hides controls. |
| Performance | 3 | Memoized filtering and modest effects; no measured runtime bottleneck in tiny QA fixture; large datasets not profiled. |
| Responsive | 1 | Modal cannot fit/scroll at 375×667; workbench produces page overflow; compact touch targets. |
| Theming | 2 | Core light palette is tokenized, but .dark only changes shadcn token family, not custom --color-* component palette. No dark-mode UI offered or tested. |
| Implementation integrity | 2 | Coherent procurement workflow, but unsaved navigation silently loses draft changes and preview data resets whenever definition changes. |
| Total | 10/20 | Acceptable, significant work needed. |

## Detector
Ran exactly once: `.agents/skills/impeccable/scripts/impeccable detect --json src/components`, exit 0. Full JSON /tmp/kernel-journey-detector.json = []. Findings 0; verified detector findings 0; detector false positives 0. Rule/file list empty. This is a limited deterministic scan, not a clean accessibility verdict.

## Verified findings (6 total: P0 0, P1 2, P2 4, P3 0)

### P1 — Short-screen create dialog clips close and submit controls with no scroll recovery
- Category: Responsive / Accessibility.
- Source: src/styles.css:248 (.dialog-overlay fixed, centered, overflow visible), :257 (.dialog-modal), :258 (.dialog-content no max-height/overflow).
- Browser: New purchase request on 375×667 rendered dialog rect y=-36.25, bottom=703.25, height=739.5; close control is above viewport and submit extends below viewport. CUA scroll down inside modal did not move dialog or page (scrollY remains 0). At 390×844 modal fits; at 1280×720 its 717px height nearly consumes viewport. Larger definitions, zoom, keyboard will worsen this.
- Impact: Touch/pointer users on short screens cannot reliably reach all create controls. WCAG reflow/focus visibility concern. Treat P1 rather than P0 because larger viewport/keyboard provides workaround.
- Fix: bound modal to dynamic viewport minus padding, scroll dialog body, keep heading/close/actions reachable. $impeccable adapt / harden.

### P1 — Draft dirty-state protection does not cover navigation
- Category: Implementation integrity / user control.
- Source: src/components/project-builder.tsx:37 dirty; :66-68 only local Close disabled; src/components/workspace-home.tsx:86 sidebar links remain active. No route blocker or beforeunload persistence in relevant sources.
- Browser reproduction: Open saved Team purchasing draft → edit Project name to Audit unsaved check → UI shows Unsaved changes and disables Close → sidebar Team purchasing immediately navigates without confirmation → All projects → Open draft restores Team purchasing. Local test edit lost; no Save/publish was invoked and saved server state unchanged.
- Impact: Users lose real editing work using ordinary navigation despite visible protection on Close.
- Fix: route/refresh exit guard with save/discard/stay or autosave recoverable local draft. $impeccable harden.

### P2 — Main journey pages have no main landmark or skip route
- Category: Accessibility.
- Source: src/components/workspace-home.tsx:105, src/components/workbench-app.tsx:98, src/components/project-build.tsx:55 use div.main. ProjectFrame only has main in loading shell.
- Browser: document.querySelectorAll('main,[role=main]').length = 0 in populated home, workbench and configuration; DOM/AX has labeled navigation and h1 but no main. No skip link in source.
- Impact: Screen-reader landmark navigation cannot jump to primary work; keyboard users traverse repeated navigation.
- Fix: main element around each primary content and skip-to-main link. $impeccable harden.

### P2 — Queue table causes horizontal page overflow on mobile
- Category: Responsive.
- Source: src/components/workbench-app.tsx:140 plain table lacks table-scroll wrapper used by builder at project-builder.tsx:117; src/styles.css:473-482 table min-content and nowrap status.
- Browser: 375px viewport gave document scrollWidth=393; queue table bounds x33.25–374.57, wider than containing card's usable width; screenshot shows horizontal page scrollbar. QA record uses ordinary short title/supplier, so not a pathological input.
- Impact: Page-level horizontal panning and clipped card edge; worse with long supplier/record values.
- Fix: contained accessible horizontal table scroll or compact mobile row presentation, wrap long content. $impeccable adapt.

### P2 — Preview records silently reset on any definition edit
- Category: Implementation integrity.
- Source: src/components/project-builder.tsx:39-42 regenerates samples for every definition dependency change, including project name change :88.
- Evidence: deterministic source; changing project name invokes setDefinition, effect replaces every preview record with initial samples and clears previewResult. Browser confirmed name editing updates definition/UI; multi-record loss not exercised to avoid extra mutations.
- Impact: A user testing scenarios loses sample records/actions after harmless name/field/settings edit, must recreate test scenario. This also erases feedback about prior test.
- Fix: retain preview state for name/settings changes; reconcile entity schema changes intentionally and communicate resets. $impeccable harden.

### P2 — Compact controls fall below 44px touch comfort target
- Category: Responsive.
- Source: src/styles.css:116-117 small/icon buttons, :231 toggle, :244 tabs.
- Browser: configuration tabs 31.5px high; modal Close 33.75×33.75; default submit 38px high. 15px root scales rem dimensions.
- Impact: harder one-handed/motor-impaired input. Do not label an automatic WCAG 2.2 AA failure: these generally exceed its 24px minimum; 44px is stronger touch/AAA target.
- Fix: add coarse-pointer minimum sizing/padding without changing desktop density. $impeccable adapt / polish.

## Positive evidence and limits
- Dialog has accessible title, initial focus inside modal; Escape closed it and returned focus to New purchase request. No submit or server mutation performed.
- ArrowRight from Versions tab selected/focused Agents tab; AX reports tab relationships and selected state. Agent checkboxes have full action+description names and fieldset legend. No credential was issued.
- Core token contrast calculated from source: quiet-on-white 5.81:1, quiet-on-paper 5.32:1, primary white-on-cobalt 5.57:1, success badge 4.53:1, warning badge 4.79:1. These sampled pairs pass AA normal text. Not an exhaustive contrast audit.
- Alerts use role alert/status; busy builder status exists; native input required validation and React Aria error primitives are present.
- No console errors/warnings captured in fresh audit tab.
- No actual touch gestures/device/virtual-keyboard or screen-reader session executed. Responsive evidence is CUA viewport emulation with DOM geometry and screenshots; no performance stress test; no live migration execution or staging/publishing.
- Reduced-motion alternative absent for spinner/shimmer (styles :199-200); minor concern, not included in six prioritized issue count. Dark token discrepancy is code-level theming debt, not claimed shipped dark-mode failure.

## Run notes
Fresh temporary tab ID 1 owned by Assessment B, closed. Viewport overrides 390×844, 375×667; reset to default 1280×720 before close. Mutable injection unavailable: advertised evaluate is read-only. No overlay attempted or claimed; no live-server started. Fallback evidence is CLI JSON plus DOM/AX/screenshots. Ignore file absent. No code edits, saved draft edits, credentials, publishing, staging or server changes. /tmp report and detector JSON intentionally retained for parent synthesis/cleanup.

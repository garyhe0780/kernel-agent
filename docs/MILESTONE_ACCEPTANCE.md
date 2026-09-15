# Describe → preview → publish → operate acceptance

Status on 2026-09-12: implementation and second-process technical acceptance complete. The isolated live-model run and authenticated browser happy path passed with MiniMax-M3 and medium reasoning; real-operator acceptance remains open. Passing automated tests or an agent-driven browser journey is not evidence of a real user trial.

## Second business process: CRM

Local application: `http://127.0.0.1:3002/p/app-cmtyciwz90001ianjaeioal12`, QA Sales workspace, published version 1. Owner: existing Builder QA account. The authored definition is `tests/fixtures/crm-application.ts`; it was saved through Kernel.saveDraft as an example in the synthetic QA workspace, then opened and published through the normal browser UI. This setup bypasses natural-language generation and is not evidence that generation works.

Browser results:

| Check | Observed result |
| --- | --- |
| Saved draft | Loaded from workspace drafts with explicit authored/synthetic assumption and disconnected-model notice. |
| Preview invalid conversion | Convert from Draft blocked: expected Open. |
| Publication | New application opened with zero leads; preview record was not installed. |
| Generated form | Created QA sample opportunity / QA Sample Company / QA Contact / Inbound. |
| Draft layout | Contact details visible; Pipeline progress hidden with reveal-all available. |
| Open proposal | Before Draft / proposed Open; stored status stayed Draft pending review. |
| Apply Open | Status and counts changed to Open; Pipeline progress became visible. |
| Open leads view | One lead with configured Lead, Company, Status columns and title sorting. |
| Convert proposal | Before Open / proposed Converted; lead stayed in Open leads pending review. |
| Apply conversion | Open leads became empty; navigation showed Open leads 0, Converted leads 1, Review leads 0. |
| Converted leads view | Same record, Converted status, no remaining lifecycle actions. |
| Activity | Creation plus separate staged/applied entries for Open and Convert, attributed to Builder QA. |

The local synthetic application is retained for inspection. No purchasing records were modified. A new integration test repeats this journey against a temporary database and additionally checks agent apply rejection, idempotent review, record version 3 and exactly two applied proposal events. Current suite: 58 passed; type checking passed. No production implementation changed in this validation pass.

## Live-model acceptance — isolated run passed

The running UI recognizes MiniMax-M3. A complete isolated live run passed on 2026-09-12 with KERNEL_REASONING_EFFORT=medium; see `validation/model-acceptance-2026-09-12.json`. Earlier runs exposed schema echoes, excessive clarification lengths and Markdown-wrapped JSON. Prompt clarification, a bounded repair and strict single-fence handling addressed these observed failures. This is one successful workflow run, not a reliability benchmark. Configure KERNEL_API_KEY, KERNEL_MODEL and the provider’s KERNEL_API_BASE_URL through the server environment, then restart the local server. OPENAI_API_KEY remains a fallback for existing setups; see `MODEL_PROVIDERS.md`. Never place credentials in prompts, evidence files or source control.

The runner verified ambiguous/clear clarification, saved generated definitions, empty publication, a live chosen action requiring owner review and a live additive revision preserving the existing definition and record. Authenticated browser generation, operation and additive revision also passed below; deterministic failure recovery has separate evidence. Browser clarification questions and answer retention passed, but generation from those answers encountered two connection/timeout failures and remains unverified. The following scenarios remain the real-operator acceptance checklist:

1. Request: “Create a sales application for leads with company, contact and source. Start in Draft. Operators can propose opening a lead, then converting or marking it lost. Owners review every change. Include Open leads and Converted leads views.” Verify a validated saved definition and honest supported scope.
2. Start a separate ambiguous purchasing brief: “Build purchasing for our team; larger purchases need extra checks.” Verify focused questions, edit suggested answers, and verify the resulting definition reflects confirmed answers or clearly states unsupported routing.
3. Request an additive revision: “Add an optional internal note to leads; keep the workflow and views.” Review, publish and verify the existing synthetic lead remains intact.
4. Ask the operational assistant to open a synthetic draft lead. Verify the model selects an allowed action, stages a proposal and does not change the record until owner review.
5. Reload pending clarification/build states and exercise a failed request. Confirm accurate recovery messaging and no accidental publication of an old definition.

## Operator acceptance — open

Use `OPERATOR_TRIAL.md` for the task script, blank observation sheet and gate-closing criteria. No participant results have been collected.

The owner has chosen to involve purchasing and sales colleagues. Participant instructions are in `OPERATOR_HANDOUT.md`; record their actual observations in `validation/operator-trial-results.md`. Localhost access requires using the host computer; no remote exposure or new credentials have been configured.

Run with a purchasing operator and a second-process operator. Use synthetic records and observe without coaching. Do not count an agent-driven browser journey as an operator interview.

Ask each person to create a record, find the relevant saved view, explain the difference between a proposal and an applied change, review a change, inspect activity, and find a conditionally hidden detail. Ask an owner to revise a label or field and explain the migration preview before publication.

Record completion, mistakes, points needing help, confusing copy and the person's own words. Close this gate only when critical misunderstandings and task-blocking defects are resolved and rechecked. Do not invent acceptance, task times or feedback.

Implementation checks after live acceptance: 64 mocked/unit/integration tests, type checking and production build passed. `pnpm accept:model` is opt-in and uses a temporary database; it is not part of the offline check suite.

## Browser failure/retry verification — passed

On 2026-09-12 the actual ProjectBuilder passed deterministic browser recovery checks using an isolated injected transport: clarification failure, generation failure, unchanged and edited retries, Back to description, discard/reopen, and saved-revision reload. This found and fixed a stale-publication path after clarification failure. See `tests/browser-recovery/README.md` and `.impeccable/review/recovery/verification.md`. No live provider requests or real application changes were made in that pass. This validates component behavior under controlled failures; the live authenticated browser happy path below and operator observation are distinct checks. Unsaved text is not crash-persisted.

## Authenticated live-model browser walkthrough — passed

On 2026-09-12, approximately 21:13–21:16 Asia/Shanghai, the existing Builder QA owner session created **QA Live Sales** through the normal UI using MiniMax-M3. Retained local application: `http://127.0.0.1:3002/p/app-cmtyepnpj0001iad0k5guah5m`, published version 1. This definition was generated live, unlike the authored CRM fixture above.

- A fully specified synthetic CRM brief passed clarification without questions and generated a saved draft with Sales pipeline navigation, Open leads/Converted leads views, and Contact details/Pipeline progress sections.
- Preview conversion from Draft was blocked with “Expected status = open; received draft.” Reloading the workspace and reopening the draft retained its name, brief and definition.
- Publication opened an empty application. The generated form created QA browser opportunity / QA Synthetic Company / QA Contact / Inbound as Draft.
- The live application assistant selected `open` and staged a proposal. The UI still displayed Draft, Open leads 0, and Review leads 1. Review showed Draft → Open and 2/2 policy checks, attributed to Builder QA · agent.
- Applying the reviewed change switched the record to Open, Open leads to 1, and Review leads to 0. Activity showed distinct staged and applied events. Reload preserved the Open record and view counts.

Evidence: `.impeccable/review/live-browser/` contains preview, empty-publication, staged-agent, review, applied-activity and reload accessibility captures plus a desktop viewport screenshot. Existing purchasing and authored CRM applications were not modified. No production code changed during this pass; the previous 64-test/typecheck/build result remains the latest code validation.

The initial preview server was stopped. Restarting with its default origin correctly rejected a write from port 3002; launching with `BETTER_AUTH_URL=http://127.0.0.1:3002 pnpm dev --port 3002 --strictPort` resolved the configuration mismatch, and Retry request preserved the entered brief. No origin protection was relaxed. This successful synthetic journey is not a reliability benchmark or operator sign-off.

### Live additive revision — passed

The authenticated browser requested an optional editable `internalNote` string with no default and preservation of all existing behavior. MiniMax generated draft revision 2. Migration preview showed exactly two changes: the added field and an explanatory assumption. It checked one existing record, reported zero value updates, no deletions and no pending proposal invalidations. After publishing application version 2, QA browser opportunity retained its title, company, contact, Inbound source and Open status; navigation still showed one Open lead. Internal note appeared as Not set under Other details. Evidence: `additive-migration.txt` and `additive-published.txt` in `.impeccable/review/live-browser/`.

### Live clarification — partial; generation blocked

A separate synthetic QA Clarified Purchasing brief produced three questions about the amount threshold, extra checks and lifecycle. Suggestions included USD 1000 and several checks. Explicit answers replaced these with strictly above USD 2500, only supplier verification, and Draft → Submitted → Approved with owner review. The UI incorporated all answers into the build request.

Generation and one unchanged Retry build both returned the sanitized connection/timeout error. Answers remained editable and intact; no new draft or application was published. This proves question rendering and live failure recovery, not that a generated policy honors the answers. Do not count this scenario as passed. Evidence: `clarification-answers.txt`, `clarification-live-timeout.txt` and `clarification-retry-timeout.txt` under `.impeccable/review/live-browser/`. The browser tab is retained with answers for later retry; unsaved inputs are not crash-persistent. Provider generation from these confirmed answers and real-operator observations remain open.

A subsequent unchanged browser retry also returned the connection/timeout error. No definition was produced or published. Review of the current policy engine confirms that its `eq`/`lte` conjunctions cannot express the requested conditional supplier check as one approval action. A passing result must explicitly disclose that unsupported requirement or provide a clearly explained supported alternative for review; it must not silently make supplier verification mandatory for all amounts or block every purchase above USD 2500. Exact single-action conditional enforcement would require a separately implemented policy capability. This limitation is not evidence that it caused the provider timeouts.

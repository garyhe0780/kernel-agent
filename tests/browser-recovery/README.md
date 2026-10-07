# Browser recovery regression

Run `pnpm test:browser-recovery` and open http://127.0.0.1:3010 in a temporary browser tab. This renders the actual ProjectBuilder with an injected transport; no API keys, live model, authentication, application database or publication endpoint are used. Saved fixture drafts use sessionStorage; reload retains only the saved draft. Request counters reset on reload.

The fixture server and the main app use separate Vite dependency caches (`node_modules/.vite-browser-recovery` and `node_modules/.vite-app`). Keep these separate when running both servers; sharing a cache can replace optimized chunks and break the app's dynamic route imports. To check isolation, open a fixture while the app is running on port 3000, then reload an application route and confirm its modules still load.

1. Edit the description and choose Revise with agent. The first clarification call fails. Verify the description remains, Retry request is enabled, and Save draft / Publish application are disabled. No save_draft request should appear in the visible request trace.
2. Retry request. Verify the trace reads clarify → clarify and a question appears. Answer it yourself; Build with these answers must be disabled until answered.
3. Build. The first generation call fails. Verify the answer is retained in the description, the saved revision is unchanged, Save/Publish remain disabled, and Retry build is available.
4. Retry without editing: trace must end build → build, not build → clarify. Success advances the saved revision and enables Publish; do not publish (fixture deliberately rejects that command).
5. Reload. Verify the recovered name, revision and composed description survive.
6. Repeat the failures after reload. Edit a failed build's description: the retry must call clarify. Back to description must keep Save/Publish blocked.
7. Discard, then Reopen saved draft. Verify only the last successfully saved definition and description return.

Check desktop and 390px mobile layouts: error/retry copy should wrap, controls remain readable, and disabled publication is reflected in the accessibility tree. These are deterministic browser/component tests, not real-operator acceptance. Browser crash recovery and persistence of unsaved text are not provided by this fixture or claimed by this check.

## Chat-led creation

Open `/studio.html` on the same fixture server. It renders ApplicationStudio and ProjectBuilder with synthetic fetch responses and never reaches a model or database.

1. Choose an example prompt: it fills the composer without starting generation.
2. Start planning: the plan appears inline; Build this application stays disabled until the review checkbox is checked.
3. Build: conversation remains beside the preview on desktop and stacks on a 390px viewport.
4. Publish opens a review dialog; dismiss it without publishing.
5. Type a revision: Publish becomes disabled. Send it: the revised plan requires explicit review again.
6. Edit preview fields: save or discard preview edits before requesting a chat revision.

This fixture covers UI sequencing with synthetic responses; server versioning and publication authorization remain covered by kernel tests.

The studio fixture now persists its synthetic plan/job in sessionStorage. Building pauses on an injected field-generation failure after one saved task. Close/reopen or reload to recover that status, then Retry failed task; the preview should open without a second plan confirmation. Close remains enabled during the queued/running job. Publication is never automatic.

## Scoped application assistant

Open `/assistant.html`. It renders the actual ApplicationAssistant with synthetic fetch responses. The fixture blocks other requests; no provider, authentication, or application database is used.

1. Select Synthetic CRM agent. Require human review must be the default.
2. Enter a task and choose Plan task. The first request fails; task text and selection must remain.
3. Retry unchanged. Request evidence must show `sameRetryKey: true`, and the run must display Waiting with the Inbox explanation.
4. Cancel run. It becomes Cancelled and Advance/Cancel controls disappear. Reload: the recent run is restored from fixture session storage (unsaved task text is not persisted).
5. Select the credential and opt into automatic operations. Verify the warning. Submit and retry the synthetic failure; request evidence shows `automatic: true` and the same key.
6. Advance run. The synthetic response produces Completed, 3/3 steps. This tests rendering; actual human review and policies are verified in the database journey tests.
7. Toggle narrow layout to inspect the component at 350px width. This is a narrow-container check, not a real mobile-device test.

Observed on 2026-09-27: all steps above passed. Evidence: `validation/agent-acceptance/browser-completed.png` and `.txt`. These checks do not establish authenticated browser integration or live-model accuracy.

Run inspection fixture: open `/run-inspection.html` on the same fixture server. It uses the actual assistant with synthetic cancelled and rejected runs. Expand “Inspect steps and history” and “Input and proposed changes”; check applied versus cancelled outcomes, preserved effects guidance, cancellation actor/time, disabled retry for the rejected proposal, and the Open record callback. Inspect at desktop and 390px width. Browser verification of this fixture was blocked on 2026-09-28 by an unavailable browser automation service.


## CRM editing

Open `/crm.html` for synthetic deal, account, owner and task records rendered by the actual board/detail/edit components. Open Edit deal, verify relationships and values are retained, change Next step, leave optional dates/notes/contact blank, and save. The fixture must show the revised next step and unchanged USD amount. Toggle Narrow layout to inspect a 390px container; this is not a full mobile-device test. No live API requests or records are involved.

The CRM fixture also supplies two synthetic workspace members. Reassign the deal from Alex Chen to Sam Rivera, save, and verify that board/details show Sam while My deals changes from 1 to 0. This verifies component behavior; member access enforcement is covered by database tests.

Related creation: choose New task in Related records. The deal must already be displayed and fixed. Enter a title and submit: the first attempt injects a save failure; title and relation must persist. Submit again: the form closes and Tasks increases from 1 to 2 with the new title. New activity must also be available when its related list is empty. Closing and reopening must discard the previous creation form.

Relationship choices: Edit deal starts with Example account and Jordan at Example. Change Account to Second account: Jordan remains visible with needs attention, and Save must not close the form. Primary contact offers Taylor at Second plus an explicit clear option; Jordan is disabled. Choose Taylor and save; account/contact details must both update. New deal for account fixes Example account and offers only Jordan. The fixture deliberately omits rule metadata on action inputs to exercise entity-effect mapping.

CSV export: Export CSV downloads the synthetic deal with all fields. Verify one data row, its record ID, raw amount 250000 in the cents column, and both IDs/names for account, contact and assigned member. The downloaded file is synthetic test data. Pure export tests cover filtering boundaries, order, Unicode/quotes/newlines, unavailable relationships and formula-like text.

## Application shell polish

Open `/application-shell.html` for the actual WorkbenchApp with an empty Tasks view, or add `?populated` for one synthetic task and its details. Its synthetic session and fetch adapter never reach the live database; mutations return a preview-only error. Verify application switching, saved-view disclosure, entity/view navigation, breadcrumb ancestors, empty-state recovery, and mobile navigation. Tables scroll locally on narrow screens.

Adaptive sidebar: `?pattern=purchasing` uses the actual purchasing presentation. Purchase requests and Suppliers each have one view and must render as single direct rows without a chevron or child row. Suppliers opens Active suppliers; its breadcrumb ancestor opens all suppliers, and the sidebar remains selected. In the CRM preview, Deals and Tasks retain multi-view disclosures while Accounts, Contacts, and Activities become direct rows. Add `&no-views` to the purchasing preview to verify direct access to entity-wide queues without saved views. At 390px, select a destination with Enter: navigation must close and focus must move to `#main-content`. Review must be the sole current sidebar item while reviewing.

Semantic icons: purchasing uses a cart, suppliers a building, review a clipboard check, and account management a gear. The application mark stays a cart when navigating to Suppliers. Other catalog patterns can be previewed with `?pattern=crm_sales`, `?pattern=issues`, `?pattern=payments`, or `?pattern=support`. Check distinct entity icons, consistent 16px sidebar sizing and 1.7 stroke width, selected-color inheritance, and desktop/mobile navigation. Unit and publication tests cover icon inference, renamed/localized labels, unknown-type fallback, validated overrides, namespaced snapshots, and migration evidence.


## Sales CRM page audit

Open `/application-shell.html?audit` for the actual WorkbenchApp with validated synthetic account, contact, two deals (including a large amount), task and activity records. The fixture starts at Open tasks; navigate through every CRM destination. Add `&screen=configure` for actual ProjectBuild configuration tabs/entity schemas, or `&screen=members` for the application-member directory. Use `/members.html` for synthetic group members, permission policies and settings. `&load-failure` injects one snapshot failure, then Try again recovers.

No audit requests reach the live database or model. Mutations are blocked. This checks the current source/catalog renderer, not the target application's authenticated persisted definition. Coverage and captures from the 2026-10-07 pass are in `validation/crm-audit/`; conclusions and limitations are in `docs/UI_AUDIT.md`.

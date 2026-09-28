# Browser recovery regression

Run `pnpm test:browser-recovery` and open http://127.0.0.1:3010 in a temporary browser tab. This renders the actual ProjectBuilder with an injected transport; no API keys, live model, authentication, application database or publication endpoint are used. Saved fixture drafts use sessionStorage; reload retains only the saved draft. Request counters reset on reload.

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

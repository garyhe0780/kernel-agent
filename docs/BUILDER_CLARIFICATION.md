# Builder clarification

The connected builder first checks whether the business request needs clarification. It asks at most three questions about consequential workflow decisions, with a short reason and suggested answer for each. Clear requests and straightforward revisions proceed directly to generation. This is one clarification round, not an open-ended chat.

Users can write answers, explicitly use an individual suggestion, or use suggested assumptions for remaining questions. Written answers take precedence. Unanswered suggestions are labeled `Suggested assumption (not confirmed)` in the generation brief. The combined description is visible/editable and is saved with a successfully generated draft. It is limited to 4,000 characters; answers are limited to 500 characters. Oversized input produces a recovery message rather than truncation.

Questions and pending answers are unsaved until generation succeeds. Returning to the description clears the pending questions. Navigation guards protect unfinished edits. If generation fails, the last saved definition remains unchanged, the composed brief remains unsaved in the editor, and saving/publishing are disabled until retry or discard. Existing manual definition edits are saved before clarification with the prior brief, so a pending model request is never described as already implemented. Unsaved text is not restored after deliberately leaving or reloading.

`clarify` is an authenticated, owner-only human API command using the same draft ownership/version checks as `build`; bearer agents cannot call it. It returns bounded validated question JSON and does not write a definition. The client then invokes the existing version-checked build path. There are no schema/database migrations. `ProjectBuilder.send` defaults to the real request function and supports an injected transport for component verification; production callers provide no override.

The model prompt distinguishes supported workflows from unsupported integrations/autonomy and avoids reopening answered decisions. Server-side application validation remains authoritative. Clarification does not authorize publication or operational execution.

Verification: 54 tests pass, including bounded/duplicate question validation, explicit-answer precedence, assumption labeling, size rejection, model transport and clear-request skipping. The actual builder component was exercised on desktop/mobile with an isolated synthetic transport: questions, disabled incomplete submit, individual suggested answer, assumptions, failed build preserving unsaved answers and saved version, retry success, publication guard. No live model generation or provider quality claim is made; server credentials remain unconfigured. Temporary fixture and server are removed after verification.

Recovery distinguishes pending clarification from pending generation. Either blocks Save and Publish after failure. Retry request repeats clarification; Retry build repeats generation only for an unchanged brief. Editing the brief after failure returns to clarification. Returning from questions to the description keeps the guard; only success or discard clears it. Browser regression instructions: `tests/browser-recovery/README.md`.


## Confirmed-plan flow (current UI)

ApplicationStudio replaces the direct clarify-then-build path for creation and model revisions. `save_plan` persists planning content before `plan_step: propose` calls the provider. The result contains a business plan and at most three questions. The owner can edit sections and answers, save for later, and explicitly confirm before generation. A persisted `needsProposal` flag prevents saved follow-ups from being ignored by confirmation, including after failed provider requests. Only successful proposal generation clears it.

`plan_step: build` requires a confirmed current version, claims it as building, then atomically stores the validated draft and marks the plan generated. Edits/recovery invalidate late results. A linked draft cannot be published from an unbuilt changed plan. Check build status reloads saved state after an interrupted browser wait; Recover plan invalidates the earlier attempt and returns to planning. This does not cancel an already dispatched provider request.

The old clarification component and injected recovery fixture remain for regression evidence, but they are not the active creation flow. The direct `build` HTTP command now rejects with PLAN_REQUIRED. The model-only acceptance runner continues to exercise lower-level model and kernel behavior, not this new UI confirmation gate.

# Sales CRM: daily workflow and follow-through

The `crm_sales` pattern adds deals, accounts, contacts, team assignments, tasks and activities. The original `crm` pattern and all existing module releases remain available unchanged.

## Architecture boundary

- Kernel owns field validation, relationship checks, action evaluation, authorization, version checks, audit events, and publication/migration.
- `src/kernel/modules/directory.ts` supplies accounts, contacts and a people directory. A team-directory record is a business assignment, not a user credential or permission.
- `src/kernel/modules/work.ts` supplies tasks and activities without sales dependencies.
- `src/kernel/modules/sales.ts` defines deal stages and adapts tasks/activities by adding deal ports. No sales identifiers are used in the execution engine or shared record components.
- `crm_sales` composes exact module releases and views. Any other application can reuse the directory/work modules.

## Shared contract additions

Application contract version 6 supports string fields with `format: "date"`. Values use valid YYYY-MM-DD calendar dates, without timezone conversion. Empty strings represent unset dates; use a positive minimum length to require a nonempty date. Date-aware controls, creation, edits and MCP actions use the same validator. Relative-date queries are supported as described below; reminder delivery is not implemented.

An action may set `humanExecution: "direct"`. Omission still requires review. Authenticated human clients call `act` with record ID, action, input, expected record version and expected definition version. The transaction checks membership, application access, the declared action mode, role, preconditions, policies and relationships; it conditionally updates the record version and writes before/after audit evidence. A stale retry is rejected rather than reapplied. The interface captures the versions when the dialog opens.

Agents cannot call this human endpoint. Existing MCP stage tools still create proposals. Automatic agent execution still needs the separate owner-issued, version-pinned grant. Human direct execution never upgrades a credential. Existing purchasing approval behavior remains unchanged.

A repository module can opt into `recordEditing: true`. Assembly compilation generates a normal `edit` action over editable fields, including bound relationship ports. Status and other kernel-owned fields are excluded. This action is available to human operators and to agents explicitly granted that action through the existing MCP mechanism. References can be cleared only when the entity field permits it.

Boards render the configured view columns, including money and next steps. Reverse relationship links in record details are derived from published definitions and loaded records. They work across domains and let an account open its deals/contacts, or a deal open its tasks and activities.

## Sales workflow

1. Create an account, optional team-directory owner, and account contacts.
2. Create a deal with value in USD, expected close date, next step and follow-up date.
3. Record calls, meetings, email history or notes as activities linked to the deal. Recording an email does not send it.
4. Update the deal with Edit deal and create a linked follow-up task.
5. Advance through New, Qualified, Discovery, Proposal, Negotiation and Won; closing Lost requires a reason. Routine human actions apply immediately and appear in audit activity.
6. Use the pipeline, follow-up-date ledger, task list and related-record links to review the work.

The overview reports counts and total recorded value across the selected view, including closed deals. It is not a weighted revenue forecast.

## Existing CRM upgrades

Use `upgradeLegacyCrm` to author a custom compatibility definition from the new package. It preserves draft/open/converted values and provides explicit actions to move those stages to new/qualified/won. It does not rewrite existing stages during publication. Existing customer/opportunity storage identities are retained. Unrecognized legacy stages fail explicitly.

Use MCP `edit_project`, `save_draft`, `preview_migration`, then `publish_draft` with the preview token. Never bypass migration blockers. As with other definition upgrades, affected existing agent grants must be reviewed and reissued; they do not gain the new operations automatically. The compatibility definition is a snapshot of the package; future module releases require another explicit reviewed migration.

## Validation and scope

The database tests cover the daily workflow, dates, legacy preservation, audit events, operator edits, reference validation, status injection, optimistic concurrency, workspace isolation, MCP review defaults and purchasing approval preservation. The isolated `/crm.html` browser fixture uses the real record board, details, related links and edit dialog; it does not change live data. Narrow-container inspection is not a full mobile-device acceptance test.

Remaining work: reminders, relationship creation inside forms, broader cross-record policies, multiple deal stakeholders, bulk import, deduplication, multiple currencies, forecasts, email/calendar integrations, and full authenticated end-to-end browser acceptance.

## Local publication evidence — 2026-09-28

Upgraded `app-cmul5sbbs000552iam4hb3tyj` through localhost-kernel MCP to Sales CRM version 2. The validated migration retained two existing records and their stored lifecycle states, adding default fields and four empty entities. No synthetic records were installed. Publication was confirmed through `list_applications`.

Validation: the full 184-test suite passed; the subsequently added transactional legacy-publication regression passed in the eight-test sales suite. Type checking and production build passed. The mechanical UI scan returned no findings. Browser fixture checks verified retained form values, USD amount handling, blank optional fields, saving a revised next step, board/detail rendering and a 390px container. The live authenticated UI was not exercised because the browser session required sign-in.

## Follow-through increment

Kernel now supports a generic string field with `format: "user"`. Nonempty assignments must name an eligible workspace member with access to the application. The UI displays member names; the stored value is the user ID. This is separate from the existing business people directory. New immutable version-2 sales/task module releases add assignments; version-1 releases remain unchanged.

Saved views support `is_me`, `empty`, `neq`, `date_on` and `date_before`. Relative dates use an explicit IANA timezone (UTC by default), and `$updatedAt` supports calendar-day age filters. The browser refreshes its view clock every minute and on focus. My views use the signed-in user; MCP views use the credential issuer.

CRM adds My deals, deals due today/overdue, missing next step, deals last updated more than seven calendar days ago, My tasks, tasks due today/overdue. Closed records are excluded. Last updated means a change to the deal record, not the latest related activity. Use `upgradeCrmFollowThrough` to add these queues without replacing existing rules or lifecycle states. Existing records start unassigned; assign them through Edit to populate personal queues.

MCP `query_records` accepts `viewId` and uses the same matcher as the UI. Each page scans at most 1,000 equality-filtered candidates, ordered by ID, and may return an empty page with a continuation cursor. Continue until `nextCursor` is null. Saved-view display sorting is not applied to MCP pages. Cursors bind the view definition and its local calendar day; restart the query after midnight.

### Follow-through publication evidence — 2026-09-28

Published version 3 through localhost-kernel MCP. The migration reported zero blockers, retained both records and added a blank assignment to the existing deal. Eight added queues use Asia/Shanghai time; Follow up today is the starting view. Publication was confirmed through `list_applications`.

Validation: 191 tests passed, type checking and production build passed, and the mechanical scan reported no findings. The isolated browser fixture verified member choices, saving a reassignment, member names in board/details, My deals membership changing from one to zero, and narrow-container rendering. Live authenticated browser acceptance remains outstanding. Migration updates the changed deal's record timestamp, so its stale-record age begins at publication.

## Contextual related-record creation — 2026-09-28

The shared workbench now discovers editable reverse relationships from published definitions and offers creation beside each related list, including empty lists. A deal can create a task/activity; an account can create a contact/deal. The create form displays and fixes the parent relationship, validates required fields and references, preserves entries after failure, and refreshes the parent after success. Multiple relationships to the same entity have explicitly labeled creation choices. Existing server creation authorization, workspace isolation, reference validation and audit events still apply.

This is a shared UI improvement and requires no definition migration or application version bump. Live CRM remains version 3. This does not yet allow creating a missing account inside an unsaved deal form.

The isolated browser fixture verified an automatically linked task, retained title after an injected save failure, successful retry and a related count increasing from one to two.

Validation for contextual creation: 14 CRM regression tests, type checking, production build and diff whitespace checks passed. The UI detector reported no findings. Browser checks used synthetic records; authenticated live browser acceptance remains outstanding.

## Relationship consistency

Sales deal module release 3 requires a selected primary contact to belong to the deal account. Kernel provides generic `referenceMatch` validation; the sales package supplies the account/contact mapping. Existing releases remain immutable. Changing the deal account requires clearing or replacing its incompatible contact in the same edit. Moving a contact to another account is blocked while existing deals depend on the old match; update or clear those links first. Archiving does not remove a relationship.

The rule applies to human creation/edits and agent proposals, including rechecking at approval. Definition migrations report incompatible existing records as blockers, never silently rewrite them. Transactional checks serialize workspace writes against publication and other record changes. Large-workspace throughput has not been benchmarked.

### Relationship consistency publication — 2026-09-28

Published CRM version 4 through localhost-kernel MCP. The migration reported zero blockers, retained both records and changed no record data. Only the primary-contact matching rule was added to the existing definition. Publication was confirmed through `list_applications`.

Validation: all 196 tests, type checking, production build and whitespace checks passed. Five new regressions cover schema compatibility and immutable releases, create/edit rejection and clearing a link, inbound target edits, approval-time revalidation, migration blockers and competing writes. These are database tests using the test database; production throughput and authenticated live-browser acceptance remain unverified.

## Relationship-aware forms — 2026-09-28

Create and action forms filter relationship choices using the published `referenceMatch` metadata. Contact choices follow the selected account, including an account prefilled by related-record creation. If changing the account invalidates an existing contact, the form retains its name with a needs-attention state and requires an explicit clear or replacement. Missing sources and empty matching lists have explanatory text. The shared select exposes descriptions and invalid state to assistive technology.

Action forms derive rules from entity effect mappings, including renamed inputs and existing custom definitions whose inputs do not repeat matching metadata. Multiple mapped constraints intersect. Server-side relationship checks remain authoritative. This shared UI improvement requires no publication; the CRM remains version 4.

Validation: nine focused relationship tests, type checking and production build passed. Browser fixture checks verified account changes, retained incompatible contacts, prevented submission, a successful matching replacement and account-prefilled creation filtering. The mechanical UI scan reported no findings. Authenticated live browser testing remains outstanding.

## Filtered CSV export — 2026-09-28

Export CSV downloads all fields for the current view's filtered records in the displayed sort order, including search and status filters. It exports the current loaded snapshot, not pending proposal effects. This shared workbench feature applies across business applications and requires no definition migration; CRM remains version 4.

Exports include record ID, record version, timestamps, field keys and labels, raw enum/date values, and separate ID/name columns for relationships and member assignments. Integer fields ending in Cents retain exact stored cents and explicitly label their unit. Missing related records or members retain their IDs with an unavailable label.

Files use UTF-8 with a BOM, quoted CSV cells and CRLF row separators. Formula-like text receives a leading apostrophe for spreadsheet safety. CSV does not preserve spreadsheet cell types; it is a reporting export, not an import or backup format. No external service receives the export, and no new export audit event is stored.

Validation: four export tests, type checking, production build and whitespace checks passed. The UI detector reported no findings. The browser fixture downloaded a synthetic CSV; the saved file was parsed and verified to contain one deal, 21 columns, account names and its exact cents value. No live records were exported during testing.

## Retiring legacy stages — 2026-09-29

Use `retireLegacyCrmStages` after every deal has left the draft, open and converted compatibility stages. It removes those stages, their move actions and the matching work-queue exclusions. Migration preview blocks publication while any deal still uses one. Version 5 also made the Team-directory owner read-only; version 6 below removes it. Empty read-only fields outside a layout are no longer listed under Other details.

Shared UI changes: create forms follow the record layout order. Board column headers show the stage total when the view includes an amount. The overview lists amounts by status, gives each open stage a distinct shade, and shows outcomes in success or danger colors.

Published CRM version 5 on localhost through the authenticated app API. The only deal was first moved from Draft to New with its audited legacy action. The migration then reported zero blockers, zero record updates and zero invalidated proposals. Live browser checks confirmed seven pipeline columns, the new form order, the absent Owner field and amounts by status in the overview. Validation: all 205 tests, type checking and production build passed.

## Member ownership and closed outcomes — 2026-09-29

Sales package release 4 (`sales.deal`, `sales.task` and `sales.activity` version 4) removes the Team-directory owner. Deals and tasks are owned through the member assignment field "Assigned to". The `crm_sales` pattern no longer includes the Team directory. Deal status marks Won and Lost as closed. Releases 1–3 are unchanged.

Application contract version 7 lets an enum list `closed` options. They must be existing options other than the default, and at least one option must stay open. The overview then shows an open amount that excludes closed statuses, instead of a total across every status.

Migration now permits removing fields and entities. The preview lists each removal with the number of stored values or records to be deleted, and the review screen shows a data-deletion warning. Publishing with the preview token deletes those values and records, removes the entity's capability definition, and rejects its pending proposals. Type changes and reference retargeting remain blocked.

Use `upgradeCrmMemberOwnership` to move an installed CRM to this shape. It requires member assignments, deletes the Team directory and every field linking to it, and substitutes "Assigned to" in affected view columns. It also marks Won and Lost closed.

## Forecasting, stage requirements and account-linked work — 2026-09-29

Sales package release 5 is used by the `crm_sales` pattern.

- **Forecast.** Deals have Win probability, an integer with `format: "percent"`. Each stage move sets it to 20, 40, 60, 80, 100 for Won or 0 for Lost, and reps can adjust it with Edit. Deals also have a Forecast category: Pipeline, Best case, Commit or Omitted. The overview shows the open amount and a weighted amount, which is the open value multiplied by each deal's probability. "Closing in 90 days" lists open deals whose expected close date is before today plus 90 days.
- **Stage requirements.** Qualify needs a primary contact and a next step. Start discovery needs an owner ("Assigned to"). Prepare proposal needs a deal value and an expected close date. Start negotiation needs a primary contact and an expected close date. Mark won needs a deal value. The action dialog lists unmet requirements and disables direct saving; the server enforces the same rules for people and agents.
- **Outcomes.** Mark won records a Win reason and Closed on. Mark lost records a Loss reason category, Loss details and Closed on. Closed on defaults to today in the dialog. Reopening clears Closed on.
- **Linked work.** Tasks and activities can link to a deal, an account or a contact, and each link is optional. A chosen contact must belong to the chosen account.

Application contract version 8 adds `format: "percent"` for integers and the `gte` and `present` rule operators. `present` requires value true and passes when the field, including a relationship, has a value.

Use `adoptSalesPackage` to replace an installed CRM definition with the current package. It keeps the application name, description and the non-UTC time zone of existing work queues. Migration preview reports any removals.

Validation: 211 tests, type checking and production build passed. The live localhost CRM has not been upgraded to release 5 yet.

### Version 6 publication

Published CRM version 6 on localhost. The preview reported zero blockers, the removed Team entity with no records, two removed owner fields with no stored values, and no invalidated proposals. Live checks confirmed that navigation no longer includes Team and that the overview shows "Open amount · Excludes Won and Lost". The chart was not visually verified because the automation tab paused animation frames. Validation: all 207 tests, type checking and production build passed. Tests include a database publication that deletes a directory record and two stored owner links.

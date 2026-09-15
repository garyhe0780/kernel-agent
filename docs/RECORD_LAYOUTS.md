# Record detail layouts

**Change application → Record detail layouts** configures one layout per entity. Customize, name sections, move sections/fields with the arrow controls, assign fields through their Section menu, or return to the default layout. Selecting Layout for also switches the sample preview entity. Publish through the existing migration preview.

Definitions include optional `layouts: [{entity, sections: [{id, name, fields, when?}]}]`. At most eight entities and eight sections per layout are supported. Section IDs are unique lowercase underscore identifiers; names are 2–60 characters. Field keys must exist and appear at most once per layout. Empty sections can be drafted but do not render. Unassigned fields, including newly added fields, appear in Other details. Omitting a layout preserves the default field order.

The agent is instructed to generate business-oriented sections and preserve them during unrelated revisions. The purchasing example separates Purchase and Decision. Builder preview and runtime use the same `RecordDetail` renderer. Existing currency, status and relationship formatting is retained; empty configured values show Not set. Existing domain-specific conditional field visibility remains in RecordFields.

Layouts organize display, not permissions. They do not change creation forms, action inputs, activity, or proposal diffs. Sections can optionally show when one same-record value matches a condition. Tabs, arbitrary grids and field-level permissions are not included.

Metadata is normalized when older drafts load, namespaced in published snapshots and retained in version history. Layout-only changes leave capability definitions, existing records and pending proposals intact. Migration summaries display the section/field changes. No database migration is needed.

Verification: 51 tests cover identity validation, duplicate/unknown fields, compatibility, stable field ordering, fallback visibility, purchasing and CRM. Publication integration verifies namespaced layouts alongside preserved records/capability versions and an applicable pending proposal. Model output uses an injected mock; live generation is not configured. Browser verification used synthetic Team purchasing on localhost3002: moved fields, reordered sections, saved, previewed, and published version5 with two records checked and zero record updates or invalidated proposals. Desktop/mobile details show Decision → Purchase → Other details.

## Conditional sections

Each section defaults to Always. Choose a non-relationship field under Show, then a comparison and value. Equality and inequality support typed strings, enums, integers and booleans; integers also support at-most/at-least comparisons. Currency inputs display dollars and store cents. Conditions must use a valid field value. Missing/null values never match, including inequality. Compound and relationship conditions are not supported.

Builder preview and published details apply the same condition. Fields assigned to a hidden section do not leak into Other details; unassigned fields remain visible. A visible count and Show all sections let users inspect the full record, and Use section conditions restores the filtered presentation. Selecting another record resets this override. This is a display preference, never an authorization boundary; action rules, inputs and proposal review still use the full record.

Conditional milestone verification: 57 tests pass, including typed comparisons, missing values, invalid conditions, fallback behavior and publication preserving records, capability versions and a usable pending proposal. Synthetic Team purchasing was saved, previewed and published as version 6 on localhost: two records checked, zero records updated, zero pending proposals invalidated. Decision is shown when Status equals Approved; the submitted request hides it and the reveal control restores it. Reload and desktop/mobile behavior were checked. Live model generation remains unconfigured.

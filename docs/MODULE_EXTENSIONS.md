# Repository module extensions

Kernel supports repository-authored declarative business modules. A module defines one entity, actions, versioned relationship ports, and default views/layouts. It compiles through the existing application validator and uses the shared runtime. Registration does not execute plugin callbacks or grant permissions.

## Author and register a release

Use `src/kernel/modules/milestone.ts` as a complete example. Export a value satisfying `ModuleSource` from `src/kernel/module-contract.ts`, then include it in the `createModuleCatalog` call in `src/kernel/modules.ts`.

A release includes:

- `contractVersion: 1`: the supported module format.
- `id`: a stable `namespace.name` identifier, such as `work.milestone`.
- `version`: a positive integer release number. Never edit a released definition in place; add another version and retain older releases.
- `defaultAlias`: an application-local identifier used by the selection helper.
- `definition`: the existing declarative entity/action contract.
- `ports`: relationship dependencies with a field, target module ID, exact `targetVersion`, label, and optional `required: false`.
- `views`, optional `layout`, and optional `grammar`: default presentation using supported fields and grammars.

Declare relationship fields through ports, rather than hard-coding an application's entity aliases into the module's fields. A port must not replace an existing field or repeat another port. Optional ports can remain unbound; compilation then omits their columns and layout assignments. Filters, conditions, and actions that require a relationship must only be used where that relationship is bound; final application validation rejects broken references.

Every port target release must be registered, including optional dependencies. Required ports must also be connected in the application assembly. Links must match both target module identity and version. There are no implicit version ranges or automatic dependency upgrades.

## Assemble and publish

`list_modules` advertises each registered release's `version`, `contractVersion`, and port `targetVersion`. Pass an assembly with explicit versions:

```json
{
  "name": "Project milestones",
  "description": "Track reviewed completion of project milestones.",
  "modules": [
    { "use": "work.milestone", "version": 1, "as": "milestones" },
    { "use": "work.project", "version": 1, "as": "projects" },
    { "use": "directory.party", "version": 1, "as": "people" }
  ],
  "links": [
    { "from": "milestones.project", "to": "projects" },
    { "from": "milestones.owner", "to": "people" }
  ],
  "surfaces": [
    { "grammar": "ledger", "of": "milestones", "view": "planned_milestones" },
    { "grammar": "detail", "of": "milestones" }
  ],
  "startView": "planned_milestones"
}
```

Use `save_draft` and `publish_draft` as usual. The saved assembly contains exact versions. Publication stores the compiled definition; the runtime does not resolve catalog modules on each record operation. Operate credentials still require explicit action scopes and human review.

For repository callers, `selectionForModules` selects the latest requested releases and their exact required dependencies; `assembleSelection` binds matching ports and builds default surfaces. If an assembly needs multiple instances or different dependency releases, supply explicit aliases and links rather than relying on automatic selection.

## Existing applications and upgrades

An omitted assembly module version always means **release 1**, preserving the meaning of older stored assemblies. Validation normalizes it to an explicit version. It never means “latest.” New selection helpers choose latest releases and write their versions; existing patterns remain on their declared versions (1 when omitted).

Adding release 2 does not change assemblies pinned to release 1. To upgrade an installed application, open a change draft, update the selected module versions and any dependent links/settings/surfaces, save, preview migration, and publish with the preview token. Migration checks still reject type changes, incompatible records and stale previews. Removed fields and entities are listed in the preview as deletions. Retain every referenced old module release so drafts can be reopened.

Version numbers identify releases; they do not assert that an upgrade is safe. Assembly compatibility and live-data migration compatibility are checked separately.

## Validation and tests

Registration checks the module format, supported field/grammar structures, duplicate releases and ports, declared presentation fields, and availability of exact dependencies. Compilation runs full application semantic validation, including roles, rules, effects, relationship bindings, and presentation constraints. A structurally valid module can therefore fail compilation; registration alone is not publication approval.

The registry keeps private parsed releases and returns copies. Callers cannot mutate its definitions through lookup results. It is an in-process catalog, not a persistent package manager or a remote plugin loader.

Tests in `tests/assembly.test.ts` cover composition, version pinning, legacy interpretation, missing/incompatible dependencies, invalid ports and fields, and mutation isolation. `tests/kernel.test.ts` publishes the milestone extension, creates linked records, stages a scoped agent action, applies human review, and verifies pinned versions survive reopening.

To add a module, exercise at least one complete compiled application and an operational action. Adding ordinary business behavior should require a module file and registration, not modifications to the evaluator, authorization engine, HTTP or MCP adapters.

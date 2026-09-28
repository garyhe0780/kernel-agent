import { z } from 'zod'
import { applicationSchema } from './application'

/** Bump this version when the advertised builder contract changes. Runtime validation is authoritative. */
export function applicationContract() {
  return {
    version: 3,
    schema: z.toJSONSchema(applicationSchema, { io: 'input' }),
    limits: { definitionCharacters: 100000, entities: 8, fieldsPerEntity: 30, actionsPerEntity: 20 },
    semantics: {
      identifiers: 'Entity slugs, entity names, action names, view IDs and section IDs use /^[a-z][a-z0-9_]{0,39}$/. Field keys use /^[a-z][a-zA-Z0-9_]{0,49}$/. Reserved keys __proto__, constructor and prototype are forbidden. Entity slugs and action names within an entity must be unique.',
      fields: 'Types are string, integer, boolean and enum. Integers must be safe whole numbers. String min constrains trimmed length and max constrains input length; stored strings are trimmed. Integer min/max constrain value. Enum options must be nonempty and unique. Defaults must validate. Every entity needs an editable required string title and a noneditable enum status with a nonempty default. Other noneditable required fields need defaults.',
      relationships: 'A reference is a string field naming an entity slug in this application, without a default. Values are record IDs checked in this application and workspace at creation, staging and review. No joins, cascades or cross-record policy evaluation.',
      roles: 'Use owner and operator action roles and reviewer roles. reviewerRoles must include owner. Credential grants further restrict access; definitions cannot grant credentials or bypass review.',
      rules: 'Preconditions and policies compare a field on the current record using eq or lte. Supply value or the name of an existing setting. lte requires an integer field and numeric comparison. enabledBy names a boolean setting. Comparison values must validate against the field.',
      effects: 'Effects assign known fields a literal or $input.<key>. Input mappings require a required input of the same type and reference target. Relationships must use input mappings. Literal values and the complete resulting record must validate; no executable expressions.',
      presentation: 'Views and layouts must refer to known entities and fields. Layout sections assign each field at most once per entity; conditions use non-relationship fields and numeric range conditions require integers. View IDs are unique and cannot be all. Nonempty columns include title without duplicates. Filters cannot use relationships; range filters require integers. Sort uses a non-relationship field or $createdAt. Navigation is empty or lists every entity exactly once. startView is null or an existing view ID.',
    },
    workflow: {
      create: ['save_draft with exactly one of pattern, assembly or definition', 'publish_draft with id and expectedVersion'],
      revise: ['edit_project', 'save_draft with id, expectedVersion and one definition source', 'preview_migration', 'publish_draft with the preview token'],
      publication: 'Creates an empty application; sample records are never published. Exact publication retries return the existing result. Edits require the current draft version.',
      migration: 'Additive changes only. Existing values are preserved; defaults fill absent fields. Removals, field type changes and reference retargeting are blocked. Concurrent data or definition changes require a fresh preview.',
    },
    unsupported: ['arbitrary code', 'SQL', 'external integrations', 'date field types', 'currency conversion', 'automatic execution without an owner grant', 'record creation without the required scope'],
  }
}

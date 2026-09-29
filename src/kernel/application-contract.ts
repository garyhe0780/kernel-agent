import { z } from 'zod'
import { applicationSchema } from './application'

/** Bump this version when the advertised builder contract changes. Runtime validation is authoritative. */
export function applicationContract() {
  return {
    version: 8,
    schema: z.toJSONSchema(applicationSchema, { io: 'input' }),
    limits: { definitionCharacters: 100000, entities: 8, fieldsPerEntity: 30, actionsPerEntity: 20 },
    semantics: {
      identifiers: 'Entity slugs, entity names, action names, view IDs and section IDs use /^[a-z][a-z0-9_]{0,39}$/. Field keys use /^[a-z][a-zA-Z0-9_]{0,49}$/. Reserved keys __proto__, constructor and prototype are forbidden. Entity slugs and action names within an entity must be unique.',
      fields: 'Types are string, integer, boolean and enum. Non-relationship strings may use format: user for workspace member IDs, validated at execution against workspace membership and application access; assignment does not grant access. They may also use format: date for calendar dates in YYYY-MM-DD; empty strings represent unset optional dates. Integers must be safe whole numbers; format: percent marks an integer from 0 to 100, and overviews weight open amounts by an entity’s first percent field. String min constrains trimmed length and max constrains input length; stored strings are trimmed. Integer min/max constrain value. Enum options must be nonempty and unique. An enum may list closed options, such as won and lost, that end the work; they must be existing options other than the default, and at least one option must stay open. Overviews total open amounts separately. Defaults must validate. Every entity needs an editable required string title and a noneditable enum status with a nonempty default. Other noneditable required fields need defaults.',
      relationships: 'A reference is a string field naming an entity slug in this application, without a default. Values are record IDs checked in this application and workspace at creation, staging and review. A reference may declare referenceMatch: {sourceField, targetField}; both fields must reference the same entity. A nonempty selected target must have targetField equal to this record’s nonempty sourceField. Target edits that break existing matches are rejected. Empty optional references skip matching. No arbitrary joins or cascades.',
      roles: 'Use owner and operator action roles and reviewer roles. reviewerRoles must include owner. Credential grants further restrict access; definitions cannot grant credentials. Actions may explicitly set humanExecution: direct for version-checked human operations; omitted values require review. Agent execution still requires a separate automatic grant.',
      rules: 'Preconditions and policies compare a field on the current record using eq, lte, gte or present. Supply value or the name of an existing setting. lte and gte require an integer field and numeric comparison. present requires value true, uses no setting, and passes when the field, including a relationship, has a nonempty value. enabledBy names a boolean setting. Comparison values must validate against the field.',
      effects: 'Effects assign known fields a literal or $input.<key>. Input mappings require a required input of the same type and reference target. Relationships must use input mappings. Literal values and the complete resulting record must validate; no executable expressions.',
      presentation: 'Views and layouts must refer to known entities and fields. Layout sections assign each field at most once per entity; conditions use non-relationship fields and numeric range conditions require integers. View IDs are unique and cannot be all. Nonempty columns include title without duplicates. Filters cannot use relationships. Numeric lte/gte filters require integers. neq compares a literal; empty uses value true. is_me requires a user-formatted field and value true. date_on/date_before require a date field or $updatedAt and an integer day offset (-3650 to 3650) from today in the view timeZone (IANA name, default UTC). Missing dates do not match. Sort uses a non-relationship field or $createdAt. Navigation is empty or lists every entity exactly once. startView is null or an existing view ID.',
    },
    workflow: {
      create: ['save_draft with exactly one of pattern, assembly or definition', 'publish_draft with id and expectedVersion'],
      revise: ['edit_project', 'save_draft with id, expectedVersion and one definition source', 'preview_migration', 'publish_draft with the preview token'],
      publication: 'Creates an empty application; sample records are never published. Exact publication retries return the existing result. Edits require the current draft version.',
      migration: 'Existing values are preserved; defaults fill absent fields. Removing a field deletes its stored values; removing an entity deletes its records and rejects its pending proposals. The preview reports these deletions, and publishing with its token accepts them. Field type changes, reference retargeting and stored entity identifier changes are blocked. Concurrent data or definition changes require a fresh preview.',
    },
    unsupported: ['arbitrary code', 'SQL', 'external integrations', 'currency conversion', 'automatic execution without an owner grant', 'record creation without the required scope'],
  }
}

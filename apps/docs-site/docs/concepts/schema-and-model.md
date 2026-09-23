# Schema and model

A schema declares document vocabulary and structure. The model applies edits to stored nodes. A renderer draws those nodes, and a browser view connects input and selection. These are separate responsibilities: a valid schema definition alone does not create an editor UI.

## Document vocabulary

`createSchema(name, definition)` builds a schema from node and mark definitions. `getMinimalSchemaDefinition()` supplies `document`, `paragraph`, and `inline-text`, with bold and italic marks. The product packages supply different presets for Note, Word, Slides, and Site.

| Field | Meaning |
| --- | --- |
| `topNode` | Intended document root type |
| `nodes` | Declared node types |
| Node `group` | A group name that content expressions can match |
| Node `content` | Allowed immediate child sequence |
| Node `attrs` | Attribute definitions, including required values and defaults |
| Schema `marks` | Declared formatting types and their attributes |
| Node `marks` | Allowed mark names for that node's editing content |

Stored model nodes use `stype` and `attributes`. A schema's attribute definitions use `attrs`; editing marks also use `attrs` for mark values. Do not interchange these field names when constructing data.

The [schema package guide](/packages/schema#validate-a-custom-structure) includes a complete custom-schema example with valid, invalid, and open-fragment checks.

## Content expressions describe order

| Expression | Meaning |
| --- | --- |
| `block+` | At least one child from the declared block group |
| `inline*` | Zero or more inline children |
| `caption body+` | A caption, then at least one body |
| `(paragraph\|heading)+` | One or more declared paragraph or heading nodes |
| `caption? body{1,3}` | Optional caption, then one to three bodies |

Declare each node used by an expression. Naming `body` in a parent's content expression does not create a body node type. Required child order matters even when a renderer could display the nodes in another order.

## Trees and stored nodes

A nested tree carries child objects in `content`. It is suitable for document loading, export, and the schema example. Within `DataStore`, child references use node IDs. Editor APIs such as `exportDocument()` return a tree again.

A node ID identifies a node in its document/store context. It is not a global customer record ID or authority to delete another document's content. A copied fragment records source identities separately; the planner/application path handles target identities.

Use public commands or model transactions for user edits that need history and selection handling. Creating a tree object does not insert it into the editor. Changing a DOM element does not change the model. Direct store mutation is a different path and does not automatically acquire the user-edit contract.

## Choose a check for the data you have

- For one node's attributes, use `schema.validateAttributes`.
- For an immediate container child sequence, use `validateEditingContent`.
- For nested editing content, marks, and explicit cut boundaries, use `validateEditingFragment`.
- For path-based structure and attribute diagnostics over a nested tree, use `validateTree`.

These functions have different results and coverage. `validateTree` is not a replacement for editing-fragment mark checks. Neither an empty findings list nor a valid fragment proves server authorization or HTML safety. A fragment can be structurally valid while being invalid at a particular target.

## Editing policy is separate from schema

The schema answers which structures are valid. An editing policy selects supported behavior where the schema alone cannot decide how to combine incoming content with a target. For example, an open body fragment can join a compatible body or preserve its boundary.

Policies cannot bypass required child order, allowed marks, or reference checks. A plan is the computed result of those rules, not the rule definition itself. See [schema-aware fragment editing](../guides/schema-editing.md) for a complete plan/apply example and the current support boundary.

## Integration boundaries

A custom type needs compatible commands and renderer templates. A product factory's `schema` option replaces its default schema; it does not merge arbitrary vocabulary automatically. Preserve the types required by the product kit, or provide an intentionally compatible replacement.

The current fragment planner is a bounded prose-editing path. It does not turn table-cell ranges, canvas geometry, file uploads, and all keyboard edits into one algorithm. The [product integration guide](../guides/office-products.md) explains the remaining view, layout, storage, and UI assembly.

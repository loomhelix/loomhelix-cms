# @loomhelix-cms/schema

## 0.1.0

The first release. Version 0 of the format is a draft, so the format and the API can change before version 1.0.

- Version 0 of [the spec](https://github.com/loomhelix/loomhelix-cms/blob/main/docs/spec-v0.md): the schema, page
  documents, block documents, block references, migrations, the load algorithm, the renderers, and the editor
  integration. The shared test cases are in `spec/test-cases`.
- `parseSchema`, `loadDocument` with an error for each invalid block, the migration operations, and `defineSchema`
  with the field functions for a schema in TypeScript.
- An option of a `choice` field can have a label. A type can have `oldNames`, and the schema can list
  `removedTypes`. A slot can have `min` and `max`.
- A field can have the type `number`, `boolean`, or `record`. An image can have a `width` and a `height`.
- `loadDocumentSet` loads the block documents that block references show, and `loadRecords` loads the records of
  `record` fields.

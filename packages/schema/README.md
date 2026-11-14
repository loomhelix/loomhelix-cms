# @loomhelix-cms/schema

The schema layer of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms): it reads a schema of block types, loads page documents, and applies
migrations. It has no dependencies, and it runs in Node.js and in browsers.

Status: draft. The format and the API can change before version 1.0.

```sh
npm install @loomhelix-cms/schema
```

```js
import { loadDocument, parseSchema } from '@loomhelix-cms/schema';

const schema = parseSchema(JSON.parse(schemaText));
const { document, errors } = loadDocument(schema, JSON.parse(pageText));
```

- `loadDocument` applies the migrations. It gives an error for each block that does not follow the schema, and the
  block stays in the document.
- A slot can contain a block reference, which shows a block document. `isBlockReference` tells a block reference from
  a block.
- `loadDocumentSet` loads a document and the block documents that its references show, also through other block
  documents. It calls `read(id)` one time for each document. `read` gives the JSON of the document, or `undefined`.

```js
const { main, shown } = await loadDocumentSet(schema, JSON.parse(pageText), readDocument);
```

- `defineSchema`, `page`, `block`, `slot`, and the field functions write a schema in TypeScript. The command
  `lhcms build` of `@loomhelix-cms/cli` writes `blocks.json` from it.

[Version 0 of the spec](https://github.com/loomhelix/loomhelix-cms/blob/main/docs/spec-v0.md) gives the full format.

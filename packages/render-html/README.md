# @loomhelix-cms/render-html

The HTML renderer of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms): it renders page documents to HTML text with your template functions.

Status: draft. The API can change before version 1.0.

```sh
npm install @loomhelix-cms/render-html @loomhelix-cms/schema
```

```js
import { createRenderer, html } from '@loomhelix-cms/render-html';
import { loadDocumentSet } from '@loomhelix-cms/schema';

const render = createRenderer(schema, {
  Landing: ({ slots }) => html`<main>${slots.main}</main>`,
  Hero: ({ props }) => html`<section class="hero"><h1>${props.title}</h1></section>`,
});

const documents = await loadDocumentSet(schema, JSON.parse(pageText), readDocument);
const page = render(documents, 'live');
```

- `html` escapes each value. It rejects an unsafe link, and a value in a `<script>` element or an event attribute.
- `render` takes the result of `loadDocumentSet`: the page and the block documents that its block references show.
  `readDocument(id)` gives the JSON of a document from your storage, or `undefined`.
- `TemplatesOf<typeof schema>` gives the types of the templates for a schema in TypeScript. For `record` fields, give
  the type of the records of each source: `TemplatesOf<typeof schema, { products: Product }>`. Without it, a record
  has the type `SiteRecord`.

[The security document](https://github.com/loomhelix/loomhelix-cms/blob/main/docs/security.md) tells which attacks the renderer stops.

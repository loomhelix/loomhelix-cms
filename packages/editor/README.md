# @loomhelix-cms/editor

The embedded editor of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms): the `<lhcms-editor>` element. It makes a form for each block type of
your schema and shows the unsaved page in a preview.

Status: draft. The API can change before version 1.0.

```sh
npm install @loomhelix-cms/editor
```

`dist/editor.js` is one ES module with no imports. Serve it from your admin area, or import the package in a bundler.

```html
<script type="module" src="/lhcms/editor.js"></script>
<lhcms-editor schema-url="/blocks.json" preview-url="/preview"></lhcms-editor>
```

```js
const editor = document.querySelector('lhcms-editor');
editor.storage = {
  read: (id) =>
    fetch(`/my-api/${id}`).then((response) => (response.ok ? response.json() : undefined)),
  write: async (id, document) => {
    const response = await fetch(`/my-api/${id}`, {
      method: 'PUT',
      body: JSON.stringify(document),
    });
    if (!response.ok) {
      throw new Error(`The server did not save the document: ${response.status}.`);
    }
  },
  list: () => fetch('/my-api').then((response) => response.json()),
};
```

The editor does not keep documents: your storage does. `createHttpStorage(apiUrl)` of this package is an optional
storage for the HTTP endpoints of the spec. [The editor section](https://github.com/loomhelix/loomhelix-cms#editor) gives all attributes.

The package has type declarations for TypeScript. When a file imports the package, `querySelector('lhcms-editor')`
gives the type `LhcmsEditorElement` with the properties of the editor.

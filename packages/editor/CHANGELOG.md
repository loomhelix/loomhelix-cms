# @loomhelix-cms/editor

## 0.1.0 (not released)

The first release. Version 0 of the format is a draft, so the format and the API can change before version 1.0.

- The `<lhcms-editor>` element with the type `LhcmsEditorElement`, the storage interface
  `{ read, write, list, lookup, upload }`, the optional `createHttpStorage`, and the editor for one document.
- The block tree shows the errors of block references. The client can add a block document to a slot and open it
  from the page.
- A `record` field has a search if the storage has `lookup`. An image field has an upload button if the storage has
  `upload`.
- The package has type declarations.

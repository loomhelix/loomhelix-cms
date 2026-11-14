# @loomhelix-cms/bridge

The script for the preview page of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms). It connects the blocks on the preview page to the editor.
A click on a block opens its fields, and the page shows an outline around the selected block.

Status: draft. The API can change before version 1.0.

```sh
npm install @loomhelix-cms/bridge
```

Serve `dist/bridge.js`, and add it to the preview page that your backend renders:

```html
<script type="module" src="/lhcms/bridge.js"></script>
```

The bridge accepts messages only from the editor window of the same origin. In the preview, the links, the buttons,
and the forms of the page do not work. On Node.js, `createCms` of `@loomhelix-cms/node` adds the bridge for you.

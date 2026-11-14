# @loomhelix-cms/node

`createCms`: an optional adapter of [loomhelix-cms](https://github.com/loomhelix/loomhelix-cms) for a Node.js site. One handler gives the editor page,
the content API, the preview, and the pages of the site at their paths.

Status: draft. The API can change before version 1.0.

```sh
npm install @loomhelix-cms/node @loomhelix-cms/render-html @loomhelix-cms/schema
```

```ts
import { createServer } from 'node:http';
import { createCms, createFolderStore } from '@loomhelix-cms/node';
import { templates } from './templates.ts';

const cms = await createCms({
  schemaFile: 'blocks.ts',
  templates,
  store: createFolderStore('pages'),
  canEdit: (request) => request.headers.host === 'localhost:3000',
});

createServer(cms.handle).listen(3000, '127.0.0.1');
```

`canEdit` decides who can use the editor. On a real site, check the session of your login in it. The handler checks
the `Origin` header and the size of each save. [Add it to a Node.js site](https://github.com/loomhelix/loomhelix-cms#add-it-to-a-nodejs-site) gives all
steps.

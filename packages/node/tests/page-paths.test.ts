import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vite-plus/test';
import { createFolderStore } from '../src/index.ts';
import { pageDocument, startTestSite } from './test-site.ts';

it('checks the path of each save with the index of the paths, and keeps the index current', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lhcms-paths-'));
  await writeFile(join(folder, 'home.json'), JSON.stringify(pageDocument('home', '/')));
  const folderStore = createFolderStore(folder);
  let listCount = 0;
  const site = await startTestSite({
    options: {
      store: {
        ...folderStore,
        list: async () => {
          listCount += 1;
          return folderStore.list();
        },
      },
    },
  });
  const put = (id: string, path: string) =>
    fetch(`${site.origin}/cms/api/pages/${id}`, {
      method: 'PUT',
      headers: { origin: site.origin, 'content-type': 'application/json' },
      body: JSON.stringify(pageDocument(id, path)),
    });
  const statuses: number[] = [];
  try {
    for (const [id, path] of [
      ['tea', '/tea'],
      ['cakes', '/tea'],
      ['tea', '/drinks'],
      ['cakes', '/tea'],
      ['home', '/drinks'],
    ] as const) {
      statuses.push((await put(id, path)).status);
    }
  } finally {
    await site.close();
    await rm(folder, { recursive: true, force: true });
  }

  expect(statuses).toStrictEqual([204, 409, 204, 204, 409]);
  expect(listCount).toBe(1);
});

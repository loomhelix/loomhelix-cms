import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFolderStore, type PageStore } from '../src/index.ts';
import { pageDocument, startTestSite, type TestSite } from './test-site.ts';

const CACHE_LIFETIME = 5000;
let site: TestSite;
let listCalls = 0;

function countingStore(folder: string): PageStore {
  const store = createFolderStore(folder);
  return {
    list: () => {
      listCalls += 1;
      return store.list();
    },
    read: (id) => store.read(id),
    write: (id, text) => store.write(id, text),
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  listCalls = 0;
  site = await startTestSite({ withNext: true });
});

afterEach(async () => {
  vi.useRealTimers();
  await site.close();
});

async function textOf(path: string): Promise<string> {
  return (await fetch(`${site.origin}${path}`)).text();
}

describe('the live pages of createCms', () => {
  it('reads the list of the store at most one time in 5 seconds', async () => {
    const counted = await startTestSite({
      options: { store: countingStore(site.pagesFolder) },
      withNext: true,
    });
    try {
      for (const path of ['/', '/missing', '/also-missing', '/']) {
        await fetch(`${counted.origin}${path}`);
      }
      const callsInLifetime = listCalls;
      vi.setSystemTime(Date.now() + CACHE_LIFETIME);
      await fetch(`${counted.origin}/`);

      expect([callsInLifetime, listCalls]).toStrictEqual([1, 2]);
    } finally {
      await counted.close();
    }
  });

  it('shows a page that the API saves at once', async () => {
    await textOf('/');
    await fetch(`${site.origin}/cms/api/pages/tea`, {
      method: 'PUT',
      headers: { origin: site.origin, 'content-type': 'application/json' },
      body: JSON.stringify(pageDocument('tea', '/tea')),
    });

    expect(await textOf('/tea')).toContain('<title>Page tea</title>');
  });

  it('shows a page that a different program saves after 5 seconds', async () => {
    await textOf('/');
    await writeFile(
      join(site.pagesFolder, 'cake.json'),
      JSON.stringify(pageDocument('cake', '/cake')),
    );
    const before = await textOf('/cake');
    vi.setSystemTime(Date.now() + CACHE_LIFETIME);

    expect(before).toBe('next');
    expect(await textOf('/cake')).toContain('<title>Page cake</title>');
  });
});

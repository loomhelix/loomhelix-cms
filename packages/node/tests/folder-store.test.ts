import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createFolderStore } from '../src/index.ts';

let parentFolder = '';
let folder = '';

beforeEach(async () => {
  parentFolder = await mkdtemp(join(tmpdir(), 'lhcms-folder-store-'));
  folder = join(parentFolder, 'pages');
  await mkdir(folder);
});

afterEach(async () => {
  await rm(parentFolder, { recursive: true, force: true });
});

describe('createFolderStore', () => {
  it('writes the text of a page to a JSON file and reads it back', async () => {
    const store = createFolderStore(folder);

    await store.write('home', '{"formatVersion":0}\n');

    expect(await store.read('home')).toBe('{"formatVersion":0}\n');
    expect(await readdir(folder)).toStrictEqual(['home.json']);
  });

  it('gives no text for a page that does not exist', async () => {
    expect(await createFolderStore(folder).read('home')).toBeUndefined();
  });

  it('lists the pages of the JSON files, sorted by id', async () => {
    await writeFile(join(folder, 'menu.json'), 'menu text');
    await writeFile(join(folder, 'home.json'), 'home text');
    await writeFile(join(folder, 'notes.txt'), 'not a page');
    await writeFile(join(folder, 'two words.json'), 'not a page id');

    expect(await createFolderStore(folder).list()).toStrictEqual([
      { id: 'home', text: 'home text' },
      { id: 'menu', text: 'menu text' },
    ]);
  });

  it.each(['../blocks', '../../package', 'menu/../home', ''])(
    'refuses to read or write a file for the page id %j',
    async (id) => {
      const store = createFolderStore(folder);
      const message = 'can contain only letters, digits, hyphens, and underscores.';

      await expect(store.read(id)).rejects.toThrow(message);
      await expect(store.write(id, '{}')).rejects.toThrow(message);
      expect(await readdir(parentFolder, { recursive: true })).toStrictEqual(['pages']);
    },
  );
});

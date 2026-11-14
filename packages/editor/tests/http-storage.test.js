import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { startTestSite } from '../../../test-site/src/test-site.ts';
import { createHttpStorage, listPages, readPage, writePage } from '../src/http-storage.ts';

let site;
let apiUrl;

beforeAll(async () => {
  site = await startTestSite();
  apiUrl = `${site.origin}/cms/api`;
  const fetchWithoutOrigin = globalThis.fetch;
  vi.stubGlobal('fetch', (address, init = {}) =>
    fetchWithoutOrigin(address, { ...init, headers: { ...init.headers, origin: site.origin } }),
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await site.close();
});

function pageDocument(id, path, title = `Page ${id}`) {
  return {
    formatVersion: 0,
    root: { id, type: 'Landing', version: 1, props: { title, path } },
  };
}

describe('the HTTP storage of the editor with the test site', () => {
  it('uploads an image, and gives the message of a refusal', async () => {
    const storage = createHttpStorage(apiUrl);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>';

    expect((await storage.upload(new File([png], 'cup.png', { type: 'image/png' }))).src).toMatch(
      /^\/uploads\/[0-9a-f]{32}\.png$/,
    );
    await expect(storage.upload(new File([svg], 'cup.png', { type: 'image/png' }))).rejects.toThrow(
      'The server did not save the image. 415: The file is not a PNG, JPEG, WebP, GIF, or AVIF image.',
    );
  });

  it('looks up the records of a source by text and by ids', async () => {
    const storage = createHttpStorage(apiUrl);

    expect(await storage.lookup('products', { text: 'shelf' })).toStrictEqual([
      { id: 'pine-shelf', label: 'Pine shelf' },
    ]);
    expect(await storage.lookup('products', { ids: ['oak-chair', 'gone'] })).toStrictEqual([
      { id: 'oak-chair', label: 'Oak chair' },
    ]);
    await expect(storage.lookup('teas', { text: '' })).rejects.toThrow(
      'The server answered the request for the records of "teas" with 404.',
    );
  });

  it('lists the pages, also with a slash at the end of the API address', async () => {
    const expected = { id: 'home', type: 'Landing', title: 'Oak and pine furniture', path: '/' };

    expect(await listPages(apiUrl)).toContainEqual(expected);
    expect(await listPages(`${apiUrl}/`)).toContainEqual(expected);
  });

  it('reads a page with its ETag, and finds no page for an unknown id', async () => {
    const page = await readPage(apiUrl, 'home');

    expect(page?.document.root.props.title).toBe('Oak and pine furniture');
    expect(page?.etag).toMatch(/^"[\w-]+"$/);
    expect(await readPage(apiUrl, 'beans')).toBeUndefined();
    expect(await readPage(apiUrl, '../blocks')).toBeUndefined();
  });

  it('creates a page one time only', async () => {
    const first = await writePage(apiUrl, 'beans', pageDocument('beans', '/beans'), {
      kind: 'create',
    });
    const second = await writePage(apiUrl, 'beans', pageDocument('beans', '/beans'), {
      kind: 'create',
    });

    expect(first.status).toBe('saved');
    expect(second).toEqual({ status: 'changed' });
  });

  it('saves a page only over the version that it read', async () => {
    await writePage(apiUrl, 'tea', pageDocument('tea', '/tea'), { kind: 'create' });
    const { etag } = await readPage(apiUrl, 'tea');

    const first = await writePage(apiUrl, 'tea', pageDocument('tea', '/tea', 'Tea'), {
      kind: 'update',
      etag,
    });
    const second = await writePage(apiUrl, 'tea', pageDocument('tea', '/tea', 'Green tea'), {
      kind: 'update',
      etag,
    });

    expect(first.status).toBe('saved');
    expect(second).toEqual({ status: 'changed' });
  });

  it('reports a path that a different page has', async () => {
    const result = await writePage(apiUrl, 'copy', pageDocument('copy', '/'), {
      kind: 'create',
    });

    expect(result).toEqual({ status: 'pathTaken' });
  });

  it('reports a document that the backend rejects, with the status and the message', async () => {
    const result = await writePage(apiUrl, 'wrong', pageDocument('other', '/wrong'), {
      kind: 'create',
    });

    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/^400: The root block has the id "other"/);
  });

  it('gives read, write, and list to the editor, and keeps the ETag of each page', async () => {
    const storage = createHttpStorage(apiUrl);
    await storage.write('scones', pageDocument('scones', '/scones'), { isNew: true });
    const stored = await storage.read('scones');
    await storage.write('scones', pageDocument('scones', '/scones', 'Scones'), { isNew: false });
    const other = createHttpStorage(apiUrl);
    await other.read('scones');
    await other.write('scones', pageDocument('scones', '/scones', 'Fresh scones'), {
      isNew: false,
    });

    expect(stored.root.props.title).toBe('Page scones');
    expect(await storage.list()).toContainEqual({
      id: 'scones',
      type: 'Landing',
      title: 'Fresh scones',
      path: '/scones',
    });
    await expect(
      storage.write('scones', pageDocument('scones', '/scones', 'Old scones'), { isNew: false }),
    ).rejects.toThrow('The document changed after you opened it.');
  });

  it.each([
    ['muffins', '/', true, 'A different page has this address. Change the address.'],
    ['home', '/', true, 'A document with the same id exists.'],
    [
      'wrong',
      '/wrong',
      true,
      'The server did not save the document. 400: The root block has the id',
    ],
  ])('throws a clear error when the server refuses %s', async (id, path, isNew, message) => {
    const document = pageDocument(id === 'wrong' ? 'other' : id, path);

    await expect(createHttpStorage(apiUrl).write(id, document, { isNew })).rejects.toThrow(message);
  });

  it('gives nothing for a page that does not exist', async () => {
    expect(await createHttpStorage(apiUrl).read('beans-2')).toBeUndefined();
  });
});

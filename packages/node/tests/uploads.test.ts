import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFolderUploads } from '../src/index.ts';
import { startTestSite, type TestSite } from './test-site.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let site: TestSite;
let uploadsFolder: string;

beforeAll(async () => {
  uploadsFolder = join(await mkdtemp(join(tmpdir(), 'lhcms-uploads-')), 'uploads');
  site = await startTestSite({
    options: { uploads: createFolderUploads(uploadsFolder, '/uploads/') },
  });
});

afterAll(async () => {
  await site.close();
  await rm(join(uploadsFolder, '..'), { recursive: true, force: true });
});

function upload(body: Uint8Array, headers: Record<string, string> = { origin: site.origin }) {
  return fetch(`${site.origin}/cms/api/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', ...headers },
    body,
  });
}

describe('the uploads of createCms', () => {
  it('keeps an image in the folder under a random name and serves it', async () => {
    const response = await upload(PNG);
    const { src } = (await response.json()) as { src: string };
    const file = await fetch(`${site.origin}${src}`);

    expect(response.status).toBe(201);
    expect(src).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    expect(await readdir(uploadsFolder)).toStrictEqual([src.slice('/uploads/'.length)]);
    expect(new Uint8Array(await readFile(join(uploadsFolder, src.slice(9))))).toStrictEqual(PNG);
    expect([
      file.status,
      file.headers.get('content-type'),
      file.headers.get('content-length'),
      file.headers.get('etag'),
      file.headers.get('x-content-type-options'),
      new Uint8Array(await file.arrayBuffer()),
    ]).toStrictEqual([
      200,
      'image/png',
      String(PNG.length),
      `"${src.slice('/uploads/'.length)}"`,
      'nosniff',
      PNG,
    ]);
  });

  it.each<[string, RequestInit, number, string | null]>([
    ['a HEAD request', { method: 'HEAD' }, 200, String(PNG.length)],
    ['a request with the ETag of the file', { headers: { 'if-none-match': 'ETAG' } }, 304, null],
    [
      'a request with a weak ETag in a list',
      { headers: { 'if-none-match': '"other", W/ETAG' } },
      304,
      null,
    ],
  ])('answers %s without the file', async (_, init, status, length) => {
    const { src } = (await (await upload(PNG)).json()) as { src: string };
    const entityTag = `"${src.slice('/uploads/'.length)}"`;
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([name, value]) => [
        name,
        String(value).replace('ETAG', entityTag),
      ]),
    );
    const response = await fetch(`${site.origin}${src}`, { ...init, headers });

    expect([
      response.status,
      response.headers.get('content-length'),
      response.headers.get('etag'),
      await response.text(),
    ]).toStrictEqual([status, length, entityTag, '']);
  });

  it('answers a HEAD request for a live page', async () => {
    const response = await fetch(`${site.origin}/`, { method: 'HEAD' });

    expect([
      response.status,
      response.headers.get('content-type'),
      await response.text(),
    ]).toStrictEqual([200, 'text/html; charset=utf-8', '']);
  });

  it.each<[string, () => Promise<Response>, number, string]>([
    [
      'an SVG file',
      () => upload(SVG),
      415,
      'The file is not a PNG, JPEG, WebP, GIF, or AVIF image.',
    ],
    [
      'a request from a different site',
      () => upload(PNG, { origin: 'https://example.com' }),
      403,
      'The request must come from a page of this site.',
    ],
    [
      'a file that is larger than 10 MB',
      () => upload(new Uint8Array(MAX_UPLOAD_BYTES + 1)),
      413,
      'The file is larger than 10 MB.',
    ],
    [
      'a GET request',
      () => fetch(`${site.origin}/cms/api/uploads`),
      405,
      'This address accepts only POST.',
    ],
  ])('refuses %s', async (_, send, status, message) => {
    const response = await send();

    expect([response.status, await response.text()]).toStrictEqual([status, message]);
  });

  it.each([
    '/uploads/0123456789abcdef0123456789abcdef.png',
    '/uploads/..%2Fpages%2Fhome.json',
    '/uploads/photo.svg',
  ])('answers 404 for %s', async (path) => {
    expect((await fetch(`${site.origin}${path}`)).status).toBe(404);
  });

  it('refuses uploads when the site gives no uploads option', async () => {
    const siteWithoutUploads = await startTestSite();
    const response = await fetch(`${siteWithoutUploads.origin}/cms/api/uploads`, {
      method: 'POST',
      headers: { origin: siteWithoutUploads.origin },
      body: PNG,
    });
    await siteWithoutUploads.close();

    expect([response.status, await response.text()]).toStrictEqual([
      404,
      'The site does not accept uploads.',
    ]);
  });

  it.each([
    ['gives the editor the upload of the HTTP storage', true, false],
    ['removes the upload from the storage of the editor', false, true],
  ])('%s when the site accepts uploads: %s', async (_, acceptsUploads, hasNoUpload) => {
    const testSite = acceptsUploads ? site : await startTestSite();
    const script = await (await fetch(`${testSite.origin}/cms/storage.js`)).text();
    if (testSite !== site) {
      await testSite.close();
    }

    expect(script.includes('upload: undefined')).toBe(hasNoUpload);
  });

  it.each(['uploads', '/', '//'])('refuses the path %j', (path) => {
    expect(() => createFolderUploads(uploadsFolder, path)).toThrow(
      `The path of the uploaded files must start with / and contain a folder name, for example /uploads, got ${JSON.stringify(path)}.`,
    );
  });
});

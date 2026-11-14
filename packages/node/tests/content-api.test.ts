import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { pageDocument, startTestSite, type TestSite } from './test-site.ts';

let site: TestSite;

beforeAll(async () => {
  site = await startTestSite();
});

afterAll(async () => {
  await site.close();
});

function pageAddress(id: string): string {
  return `${site.origin}/cms/api/pages/${id}`;
}

function putPage(id: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(pageAddress(id), {
    method: 'PUT',
    headers: { origin: site.origin, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('the content API', () => {
  it('lists the pages with their ids, titles, and paths', async () => {
    const response = await fetch(`${site.origin}/cms/api/pages`);

    expect(await response.json()).toStrictEqual({
      pages: [{ id: 'home', type: 'Landing', title: 'Page home', path: '/' }],
    });
  });

  it('sends the stored text of a page with an ETag', async () => {
    const response = await fetch(pageAddress('home'));

    expect(response.headers.get('etag')).toMatch(/^"[\w-]+"$/);
    expect(await response.text()).toBe(await readFile(join(site.pagesFolder, 'home.json'), 'utf8'));
  });

  it.each(['beans', 'a%2Fb', '..'])('answers 404 for the page id %j', async (id) => {
    expect((await fetch(pageAddress(id))).status).toBe(404);
  });

  it('creates a page, and then saves only changes of the version that the editor read', async () => {
    const created = await putPage('tea', pageDocument('tea', '/tea'), { 'if-none-match': '*' });
    const etag = created.headers.get('etag') ?? '';
    const first = await putPage('tea', pageDocument('tea', '/tea', 'Tea'), { 'if-match': etag });
    const second = await putPage('tea', pageDocument('tea', '/tea', 'Tea'), { 'if-match': etag });
    const stored = JSON.parse(await readFile(join(site.pagesFolder, 'tea.json'), 'utf8'));

    expect([created.status, first.status, second.status]).toStrictEqual([204, 204, 412]);
    expect(stored).toStrictEqual(pageDocument('tea', '/tea', 'Tea'));
  });

  it.each([
    [
      412,
      'a new page over a page that exists',
      'home',
      pageDocument('home', '/'),
      { 'if-none-match': '*' },
    ],
    [409, 'a path that a different page has', 'cakes', pageDocument('cakes', '/'), {}],
    [400, 'a body that is not JSON', 'cakes', '{', {}],
    [400, 'a document that fails step 1', 'cakes', { formatVersion: 0 }, {}],
    [400, 'a root id that is not the page id', 'cakes', pageDocument('menu', '/menu'), {}],
    [
      415,
      'a body of a different type',
      'cakes',
      pageDocument('cakes', '/cakes'),
      { 'content-type': 'text/plain' },
    ],
    [
      403,
      'a request from a different site',
      'cakes',
      pageDocument('cakes', '/cakes'),
      { origin: 'https://example.com' },
    ],
    [
      403,
      'a request without an Origin header',
      'cakes',
      pageDocument('cakes', '/cakes'),
      { origin: '' },
    ],
    [
      403,
      'a request from a different port',
      'cakes',
      pageDocument('cakes', '/cakes'),
      { origin: 'http://127.0.0.1:1' },
    ],
  ])('answers %j to %s', async (status, _, id, body, headers) => {
    expect((await putPage(id, body, headers)).status).toBe(status);
  });

  it('accepts a request from the same host over HTTPS', async () => {
    const origin = site.origin.replace('http:', 'https:');

    expect((await putPage('scones', pageDocument('scones', '/scones'), { origin })).status).toBe(
      204,
    );
  });

  it('answers 413 to a body that is larger than 1 MB', async () => {
    const body = JSON.stringify({
      ...pageDocument('big', '/big'),
      padding: 'x'.repeat(1024 * 1024),
    });

    expect((await putPage('big', body)).status).toBe(413);
  });

  it.each([
    ['POST', '/cms/api/pages', 'GET'],
    ['DELETE', '/cms/api/pages/home', 'GET, PUT'],
  ])('answers 405 to %s %s', async (method, path, allow) => {
    const response = await fetch(`${site.origin}${path}`, { method });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(allow);
  });

  it('lists a stored text that is not JSON as a page without a title and a path', async () => {
    await writeFile(join(site.pagesFolder, 'broken.json'), '{');
    const response = await fetch(`${site.origin}/cms/api/pages`);

    expect(await response.json()).toStrictEqual({
      pages: expect.arrayContaining([{ id: 'broken' }]),
    });
  });
});

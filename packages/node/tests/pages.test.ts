import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { pageDocument, startTestSite, type TestSite } from './test-site.ts';

const SITE_POLICY = "default-src 'self'";
let site: TestSite;

beforeAll(async () => {
  site = await startTestSite({
    withNext: true,
    siteHeaders: { 'content-security-policy': SITE_POLICY },
  });
  await writeFile(
    join(site.pagesFolder, 'cafe.json'),
    JSON.stringify(pageDocument('cafe', '/café')),
  );
});

afterAll(async () => {
  await site.close();
});

describe('the stored pages', () => {
  it('renders the page of the path for the live site with the headers of the site', async () => {
    const response = await fetch(`${site.origin}/`);

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe(SITE_POLICY);
    expect(await response.text()).toContain('<title>Page home</title>');
  });

  it('finds a page with an encoded path', async () => {
    expect(await (await fetch(`${site.origin}/caf%C3%A9`)).text()).toContain('Page cafe');
  });

  it('saves a page with an invalid block, and the live site skips the block', async () => {
    const document = pageDocument('tea', '/tea');
    const blocks = [
      { id: 'tea-text', type: 'Text', version: 1, props: { body: 'Green tea' } },
      { id: 'tea-invalid', type: 'Text', version: 1, props: { body: 'Line one\nLine two' } },
    ];
    const saved = await fetch(`${site.origin}/cms/api/pages/tea`, {
      method: 'PUT',
      headers: { origin: site.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ...document, root: { ...document.root, slots: { main: blocks } } }),
    });
    const live = await (await fetch(`${site.origin}/tea`)).text();

    expect(saved.status).toBe(204);
    expect(live).toContain('<p>Green tea</p>');
    expect(live).not.toContain('Line one');
  });

  it.each([
    ['GET', '/menu'],
    ['GET', '/%E0'],
    ['POST', '/'],
  ])('gives %s %j to next', async (method, path) => {
    expect(await (await fetch(`${site.origin}${path}`, { method })).text()).toBe('next');
  });
});

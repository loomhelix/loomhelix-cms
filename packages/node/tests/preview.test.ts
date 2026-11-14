import { readFile } from 'node:fs/promises';
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

function withText(body: string) {
  const document = pageDocument('home', '/', 'Home draft');
  const text = { id: 'home-text', type: 'Text', version: 1, props: { body } };
  return { ...document, root: { ...document.root, slots: { main: [text] } } };
}

function postPreview(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return fetch(`${site.origin}/cms/preview`, {
    method: 'POST',
    headers: {
      origin: site.origin,
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe('the preview', () => {
  it('renders the document of the form with the bridge script and does not save it', async () => {
    const storedBefore = await readFile(join(site.pagesFolder, 'home.json'), 'utf8');
    const response = await postPreview({ document: JSON.stringify(withText('Fresh bread')) });
    const body = await response.text();

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(body).toContain('<title>Home draft</title>');
    expect(body).toContain('<p data-lhcms-block="home-text">Fresh bread</p>');
    expect(body).toContain('<script type="module" src="/cms/bridge.js"></script></body>');
    expect(await readFile(join(site.pagesFolder, 'home.json'), 'utf8')).toBe(storedBefore);
  });

  it('shows a fallback with the escaped error for an invalid block', async () => {
    const document = withText('Line one\n<script>alert(1)</script>');
    const body = await (await postPreview({ document: JSON.stringify(document) })).text();

    expect(body).toContain('This block cannot be shown.');
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>alert(1)</script>');
  });

  it.each([
    [
      403,
      'a request from a different site',
      { document: '{}' },
      { origin: 'https://evil.example' },
    ],
    [403, 'a request without an Origin header', { document: '{}' }, { origin: '' }],
    [415, 'a body of a different type', { document: '{}' }, { 'content-type': 'text/plain' }],
    [400, 'a form without the document field', { page: '{}' }, {}],
    [400, 'a document that is not JSON', { document: '{' }, {}],
    [400, 'a document with an old format', { document: '{"formatVersion":0,"blocks":[]}' }, {}],
  ])('answers %j to %s', async (status, _, fields, headers) => {
    expect((await postPreview(fields, headers)).status).toBe(status);
  });

  it.each([
    [200, 1.5 * 1024 * 1024],
    [413, 2 * 1024 * 1024 + 1],
  ])('answers %j to a form body of %j bytes', async (status, size) => {
    const prefix = new URLSearchParams({ document: JSON.stringify(withText('')) });
    const text = 'x'.repeat(size - prefix.toString().length);
    const response = await postPreview({ document: JSON.stringify(withText(text)) });

    expect(response.status).toBe(status);
  });

  it('answers 405 to a request other than POST', async () => {
    expect((await fetch(`${site.origin}/cms/preview`)).status).toBe(405);
  });
});

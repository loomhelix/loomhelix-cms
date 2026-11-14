import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { pageDocument, startTestSite, type TestSite } from './test-site.ts';

const NOTICE = {
  formatVersion: 0,
  root: { id: 'notice', type: 'Text', version: 1, props: { body: 'Closed on Monday' } },
};
let site: TestSite;

beforeAll(async () => {
  site = await startTestSite();
  await writeFile(join(site.pagesFolder, 'notice.json'), JSON.stringify(NOTICE));
});

afterAll(async () => {
  await site.close();
});

function postPreview(origin: string, document: unknown) {
  return fetch(`${origin}/cms/preview`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ document: JSON.stringify(document) }).toString(),
  });
}

describe('block documents', () => {
  it('renders a block document for a page of the site', async () => {
    expect(await site.cms.renderBlock('notice')).toBe('<p>Closed on Monday</p>');
  });

  it('renders a block document with the old name of its type', async () => {
    const oldNotice = { ...NOTICE, root: { ...NOTICE.root, id: 'old-notice', type: 'Note' } };
    await writeFile(join(site.pagesFolder, 'old-notice.json'), JSON.stringify(oldNotice));

    expect(await site.cms.renderBlock('old-notice')).toBe('<p>Closed on Monday</p>');
  });

  it('shows a block document through a block reference on a live page and in the preview', async () => {
    const page = pageDocument('visit', '/visit');
    const visit = {
      ...page,
      root: { ...page.root, slots: { main: [{ id: 'r1', type: 'Text', document: 'notice' }] } },
    };
    await writeFile(join(site.pagesFolder, 'visit.json'), JSON.stringify(visit));

    expect(await (await fetch(`${site.origin}/visit`)).text()).toContain('<p>Closed on Monday</p>');
    expect(await (await postPreview(site.origin, visit)).text()).toContain(
      '<p data-lhcms-block="r1">Closed on Monday</p>',
    );
  });

  it('gives nothing for a block document that does not exist', async () => {
    expect(await site.cms.renderBlock('banner')).toBeUndefined();
  });

  it('refuses to render a page with renderBlock', async () => {
    await expect(site.cms.renderBlock('home')).rejects.toThrow(
      'The document "home" is not a block document.',
    );
  });

  it('shows a block document in a preview page with the bridge script', async () => {
    const preview = await (await postPreview(site.origin, NOTICE)).text();

    expect(preview).toContain('<title>Block preview</title>');
    expect(preview).toContain('<p data-lhcms-block="notice">Closed on Monday</p>');
    expect(preview).toContain('<script type="module" src="/cms/bridge.js"></script></body>');
  });

  it('puts a block document into the preview page of the site', async () => {
    const custom = await startTestSite({
      options: {
        blockPreviewPage: (blockHtml) =>
          `<html><head><link rel="stylesheet" href="/site.css" /></head><body>${blockHtml}</body></html>`,
      },
    });
    try {
      const preview = await (await postPreview(custom.origin, NOTICE)).text();

      expect(preview).toContain('<link rel="stylesheet" href="/site.css" />');
      expect(preview).toContain('<body><p data-lhcms-block="notice">Closed on Monday</p>');
    } finally {
      await custom.close();
    }
  });

  it('saves block documents without a path, and lists them with their type', async () => {
    const save = (id: string) =>
      fetch(`${site.origin}/cms/api/pages/${id}`, {
        method: 'PUT',
        headers: { origin: site.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ...NOTICE, root: { ...NOTICE.root, id } }),
      });
    const statuses = [(await save('banner')).status, (await save('footer')).status];
    const response = await fetch(`${site.origin}/cms/api/pages`);

    expect(statuses).toStrictEqual([204, 204]);
    expect(await response.json()).toStrictEqual({
      pages: expect.arrayContaining([{ id: 'footer', type: 'Text' }]),
    });
  });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { SCHEMA, startTestSite, type TestSite } from './test-site.ts';

let site: TestSite;

beforeAll(async () => {
  site = await startTestSite();
});

afterAll(async () => {
  await site.close();
});

describe('the files of the editor', () => {
  it.each(['/cms', '/cms/'])('sends the editor page at %j', async (path) => {
    const response = await fetch(`${site.origin}${path}`);
    const page = await response.text();

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(page).toContain('<script type="module" src="/cms/editor.js"></script>');
    expect(page).toContain('schema-url="/cms/blocks.json"');
    expect(page).toContain('<script type="module" src="/cms/storage.js"></script>');
    expect(page).toContain('preview-url="/cms/preview"');
  });

  it('sends the schema file', async () => {
    expect(await (await fetch(`${site.origin}/cms/blocks.json`)).json()).toStrictEqual(SCHEMA);
  });

  it('reads the schema from a TypeScript module too', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'lhcms-schema-module-'));
    const schemaFile = join(folder, 'blocks.ts');
    await writeFile(schemaFile, `export default ${JSON.stringify(SCHEMA)} as const;\n`);
    const moduleSite = await startTestSite({ options: { schemaFile } });
    try {
      const response = await fetch(`${moduleSite.origin}/cms/blocks.json`);

      expect(await response.json()).toStrictEqual(SCHEMA);
    } finally {
      await moduleSite.close();
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('sends the script that gives each editor of the page the HTTP storage', async () => {
    const response = await fetch(`${site.origin}/cms/storage.js`);
    const script = await response.text();

    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(script).toContain("import { createHttpStorage } from '/cms/editor.js';");
    expect(script).toContain("createHttpStorage('/cms/api')");
  });

  it.each(['/cms/editor.js', '/cms/bridge.js'])('sends the built script %j', async (path) => {
    const response = await fetch(`${site.origin}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  });

  it.each(['/cms', '/cms/blocks.json', '/cms/editor.js'])(
    'answers 405 to a POST request to %j',
    async (path) => {
      const response = await fetch(`${site.origin}${path}`, { method: 'POST' });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
    },
  );
});

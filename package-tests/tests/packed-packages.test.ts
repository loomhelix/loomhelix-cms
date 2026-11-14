import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const run = promisify(execFile);
const PACKAGES_FOLDER = fileURLToPath(new URL('../../packages', import.meta.url));
const PACKAGE_FOLDERS = ['schema', 'render-html', 'editor', 'bridge', 'cli', 'node'];
const TYPESCRIPT_COMPILER = fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url));
const COMPILER_OPTIONS = [
  '--noEmit',
  '--pretty',
  'false',
  '--strict',
  '--module',
  'nodenext',
  '--target',
  'es2023',
];

const TYPE_CASES = [
  {
    name: 'a storage from createHttpStorage',
    file: 'http-storage.ts',
    source: `import { createHttpStorage, type EditorStorage } from '@loomhelix-cms/editor';

const storage: EditorStorage = createHttpStorage('/cms/api');
export const titles = (await storage.list?.())?.map(({ title }) => title);
`,
    errors: [],
  },
  {
    name: 'a write of a document with an unknown format version',
    file: 'unknown-format-version.ts',
    source: `import { createHttpStorage } from '@loomhelix-cms/editor';

const root = { id: 'home', type: 'Landing', version: 1, props: {} };
await createHttpStorage('/cms/api').write('home', { formatVersion: 1, root }, { isNew: true });
`,
    errors: ['TS2322'],
  },
  {
    name: 'the editor element from querySelector',
    file: 'editor-element.ts',
    source: `import { createHttpStorage } from '@loomhelix-cms/editor';

const editor = document.querySelector('lhcms-editor');
if (editor !== null) {
  editor.storage = createHttpStorage('/cms/api');
  editor.schemaUrl = '/blocks.json';
}
`,
    errors: [],
  },
  {
    name: 'a number in the schemaUrl property',
    file: 'number-schema-url.ts',
    source: `import type { LhcmsEditorElement } from '@loomhelix-cms/editor';

export function setSchema(editor: LhcmsEditorElement): void {
  editor.schemaUrl = 1;
}
`,
    errors: ['TS2322'],
  },
];

const SCHEMA_MODULE = `import { block, defineSchema, page, slot, text } from '@loomhelix-cms/schema';

export default defineSchema({
  pages: { Landing: page({ slots: { main: slot(['Notice']) } }) },
  blocks: { Notice: block({ fields: { text: text({ label: 'Text' }) } }) },
});
`;

const HOME_PAGE = {
  formatVersion: 0,
  root: {
    id: 'home',
    type: 'Landing',
    version: 1,
    props: { title: 'Bakery', path: '/' },
    slots: {
      main: [{ id: 'notice', type: 'Notice', version: 1, props: { text: 'Fresh bread at 8' } }],
    },
  },
};

const SITE_SCRIPT = `import { once } from 'node:events';
import { createServer } from 'node:http';
import { createCms, createFolderStore } from '@loomhelix-cms/node';
import { html } from '@loomhelix-cms/render-html';

const cms = await createCms({
  schemaFile: 'blocks.ts',
  templates: {
    Landing: ({ props, slots }) => html\`<html><head><title>\${props.title}</title></head><body>\${slots.main}</body></html>\`,
    Notice: ({ props }) => html\`<p>\${props.text}</p>\`,
  },
  store: createFolderStore('pages'),
  canEdit: () => true,
});
const server = createServer((request, response) => cms.handle(request, response));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = \`http://127.0.0.1:\${server.address().port}\`;
const home = await (await fetch(\`\${origin}/\`)).text();
const scripts = [];
for (const path of ['/cms/editor.js', '/cms/bridge.js']) {
  const response = await fetch(origin + path);
  scripts.push(\`\${path} \${response.status} \${response.headers.get('content-type')}\`);
}
server.close();
console.log(JSON.stringify({ home, scripts }));
`;

interface PackResult {
  readonly filename: string;
  readonly files: readonly { readonly path: string }[];
}

let folder: string;
let project: string;
let packs: ReadonlyMap<string, PackResult>;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'lhcms-packages-'));
  project = join(folder, 'project');
  await mkdir(join(project, 'pages'), { recursive: true });
  packs = new Map(
    await Promise.all(
      PACKAGE_FOLDERS.map(
        async (packageFolder) => [packageFolder, await pack(packageFolder)] as const,
      ),
    ),
  );
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ name: 'packed-site', private: true, type: 'module' }),
  );
  await writeFile(join(project, 'blocks.ts'), SCHEMA_MODULE);
  await writeFile(join(project, 'pages', 'home.json'), JSON.stringify(HOME_PAGE));
  await writeFile(join(project, 'site.js'), SITE_SCRIPT);
  await run(
    'npm',
    [
      'install',
      '--offline',
      '--no-audit',
      '--no-fund',
      ...[...packs.values()].map(({ filename }) => filename),
    ],
    { cwd: project },
  );
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function pack(packageFolder: string): Promise<PackResult> {
  const { stdout } = await run('pnpm', ['pack', '--json', '--pack-destination', folder], {
    cwd: join(PACKAGES_FOLDER, packageFolder),
  });
  return JSON.parse(stdout);
}

async function typeErrorCodes(file: string): Promise<readonly string[]> {
  const output = await run(TYPESCRIPT_COMPILER, [...COMPILER_OPTIONS, file], { cwd: project }).then(
    ({ stdout }) => stdout,
    (error: { readonly stdout: string }) => error.stdout,
  );
  return output.match(/(?<=error )TS\d+/g) ?? [];
}

describe('the packed packages', () => {
  it.each(PACKAGE_FOLDERS)(
    'packs only package.json, README.md, LICENSE, and dist of %s',
    (packageFolder) => {
      const paths = packs.get(packageFolder)?.files.map(({ path }) => path.split('/')[0]) ?? [];

      expect(new Set(paths)).toStrictEqual(
        new Set(['LICENSE', 'README.md', 'dist', 'package.json']),
      );
    },
  );

  it('builds blocks.json from blocks.ts with the lhcms command', async () => {
    await run(join(project, 'node_modules', '.bin', 'lhcms'), ['build'], { cwd: project });
    const schema = JSON.parse(await readFile(join(project, 'blocks.json'), 'utf8'));

    expect([
      schema.formatVersion,
      Object.keys(schema.pages),
      Object.keys(schema.blocks),
    ]).toStrictEqual([0, ['Landing'], ['Notice']]);
  });

  it('renders a page and serves the editor scripts with createCms', async () => {
    const { stdout } = await run(process.execPath, ['site.js'], { cwd: project });
    const { home, scripts } = JSON.parse(stdout);

    expect(home).toContain('<p>Fresh bread at 8</p>');
    expect(scripts).toStrictEqual([
      '/cms/editor.js 200 text/javascript; charset=utf-8',
      '/cms/bridge.js 200 text/javascript; charset=utf-8',
    ]);
  });

  it.each(TYPE_CASES)(
    'checks $name with the types of the editor',
    async ({ file, source, errors }) => {
      await writeFile(join(project, file), source);

      expect(await typeErrorCodes(file)).toStrictEqual(errors);
    },
  );
});

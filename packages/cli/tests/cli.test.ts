import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseSchema } from '@loomhelix-cms/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runCli } from '../src/cli.ts';
import { writeSchemaTypes } from '../src/schema-types.ts';
import { SCHEMA } from './test-schema.ts';

const BIN_FILE = fileURLToPath(new URL('../src/bin.ts', import.meta.url));
const SCHEMA_MODULE = `const schema: Record<string, unknown> = ${JSON.stringify(SCHEMA)};\nexport default schema;\n`;
let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'lhcms-cli-'));
  await writeFile(join(folder, 'blocks.json'), JSON.stringify(SCHEMA));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const output = { stdout: '', stderr: '' };
  const code = await runCli(args, {
    cwd: folder,
    write: (text) => {
      output.stdout += text;
    },
    writeError: (text) => {
      output.stderr += text;
    },
  });
  return { code, ...output };
}

describe('lhcms types', () => {
  it('writes the types next to the default schema file', async () => {
    const result = await run('types');

    expect(result).toStrictEqual({
      code: 0,
      stdout: 'Wrote blocks.types.ts: 1 page type and 1 block type.\n',
      stderr: '',
    });
    expect(await readFile(join(folder, 'blocks.types.ts'), 'utf8')).toBe(
      writeSchemaTypes(parseSchema(SCHEMA)),
    );
  });

  it('writes the types next to a schema file in a different folder', async () => {
    await mkdir(join(folder, 'site'));
    await writeFile(join(folder, 'site', 'schema.json'), JSON.stringify(SCHEMA));

    expect((await run('types', 'site/schema.json')).stdout).toBe(
      `Wrote ${join('site', 'schema.types.ts')}: 1 page type and 1 block type.\n`,
    );
  });
});

describe('lhcms build', () => {
  it('writes the JSON of the default export next to the schema module', async () => {
    await writeFile(join(folder, 'blocks.ts'), SCHEMA_MODULE);
    await writeFile(join(folder, 'blocks.json'), '{}');

    expect(await run('build')).toStrictEqual({
      code: 0,
      stdout: 'Wrote blocks.json: 1 page type and 1 block type.\n',
      stderr: '',
    });
    expect(await readFile(join(folder, 'blocks.json'), 'utf8')).toBe(
      `${JSON.stringify(SCHEMA, null, 2)}\n`,
    );
  });

  it.each([
    [['build'], '', 'The schema file blocks.ts does not exist.\n'],
    [['build', 'blocks.json'], '', 'blocks.json is a JSON file already.'],
    [['build'], 'export const schema = {};', 'must export the schema as its default export.'],
    [['build'], 'export default { formatVersion: 0 };', 'The schema must have "pages"'],
  ])('answers %j with an error for the module %j', async (args, moduleText, message) => {
    if (moduleText !== '') {
      await writeFile(join(folder, 'blocks.ts'), moduleText);
    }
    const result = await run(...args);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(await readFile(join(folder, 'blocks.json'), 'utf8')).toBe(JSON.stringify(SCHEMA));
  });
});

describe('a schema in TypeScript', () => {
  const QUOTE_SCHEMA = {
    ...SCHEMA,
    blocks: { ...SCHEMA.blocks, Quote: { version: 1, fields: { text: { type: 'text' } } } },
  };

  it('is the default schema file when blocks.ts exists', async () => {
    await writeFile(join(folder, 'blocks.ts'), `export default ${JSON.stringify(QUOTE_SCHEMA)};\n`);
    const result = await run('template', 'Quote');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('  Quote: ({ props }) =>');
  });

  it('gives the types of the templates', async () => {
    await writeFile(join(folder, 'blocks.ts'), `export default ${JSON.stringify(QUOTE_SCHEMA)};\n`);

    expect((await run('types', 'blocks.ts')).stdout).toBe(
      'Wrote blocks.types.ts: 1 page type and 2 block types.\n',
    );
    expect(await readFile(join(folder, 'blocks.types.ts'), 'utf8')).toContain('QuoteProps');
  });
});

describe('lhcms template', () => {
  it('prints a first template for a type', async () => {
    const result = await run('template', 'Text');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('  Text: ({ props }) =>\n    html`<div class="text">');
  });
});

describe('lhcms check and lhcms migrate', () => {
  const CONTENT_SCHEMA = {
    ...SCHEMA,
    blocks: {
      Text: {
        version: 2,
        fields: { body: { type: 'text' } },
        migrations: [{ from: 1, operations: [{ op: 'renameField', from: 'heading', to: 'body' }] }],
      },
    },
  };
  const DOCUMENTS: Readonly<Record<string, unknown>> = {
    current: landing('current', { type: 'Text', version: 2, props: { body: 'New' } }),
    old: landing('old', { type: 'Text', version: 1, props: { heading: 'Old' } }),
    quote: landing('quote', { type: 'Quote', version: 1, props: {} }),
  };
  const QUOTE_ERROR = `${join('pages', 'quote.json')}: The block "quote-text" has the type "Quote", but the schema has no block type with this name. (unknownType)`;

  function landing(id: string, text: Readonly<Record<string, unknown>>) {
    return {
      formatVersion: 0,
      root: {
        id,
        type: 'Landing',
        version: 1,
        props: { title: id, path: `/${id}` },
        slots: { main: [{ id: `${id}-text`, ...text }] },
      },
    };
  }

  function readPage(name: string): Promise<string> {
    return readFile(join(folder, 'pages', name), 'utf8');
  }

  beforeEach(async () => {
    await writeFile(join(folder, 'blocks.json'), JSON.stringify(CONTENT_SCHEMA));
    await mkdir(join(folder, 'pages'));
    await Promise.all([
      ...Object.entries(DOCUMENTS).map(([id, document]) =>
        writeFile(join(folder, 'pages', `${id}.json`), JSON.stringify(document)),
      ),
      writeFile(join(folder, 'pages', 'broken.json'), '{'),
      writeFile(join(folder, 'pages', 'notes.txt'), 'not a document'),
    ]);
  });

  it.each([
    [
      'check',
      `${join('pages', 'old.json')}: The migrations change this document.`,
      '4 documents: 2 with errors, 1 to migrate.',
    ],
    ['migrate', `Wrote ${join('pages', 'old.json')}.`, '4 documents: 2 with errors, 1 written.'],
  ])('reports each document with lhcms %s', async (command, changedLine, summary) => {
    const result = await run(command, 'pages');

    expect(result.code).toBe(1);
    expect(result.stdout.split('\n')).toStrictEqual([
      expect.stringMatching(/^pages.broken\.json: The file is not valid JSON\. \S/),
      changedLine,
      QUOTE_ERROR,
      summary,
      '',
    ]);
  });

  it('writes only the changed documents with lhcms migrate', async () => {
    await run('migrate', 'pages');
    const migrated = JSON.parse(await readPage('old.json'));

    expect(migrated.root.slots.main[0]).toStrictEqual({
      id: 'old-text',
      type: 'Text',
      version: 2,
      props: { body: 'Old' },
    });
    expect([await readPage('current.json'), await readPage('quote.json')]).toStrictEqual([
      JSON.stringify(DOCUMENTS.current),
      JSON.stringify(DOCUMENTS.quote),
    ]);
    expect((await run('check', 'pages')).stdout).toContain('2 with errors, 0 to migrate.');
  });

  it('checks the block references between the documents of the folder', async () => {
    const notice = {
      formatVersion: 0,
      root: { id: 'notice', type: 'Text', version: 2, props: { body: 'Closed on Monday' } },
    };
    await Promise.all([
      writeFile(join(folder, 'pages', 'notice.json'), JSON.stringify(notice)),
      writeFile(
        join(folder, 'pages', 'shows.json'),
        JSON.stringify(landing('shows', { type: 'Text', document: 'notice' })),
      ),
      writeFile(
        join(folder, 'pages', 'lost.json'),
        JSON.stringify(landing('lost', { type: 'Text', document: 'gone' })),
      ),
    ]);
    const { stdout } = await run('check', 'pages');

    expect(stdout).toContain(
      `${join('pages', 'lost.json')}: The block "lost-text" shows the document "gone", but the document does not exist. (missingDocument)`,
    );
    expect(stdout).not.toContain('shows.json');
  });

  it('changes no file with lhcms check', async () => {
    await run('check', 'pages');

    expect(await readPage('old.json')).toBe(JSON.stringify(DOCUMENTS.old));
  });

  it('ends without an error when each document is valid', async () => {
    await rm(join(folder, 'pages', 'quote.json'));
    await rm(join(folder, 'pages', 'broken.json'));

    expect(await run('migrate', 'pages', 'blocks.json')).toStrictEqual({
      code: 0,
      stdout: `Wrote ${join('pages', 'old.json')}.\n2 documents: 0 with errors, 1 written.\n`,
      stderr: '',
    });
  });

  it.each(['missing', join('pages', 'current.json')])(
    'answers the folder %s that does not exist',
    async (missingFolder) => {
      expect(await run('check', missingFolder)).toStrictEqual({
        code: 1,
        stdout: '',
        stderr: `The folder ${missingFolder} does not exist.\n`,
      });
    },
  );
});

describe('lhcms diff', () => {
  it.each([
    [SCHEMA, 0, 'No change of the schema makes stored blocks invalid.\n'],
    [
      {
        ...SCHEMA,
        blocks: {
          Text: { version: 1, fields: { body: { type: 'text' }, heading: { type: 'text' } } },
        },
      },
      1,
      'Text: error: The field "heading" is not in the new type, but the stored blocks have it. Increase "version" to 2, and add { "op": "removeField", "field": "heading" } to a migration from version 1.\n1 error and 0 warnings.\n',
    ],
    [
      {
        ...SCHEMA,
        blocks: { Text: { version: 1, fields: { body: { type: 'text', multiline: true } } } },
      },
      0,
      'Text: warning: The field "body" has a stricter rule: no line breaks. Run lhcms check to find the stored blocks that break it.\n0 errors and 1 warning.\n',
    ],
  ])('compares an earlier schema with blocks.json (case %#)', async (oldSchema, code, stdout) => {
    await writeFile(join(folder, 'old.json'), JSON.stringify(oldSchema));

    expect(await run('diff', 'old.json')).toStrictEqual({ code, stdout, stderr: '' });
  });
});

describe('lhcms errors and usage', () => {
  it.each([
    [['types', 'missing.json'], 'The schema file missing.json does not exist.\n'],
    [['template', 'Quote'], 'The schema has no type "Quote". Its types are Landing, Text.\n'],
  ])('answers %j with an error', async (args, message) => {
    expect(await run(...args)).toStrictEqual({ code: 1, stdout: '', stderr: message });
  });

  it.each([
    ['{', 'The schema file blocks.json is not valid JSON.'],
    ['{"formatVersion":0}', 'The schema must have "pages"'],
  ])('reports a schema file with the text %j', async (text, message) => {
    await writeFile(join(folder, 'blocks.json'), text);
    const result = await run('types');

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it.each([[[]], [['deploy']], [['build', 'a.ts', 'b.ts']], [['template']]])(
    'prints the usage for the arguments %j',
    async (args) => {
      const result = await run(...args);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage:\n  lhcms build [schema-module]');
    },
  );

  it('prints the usage for --help without an error', async () => {
    expect(await run('--help')).toMatchObject({ code: 0, stderr: '' });
  });
});

describe('the lhcms command', () => {
  it('runs in Node.js and sets the exit code', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [BIN_FILE, 'types'], {
      cwd: folder,
    });

    expect(stdout).toBe('Wrote blocks.types.ts: 1 page type and 1 block type.\n');
    await expect(
      promisify(execFile)(process.execPath, [BIN_FILE, 'deploy'], { cwd: folder }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it('loads a TypeScript schema module in Node.js', async () => {
    await writeFile(join(folder, 'blocks.ts'), SCHEMA_MODULE);
    const { stdout } = await promisify(execFile)(process.execPath, [BIN_FILE, 'build'], {
      cwd: folder,
    });

    expect(stdout).toBe('Wrote blocks.json: 1 page type and 1 block type.\n');
  });
});

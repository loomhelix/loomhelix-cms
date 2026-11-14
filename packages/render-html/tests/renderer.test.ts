import { loadDocument, loadDocumentSet, parseSchema, type RichText } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import {
  createRenderer,
  html,
  richText,
  type Html,
  type RenderMode,
  type Template,
} from '../src/index.ts';

const schema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Hero', 'Columns'] } } } },
  blocks: {
    Hero: {
      version: 1,
      fields: { title: { type: 'text' }, link: { type: 'link', optional: true } },
    },
    Columns: { version: 1, slots: { items: { allow: ['Column'] } } },
    Column: { version: 1, slots: { content: { allow: ['Text'] } } },
    Text: { version: 1, fields: { body: { type: 'richText' } } },
  },
});

const templates: Record<string, Template> = {
  Landing: ({ props, slots }) =>
    html`<main>
      <h1>${props.title}</h1>
      ${slots.main}
    </main>`,
  Hero: ({ props }) =>
    html`<section class="hero"><a href="${props.link ?? '/'}">${props.title}</a></section>`,
  Columns: ({ slots }) => html`<div class="columns">${slots.items}</div>`,
  Column: ({ slots }) => html`<div class="column">${slots.content}</div>`,
  Text: ({ props }) => html`<div class="text">${richText(props.body as RichText)}</div>`,
};

const renderSet = createRenderer(schema, templates);

function setOf(json: unknown) {
  return { main: loadDocument(schema, json), shown: new Map() };
}

function render(json: unknown, mode: RenderMode) {
  return renderSet(setOf(json), mode);
}

function block(id: string, type: string, props: object, slots?: object) {
  return { id, type, version: 1, props, ...(slots === undefined ? {} : { slots }) };
}

function page(...blocks: unknown[]) {
  return {
    formatVersion: 0,
    root: {
      ...block('p1', 'Landing', { title: 'Fresh <coffee>', path: '/' }),
      slots: { main: blocks },
    },
  };
}

const hero = block('b1', 'Hero', { title: 'Welcome', link: '/menu' });
const columns = block(
  'b2',
  'Columns',
  {},
  {
    items: [
      block('b3', 'Column', {}, { content: [block('b4', 'Text', { body: [[{ text: 'Open' }]] })] }),
    ],
  },
);
const unsafeHero = block('b1', 'Hero', { title: 'Welcome', link: 'javascript:alert(1)' });

function compact(text: string): string {
  return text.replaceAll(/>\s+</g, '><').trim();
}

describe('createRenderer', () => {
  it('renders the live page with the templates of the site', () => {
    expect(compact(render(page(hero, columns), 'live'))).toBe(
      '<main><h1>Fresh &lt;coffee&gt;</h1>' +
        '<section class="hero"><a href="/menu">Welcome</a></section>' +
        '<div class="columns"><div class="column"><div class="text"><p>Open</p></div></div></div>' +
        '</main>',
    );
  });

  it('marks the first element of each block in a slot in the preview', () => {
    expect(compact(render(page(hero, columns), 'preview'))).toBe(
      '<main><h1>Fresh &lt;coffee&gt;</h1>' +
        '<section data-lhcms-block="b1" class="hero"><a href="/menu">Welcome</a></section>' +
        '<div data-lhcms-block="b2" class="columns"><div data-lhcms-block="b3" class="column">' +
        '<div data-lhcms-block="b4" class="text"><p>Open</p></div></div></div>' +
        '</main>',
    );
  });

  it('skips an invalid block on the live page', () => {
    expect(compact(render(page(unsafeHero, columns), 'live'))).toBe(
      compact(render(page(columns), 'live')),
    );
  });

  it('shows a fallback with the escaped error for an invalid block in the preview', () => {
    const output = compact(render(page(unsafeHero), 'preview'));

    expect(output).toContain('data-lhcms-block="b1"');
    expect(output).toContain('<p>This block cannot be shown.</p>');
    expect(output).toContain('got &quot;javascript:alert(1)&quot;.');
    expect(output).not.toContain('href="javascript');
  });

  it('does not render the blocks in the slots of an invalid block', () => {
    const newerColumns = { ...columns, version: 2 };

    expect(compact(render(page(newerColumns), 'live'))).toBe(
      '<main><h1>Fresh &lt;coffee&gt;</h1></main>',
    );
    expect(render(page(newerColumns), 'preview')).not.toContain('data-lhcms-block="b3"');
  });

  it('reports an error if the root block is invalid', () => {
    const document = page(hero);

    expect(() => render({ ...document, root: { ...document.root, version: 2 } }, 'live')).toThrow(
      'The document cannot be rendered. The block "p1" has version 2',
    );
  });

  it.each([
    [
      'live',
      '<div class="columns"><div class="column"><div class="text"><p>Open</p></div></div></div>',
    ],
    [
      'preview',
      '<div data-lhcms-block="b2" class="columns"><div data-lhcms-block="b3" class="column">' +
        '<div data-lhcms-block="b4" class="text"><p>Open</p></div></div></div>',
    ],
  ] as const)('renders a block document in the %s mode without a page', (mode, markup) => {
    expect(compact(render({ formatVersion: 0, root: columns }, mode))).toBe(markup);
  });

  it('reports an error if the root block of a block document is invalid on the live site', () => {
    expect(() => render({ formatVersion: 0, root: unsafeHero }, 'live')).toThrow(
      'The document cannot be rendered. The block "b1"',
    );
  });

  it('shows a fallback for an invalid root block of a block document in the preview', () => {
    const output = compact(render({ formatVersion: 0, root: unsafeHero }, 'preview'));

    expect(output).toMatch(/^<div\s+data-lhcms-block="b1"\s+class="lhcms-fallback"/);
    expect(output).toContain('<p>This block cannot be shown.</p>');
  });

  it.each<[string, Record<string, Template>, string]>([
    [
      'a missing template',
      {
        Landing: templates.Landing!,
        Hero: templates.Hero!,
        Columns: templates.Columns!,
        Column: templates.Column!,
      },
      'The schema has the type "Text", but the templates have no "Text". Add a template for it.',
    ],
    [
      'a template for an unknown type',
      { ...templates, Gallery: () => html`<div></div>` },
      'The templates have "Gallery", but the schema has no type with this name.',
    ],
  ])('rejects %s', (_, templatesToCheck, message) => {
    expect(() => createRenderer(schema, templatesToCheck)).toThrow(message);
  });

  it('rejects a template that does not return the result of html', () => {
    const renderString = createRenderer(schema, {
      ...templates,
      Hero: () => '<section></section>' as unknown as Html,
    });

    expect(() => renderString(setOf(page(hero)), 'live')).toThrow(
      'The template of "Hero" must return the result of html.',
    );
  });

  it('rejects a block template without a first element in the preview', () => {
    const renderText = createRenderer(schema, { ...templates, Hero: () => html`Welcome` });

    expect(compact(renderText(setOf(page(hero)), 'live'))).toContain('Welcome');
    expect(() => renderText(setOf(page(hero)), 'preview')).toThrow(
      'The template of "Hero" must return markup that starts with an element',
    );
  });
});

describe('a block reference', () => {
  const storage: Readonly<Record<string, unknown>> = {
    promo: { formatVersion: 0, root: block('promo', 'Hero', { title: 'Sale', link: '/sale' }) },
    grid: { formatVersion: 0, root: { ...columns, id: 'grid' } },
    broken: {
      formatVersion: 0,
      root: block(
        'broken',
        'Columns',
        {},
        { items: [block('c1', 'Column', {}, { content: [block('t1', 'Text', { body: 5 })] })] },
      ),
    },
  };
  const promo = { id: 'r1', type: 'Hero', document: 'promo' };

  async function renderWith(mode: RenderMode, ...items: unknown[]) {
    const documents = await loadDocumentSet(schema, page(...items), async (id) =>
      Object.hasOwn(storage, id) ? storage[id] : undefined,
    );
    return compact(renderSet(documents, mode));
  }

  it.each([
    [
      'live',
      '<main><h1>Fresh &lt;coffee&gt;</h1><section class="hero"><a href="/sale">Sale</a></section></main>',
    ],
    [
      'preview',
      '<main><h1>Fresh &lt;coffee&gt;</h1><section data-lhcms-block="r1" class="hero"><a href="/sale">Sale</a></section></main>',
    ],
  ] as const)('renders the shown document in the %s mode', async (mode, markup) => {
    expect(await renderWith(mode, promo)).toBe(markup);
  });

  it('marks only the root block of a shown document in the preview', async () => {
    const output = await renderWith('preview', { id: 'r1', type: 'Columns', document: 'grid' });

    expect(output.match(/data-lhcms-block="[^"]+"/g)).toStrictEqual(['data-lhcms-block="r1"']);
  });

  it('skips the invalid blocks of a shown document also in the preview', async () => {
    const output = await renderWith('preview', { id: 'r1', type: 'Columns', document: 'broken' });

    expect(output).toContain(
      '<div data-lhcms-block="r1" class="columns"><div class="column"></div></div>',
    );
  });

  it('skips an invalid reference on the live site, and shows its error in the preview', async () => {
    const missing = { id: 'r1', type: 'Hero', document: 'sale' };

    expect(await renderWith('live', missing)).toBe('<main><h1>Fresh &lt;coffee&gt;</h1></main>');
    expect(await renderWith('preview', missing)).toContain(
      'The block &quot;r1&quot; shows the document &quot;sale&quot;, but the document does not exist.',
    );
  });

  it('treats a reference as invalid when the root block of its document is invalid', () => {
    const shown = loadDocument(schema, storage.promo);
    const rootError = {
      blockId: 'promo',
      code: 'missingRecord',
      message: 'The site has no record "decaf".',
    } as const;
    const set = {
      main: loadDocument(schema, page(promo)),
      shown: new Map([['promo', { ...shown, errors: [rootError] }]]),
    };

    const preview = renderSet(set, 'preview');

    expect(compact(renderSet(set, 'live'))).toBe('<main><h1>Fresh &lt;coffee&gt;</h1></main>');
    expect(preview).toMatch(/data-lhcms-block="r1"\s+class="lhcms-fallback"/);
    expect(preview).toContain('The site has no record &quot;decaf&quot;.');
  });

  it('rejects a document set without the shown document of a valid reference', () => {
    expect(() => renderSet(setOf(page(promo)), 'live')).toThrow(
      'The block "r1" shows the document "promo", but the document set does not have it. Load the documents with loadDocumentSet.',
    );
  });
});

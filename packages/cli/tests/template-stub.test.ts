import { runInNewContext } from 'node:vm';
import { createRenderer, html, richText } from '@loomhelix-cms/render-html';
import { loadDocumentSet, parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import { writeTemplateStub } from '../src/template-stub.ts';

const SCHEMA = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['HeroBanner', 'Columns'] } } } },
  blocks: {
    HeroBanner: {
      version: 1,
      fields: {
        title: { type: 'text' },
        subtitle: { type: 'text', optional: true },
        image: { type: 'image', optional: true },
        background: { type: 'choice', options: ['light', 'dark'] },
      },
    },
    Columns: { version: 1, slots: { items: { allow: ['Text'] } } },
    Text: {
      version: 1,
      fields: { body: { type: 'richText' }, link: { type: 'link', optional: true } },
    },
    Divider: { version: 1 },
    Product: {
      version: 1,
      fields: {
        price: { type: 'number', min: 0 },
        isNew: { type: 'boolean' },
        maker: { type: 'record', source: 'makers' },
      },
    },
  },
});

describe('writeTemplateStub', () => {
  it.each([
    [
      'HeroBanner',
      `  HeroBanner: ({ props }) =>
    html\`<div class="hero-banner hero-banner-\${props.background}">
      <p>\${props.title}</p>
      \${props.subtitle === undefined ? '' : html\`<p>\${props.subtitle}</p>\`}
      \${props.image === undefined ? '' : html\`<img src="\${props.image.src}" alt="\${props.image.alt}" />\`}
    </div>\`,`,
    ],
    [
      'Text',
      `  Text: ({ props }) =>
    html\`<div class="text">
      <div>\${richText(props.body)}</div>
      \${props.link === undefined ? '' : html\`<a href="\${props.link}">\${props.link}</a>\`}
    </div>\`,`,
    ],
    [
      'Columns',
      `  Columns: ({ slots }) =>
    html\`<div class="columns">
      \${slots.items}
    </div>\`,`,
    ],
    ['Divider', '  Divider: () =>\n    html`<div class="divider">\n    </div>`,'],
    [
      'Product',
      `  Product: ({ props }) =>
    html\`<div class="product">
      <p>\${props.price}</p>
    </div>\`,`,
    ],
  ])('writes a template for the block type %s', (typeName, stub) => {
    expect(writeTemplateStub(SCHEMA, typeName)).toBe(stub);
  });

  it('writes a whole document for a page type', () => {
    const stub = writeTemplateStub(SCHEMA, 'Landing') ?? '';

    expect(stub.split('\n').slice(0, 2)).toStrictEqual([
      '  Landing: ({ props, slots }) =>',
      '    html`<!doctype html>',
    ]);
    expect(stub).toContain('<title>${props.title}</title>');
    expect(stub).toContain('<body class="landing">\n          ${slots.main}\n        </body>');
  });

  it('writes templates that render a page of the schema', async () => {
    const stubs = ['Landing', 'HeroBanner', 'Columns', 'Text', 'Divider', 'Product']
      .map((typeName) => writeTemplateStub(SCHEMA, typeName))
      .join('\n');
    const templates: unknown = runInNewContext(`({\n${stubs}\n})`, { html, richText });
    const hero = {
      id: 'hero',
      type: 'HeroBanner',
      version: 1,
      props: { title: 'Fresh bread', background: 'dark' },
    };
    const page = {
      formatVersion: 0,
      root: {
        id: 'home',
        type: 'Landing',
        version: 1,
        props: { title: 'Bakery', path: '/' },
        slots: { main: [hero] },
      },
    };
    const render = createRenderer(SCHEMA, templates as Parameters<typeof createRenderer>[1]);

    const documents = await loadDocumentSet(SCHEMA, page, async () => undefined);

    expect(render(documents, 'live')).toContain(
      '<div class="hero-banner hero-banner-dark">\n      <p>Fresh bread</p>',
    );
  });

  it('gives nothing for a type that the schema does not have', () => {
    expect(writeTemplateStub(SCHEMA, 'Quote')).toBeUndefined();
  });
});

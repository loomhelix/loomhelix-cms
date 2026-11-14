import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { html } from '@loomhelix-cms/render-html';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import type { CmsOptions, RecordQuery } from '../src/index.ts';
import { SCHEMA, startTestSite, TEMPLATES, type TestSite } from './test-site.ts';

const SCHEMA_WITH_RECORD = {
  ...SCHEMA,
  blocks: {
    Text: {
      version: 1,
      fields: {
        body: { type: 'text' },
        product: { type: 'record', source: 'products', optional: true },
      },
    },
  },
};

const PRODUCTS = [
  { id: 'espresso-beans', label: 'Espresso beans', price: 24 },
  { id: 'filter-beans', label: 'Filter beans', price: 18 },
];

let site: TestSite;
const queries: RecordQuery[] = [];
const reads: (readonly string[])[] = [];

function productsWithIds(ids: readonly string[]) {
  return PRODUCTS.filter(({ id }) => ids.includes(id));
}

beforeAll(async () => {
  site = await startTestSite({
    schema: SCHEMA_WITH_RECORD,
    options: {
      records: {
        products: {
          lookup: async (query) => {
            queries.push(query);
            return 'ids' in query
              ? productsWithIds(query.ids)
              : PRODUCTS.filter(({ label }) => label.toLowerCase().includes(query.text));
          },
          read: async (ids) => {
            reads.push(ids);
            return productsWithIds(ids);
          },
        },
      },
      templates: {
        ...TEMPLATES,
        Text: ({ props }) => {
          const product = props.product as { readonly label: string } | undefined;
          return html`<p>${props.body}${product === undefined ? '' : ` (${product.label})`}</p>`;
        },
      },
    },
  });
});

afterAll(async () => {
  await site.close();
});

function recordsAddress(path: string): string {
  return `${site.origin}/cms/api/records/${path}`;
}

describe('the records API of createCms', () => {
  it.each<[string, string, RecordQuery, string[]]>([
    ['a text', 'products?text=espresso', { text: 'espresso' }, ['espresso-beans']],
    ['no text', 'products', { text: '' }, ['espresso-beans', 'filter-beans']],
    [
      'ids',
      'products?id=filter-beans&id=gone',
      { ids: ['filter-beans', 'gone'] },
      ['filter-beans'],
    ],
  ])('gives the records for %s, with only the id and the label', async (_, path, query, ids) => {
    queries.length = 0;
    const response = await fetch(recordsAddress(path));

    expect(queries).toStrictEqual([query]);
    expect(await response.json()).toStrictEqual({
      records: PRODUCTS.filter(({ id }) => ids.includes(id)).map(({ id, label }) => ({
        id,
        label,
      })),
    });
  });

  it.each<[string, string, RequestInit, number]>([
    ['an unknown source', 'teas?text=green', {}, 404],
    ['a nested path', 'products/espresso-beans', {}, 404],
    ['a POST request', 'products', { method: 'POST' }, 405],
  ])('answers %s with %d', async (_, path, init, status) => {
    expect((await fetch(recordsAddress(path), init)).status).toBe(status);
  });

  it('renders the live page with the records of its record fields', async () => {
    const home = {
      formatVersion: 0,
      root: {
        id: 'home',
        type: 'Landing',
        version: 1,
        props: { title: 'Shop', path: '/' },
        slots: {
          main: [
            {
              id: 't1',
              type: 'Text',
              version: 1,
              props: { body: 'Hot', product: 'espresso-beans' },
            },
            { id: 't2', type: 'Text', version: 1, props: { body: 'Gone', product: 'gone' } },
          ],
        },
      },
    };
    await writeFile(join(site.pagesFolder, 'home.json'), JSON.stringify(home));
    reads.length = 0;
    const body = await (await fetch(`${site.origin}/`)).text();

    expect(body).toContain('<p>Hot (Espresso beans)</p>');
    expect(body).toContain('<p>Gone</p>');
    expect(reads).toStrictEqual([['espresso-beans', 'gone']]);
  });

  it.each<[string, Partial<CmsOptions>]>([
    ['without a record source', {}],
    ['without the read function', { records: { products: { lookup: async () => [] } } as never }],
  ])('does not start %s for a source of the schema', async (_, options) => {
    await expect(startTestSite({ schema: SCHEMA_WITH_RECORD, options })).rejects.toThrow(
      'The schema has a record field with the source "products". Give createCms the option "records" with the functions lookup and read for "products".',
    );
  });
});

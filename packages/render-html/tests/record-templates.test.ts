import {
  block,
  defineSchema,
  loadDocumentSet,
  loadRecords,
  page,
  parseSchema,
  record,
  slot,
  type SiteRecord,
} from '@loomhelix-cms/schema';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import { createRenderer, html, type TemplatesOf } from '../src/index.ts';

interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

const schema = defineSchema({
  pages: {
    Landing: page({
      fields: { cover: record({ source: 'photos', optional: true }) },
      slots: { main: slot(['Featured']) },
    }),
  },
  blocks: { Featured: block({ fields: { product: record({ source: 'products' }) } }) },
});

const PRODUCTS: readonly Product[] = [{ id: 'decaf', name: 'Decaf beans', price: 13 }];

const templates = {
  Landing: ({ slots }) => html`<main>${slots.main}</main>`,
  Featured: ({ props }) => html`<p>${props.product.name}: ${props.product.price}</p>`,
} satisfies TemplatesOf<typeof schema, { products: Product }>;

describe('TemplatesOf with record types', () => {
  it('gives a record field the type of the records of its source', () => {
    type Templates = TemplatesOf<typeof schema, { products: Product }>;

    expectTypeOf<Parameters<Templates['Featured']>[0]['props']>().toEqualTypeOf<{
      readonly product: Product;
    }>();
    expectTypeOf<Parameters<Templates['Landing']>[0]['props']['cover']>().toEqualTypeOf<
      SiteRecord | undefined
    >();
  });

  it('gives a record field without a record type the type SiteRecord', () => {
    expectTypeOf<Parameters<TemplatesOf<typeof schema>['Featured']>[0]['props']>().toEqualTypeOf<{
      readonly product: SiteRecord;
    }>();
  });

  it('renders the records that loadRecords gives', async () => {
    const parsed = parseSchema(schema);
    const json = {
      formatVersion: 0,
      root: {
        id: 'home',
        type: 'Landing',
        version: 1,
        props: { title: 'Home', path: '/' },
        slots: { main: [{ id: 'f1', type: 'Featured', version: 1, props: { product: 'decaf' } }] },
      },
    };
    const set = await loadDocumentSet(parsed, json, async () => undefined);
    const loaded = await loadRecords(parsed, set, {
      products: async (ids) => PRODUCTS.filter(({ id }) => ids.includes(id)),
      photos: async () => [],
    });

    expect(createRenderer(parsed, templates)(loaded, 'live')).toBe(
      '<main><p>Decaf beans: 13</p></main>',
    );
  });
});

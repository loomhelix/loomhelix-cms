import { describe, expect, it } from 'vite-plus/test';
import {
  loadDocumentSet,
  loadRecords,
  parseSchema,
  type RecordReaders,
  type SiteRecord,
} from '../src/index.ts';

const schema = parseSchema({
  formatVersion: 0,
  pages: {
    Landing: {
      version: 1,
      fields: { cover: { type: 'record', source: 'photos', optional: true } },
      slots: { main: { allow: ['Product', 'Box'] } },
    },
  },
  blocks: {
    Product: {
      version: 1,
      fields: {
        product: { type: 'record', source: 'products' },
        related: { type: 'record', source: 'products', optional: true },
        note: { type: 'text', optional: true },
      },
    },
    Box: { version: 1, slots: { items: { allow: ['Product'] } } },
  },
});

const PRODUCTS: readonly SiteRecord[] = [
  { id: 'espresso', name: 'Espresso beans', price: 32 },
  { id: 'decaf', name: 'Decaf beans', price: 13 },
];

function product(id: string, props: Readonly<Record<string, unknown>>) {
  return { id, type: 'Product', version: 1, props };
}

function page(props: Readonly<Record<string, unknown>>, ...main: unknown[]) {
  return {
    formatVersion: 0,
    root: {
      id: 'home',
      type: 'Landing',
      version: 1,
      props: { title: 'Home', path: '/', ...props },
      slots: { main },
    },
  };
}

async function loadWith(json: unknown, documents: Readonly<Record<string, unknown>> = {}) {
  const reads: [string, readonly string[]][] = [];
  const readerOf =
    (source: string, records: readonly SiteRecord[]) => async (ids: readonly string[]) => {
      reads.push([source, ids]);
      return records.filter(({ id }) => ids.includes(id));
    };
  const set = await loadDocumentSet(schema, json, async (id) => documents[id]);
  const loaded = await loadRecords(schema, set, {
    products: readerOf('products', PRODUCTS),
    photos: readerOf('photos', []),
  });
  return { loaded, reads };
}

function errorsOf({ errors }: { readonly errors: readonly { blockId: string; code: string }[] }) {
  return errors.map(({ blockId, code }) => [blockId, code]);
}

describe('loadRecords', () => {
  it('gives each record field its record, and reads each source one time', async () => {
    const { loaded, reads } = await loadWith(
      page(
        {},
        product('p1', { product: 'espresso', related: 'decaf', note: 'Hot' }),
        product('p2', { product: 'espresso' }),
      ),
    );

    expect(loaded.main.document.root.slots?.main).toStrictEqual([
      product('p1', { note: 'Hot', product: PRODUCTS[0], related: PRODUCTS[1] }),
      product('p2', { product: PRODUCTS[0] }),
    ]);
    expect(loaded.main.errors).toStrictEqual([]);
    expect(reads).toStrictEqual([['products', ['espresso', 'decaf']]]);
  });

  it.each<
    [string, Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>, string[][]]
  >([
    [
      'makes a block with a missing required record invalid',
      { product: 'gone' },
      { product: 'gone' },
      [['p1', 'missingRecord']],
    ],
    [
      'removes a missing optional record',
      { product: 'decaf', related: 'gone' },
      { product: PRODUCTS[1] },
      [],
    ],
  ])('%s', async (_, props, expectedProps, errors) => {
    const { loaded } = await loadWith(page({ cover: 'beach' }, product('p1', props)));

    expect(loaded.main.document.root.props).toStrictEqual({ title: 'Home', path: '/' });
    expect(loaded.main.document.root.slots?.main?.[0]).toStrictEqual(product('p1', expectedProps));
    expect(errorsOf(loaded.main)).toStrictEqual(errors);
  });

  it('tells the id and the source of a missing record', async () => {
    const { loaded } = await loadWith(page({}, product('p1', { product: 'gone' })));

    expect(loaded.main.errors[0]?.message).toBe(
      'The block "p1" has the record "gone" of the source "products" in the field "product", but the site has no record with this id.',
    );
  });

  it('loads the records of the shown documents into their own results', async () => {
    const shown = {
      formatVersion: 0,
      root: product('featured', { product: 'gone' }),
    };
    const { loaded } = await loadWith(
      page({}, { id: 'r1', type: 'Product', document: 'featured' }),
      { featured: shown },
    );

    expect(errorsOf(loaded.main)).toStrictEqual([]);
    expect(errorsOf(loaded.shown.get('featured') ?? { errors: [] })).toStrictEqual([
      ['featured', 'missingRecord'],
    ]);
  });

  it('skips an invalid block with the blocks in its slots', async () => {
    const box = {
      id: 'b1',
      type: 'Box',
      version: 1,
      props: { color: 'red' },
      slots: { items: [product('p1', { product: 'espresso' })] },
    };
    const { loaded, reads } = await loadWith(page({}, box));

    expect(errorsOf(loaded.main)).toStrictEqual([['b1', 'invalidProps']]);
    expect(loaded.main.document.root.slots?.main).toStrictEqual([box]);
    expect(reads).toStrictEqual([]);
  });

  it.each<[string, RecordReaders, string]>([
    [
      'without a reader for a source of the schema',
      { products: async () => PRODUCTS },
      'The schema has record fields with the source "photos". Give loadRecords a reader for "photos".',
    ],
    [
      'when a reader gives a record without an id',
      {
        products: async () => [{ name: 'Espresso beans' } as unknown as SiteRecord],
        photos: async () => [],
      },
      'The reader of the record source "products" must give objects with an "id" string.',
    ],
  ])('fails %s', async (_, readers, message) => {
    const set = await loadDocumentSet(
      schema,
      page({}, product('p1', { product: 'espresso' })),
      async () => undefined,
    );

    await expect(loadRecords(schema, set, readers)).rejects.toThrow(message);
  });
});

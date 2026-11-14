import { describe, expect, it } from 'vite-plus/test';
import { loadDocument, parseSchema } from '../src/index.ts';

const schema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Text'] } } } },
  blocks: {
    Text: {
      version: 2,
      fields: {
        body: { type: 'text' },
        constructor: { type: 'text', optional: true },
      },
      migrations: [{ from: 1, operations: [{ op: 'renameField', from: 'heading', to: 'body' }] }],
    },
    Quote: { version: 1 },
  },
});

function pageWith(...blocks: unknown[]) {
  return {
    formatVersion: 0,
    root: {
      id: 'p1',
      type: 'Landing',
      version: 1,
      props: { title: 'Home', path: '/' },
      slots: { main: blocks },
    },
  };
}

describe('loadDocument', () => {
  it('tells that the type of a root block is in removedTypes', () => {
    const schemaWithRemovedType = parseSchema({
      formatVersion: 0,
      removedTypes: ['Promo'],
      pages: { Landing: { version: 1 } },
      blocks: {},
    });
    const { errors } = loadDocument(schemaWithRemovedType, {
      formatVersion: 0,
      root: { id: 'r1', type: 'Promo', version: 1, props: {} },
    });

    expect(errors).toStrictEqual([
      {
        blockId: 'r1',
        code: 'unknownType',
        message:
          'The block "r1" has the type "Promo", but the schema lists this type in "removedTypes".',
      },
    ]);
  });

  it.each<[string, unknown, string]>([
    [
      'an unknown type',
      { id: 'b1', type: 'Gallery', version: 1, props: {} },
      'The block "b1" has the type "Gallery", but the schema has no block type with this name.',
    ],
    [
      'a type that the slot does not allow',
      { id: 'b1', type: 'Quote', version: 1, props: {} },
      'The block "b1" has the type "Quote", but its slot allows only "Text".',
    ],
    [
      'a newer version',
      { id: 'b1', type: 'Text', version: 3, props: { body: 'Hello' } },
      'The block "b1" has version 3, but the schema has version 2 of "Text". Update the schema or the program that reads the document.',
    ],
    [
      'a failed migration',
      { id: 'b1', type: 'Text', version: 1, props: { heading: 'Hi', body: 'Hello' } },
      'The block "b1" cannot run the migration from version 1. The migration renames the field "heading" to "body", but the block has the field "body" already.',
    ],
    [
      'a missing required field',
      { id: 'b1', type: 'Text', version: 2, props: {} },
      'The block "b1" has no value for the required field "body".',
    ],
    [
      'an invalid value',
      { id: 'b1', type: 'Text', version: 2, props: { body: 5 } },
      'The block "b1" has a field "body" that must be a string, got 5.',
    ],
    [
      'an unknown slot',
      { id: 'b1', type: 'Text', version: 2, props: { body: 'Hello' }, slots: { aside: [] } },
      'The block "b1" has the slot "aside", but the type "Text" does not define this slot.',
    ],
    [
      'a block reference of a type that the slot does not allow',
      { id: 'b1', type: 'Quote', document: 'sale' },
      'The block "b1" has the type "Quote", but its slot allows only "Text".',
    ],
  ])('describes %s for the developer', (_, block, message) => {
    expect(loadDocument(schema, pageWith(block)).errors.map((error) => error.message)).toEqual([
      message,
    ]);
  });

  it('finds no value for a field named after an object property', () => {
    const result = loadDocument(
      schema,
      pageWith({ id: 'b1', type: 'Text', version: 2, props: { body: 'Hello' } }),
    );

    expect(result.errors).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    [
      'a document of an old format',
      { formatVersion: 0, blocks: [] },
      'The page document has the unknown property "blocks".',
    ],
    [
      'an invalid id',
      pageWith({ id: 'b 1', type: 'Text', version: 2, props: {} }),
      'The block 1 in the slot "main" of the block "p1" must have an "id" of letters, digits, hyphens, and underscores, got "b 1".',
    ],
    [
      'a repeated id',
      pageWith({ id: 'p1', type: 'Text', version: 2, props: { body: 'Hello' } }),
      'The id "p1" occurs more than one time in the page document. Give each block a unique id.',
    ],
    [
      'a block reference with props',
      pageWith({ id: 'b1', type: 'Text', document: 'sale', props: {} }),
      'The block 1 in the slot "main" of the block "p1" has the unknown property "props".',
    ],
    [
      'a block reference with an invalid document id',
      pageWith({ id: 'b1', type: 'Text', document: 'a/b' }),
      'The block "b1" must have a "document" of letters, digits, hyphens, and underscores, got "a/b".',
    ],
  ])('rejects %s with a message', (_, document, message) => {
    expect(() => loadDocument(schema, document)).toThrow(message);
  });

  it('checks the ids of a large page in linear time', () => {
    const blocks = Array.from({ length: 100_000 }, (_, index) => ({
      id: `b${index}`,
      type: 'Text',
      version: 2,
      props: { body: 'Text' },
    }));
    const start = performance.now();

    loadDocument(schema, pageWith(...blocks));

    expect(performance.now() - start).toBeLessThan(2000);
  });

  it.each([
    [32, undefined],
    [33, 'is at level 33, but a page document can have no more than 32 levels of blocks.'],
    [100_000, 'is at level 33, but a page document can have no more than 32 levels of blocks.'],
  ])('reads a page with %s levels of blocks', (levels, message) => {
    const load = () => loadDocument(nestingSchema, pageWithLevels(levels));
    if (message === undefined) {
      expect(load().errors).toStrictEqual([]);
    } else {
      expect(load).toThrow(message);
    }
  });
});

const nestingSchema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Section'] } } } },
  blocks: { Section: { version: 1, slots: { inner: { allow: ['Section'] } } } },
});

function pageWithLevels(levels: number) {
  let block: Record<string, unknown> = { id: `s${levels}`, type: 'Section', version: 1, props: {} };
  for (let level = levels - 1; level > 1; level -= 1) {
    block = { id: `s${level}`, type: 'Section', version: 1, props: {}, slots: { inner: [block] } };
  }
  return {
    formatVersion: 0,
    root: {
      id: 's1',
      type: 'Landing',
      version: 1,
      props: { title: 'Home', path: '/' },
      slots: { main: [block] },
    },
  };
}

describe('the limits of a slot', () => {
  function messageFor(limits: Readonly<Record<string, number>>, count: number) {
    const limitSchema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1, slots: { main: { allow: ['Text'], ...limits } } } },
      blocks: { Text: { version: 1 } },
    });
    const blocks = Array.from({ length: count }, (_, index) => ({
      id: `t${index}`,
      type: 'Text',
      version: 1,
      props: {},
    }));
    return loadDocument(limitSchema, pageWith(...blocks)).errors.map(({ message }) => message);
  }

  it.each<[Readonly<Record<string, number>>, number, readonly string[]]>([
    [{ min: 2, max: 3 }, 2, []],
    [{ min: 2, max: 3 }, 1, ['from 2 to 3 blocks']],
    [{ min: 2, max: 3 }, 4, ['from 2 to 3 blocks']],
    [{ min: 1 }, 0, ['1 or more blocks']],
    [{ max: 1 }, 2, ['no more than 1 block']],
    [{ min: 2, max: 2 }, 3, ['exactly 2 blocks']],
  ])('checks the limits %j for %i blocks', (limits, count, allowed) => {
    expect(messageFor(limits, count)).toStrictEqual(
      allowed.map(
        (text) =>
          `The block "p1" has ${count} ${count === 1 ? 'block' : 'blocks'} in the slot "main", but the slot allows ${text}.`,
      ),
    );
  });
});

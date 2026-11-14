import { parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import { diffSchemas } from '../src/schema-diff.ts';

type Blocks = Readonly<Record<string, unknown>>;

const TEXT = { version: 1, fields: { body: { type: 'text' } } };
const NOTE = { type: 'text', optional: true };
const BACKGROUND = { type: 'choice', options: ['light', 'dark'] };
const QUOTE = { version: 1 };

function columnsWith(slots: Blocks, version = 1, operations: readonly unknown[] = []) {
  const migrations = operations.length === 0 ? [] : [{ from: 1, operations }];
  return { Columns: { version, slots, migrations }, Text: TEXT, Quote: QUOTE };
}

function schemaWith(blocks: Blocks, extra: Blocks = {}) {
  return parseSchema({ formatVersion: 0, pages: { Landing: { version: 1 } }, blocks, ...extra });
}

function changesOf(oldBlocks: Blocks, newBlocks: Blocks, extra: Blocks = {}): readonly string[] {
  return diffSchemas(schemaWith(oldBlocks), schemaWith(newBlocks, extra)).map(
    ({ typeName, level, message }) => `${typeName} ${level}: ${message}`,
  );
}

function textWith(fields: Blocks, version = 1, operations: readonly unknown[] = []) {
  const migrations = operations.length === 0 ? [] : [{ from: 1, operations }];
  return { Text: { version, fields, migrations } };
}

describe('diffSchemas', () => {
  it.each<[string, Blocks, Blocks, Blocks]>([
    ['the same schema', { Text: TEXT }, { Text: TEXT }, {}],
    [
      'a new label, a new optional field, a new option, and a new type',
      textWith({ body: { type: 'text' }, background: BACKGROUND }),
      {
        ...textWith({
          body: { type: 'text', label: 'Body' },
          note: NOTE,
          background: { type: 'choice', options: ['light', 'dark', 'brand'] },
        }),
        Quote: { version: 1 },
      },
      {},
    ],
    [
      'a type in removedTypes',
      { Text: TEXT, Promo: { version: 1 } },
      { Text: TEXT },
      { removedTypes: ['Promo'] },
    ],
    ['a renamed type', { Note: TEXT }, { Text: { ...TEXT, oldNames: ['Note'] } }, {}],
    [
      'a renamed field with a migration',
      textWith({ heading: { type: 'text' } }),
      textWith({ body: { type: 'text' } }, 2, [{ op: 'renameField', from: 'heading', to: 'body' }]),
      {},
    ],
    [
      'a new required field with addField',
      textWith({}),
      textWith({ body: { type: 'text' } }, 2, [{ op: 'addField', field: 'body', value: '' }]),
      {},
    ],
    [
      'a removed option with mapValues',
      textWith({ background: BACKGROUND }),
      textWith({ background: { type: 'choice', options: ['light'] } }, 2, [
        { op: 'mapValues', field: 'background', values: { dark: 'light' } },
      ]),
      {},
    ],
    ['a new slot without min', columnsWith({}), columnsWith({ items: { allow: ['Text'] } }), {}],
    [
      'a renamed slot with renameSlot',
      columnsWith({ items: { allow: ['Text'] } }),
      columnsWith({ columns: { allow: ['Text'] } }, 2, [
        { op: 'renameSlot', from: 'items', to: 'columns' },
      ]),
      {},
    ],
    [
      'a wider allow list and wider limits',
      columnsWith({ items: { allow: ['Text'], min: 2, max: 3 } }),
      columnsWith({ items: { allow: ['Text', 'Quote'], min: 1 } }),
      {},
    ],
  ])('finds no change that breaks stored blocks for %s', (_, oldBlocks, newBlocks, extra) => {
    expect(changesOf(oldBlocks, newBlocks, extra)).toStrictEqual([]);
  });

  it.each<[string, Blocks, Blocks, string]>([
    [
      'a removed type',
      { Text: TEXT, Promo: { version: 1 } },
      { Text: TEXT },
      'Promo error: The type is not in the new schema, so its blocks become invalid. Add it to "removedTypes", or to the "oldNames" of the type that replaces it.',
    ],
    [
      'a lower version',
      textWith({ body: { type: 'text' } }, 2, [{ op: 'addField', field: 'body', value: '' }]),
      { Text: TEXT },
      'Text error: The version goes down from 2 to 1, so blocks of version 2 become invalid.',
    ],
    [
      'a removed field',
      { Text: TEXT },
      textWith({}),
      'Text error: The field "body" is not in the new type, but the stored blocks have it. Increase "version" to 2, and add { "op": "removeField", "field": "body" } to a migration from version 1.',
    ],
    [
      'a removed field after a new version',
      { Text: TEXT },
      textWith({ note: NOTE }, 2, [{ op: 'addField', field: 'note', value: 'New' }]),
      'Text error: The field "body" is not in the new type, but the stored blocks have it. Add { "op": "removeField", "field": "body" } to a migration from version 1 or later.',
    ],
    [
      'a new required field',
      textWith({}),
      textWith({ body: { type: 'text', default: 'Hello' } }),
      'Text error: The new required field "body" has no value in the stored blocks. Increase "version" to 2, and add { "op": "addField", "field": "body", "value": "Hello" } to a migration from version 1.',
    ],
    [
      'an addField value of the wrong type',
      textWith({}),
      textWith({ body: { type: 'text' } }, 2, [{ op: 'addField', field: 'body', value: 5 }]),
      'Text error: The value of "addField" for the field "body" must be a string, got 5.',
    ],
    [
      'a new field type',
      { Text: TEXT },
      textWith({ body: { type: 'richText' } }),
      'Text error: The field "body" changes from text to richText. No operation converts the values, so the stored blocks with a value become invalid.',
    ],
    [
      'a removed option',
      textWith({ background: BACKGROUND }),
      textWith({ background: { type: 'choice', options: ['light'] } }),
      'Text error: The field "background" has no option "dark". Increase "version" to 2, and add { "op": "mapValues", "field": "background", "values": { "dark": "…" } } to a migration from version 1.',
    ],
    [
      'an optional field that is now required',
      textWith({ note: NOTE }),
      textWith({ note: { type: 'text' } }),
      'Text warning: The field "note" is now required. Increase "version" to 2, and add { "op": "addField", "field": "note", "value": … } to a migration from version 1. Run lhcms check to find the stored blocks that break it.',
    ],
    [
      'a stricter text',
      textWith({ note: { ...NOTE, multiline: true, maxLength: 80 } }),
      textWith({ note: { ...NOTE, maxLength: 40 } }),
      'Text warning: The field "note" has a stricter rule: "maxLength" 40, no line breaks. Run lhcms check to find the stored blocks that break it.',
    ],
    [
      'a stricter number',
      textWith({ price: { type: 'number', min: 0 } }),
      textWith({ price: { type: 'number', integer: true, min: 1, max: 99 } }),
      'Text warning: The field "price" has a stricter rule: "min" 1, "max" 99, integers only. Run lhcms check to find the stored blocks that break it.',
    ],
    [
      'a removed slot',
      columnsWith({ items: { allow: ['Text'] } }),
      columnsWith({}),
      'Columns error: The slot "items" is not in the new type, but the stored blocks have it. Increase "version" to 2, and add { "op": "removeSlot", "slot": "items" } to a migration from version 1.',
    ],
    [
      'a new slot with min',
      columnsWith({}),
      columnsWith({ items: { allow: ['Text'], min: 1 } }),
      'Columns error: The new slot "items" needs 1 or more blocks, but the stored blocks have no blocks in it. Remove "min" until the stored blocks have blocks in this slot.',
    ],
    [
      'a narrower allow list',
      columnsWith({ items: { allow: ['Text', 'Quote'] } }),
      columnsWith({ items: { allow: ['Text'] } }),
      'Columns warning: The slot "items" does not allow "Quote" now. Run lhcms check to find the stored blocks that break it.',
    ],
    [
      'stricter limits of a slot',
      columnsWith({ items: { allow: ['Text'] } }),
      columnsWith({ items: { allow: ['Text'], max: 3 } }),
      'Columns warning: The slot "items" has stricter limits for its blocks. Run lhcms check to find the stored blocks that break it.',
    ],
  ])('reports %s', (_, oldBlocks, newBlocks, change) => {
    expect(changesOf(oldBlocks, newBlocks)).toStrictEqual([change]);
  });

  it('reports a type that moves from "pages" to "blocks"', () => {
    const oldSchema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1 }, Promo: { version: 1 } },
      blocks: {},
    });
    const newSchema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1 } },
      blocks: { Promo: { version: 1 } },
    });

    expect(diffSchemas(oldSchema, newSchema)).toStrictEqual([
      {
        level: 'error',
        typeName: 'Promo',
        message:
          'The type moves between "pages" and "blocks", so its stored blocks become invalid.',
      },
    ]);
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { parseSchema } from '../src/index.ts';

const landing = { version: 1, slots: { main: { allow: ['Text'] } } };

function schemaWithText(text: unknown, pages: unknown = { Landing: landing }) {
  return { formatVersion: 0, pages, blocks: { Text: text } };
}

function schemaWithOption(option: unknown) {
  return schemaWithText({
    version: 1,
    fields: { background: { type: 'choice', options: ['light', option] } },
  });
}

describe('parseSchema', () => {
  it('reads the types with their fields, slots, and migrations', () => {
    const schema = parseSchema(
      schemaWithText({
        label: 'Text block',
        version: 2,
        fields: { body: { type: 'text', maxLength: 80, default: 'Hello' } },
        migrations: [{ from: 1, operations: [{ op: 'renameField', from: 'heading', to: 'body' }] }],
      }),
    );

    expect(schema.pages.get('Landing')).toEqual({
      version: 1,
      fields: new Map(),
      slots: new Map([['main', { allow: ['Text'] }]]),
      migrations: new Map(),
    });
    expect(schema.blocks.get('Text')).toEqual({
      label: 'Text block',
      version: 2,
      fields: new Map([
        [
          'body',
          { type: 'text', optional: false, multiline: false, maxLength: 80, default: 'Hello' },
        ],
      ]),
      slots: new Map(),
      migrations: new Map([[1, [{ op: 'renameField', from: 'heading', to: 'body' }]]]),
    });
  });

  it('maps the old name of each type to its current name', () => {
    const schema = parseSchema(
      schemaWithText(
        { version: 1, oldNames: ['Note', 'Paragraph'] },
        {
          Landing: { ...landing, oldNames: ['Home'] },
        },
      ),
    );

    expect(schema.renamedTypes).toStrictEqual(
      new Map([
        ['Home', 'Landing'],
        ['Note', 'Text'],
        ['Paragraph', 'Text'],
      ]),
    );
  });

  it('reads number fields', () => {
    const schema = parseSchema(
      schemaWithText({
        version: 1,
        fields: {
          rating: { type: 'number', integer: true, min: 1, max: 5 },
          price: { type: 'number', default: 2.5 },
        },
      }),
    );

    expect([...(schema.blocks.get('Text')?.fields ?? [])]).toStrictEqual([
      ['rating', { type: 'number', optional: false, integer: true, min: 1, max: 5 }],
      ['price', { type: 'number', optional: false, integer: false, default: 2.5 }],
    ]);
  });

  it('gives a boolean field the default false', () => {
    const schema = parseSchema(
      schemaWithText({
        version: 1,
        fields: { isNew: { type: 'boolean' }, isOpen: { type: 'boolean', default: true } },
      }),
    );

    expect([...(schema.blocks.get('Text')?.fields ?? [])]).toStrictEqual([
      ['isNew', { type: 'boolean', optional: false, default: false }],
      ['isOpen', { type: 'boolean', optional: false, default: true }],
    ]);
  });

  it('reads the source of a record field', () => {
    const schema = parseSchema(
      schemaWithText({ version: 1, fields: { product: { type: 'record', source: 'products' } } }),
    );

    expect(schema.blocks.get('Text')?.fields.get('product')).toStrictEqual({
      type: 'record',
      optional: false,
      source: 'products',
    });
  });

  it('reads the limits of a slot', () => {
    const schema = parseSchema(
      schemaWithText(
        { version: 1 },
        { Landing: { version: 1, slots: { main: { allow: ['Text'], min: 1, max: 3 } } } },
      ),
    );

    expect(schema.pages.get('Landing')?.slots.get('main')).toStrictEqual({
      allow: ['Text'],
      min: 1,
      max: 3,
    });
  });

  it('reads the names of the removed types', () => {
    const schema = parseSchema({
      ...schemaWithText({ version: 1 }),
      removedTypes: ['Promo', 'Banner'],
    });

    expect(schema.removedTypes).toStrictEqual(new Set(['Promo', 'Banner']));
  });

  it('reads the options of a choice field with and without a label', () => {
    const schema = parseSchema(
      schemaWithText({
        version: 1,
        fields: {
          background: { type: 'choice', options: ['light', { name: 'dark', label: 'Dark' }] },
        },
      }),
    );

    expect(schema.blocks.get('Text')?.fields.get('background')).toStrictEqual({
      type: 'choice',
      optional: false,
      options: [{ name: 'light' }, { name: 'dark', label: 'Dark' }],
    });
  });

  it.each<[string, unknown, string]>([
    [
      'an unknown format version',
      { formatVersion: 1, pages: { Landing: landing }, blocks: {} },
      'The schema has "formatVersion" 1, but this version of @loomhelix-cms/schema reads format version 0.',
    ],
    [
      'a schema without blocks',
      { formatVersion: 0, pages: { Landing: landing } },
      'The schema must have "blocks".',
    ],
    [
      'an unknown type property',
      schemaWithText({ version: 1, title: 'Text' }),
      'The block type "Text" has the unknown property "title". Remove it or correct its name.',
    ],
    [
      'an invalid field name',
      schemaWithText({ version: 1, fields: { 'sub-title': { type: 'text' } } }),
      'The fields of the block type "Text" contain the name "sub-title". A name must start with a letter and contain only letters and digits.',
    ],
    [
      'an unknown field type',
      schemaWithText({ version: 1, fields: { opening: { type: 'date' } } }),
      'The field "opening" of the block type "Text" must have a "type" that is text, richText, link, image, choice, number, boolean, or record, got "date".',
    ],
    [
      'a record field without a source',
      schemaWithText({ version: 1, fields: { product: { type: 'record' } } }),
      'The field "product" of the block type "Text" must have a "source" name, got no value. A source name must start with a letter and contain only letters, digits, and hyphens.',
    ],
    [
      'an invalid source name',
      schemaWithText({
        version: 1,
        fields: { product: { type: 'record', source: 'shop products' } },
      }),
      'The field "product" of the block type "Text" must have a "source" name, got "shop products". A source name must start with a letter and contain only letters, digits, and hyphens.',
    ],
    [
      'an invalid default value',
      schemaWithText({
        version: 1,
        fields: { background: { type: 'choice', options: ['light', 'dark'], default: 'blue' } },
      }),
      'The default value of the field "background" of the block type "Text" must be one of "light", "dark", got "blue".',
    ],
    [
      'an option without a label',
      schemaWithOption({ name: 'dark' }),
      'The option "dark" of the field "background" of the block type "Text" must have a "label" string, got no value.',
    ],
    [
      'an option with an unknown property',
      schemaWithOption({ name: 'dark', label: 'Dark', color: 'black' }),
      'The option of the field "background" of the block type "Text" has the unknown property "color". Remove it or correct its name.',
    ],
    [
      'an option object with an invalid name',
      schemaWithOption({ name: 'dark mode', label: 'Dark' }),
      'The "options" of the field "background" of the block type "Text" contain "dark mode". An option name must start with a letter and contain only letters, digits, and hyphens.',
    ],
    [
      'an option name that occurs two times',
      schemaWithOption({ name: 'light', label: 'Light' }),
      'The "options" of the field "background" of the block type "Text" contain "light" more than one time.',
    ],
    [
      'an old name that is the name of a type',
      schemaWithText({ version: 1, oldNames: ['Landing'] }),
      'The old name "Landing" of "Text" is the name of a type in the schema. Remove it from "oldNames".',
    ],
    [
      'an old name of two types',
      schemaWithText(
        { version: 1, oldNames: ['Note'] },
        { Landing: { ...landing, oldNames: ['Note'] } },
      ),
      'The old name "Note" is in the "oldNames" of "Landing" and of "Text". Keep it in one type.',
    ],
    [
      'an old name that occurs two times in one type',
      schemaWithText({ version: 1, oldNames: ['Note', 'Note'] }),
      'The "oldNames" of the block type "Text" contain "Note" more than one time.',
    ],
    [
      'an invalid old name',
      schemaWithText({ version: 1, oldNames: ['old-text'] }),
      'The "oldNames" of the block type "Text" must be a name, got "old-text". A name must start with a letter and contain only letters and digits.',
    ],
    [
      'a removed type that the schema has',
      { ...schemaWithText({ version: 1 }), removedTypes: ['Text'] },
      'The "removedTypes" of the schema contain "Text", but the schema has a type with this name. Remove it from "removedTypes" or from the types.',
    ],
    [
      'a removed type that is an old name',
      { ...schemaWithText({ version: 1, oldNames: ['Note'] }), removedTypes: ['Note'] },
      'The "removedTypes" of the schema contain "Note", but it is an old name of "Text". Remove it from "removedTypes" or from "oldNames".',
    ],
    [
      'a removed type that occurs two times',
      { ...schemaWithText({ version: 1 }), removedTypes: ['Promo', 'Promo'] },
      'The "removedTypes" of the schema contain "Promo" more than one time.',
    ],
    [
      'a slot with "max" smaller than "min"',
      schemaWithText(
        { version: 1 },
        { Landing: { version: 1, slots: { main: { allow: ['Text'], min: 3, max: 2 } } } },
      ),
      'The slot "main" of the page type "Landing" has "max" 2, which is smaller than "min" 3.',
    ],
    [
      'a slot with "min" 0',
      schemaWithText(
        { version: 1 },
        { Landing: { version: 1, slots: { main: { allow: ['Text'], min: 0 } } } },
      ),
      'The "min" of the slot "main" of the page type "Landing" must be an integer of 1 or more, got 0.',
    ],
    [
      'a number field with "max" smaller than "min"',
      schemaWithText({ version: 1, fields: { rating: { type: 'number', min: 5, max: 1 } } }),
      'The field "rating" of the block type "Text" has "max" 1, which is smaller than "min" 5.',
    ],
    [
      'a number field with a text "min"',
      schemaWithText({ version: 1, fields: { rating: { type: 'number', min: '1' } } }),
      'The "min" of the field "rating" of the block type "Text" must be a number, got "1".',
    ],
    [
      'a number default out of the range',
      schemaWithText({ version: 1, fields: { rating: { type: 'number', max: 5, default: 6 } } }),
      'The default value of the field "rating" of the block type "Text" must be 5 or less, got 6.',
    ],
    [
      'a missing migration',
      schemaWithText({
        version: 3,
        migrations: [{ from: 1, operations: [] }],
      }),
      'The block type "Text" has version 3, but it has no migration from version 2. Add a migration with "from": 2.',
    ],
    [
      'an unknown type in an allow list',
      schemaWithText(
        { version: 1 },
        { Landing: { version: 1, slots: { main: { allow: ['Gallery'] } } } },
      ),
      'The "allow" list of the slot "main" of "Landing" contains "Gallery", but "blocks" has no type with this name.',
    ],
    [
      'a built-in page field',
      schemaWithText(
        { version: 1 },
        { Landing: { version: 1, fields: { path: { type: 'text' } } } },
      ),
      'The page type "Landing" defines the field "path". Each page type has this field already, so remove it from "fields".',
    ],
  ])('rejects %s with a message that tells what to do', (_, json, message) => {
    expect(() => parseSchema(json)).toThrow(message);
  });
});

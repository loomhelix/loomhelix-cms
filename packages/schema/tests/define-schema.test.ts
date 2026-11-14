import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import {
  block,
  boolean,
  choice,
  defineSchema,
  image,
  link,
  number,
  page,
  parseSchema,
  record,
  richText,
  slot,
  text,
  type Image,
  type PagePropsOf,
  type PropsOf,
  type RichText,
  type SiteRecord,
  type SlotNamesOf,
} from '../src/index.ts';

const button = { label: text({ label: 'Button label', maxLength: 40 }), link: link() };

const schema = defineSchema({
  removedTypes: ['Promo'],
  pages: {
    Landing: page({
      label: 'Landing page',
      fields: { cover: image({ optional: true }) },
      slots: { main: slot(['Hero', 'Text'], { label: 'Sections', min: 1 }) },
    }),
  },
  blocks: {
    Hero: block({
      label: 'Hero banner',
      version: 2,
      fields: {
        title: text({ label: 'Title', maxLength: 80 }),
        image: image({ optional: true }),
        background: choice(['light', { name: 'dark', label: 'Dark background' }], {
          default: 'light',
        }),
        ...button,
      },
      migrations: [{ from: 1, operations: [{ op: 'renameField', from: 'heading', to: 'title' }] }],
    }),
    Text: block({ oldNames: ['Note'], fields: { body: richText() } }),
    Divider: block({}),
    Product: block({
      fields: {
        price: number({ min: 0 }),
        stars: number({ integer: true, min: 1, max: 5, optional: true }),
        isNew: boolean({ label: 'New product' }),
      },
    }),
    FeaturedProduct: block({
      fields: {
        product: record({ source: 'products', label: 'Product' }),
        related: record({ source: 'products', optional: true }),
      },
    }),
  },
});

describe('defineSchema and the type builders', () => {
  it('give the JSON of the schema format', () => {
    expect(JSON.parse(JSON.stringify(schema))).toStrictEqual({
      formatVersion: 0,
      removedTypes: ['Promo'],
      pages: {
        Landing: {
          version: 1,
          label: 'Landing page',
          fields: { cover: { type: 'image', optional: true } },
          slots: { main: { allow: ['Hero', 'Text'], label: 'Sections', min: 1 } },
        },
      },
      blocks: {
        Hero: {
          version: 2,
          label: 'Hero banner',
          fields: {
            title: { type: 'text', label: 'Title', maxLength: 80 },
            image: { type: 'image', optional: true },
            background: {
              type: 'choice',
              options: ['light', { name: 'dark', label: 'Dark background' }],
              default: 'light',
            },
            label: { type: 'text', label: 'Button label', maxLength: 40 },
            link: { type: 'link' },
          },
          migrations: [
            { from: 1, operations: [{ op: 'renameField', from: 'heading', to: 'title' }] },
          ],
        },
        Text: { version: 1, oldNames: ['Note'], fields: { body: { type: 'richText' } } },
        Divider: { version: 1 },
        Product: {
          version: 1,
          fields: {
            price: { type: 'number', min: 0 },
            stars: { type: 'number', integer: true, min: 1, max: 5, optional: true },
            isNew: { type: 'boolean', label: 'New product' },
          },
        },
        FeaturedProduct: {
          version: 1,
          fields: {
            product: { type: 'record', source: 'products', label: 'Product' },
            related: { type: 'record', source: 'products', optional: true },
          },
        },
      },
    });
  });

  it('give a schema that parseSchema accepts', () => {
    expect(() => parseSchema(schema)).not.toThrow();
  });

  it('give the props of each type, with the optional fields as optional props', () => {
    expectTypeOf<PropsOf<typeof schema.blocks.Hero>>().toEqualTypeOf<{
      readonly title: string;
      readonly image?: Image;
      readonly background: 'light' | 'dark';
      readonly label: string;
      readonly link: string;
    }>();
    expectTypeOf<PropsOf<typeof schema.blocks.Text>>().toEqualTypeOf<{
      readonly body: RichText;
    }>();
    expectTypeOf<PropsOf<typeof schema.blocks.Divider>>().toEqualTypeOf<{}>();
    expectTypeOf<PropsOf<typeof schema.blocks.Product>>().toEqualTypeOf<{
      readonly price: number;
      readonly stars?: number;
      readonly isNew: boolean;
    }>();
    expectTypeOf<PropsOf<typeof schema.blocks.FeaturedProduct>>().toEqualTypeOf<{
      readonly product: SiteRecord;
      readonly related?: SiteRecord;
    }>();
  });

  it('give a page type the built-in fields and its own fields', () => {
    expectTypeOf<PagePropsOf<typeof schema.pages.Landing>>().toEqualTypeOf<{
      readonly title: string;
      readonly description?: string;
      readonly path: string;
      readonly cover?: Image;
    }>();
  });

  it('give the slot names of each type', () => {
    expectTypeOf<SlotNamesOf<typeof schema.pages.Landing>>().toEqualTypeOf<'main'>();
    expectTypeOf<SlotNamesOf<typeof schema.blocks.Hero>>().toEqualTypeOf<never>();
  });
});

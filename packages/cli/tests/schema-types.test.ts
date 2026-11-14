import { parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import { writeSchemaTypes } from '../src/schema-types.ts';

describe('writeSchemaTypes', () => {
  it('writes the props of each type and the templates interface', () => {
    const schema = parseSchema({
      formatVersion: 0,
      pages: {
        Landing: {
          version: 1,
          fields: {
            theme: {
              type: 'choice',
              options: ['light', { name: 'dark-blue', label: 'Dark blue' }],
            },
          },
          slots: { main: { allow: ['Hero', 'Columns'] } },
        },
      },
      blocks: {
        Hero: {
          version: 1,
          fields: {
            title: { type: 'text' },
            image: { type: 'image', optional: true },
            body: { type: 'richText' },
            link: { type: 'link', optional: true },
            rating: { type: 'number', integer: true, min: 1, max: 5 },
            isNew: { type: 'boolean' },
            product: { type: 'record', source: 'products', optional: true },
          },
        },
        Columns: { version: 1, slots: { left: { allow: ['Hero'] }, right: { allow: ['Hero'] } } },
      },
    });

    expect(writeSchemaTypes(schema))
      .toBe(`import type { Image, RichText, SiteRecord, Template } from '@loomhelix-cms/render-html';

export type LandingProps = {
  readonly title: string;
  readonly description?: string;
  readonly path: string;
  readonly theme: 'light' | 'dark-blue';
};

export type HeroProps = {
  readonly title: string;
  readonly image?: Image;
  readonly body: RichText;
  readonly link?: string;
  readonly rating: number;
  readonly isNew: boolean;
  readonly product?: SiteRecord;
};

export type ColumnsProps = Readonly<Record<string, never>>;

export interface Templates {
  readonly Landing: Template<LandingProps, 'main'>;
  readonly Hero: Template<HeroProps, never>;
  readonly Columns: Template<ColumnsProps, 'left' | 'right'>;
}
`);
  });

  it('imports only the field types that the schema uses', () => {
    const schema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1 } },
      blocks: {},
    });

    expect(writeSchemaTypes(schema).split('\n')[0]).toBe(
      "import type { Template } from '@loomhelix-cms/render-html';",
    );
  });
});

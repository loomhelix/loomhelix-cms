import {
  block,
  choice,
  defineSchema,
  image,
  loadDocumentSet,
  page,
  parseSchema,
  slot,
  text,
  type Image,
} from '@loomhelix-cms/schema';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import { createRenderer, html, type Html, type TemplatesOf } from '../src/index.ts';

const schema = defineSchema({
  pages: { Landing: page({ slots: { main: slot(['Hero']) } }) },
  blocks: {
    Hero: block({
      fields: {
        title: text({ maxLength: 80 }),
        image: image({ optional: true }),
        background: choice(['light', 'dark']),
      },
    }),
  },
});

const templates = {
  Landing: ({ props, slots }) =>
    html`<main>
      <h1>${props.title}</h1>
      ${slots.main}
    </main>`,
  Hero: ({ props }) =>
    html`<section class="hero hero-${props.background}">
      <h2>${props.title}</h2>
      ${props.image === undefined ? '' : html`<img src="${props.image.src}" alt="${props.image.alt}" />`}
    </section>`,
} satisfies TemplatesOf<typeof schema>;

type Templates = TemplatesOf<typeof schema>;

describe('TemplatesOf', () => {
  it('gives each template the props and the slots of its type in the schema', () => {
    expectTypeOf<Parameters<Templates['Hero']>[0]['props']>().toEqualTypeOf<{
      readonly title: string;
      readonly image?: Image;
      readonly background: 'light' | 'dark';
    }>();
    expectTypeOf<Parameters<Templates['Landing']>[0]['props']>().toEqualTypeOf<{
      readonly title: string;
      readonly description?: string;
      readonly path: string;
    }>();
    expectTypeOf<Parameters<Templates['Landing']>[0]['slots']>().toEqualTypeOf<
      Readonly<Record<'main', Html>>
    >();
  });

  it('gives templates that createRenderer accepts', async () => {
    const parsedSchema = parseSchema(schema);
    const render = createRenderer(parsedSchema, templates);
    const hero = {
      id: 'hero',
      type: 'Hero',
      version: 1,
      props: { title: 'Fresh bread', background: 'dark' },
    };
    const document = {
      formatVersion: 0,
      root: {
        id: 'home',
        type: 'Landing',
        version: 1,
        props: { title: 'Bakery', path: '/' },
        slots: { main: [hero] },
      },
    };

    const documents = await loadDocumentSet(parsedSchema, document, async () => undefined);

    expect(render(documents, 'live')).toContain('<section class="hero hero-dark">');
  });
});

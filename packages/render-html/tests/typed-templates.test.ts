import { loadDocumentSet, parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import {
  createRenderer,
  html,
  richText,
  type Html,
  type Image,
  type RichText,
  type Template,
} from '../src/index.ts';

type LandingProps = {
  readonly title: string;
  readonly description?: string;
  readonly path: string;
};

type HeroProps = {
  readonly title: string;
  readonly image?: Image;
  readonly body: RichText;
};

interface Templates {
  readonly Landing: Template<LandingProps, 'main'>;
  readonly Hero: Template<HeroProps, never>;
}

const schema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Hero'] } } } },
  blocks: {
    Hero: {
      version: 1,
      fields: {
        title: { type: 'text' },
        image: { type: 'image', optional: true },
        body: { type: 'richText' },
      },
    },
  },
});

const templates = {
  Landing: ({ props, slots }) =>
    html`<main>
      <h1>${props.title}</h1>
      ${slots.main}
    </main>`,
  Hero: ({ props }) =>
    html`<section>
      <h2>${props.title}</h2>
      ${props.image === undefined ? '' : html`<img src="${props.image.src}" alt="${props.image.alt}" />`}
      ${richText(props.body)}
    </section>`,
} satisfies Templates;

describe('templates with the types of their blocks', () => {
  it('give each template the props and the slots of its type', () => {
    expectTypeOf<Parameters<Templates['Hero']>[0]['props']>().toEqualTypeOf<HeroProps>();
    expectTypeOf<Parameters<Templates['Landing']>[0]['slots']>().toEqualTypeOf<
      Readonly<Record<'main', Html>>
    >();
  });

  it('go to createRenderer like templates without types', async () => {
    const render = createRenderer(schema, templates);
    const hero = {
      id: 'hero',
      type: 'Hero',
      version: 1,
      props: { title: 'Fresh bread', body: [[{ text: 'Every morning.' }]] },
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

    const documents = await loadDocumentSet(schema, page, async () => undefined);

    expect(render(documents, 'live')).toContain('<h2>Fresh bread</h2>');
  });
});

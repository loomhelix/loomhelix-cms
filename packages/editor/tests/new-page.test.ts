import { webcrypto } from 'node:crypto';
import { parseSchema } from '@loomhelix-cms/schema';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createBlockDocument,
  createPageDocument,
  createPageId,
  suggestPath,
} from '../src/new-page.ts';

describe('suggestPath', () => {
  it.each([
    ['Our menu', '/our-menu'],
    ['  Fresh   coffee  ', '/fresh-coffee'],
    ['Menu & prices!', '/menu-prices'],
    ['Наше меню', '/наше-меню'],
    ['Café 24/7', '/café-24-7'],
    ['What? #1', '/what-1'],
    ['', '/'],
  ])('suggests a path for %j', (title, path) => {
    expect(suggestPath(title)).toBe(path);
  });
});

describe('createPageId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a page id that follows the id rules of the spec', () => {
    expect(createPageId()).toMatch(/^page-[0-9a-f]{8}$/);
  });

  it('creates a page id on a page that is not secure and has no crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => webcrypto.getRandomValues(bytes),
    });

    expect(createPageId()).toMatch(/^page-[0-9a-f]{8}$/);
  });
});

describe('createPageDocument', () => {
  it('creates the root block with the built-in fields and the defaults of the page type', () => {
    const schema = parseSchema({
      formatVersion: 0,
      pages: {
        Article: {
          version: 2,
          fields: { theme: { type: 'choice', options: ['light', 'dark'], default: 'light' } },
          migrations: [{ from: 1, operations: [] }],
        },
      },
      blocks: {},
    });
    const type = schema.pages.get('Article');
    if (type === undefined) {
      throw new Error('The test schema has no page type "Article".');
    }

    expect(
      createPageDocument({ id: 'page-1', typeName: 'Article', type, title: 'News', path: '/news' }),
    ).toStrictEqual({
      formatVersion: 0,
      root: {
        id: 'page-1',
        type: 'Article',
        version: 2,
        props: { theme: 'light', title: 'News', path: '/news' },
      },
    });
  });
});

describe('createBlockDocument', () => {
  it('creates a block document with the defaults of the block type', () => {
    const schema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1 } },
      blocks: {
        Notice: {
          version: 1,
          fields: {
            text: { type: 'text' },
            tone: { type: 'choice', options: ['calm', 'urgent'], default: 'calm' },
          },
        },
      },
    });
    const type = schema.blocks.get('Notice');
    if (type === undefined) {
      throw new Error('The test schema has no block type "Notice".');
    }

    expect(createBlockDocument('notice', 'Notice', type)).toStrictEqual({
      formatVersion: 0,
      root: { id: 'notice', type: 'Notice', version: 1, props: { tone: 'calm' } },
    });
  });
});

import { parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import {
  blockDocumentsOf,
  isBlockDocument,
  rootTypeOf,
  withoutBlockDocuments,
} from '../src/document-kinds.ts';

const schema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, label: 'Landing page' } },
  blocks: {
    Footer: {
      version: 2,
      label: 'Footer',
      oldNames: ['BottomBar'],
      migrations: [{ from: 1, operations: [] }],
    },
  },
});

function documentOf(type: string) {
  return { formatVersion: 0, root: { id: 'doc', type, version: 1, props: {} } } as const;
}

describe('the kinds of documents', () => {
  it.each([
    ['Landing', false, 'Landing page'],
    ['Footer', true, 'Footer'],
    ['Gallery', false, undefined],
  ])('knows the document with the root type %s', (type, isBlock, label) => {
    expect(isBlockDocument(schema, documentOf(type))).toBe(isBlock);
    expect(rootTypeOf(schema, documentOf(type))?.label).toBe(label);
  });

  const summaries = [
    { id: 'home', type: 'Landing', title: 'Home', path: '/' },
    { id: 'footer', type: 'Footer', title: '', path: '' },
    { id: 'bar', type: 'BottomBar', title: '', path: '' },
    { id: 'old', type: '', title: 'Old', path: '/old' },
  ];

  it('keeps the pages and the documents of unknown type in the page list', () => {
    expect(withoutBlockDocuments(summaries, schema).map((page) => page.id)).toStrictEqual([
      'home',
      'old',
    ]);
  });

  it('gives the block documents with the current names of their types', () => {
    expect(blockDocumentsOf(schema, summaries)).toStrictEqual([
      { id: 'footer', type: 'Footer' },
      { id: 'bar', type: 'Footer' },
    ]);
  });
});

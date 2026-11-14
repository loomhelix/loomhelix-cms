import { parseSchema } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import {
  findSaveError,
  indexPaths,
  isPageId,
  readPageBody,
  summarizePages,
  withPagePath,
} from '../src/page-rules.ts';

const SCHEMA = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Text'] } } } },
  blocks: { Text: { version: 1, fields: { body: { type: 'text' } } } },
});

function pageDocument(id: string, path: string) {
  return {
    formatVersion: 0,
    root: { id, type: 'Landing', version: 1, props: { title: `Page ${id}`, path }, slots: {} },
  };
}

function loadedPage(id: string, path: string) {
  const body = readPageBody(SCHEMA, JSON.stringify(pageDocument(id, path)), id);
  if (!('document' in body)) {
    throw new Error(body.error);
  }
  return body.document;
}

function loadedBlockDocument() {
  const body = readPageBody(SCHEMA, JSON.stringify(BLOCK_DOCUMENT), 'notice');
  if (!('document' in body)) {
    throw new Error(body.error);
  }
  return body.document;
}

const NO_CONDITIONS = { ifMatch: undefined, ifNoneMatch: undefined };
const IF_MATCH_A = { ...NO_CONDITIONS, ifMatch: '"a"' };
const IF_NONE_MATCH = { ...NO_CONDITIONS, ifNoneMatch: '*' };
const BLOCK_DOCUMENT = {
  formatVersion: 0,
  root: { id: 'notice', type: 'Text', version: 1, props: { body: 'Closed on Monday' } },
};
const STORED_PAGES = [
  { id: 'banner', document: { ...BLOCK_DOCUMENT, root: { ...BLOCK_DOCUMENT.root, id: 'banner' } } },
  { id: 'home', document: pageDocument('home', '/') },
  { id: 'menu', document: pageDocument('menu', '/menu') },
];

describe('isPageId', () => {
  it.each([
    ['home', true],
    ['page_2-b', true],
    ['', false],
    ['a/b', false],
    ['..', false],
    ['menu.json', false],
  ])('gives %j: %s', (id, expected) => {
    expect(isPageId(id)).toBe(expected);
  });
});

describe('summarizePages', () => {
  it('gives the id, the type, the title, and the path of each document, sorted by path', () => {
    expect(summarizePages([...STORED_PAGES].reverse())).toStrictEqual([
      { id: 'home', type: 'Landing', title: 'Page home', path: '/' },
      { id: 'menu', type: 'Landing', title: 'Page menu', path: '/menu' },
      { id: 'banner', type: 'Text', title: undefined, path: undefined },
    ]);
  });

  it.each([[null], ['text'], [[]], [{}], [{ root: 'text' }], [{ root: { props: null } }]])(
    'gives no type, no title, and no path for the stored value %j',
    (document: unknown) => {
      expect(summarizePages([{ id: 'broken', document }])).toStrictEqual([
        { id: 'broken', type: undefined, title: undefined, path: undefined },
      ]);
    },
  );
});

describe('indexPaths', () => {
  it('maps each path to the first page with it, and skips documents without a path', () => {
    const copy = { id: 'copy', document: pageDocument('copy', '/menu') };

    expect(indexPaths([...STORED_PAGES, copy])).toStrictEqual(
      new Map([
        ['/', 'home'],
        ['/menu', 'menu'],
      ]),
    );
  });
});

describe('readPageBody', () => {
  it('gives the JSON and the loaded document of a valid body', () => {
    const json = pageDocument('home', '/');
    const body = readPageBody(SCHEMA, JSON.stringify(json), 'home');

    expect(body).toStrictEqual({ json, document: json });
  });

  it.each([
    ['text that is not JSON', '{', 'home', 'JSON'],
    ['a document that fails step 1', '{"formatVersion":0}', 'home', 'The root block must be'],
    [
      'a root id that is not the page id',
      JSON.stringify(pageDocument('menu', '/menu')),
      'home',
      'The root block has the id "menu", but the address has the page id "home".',
    ],
  ])('gives a error for %s', (_, text, id, message) => {
    const body = readPageBody(SCHEMA, text, id);

    expect('error' in body && body.error).toContain(message);
  });
});

describe('withPagePath', () => {
  const paths = new Map([
    ['/', 'home'],
    ['/menu', 'menu'],
  ]);

  it.each<[string, string, unknown, [string, string][]]>([
    [
      'a new page',
      'tea',
      '/tea',
      [
        ['/', 'home'],
        ['/menu', 'menu'],
        ['/tea', 'tea'],
      ],
    ],
    [
      'a page with a new path',
      'menu',
      '/drinks',
      [
        ['/', 'home'],
        ['/drinks', 'menu'],
      ],
    ],
    [
      'a page with the same path',
      'menu',
      '/menu',
      [
        ['/', 'home'],
        ['/menu', 'menu'],
      ],
    ],
    [
      'a block document without a path',
      'footer',
      undefined,
      [
        ['/', 'home'],
        ['/menu', 'menu'],
      ],
    ],
  ])('gives the paths after the save of %s', (_, id, path, expected) => {
    expect([...withPagePath(paths, id, path)]).toStrictEqual(expected);
  });
});

describe('findSaveError', () => {
  it.each([
    ['none', 'a new page with a free path', NO_CONDITIONS, undefined, loadedPage('tea', '/tea')],
    ['none', 'a change of the read version', IF_MATCH_A, '"a"', loadedPage('menu', '/menu')],
    [412, 'a new page over a page that exists', IF_NONE_MATCH, '"a"', loadedPage('menu', '/menu')],
    [412, 'a change of an older version', IF_MATCH_A, '"b"', loadedPage('menu', '/menu')],
    [409, 'a path that a different page has', NO_CONDITIONS, undefined, loadedPage('tea', '/menu')],
    ['none', 'a block document without a path', NO_CONDITIONS, undefined, loadedBlockDocument()],
  ])('gives the status %j for %s', (status, _, conditions, currentTag, document) => {
    const error = findSaveError({
      conditions,
      currentTag,
      paths: indexPaths(STORED_PAGES),
      document,
    });

    expect(error?.status ?? 'none').toBe(status);
  });

  it('names the page that has the path', () => {
    const document = loadedPage('tea', '/menu');
    const error = findSaveError({
      conditions: NO_CONDITIONS,
      currentTag: undefined,
      paths: indexPaths(STORED_PAGES),
      document,
    });

    expect(error?.message).toBe('The page "menu" has the path /menu already.');
  });
});

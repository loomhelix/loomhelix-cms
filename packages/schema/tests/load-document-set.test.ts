import { describe, expect, it } from 'vite-plus/test';
import { loadDocumentSet, parseSchema } from '../src/index.ts';

const schema = parseSchema({
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Notice', 'Box'] } } } },
  blocks: {
    Notice: { version: 1, fields: { text: { type: 'text' } } },
    Box: { version: 1, slots: { items: { allow: ['Notice', 'Box'] } } },
  },
});

type Storage = Readonly<Record<string, unknown>>;

function reference(id: string, document: string, type = 'Notice') {
  return { id, type, document };
}

function notice(id: string, props: Readonly<Record<string, unknown>> = { text: 'Open' }) {
  return { formatVersion: 0, root: { id, type: 'Notice', version: 1, props } };
}

function box(id: string, ...items: unknown[]) {
  return { formatVersion: 0, root: { id, type: 'Box', version: 1, props: {}, slots: { items } } };
}

function page(...items: unknown[]) {
  return {
    formatVersion: 0,
    root: {
      id: 'home',
      type: 'Landing',
      version: 1,
      props: { title: 'Home', path: '/' },
      slots: { main: items },
    },
  };
}

function deepBox(id: string, levels: number, ...items: unknown[]) {
  let block: Record<string, unknown> = {
    id: `${id}-${levels}`,
    type: 'Box',
    version: 1,
    props: {},
  };
  for (let level = levels - 1; level >= 1; level -= 1) {
    const slots = { items: level === levels - 1 ? [block, ...items] : [block] };
    block = { id: level === 1 ? id : `${id}-${level}`, type: 'Box', version: 1, props: {}, slots };
  }
  return { formatVersion: 0, root: block };
}

function errorsOf({ errors }: { readonly errors: readonly { blockId: string; code: string }[] }) {
  return errors.map(({ blockId, code }) => [blockId, code]);
}

async function loadWith(storage: Storage, json: unknown) {
  const reads: string[] = [];
  const set = await loadDocumentSet(schema, json, async (id) => {
    reads.push(id);
    return Object.hasOwn(storage, id) ? storage[id] : undefined;
  });
  return { set, reads };
}

describe('loadDocumentSet', () => {
  it('reads each shown document one time, also the documents that other documents show', async () => {
    const storage = { hours: notice('hours'), side: box('side', reference('r3', 'hours')) };
    const { set, reads } = await loadWith(
      storage,
      page(reference('r1', 'hours'), reference('r2', 'side', 'Box'), reference('r4', 'hours')),
    );

    expect([...set.shown.keys()]).toStrictEqual(['hours', 'side']);
    expect(reads.toSorted()).toStrictEqual(['hours', 'side']);
    expect(set.main.errors).toStrictEqual([]);
  });

  it.each<[string, Storage, string, string]>([
    [
      'a document that does not exist',
      {},
      'missingDocument',
      'The block "r1" shows the document "hours", but the document does not exist.',
    ],
    [
      'a document that the load rejects',
      { hours: { formatVersion: 0 } },
      'invalidReference',
      'The block "r1" shows the document "hours", but the load rejects the document. The root block must be an object, got no value.',
    ],
    [
      'a document with an invalid root block',
      { hours: notice('hours', {}) },
      'invalidReference',
      'The block "r1" shows the document "hours", but the root block of the document is invalid. The block "hours" has no value for the required field "text".',
    ],
    [
      'a document with a root block of a different type',
      { hours: box('hours') },
      'invalidReference',
      'The block "r1" has the type "Notice", but the root block of the document "hours" has the type "Box".',
    ],
  ])('reports a reference to %s', async (_, storage, code, message) => {
    const { set } = await loadWith(storage, page(reference('r1', 'hours')));

    expect(set.main.errors).toStrictEqual([{ blockId: 'r1', code, message }]);
    expect(set.shown.size).toBe(0);
  });

  it('uses the main document for a reference to it, and does not read it', async () => {
    const { set, reads } = await loadWith({}, page(reference('r1', 'home')));

    expect(set.main.errors.map(({ code }) => code)).toStrictEqual(['invalidReference']);
    expect(reads).toStrictEqual([]);
  });

  it('gives each shown document the errors of its own references', async () => {
    const storage = { side: box('side', reference('r2', 'sale')) };
    const { set } = await loadWith(storage, page(reference('r1', 'side', 'Box')));

    expect(set.main.errors).toStrictEqual([]);
    expect(set.shown.get('side')?.errors.map(({ blockId, code }) => [blockId, code])).toStrictEqual(
      [['r2', 'missingDocument']],
    );
  });

  it('does not read the references in an invalid block', async () => {
    const invalidBox = {
      id: 'b1',
      type: 'Box',
      version: 1,
      props: { color: 'red' },
      slots: { items: [reference('r1', 'hours')] },
    };
    const { set, reads } = await loadWith({ hours: notice('hours') }, page(invalidBox));

    expect(set.main.errors.map(({ blockId, code }) => [blockId, code])).toStrictEqual([
      ['b1', 'invalidProps'],
    ]);
    expect(reads).toStrictEqual([]);
  });

  it.each<[string, Storage, unknown, string]>([
    [
      'a document that shows itself',
      {},
      box('banner', reference('r1', 'banner', 'Box')),
      'The block "r1" shows "banner", the document of this block. A document cannot show itself.',
    ],
    [
      'a document that shows itself through another document',
      { side: box('side', reference('r2', 'banner', 'Box')) },
      box('banner', reference('r1', 'side', 'Box')),
      'The block "r1" shows "side", but "side" shows "banner", the document of this block. A document cannot show itself.',
    ],
  ])('reports %s', async (_, storage, json, message) => {
    const { set } = await loadWith(storage, json);

    expect(set.main.errors).toStrictEqual([{ blockId: 'r1', code: 'cyclicReference', message }]);
    expect(set.shown.size).toBe(0);
  });

  it('shows a document of a loop, but reports its reference that closes the loop', async () => {
    const storage = {
      first: box('first', reference('r2', 'second', 'Box')),
      second: box('second', reference('r3', 'first', 'Box')),
    };
    const { set } = await loadWith(storage, page(reference('r1', 'first', 'Box')));

    expect([errorsOf(set.main), [...set.shown.keys()]]).toStrictEqual([[], ['first']]);
    expect(errorsOf(set.shown.get('first') ?? { errors: [] })).toStrictEqual([
      ['r2', 'cyclicReference'],
    ]);
  });

  it.each<[number, string[][]]>([
    [31, []],
    [32, [['r1', 'tooManyLevels']]],
  ])('counts the levels of a shown document with %i levels', async (levels, errors) => {
    const { set } = await loadWith(
      { deep: deepBox('deep', levels) },
      page(reference('r1', 'deep', 'Box')),
    );

    expect(errorsOf(set.main)).toStrictEqual(errors);
  });

  it('counts the levels of the documents that a shown document shows', async () => {
    const storage = {
      outer: deepBox('outer', 15, reference('r2', 'inner', 'Box')),
      inner: deepBox('inner', 18),
    };
    const { set } = await loadWith(storage, page(reference('r1', 'outer', 'Box')));

    expect(set.main.errors).toStrictEqual([
      {
        blockId: 'r1',
        code: 'tooManyLevels',
        message:
          'The block "r1" shows "outer", and then the blocks of "home" go to level 33. A document with its shown documents can have no more than 32 levels of blocks.',
      },
    ]);
  });
});

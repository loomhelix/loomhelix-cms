import {
  isBlockReference,
  parseSchema,
  type Block,
  type BlockReference,
  type PageDocument,
} from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import {
  addBlock,
  createBlock,
  createBlockId,
  findItem,
  findPlace,
  moveBlock,
  removeBlock,
  restoreBlock,
  setProp,
} from '../src/document-edits.ts';

function propsOf(document: PageDocument, id: string): unknown {
  const item = findItem(document.root, id);
  return item === undefined || isBlockReference(item) ? undefined : item.props;
}

function block(id: string, slots?: Record<string, (Block | BlockReference)[]>): Block {
  return { id, type: 'Text', version: 1, props: {}, ...(slots === undefined ? {} : { slots }) };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const document: PageDocument = deepFreeze({
  formatVersion: 0,
  root: block('p1', { main: [block('b1'), block('b2', { items: [block('b3')] }), block('b4')] }),
});

function remove(id: string, from: PageDocument = document) {
  const result = removeBlock(from, id);
  if (result === undefined) {
    throw new Error(`The test expected that the block ${id} can be removed.`);
  }
  return result;
}

function mainIds(edited: PageDocument): string[] {
  return (edited.root.slots?.main ?? []).map((child) => child.id);
}

describe('addBlock', () => {
  it('adds a block at the end of a slot', () => {
    expect(mainIds(addBlock(document, 'p1', 'main', block('b5')))).toEqual([
      'b1',
      'b2',
      'b4',
      'b5',
    ]);
  });

  it('adds a block to a nested slot', () => {
    const edited = addBlock(document, 'b2', 'items', block('b5'));

    expect(findPlace(edited.root, 'b5')).toEqual({ parentId: 'b2', slotName: 'items', index: 1 });
  });

  it('creates a slot that the block does not have yet', () => {
    const edited = addBlock(document, 'b1', 'items', block('b5'));

    expect(findPlace(edited.root, 'b5')).toEqual({ parentId: 'b1', slotName: 'items', index: 0 });
  });
});

describe('removeBlock and restoreBlock', () => {
  it.each(['b1', 'b2', 'b3', 'b4'])(
    'removes the block %s, and the removal restores the document',
    (id) => {
      const { document: edited, removal } = remove(id);

      expect(findPlace(edited.root, id)).toBeUndefined();
      expect(restoreBlock(edited, removal)).toEqual(document);
    },
  );

  it('removes a block with the blocks in its slots', () => {
    expect(findPlace(remove('b2').document.root, 'b3')).toBeUndefined();
  });

  it.each(['p1', 'b9'])('does not remove %s, because it is not in a slot', (id) => {
    expect(removeBlock(document, id)).toBeUndefined();
  });
});

describe('moveBlock', () => {
  it.each<[string, 'up' | 'down', string[]]>([
    ['b2', 'up', ['b2', 'b1', 'b4']],
    ['b2', 'down', ['b1', 'b4', 'b2']],
    ['b1', 'up', ['b1', 'b2', 'b4']],
    ['b4', 'down', ['b1', 'b2', 'b4']],
  ])('moves %s %s', (id, direction, ids) => {
    expect(mainIds(moveBlock(document, id, direction))).toEqual(ids);
  });

  it('moves a block in a nested slot', () => {
    const edited = addBlock(document, 'b2', 'items', block('b5'));

    expect(findPlace(moveBlock(edited, 'b5', 'up').root, 'b5')?.index).toBe(0);
  });
});

describe('setProp', () => {
  it.each<[string, string, string, unknown, Record<string, unknown>]>([
    ['sets a new value', 'b1', 'body', 'Hello', { body: 'Hello' }],
    ['sets a value of a nested block', 'b3', 'body', 'Open', { body: 'Open' }],
    ['sets a value of the root block', 'p1', 'title', 'Home', { title: 'Home' }],
  ])('%s', (_, blockId, name, value, props) => {
    const edited = setProp(document, blockId, name, value);

    expect(propsOf(edited, blockId)).toStrictEqual(props);
  });

  it('replaces a value and removes a value', () => {
    const withBody = setProp(document, 'b1', 'body', 'Hello');
    const replaced = setProp(withBody, 'b1', 'body', 'Hi');
    const removed = setProp(replaced, 'b1', 'body', undefined);

    expect(propsOf(replaced, 'b1')).toStrictEqual({ body: 'Hi' });
    expect(propsOf(removed, 'b1')).toStrictEqual({});
  });
});

describe('createBlock and createBlockId', () => {
  it('creates a block of the current version with the default values of its fields', () => {
    const schema = parseSchema({
      formatVersion: 0,
      pages: { Landing: { version: 1 } },
      blocks: {
        Hero: {
          version: 2,
          fields: {
            title: { type: 'text' },
            background: { type: 'choice', options: ['light', 'dark'], default: 'dark' },
          },
          migrations: [{ from: 1, operations: [] }],
        },
      },
    });
    const type = schema.blocks.get('Hero');
    if (type === undefined) {
      throw new Error('The test schema has no block type "Hero".');
    }

    expect(createBlock('b9', 'Hero', type)).toStrictEqual({
      id: 'b9',
      type: 'Hero',
      version: 2,
      props: { background: 'dark' },
    });
  });

  it('creates an id that the document does not have', () => {
    const id = createBlockId(document);

    expect(id).toMatch(/^block-[0-9a-f]{8}$/);
    expect(findPlace(document.root, id)).toBeUndefined();
  });
});

describe('a block reference', () => {
  const reference: BlockReference = { id: 'r1', type: 'Notice', document: 'sale' };
  const withReference: PageDocument = deepFreeze({
    formatVersion: 0,
    root: block('p1', { main: [reference, block('b1')] }),
  });

  it('has a place in its slot, and the search finds it', () => {
    expect([findPlace(withReference.root, 'r1'), findItem(withReference.root, 'r1')]).toEqual([
      { parentId: 'p1', slotName: 'main', index: 0 },
      reference,
    ]);
  });

  it('goes to the end of a slot', () => {
    expect(mainIds(addBlock(withReference, 'p1', 'main', { ...reference, id: 'r2' }))).toEqual([
      'r1',
      'b1',
      'r2',
    ]);
  });

  it('moves, and the removal restores it', () => {
    const { document: edited, removal } = remove('r1', withReference);

    expect([mainIds(moveBlock(withReference, 'r1', 'down')), mainIds(edited)]).toEqual([
      ['b1', 'r1'],
      ['b1'],
    ]);
    expect(restoreBlock(edited, removal)).toEqual(withReference);
  });
});

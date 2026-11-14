import { describe, expect, it } from 'vite-plus/test';
import { readEditorMessage, type EditorMessage } from '../src/editor-messages.ts';

describe('readEditorMessage', () => {
  it.each<[string, unknown, EditorMessage | undefined]>([
    [
      'a highlight',
      { type: 'lhcms:highlight', blockId: 'hero' },
      { type: 'lhcms:highlight', blockId: 'hero' },
    ],
    [
      'a highlight without a block',
      { type: 'lhcms:highlight', blockId: null },
      { type: 'lhcms:highlight', blockId: null },
    ],
    ['a hover', { type: 'lhcms:hover', blockId: 'hero' }, { type: 'lhcms:hover', blockId: 'hero' }],
    [
      'a scroll with other properties',
      { type: 'lhcms:scroll-to', blockId: 'hero', extra: true },
      { type: 'lhcms:scroll-to', blockId: 'hero' },
    ],
    ['a scroll without a block', { type: 'lhcms:scroll-to', blockId: null }, undefined],
    ['a number as the block', { type: 'lhcms:highlight', blockId: 5 }, undefined],
    ['a message of the bridge', { type: 'lhcms:ready', blockIds: [] }, undefined],
    ['an unknown type', { type: 'other', blockId: 'hero' }, undefined],
    ['a string', 'lhcms:highlight', undefined],
    ['null', null, undefined],
  ])('reads %s', (_, data, message) => {
    expect(readEditorMessage(data)).toStrictEqual(message);
  });
});

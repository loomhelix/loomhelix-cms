import { describe, expect, it } from 'vite-plus/test';
import { readBridgeMessage, type BridgeMessage } from '../src/preview-messages.ts';

describe('readBridgeMessage', () => {
  it.each<[string, unknown, BridgeMessage | undefined]>([
    ['a ready message', { type: 'lhcms:ready', blockIds: ['hero'] }, { type: 'lhcms:ready' }],
    [
      'a selection',
      { type: 'lhcms:select', blockId: 'hero' },
      { type: 'lhcms:select', blockId: 'hero' },
    ],
    ['a selection without a block', { type: 'lhcms:select' }, undefined],
    ['a selection with a number', { type: 'lhcms:select', blockId: 5 }, undefined],
    ['a message of the editor', { type: 'lhcms:highlight', blockId: 'hero' }, undefined],
    ['a string', 'lhcms:ready', undefined],
    ['null', null, undefined],
  ])('reads %s', (_, data, message) => {
    expect(readBridgeMessage(data)).toStrictEqual(message);
  });
});

import type { RichText } from '@loomhelix-cms/schema';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { fromProseMirror, toProseMirror } from '../src/rich-text-conversion.ts';
import { findLinkRange, removeLink, setLink, type LinkRange } from '../src/rich-text-links.ts';

const text: RichText = [
  [{ text: 'See ' }, { text: 'the ' }, { text: 'menu', link: '/menu' }, { text: '.' }],
];
const boldLink: RichText = [
  [
    { text: 'See ' },
    { text: 'the ', link: '/menu' },
    { text: 'menu', marks: ['bold'], link: '/menu' },
  ],
];

function stateWith(value: RichText, from: number, to = from): EditorState {
  const state = EditorState.create({ doc: toProseMirror(value) });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

describe('findLinkRange', () => {
  it.each<[string, RichText, number, number, LinkRange | undefined]>([
    ['a selection without a link', text, 1, 4, { from: 1, to: 4, href: undefined }],
    ['a selection with part of a link', text, 6, 11, { from: 6, to: 11, href: '/menu' }],
    ['a cursor in plain text', text, 2, 2, undefined],
    ['a cursor in a link', text, 11, 11, { from: 9, to: 13, href: '/menu' }],
    ['a cursor at the start of a link', text, 9, 9, { from: 9, to: 13, href: '/menu' }],
    ['a cursor at the end of a link', text, 13, 13, { from: 9, to: 13, href: '/menu' }],
    ['a cursor in a link with two spans', boldLink, 7, 7, { from: 5, to: 13, href: '/menu' }],
  ])('finds the range for %s', (_, value, from, to, range) => {
    expect(findLinkRange(stateWith(value, from, to))).toStrictEqual(range);
  });
});

describe('setLink and removeLink', () => {
  it('adds a link to the selected text', () => {
    const state = stateWith(text, 1, 4);
    const range = { from: 1, to: 4, href: undefined };
    expect(fromProseMirror(setLink(state, range, 'https://example.com').doc)).toStrictEqual([
      [
        { text: 'See', link: 'https://example.com' },
        { text: ' the ' },
        { text: 'menu', link: '/menu' },
        { text: '.' },
      ],
    ]);
  });

  it('changes the address of a link and keeps its marks', () => {
    const state = stateWith(boldLink, 7);
    const range = { from: 5, to: 13, href: '/menu' };
    expect(fromProseMirror(setLink(state, range, '/drinks').doc)).toStrictEqual([
      [
        { text: 'See ' },
        { text: 'the ', link: '/drinks' },
        { text: 'menu', marks: ['bold'], link: '/drinks' },
      ],
    ]);
  });

  it('removes a link and keeps its marks', () => {
    const state = stateWith(boldLink, 7);
    const range = { from: 5, to: 13, href: '/menu' };
    expect(fromProseMirror(removeLink(state, range).doc)).toStrictEqual([
      [{ text: 'See the ' }, { text: 'menu', marks: ['bold'] }],
    ]);
  });
});

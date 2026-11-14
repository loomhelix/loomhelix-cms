import type { RichText } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import type { Mark } from 'prosemirror-model';
import {
  fromProseMirror,
  richTextSchema,
  toPlainTextSlice,
  toProseMirror,
} from '../src/rich-text-conversion.ts';

describe('toPlainTextSlice', () => {
  const bold = [richTextSchema.marks.bold.create()];

  it.each<[string, string, readonly Mark[], RichText]>([
    ['one line', 'xy', [], [[{ text: 'AxyB' }]]],
    ['two lines', 'x\ny', [], [[{ text: 'Ax' }], [{ text: 'yB' }]]],
    ['empty lines', 'x\r\n\r\ny', [], [[{ text: 'Ax' }], [{ text: 'yB' }]]],
    ['only line breaks', '\n\n', [], [[{ text: 'AB' }]]],
    [
      'a line with marks',
      'xy',
      bold,
      [[{ text: 'A' }, { text: 'xy', marks: ['bold'] }, { text: 'B' }]],
    ],
  ])('pastes %s into a paragraph', (_, text, marks, result) => {
    const document = toProseMirror([[{ text: 'AB' }]]);
    expect(fromProseMirror(document.replace(2, 2, toPlainTextSlice(text, marks)))).toStrictEqual(
      result,
    );
  });
});

describe('toProseMirror and fromProseMirror', () => {
  it.each<[string, RichText]>([
    ['a plain paragraph', [[{ text: 'Fresh coffee' }]]],
    ['two marks', [[{ text: 'Fresh ' }, { text: 'coffee', marks: ['bold', 'italic'] }]]],
    ['a link with a mark', [[{ text: 'menu', marks: ['italic'], link: '/menu' }]]],
    ['two paragraphs', [[{ text: 'One' }], [{ text: 'Two', link: 'mailto:hello@example.com' }]]],
  ])('keeps %s', (_, value) => {
    expect(fromProseMirror(toProseMirror(value))).toStrictEqual(value);
  });

  it.each<[string, unknown, RichText | undefined]>([
    ['an unsafe link', [[{ text: 'Menu', link: 'javascript:alert(1)' }]], [[{ text: 'Menu' }]]],
    [
      'unknown and repeated marks',
      [[{ text: 'Menu', marks: ['underline', 'bold', 'bold'] }]],
      [[{ text: 'Menu', marks: ['bold'] }]],
    ],
    [
      'marks in a different order',
      [[{ text: 'Menu', marks: ['italic', 'bold'] }]],
      [[{ text: 'Menu', marks: ['bold', 'italic'] }]],
    ],
    ['an empty span', [[{ text: '' }, { text: 'Menu' }]], [[{ text: 'Menu' }]]],
    ['line breaks in a span', [[{ text: 'Fresh\r\ncoffee' }]], [[{ text: 'Fresh coffee' }]]],
    ['an unknown property', [[{ text: 'Menu', color: 'red' }]], [[{ text: 'Menu' }]]],
    [
      'spans with the same marks',
      [[{ text: 'Fresh ' }, { text: 'coffee' }]],
      [[{ text: 'Fresh coffee' }]],
    ],
    [
      'an empty paragraph',
      [[{ text: 'One' }], [], [{ text: 'Two' }]],
      [[{ text: 'One' }], [{ text: 'Two' }]],
    ],
    ['only empty paragraphs', [[], []], undefined],
    ['an empty list', [], undefined],
    ['a string', 'Menu', undefined],
  ])('makes a valid value from %s', (_, value, result) => {
    expect(fromProseMirror(toProseMirror(value))).toStrictEqual(result);
  });
});

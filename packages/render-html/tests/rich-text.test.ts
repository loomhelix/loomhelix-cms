import { expect, it } from 'vite-plus/test';
import { richText } from '../src/index.ts';

it('renders paragraphs, marks, and links as HTML elements', () => {
  const body = richText([
    [{ text: 'Fresh ' }, { text: 'coffee', marks: ['bold'] }, { text: ' every day.' }],
    [
      { text: 'Hot', marks: ['italic', 'bold'] },
      { text: ' & ', marks: ['italic'] },
      { text: 'cold', link: '/drinks?type=cold&size=large' },
    ],
  ]);

  expect(body.text).toBe(
    '<p>Fresh <strong>coffee</strong> every day.</p>' +
      '<p><strong><em>Hot</em></strong><em> &amp; </em>' +
      '<a href="/drinks?type=cold&amp;size=large">cold</a></p>',
  );
});

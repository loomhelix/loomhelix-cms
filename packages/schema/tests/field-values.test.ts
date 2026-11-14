import { describe, expect, it } from 'vite-plus/test';
import { findValueError } from '../src/field-values.ts';
import type { Field } from '../src/types.ts';

const title: Field = { type: 'text', optional: false, multiline: false, maxLength: 10 };
const note: Field = { type: 'text', optional: false, multiline: true };
const body: Field = { type: 'richText', optional: false };
const link: Field = { type: 'link', optional: false };
const image: Field = { type: 'image', optional: false };
const background: Field = {
  type: 'choice',
  optional: false,
  options: [{ name: 'light' }, { name: 'dark' }],
};

const rating: Field = { type: 'number', optional: false, integer: true, min: 1, max: 5 };
const price: Field = { type: 'number', optional: false, integer: false, min: 0 };
const discount: Field = { type: 'number', optional: false, integer: false, max: 50 };
const isNew: Field = { type: 'boolean', optional: false, default: false };
const product: Field = { type: 'record', optional: false, source: 'products' };

describe('findValueError', () => {
  it.each<[string, Field, unknown]>([
    ['a text', title, 'Menu'],
    ['a text of 10 code points with emoji', title, '\u{1F600}'.repeat(10)],
    ['a multiline text with line breaks', note, 'One\r\nTwo'],
    [
      'formatted text with marks and links',
      body,
      [[{ text: 'Hot', marks: ['italic', 'bold'], link: '/drinks' }]],
    ],
    ['a relative link', link, '/menu'],
    ['an image with an empty alt', image, { src: '/cup.jpg', alt: '' }],
    ['an image with a size', image, { src: '/cup.jpg', alt: '', width: 1600, height: 1067 }],
    ['an option', background, 'dark'],
    ['an integer in the range', rating, 5],
    ['a decimal number', price, 2.5],
    ['a negative number without min', discount, -10],
    ['false', isNew, false],
    ['a record id', product, 'espresso-beans'],
    ['a record id of digits', product, '42'],
  ])('accepts %s', (_, field, value) => {
    expect(findValueError(field, value)).toBeUndefined();
  });

  it.each<[string, Field, unknown, string]>([
    ['a number for a text', title, 5, 'must be a string, got 5.'],
    ['a string for a number', rating, '3', 'must be a number, got "3".'],
    ['a decimal number for an integer', rating, 2.5, 'must be an integer, got 2.5.'],
    ['a number above max', rating, 6, 'must be from 1 to 5, got 6.'],
    ['a number below min', price, -1, 'must be 0 or more, got -1.'],
    ['a number above max without min', discount, 60, 'must be 50 or less, got 60.'],
    ['a string for a boolean', isNew, 'true', 'must be true or false, got "true".'],
    [
      'a number for a record id',
      product,
      42,
      'must be the id of a record: a non-empty string without control characters, got 42.',
    ],
    [
      'an empty record id',
      product,
      '',
      'must be the id of a record: a non-empty string without control characters, got "".',
    ],
    [
      'a record id with a tab',
      product,
      'espresso\tbeans',
      'must be the id of a record: a non-empty string without control characters, got "espresso\\tbeans".',
    ],
    ['a line feed', title, 'Fresh\ncoffee', 'must not contain line breaks, got "Fresh\\ncoffee".'],
    [
      'a carriage return',
      title,
      'Fresh\rcoffee',
      'must not contain line breaks, got "Fresh\\rcoffee".',
    ],
    ['a long text', title, 'Hello world', 'must have no more than 10 Unicode code points, got 11.'],
    ['no paragraphs', body, [], 'must be a list of one or more paragraphs, got an empty list.'],
    [
      'a plain string for formatted text',
      body,
      'Fresh',
      'must be a list of one or more paragraphs, got "Fresh".',
    ],
    [
      'an empty paragraph',
      body,
      [[{ text: 'Fresh' }], []],
      'must not have empty paragraphs. Paragraph 2 has no spans.',
    ],
    [
      'a paragraph that is not a list',
      body,
      ['Fresh'],
      'must have paragraphs that are lists of spans. Paragraph 1 is "Fresh".',
    ],
    [
      'an empty span',
      body,
      [[{ text: '' }]],
      'must follow section 3.3 of the spec. Span 1 of paragraph 1 must have a non-empty "text" without line breaks, got "".',
    ],
    [
      'an unknown span property',
      body,
      [[{ text: 'Fresh' }, { text: 'coffee', color: 'red' }]],
      'must follow section 3.3 of the spec. Span 2 of paragraph 1 has the unknown property "color".',
    ],
    [
      'a repeated mark',
      body,
      [[{ text: 'Fresh', marks: ['bold', 'bold'] }]],
      'must follow section 3.3 of the spec. Span 1 of paragraph 1 must have "marks" with "bold", "italic", or both, each one time.',
    ],
    [
      'an empty mark list',
      body,
      [[{ text: 'Fresh', marks: [] }]],
      'must follow section 3.3 of the spec. Span 1 of paragraph 1 must have "marks" with "bold", "italic", or both, each one time.',
    ],
    [
      'an unsafe span link',
      body,
      [[{ text: 'Fresh', link: 'javascript:alert(1)' }]],
      'must follow section 3.3 of the spec. Span 1 of paragraph 1 must have a "link" that follows section 3.2 of the spec, got "javascript:alert(1)".',
    ],
    [
      'an unsafe link',
      link,
      'javascript:alert(1)',
      'must be a link that follows section 3.2 of the spec, got "javascript:alert(1)".',
    ],
    [
      'a string for an image',
      image,
      '/cup.jpg',
      'must be an object with "src" and "alt", got "/cup.jpg".',
    ],
    [
      'an image with a width and without a height',
      image,
      { src: '/cup.jpg', alt: '', width: 1600 },
      'must have a "width" and a "height" that are integers of 1 or more, or neither of them, got 1600 and no value.',
    ],
    [
      'an image with a height of 0',
      image,
      { src: '/cup.jpg', alt: '', width: 1600, height: 0 },
      'must have a "width" and a "height" that are integers of 1 or more, or neither of them, got 1600 and 0.',
    ],
    [
      'an image with an unknown property',
      image,
      { src: '/cup.jpg', alt: '', title: 'Cup' },
      'has the unknown property "title". An image has only "src", "alt", "width", and "height".',
    ],
    [
      'an image with a mailto source',
      image,
      { src: 'mailto:hello@example.com', alt: '' },
      'must have a "src" with the scheme http or https or no scheme, got "mailto:hello@example.com".',
    ],
    [
      'an image without alt',
      image,
      { src: '/cup.jpg' },
      'must have an "alt" string, got no value.',
    ],
    ['an unknown option', background, 'blue', 'must be one of "light", "dark", got "blue".'],
    ['null for an option', background, null, 'must be one of "light", "dark", got null.'],
  ])('rejects %s', (_, field, value, error) => {
    expect(findValueError(field, value)).toBe(error);
  });
});

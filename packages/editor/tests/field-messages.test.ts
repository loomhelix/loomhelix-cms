import type { Field } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import {
  describeFieldError,
  describePathError,
  MISSING_VALUE,
  PATH_RULE,
} from '../src/field-messages.ts';

const title: Field = { type: 'text', optional: false, multiline: false, maxLength: 10 };
const subtitle: Field = { type: 'text', optional: true, multiline: false };
const link: Field = { type: 'link', optional: false };
const image: Field = { type: 'image', optional: true };
const background: Field = {
  type: 'choice',
  optional: false,
  options: [{ name: 'light' }, { name: 'dark' }],
};
const body: Field = { type: 'richText', optional: false };
const rating: Field = { type: 'number', optional: false, integer: true, min: 1, max: 5 };
const price: Field = { type: 'number', optional: false, integer: false, min: 0 };
const discount: Field = { type: 'number', optional: false, integer: false, max: 50 };
const isNew: Field = { type: 'boolean', optional: false, default: false };
const product: Field = { type: 'record', optional: false, source: 'products' };

describe('describeFieldError', () => {
  it.each<[string, Field, unknown, string | undefined]>([
    ['a valid text', title, 'Menu', undefined],
    ['an empty text, which is a value', title, '', undefined],
    ['a missing required field', title, undefined, MISSING_VALUE],
    ['a missing optional field', subtitle, undefined, undefined],
    ['a long text', title, 'Fresh coffee', 'Use no more than 10 characters. The text has 12.'],
    ['a text with a line break', subtitle, 'One\nTwo', 'Remove the line breaks from this text.'],
    ['a number for a text', subtitle, 5, 'Enter a text.'],
    [
      'an unsafe link',
      link,
      'javascript:alert(1)',
      'Enter an address that starts with /, #, ?, https://, http://, mailto:, or tel:, without spaces.',
    ],
    [
      'an image with a mailto source',
      image,
      { src: 'mailto:hello@example.com', alt: '' },
      'Enter an image address that starts with / or https://, without spaces.',
    ],
    ['an unknown option', background, 'blue', 'Select one of the options.'],
    ['a number in the range', rating, 3, undefined],
    ['a text for a number', rating, 'three', 'Enter a number.'],
    ['a decimal number for an integer', rating, 2.5, 'Enter a whole number.'],
    ['a number out of the range', rating, 7, 'Enter a number from 1 to 5.'],
    ['a number below min', price, -1, 'Enter a number of 0 or more.'],
    ['a number above max', discount, 60, 'Enter a number of 50 or less.'],
    ['a text for a boolean', isNew, 'yes', 'Select or clear the check box.'],
    [
      'an empty record id',
      product,
      '',
      'Enter the id of a record. The id cannot contain line breaks or tabs.',
    ],
    [
      'an unsafe link in formatted text',
      body,
      [[{ text: 'Menu', link: 'javascript:alert(1)' }]],
      'The formatted text has an error. Change the text to correct it.',
    ],
  ])('describes %s', (_, field, value, message) => {
    expect(describeFieldError(field, value)).toBe(message);
  });
});

describe('describePathError', () => {
  it.each<[unknown, string | undefined]>([
    ['/menu', undefined],
    ['/', undefined],
    ['', MISSING_VALUE],
    [undefined, MISSING_VALUE],
    ['menu', PATH_RULE],
    ['/menu?page=2', PATH_RULE],
  ])('describes the path %j', (path, message) => {
    expect(describePathError(path)).toBe(message);
  });
});

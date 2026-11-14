import type { Image } from '@loomhelix-cms/schema';
import { describe, expect, it } from 'vite-plus/test';
import { imageFieldValue, imagePartsOf, withSize, withSource } from '../src/image-value.ts';

const sized: Image = { src: '/cup.jpg', alt: 'Cup', width: 1600, height: 1067 };

describe('the value of an image field', () => {
  it.each<[string, unknown, Image]>([
    ['no value', undefined, { src: '', alt: '' }],
    ['a value with a size', sized, sized],
    ['a value of wrong types', { src: 5, alt: null, width: '1600' }, { src: '', alt: '' }],
  ])('gives the parts of %s', (_, value, parts) => {
    expect(imagePartsOf(value)).toStrictEqual(parts);
  });

  it('removes the size with a new source, and adds the measured size', () => {
    const moved = withSource(sized, '/mug.jpg');

    expect(moved).toStrictEqual({ src: '/mug.jpg', alt: 'Cup' });
    expect(withSize(moved, 800, 600)).toStrictEqual({
      src: '/mug.jpg',
      alt: 'Cup',
      width: 800,
      height: 600,
    });
  });

  it.each<[string, Image, boolean, Image | undefined]>([
    ['an empty optional image', { src: '', alt: '' }, true, undefined],
    ['an empty required image', { src: '', alt: '' }, false, { src: '', alt: '' }],
    ['an optional image with an alt', { src: '', alt: 'Cup' }, true, { src: '', alt: 'Cup' }],
  ])('gives the field value of %s', (_, image, isOptional, value) => {
    expect(imageFieldValue(image, isOptional)).toStrictEqual(value);
  });
});

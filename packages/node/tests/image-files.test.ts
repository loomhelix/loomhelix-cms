import { describe, expect, it } from 'vite-plus/test';
import { findImageFormat, imageTypeOfName } from '../src/image-files.ts';

function bytesOf(...parts: (string | number[])[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? Array.from({ length: part.length }, (_, index) => part.charCodeAt(index))
        : part,
    ),
  );
}

describe('findImageFormat', () => {
  it.each<[string, Uint8Array, string | undefined]>([
    ['a PNG file', bytesOf([0x89], 'PNG\r\n', [0x1a], '\n', 'data'), '.png'],
    ['a JPEG file', bytesOf([0xff, 0xd8, 0xff, 0xe0], 'data'), '.jpg'],
    ['a GIF 87a file', bytesOf('GIF87a', 'data'), '.gif'],
    ['a GIF 89a file', bytesOf('GIF89a', 'data'), '.gif'],
    ['a WebP file', bytesOf('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), '.webp'],
    ['an AVIF file', bytesOf([0, 0, 0, 28], 'ftypavif', [0, 0, 0, 0]), '.avif'],
    ['an AVIF sequence', bytesOf([0, 0, 0, 28], 'ftypavis', [0, 0, 0, 0]), '.avif'],
    ['an SVG file', bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script>'), undefined],
    ['an HTML file with a PNG name', bytesOf('<html><script>alert(1)</script>'), undefined],
    ['a RIFF file that is not WebP', bytesOf('RIFF', [0, 0, 0, 0], 'WAVEfmt '), undefined],
    ['an HEIC file', bytesOf([0, 0, 0, 24], 'ftypheic'), undefined],
    ['an empty file', bytesOf(), undefined],
  ])('finds %s', (_, bytes, extension) => {
    expect(findImageFormat(bytes)?.extension).toBe(extension);
  });
});

describe('imageTypeOfName', () => {
  it.each<[string, string | undefined]>([
    ['0123456789abcdef0123456789abcdef.png', 'image/png'],
    ['0123456789abcdef0123456789abcdef.jpg', 'image/jpeg'],
    ['0123456789abcdef0123456789abcdef.avif', 'image/avif'],
    ['0123456789abcdef0123456789abcdef.svg', undefined],
    ['../0123456789abcdef0123456789abcd.png', undefined],
    ['photo.png', undefined],
  ])('gives the type of %s', (name, type) => {
    expect(imageTypeOfName(name)).toBe(type);
  });
});

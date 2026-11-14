import type { Image } from '@loomhelix-cms/schema';

export function imagePartsOf(value: unknown): Image {
  if (typeof value !== 'object' || value === null) {
    return { src: '', alt: '' };
  }
  const { src, alt, width, height } = value as Readonly<Record<string, unknown>>;
  return {
    src: typeof src === 'string' ? src : '',
    alt: typeof alt === 'string' ? alt : '',
    ...(typeof width === 'number' ? { width } : {}),
    ...(typeof height === 'number' ? { height } : {}),
  };
}

export function withSource(image: Image, src: string): Image {
  return { src, alt: image.alt };
}

export function withSize(image: Image, width: number, height: number): Image {
  return { ...image, width, height };
}

export function imageFieldValue(image: Image, isOptional: boolean): Image | undefined {
  return isOptional && image.src === '' && image.alt === '' ? undefined : image;
}

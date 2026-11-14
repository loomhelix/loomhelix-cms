export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif';

export interface ImageFormat {
  readonly type: ImageType;
  readonly extension: string;
}

interface Signature {
  readonly offset: number;
  readonly bytes: readonly number[];
}

interface KnownFormat extends ImageFormat {
  readonly signatures: readonly (readonly Signature[])[];
}

const PNG_START = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_START = [0xff, 0xd8, 0xff];
const UPLOAD_NAME_PATTERN = /^[0-9a-f]{32}\.(?:png|jpg|webp|gif|avif)$/;

const KNOWN_FORMATS: readonly KnownFormat[] = [
  { type: 'image/png', extension: '.png', signatures: [[{ offset: 0, bytes: PNG_START }]] },
  { type: 'image/jpeg', extension: '.jpg', signatures: [[{ offset: 0, bytes: JPEG_START }]] },
  {
    type: 'image/gif',
    extension: '.gif',
    signatures: [[{ offset: 0, bytes: ascii('GIF87a') }], [{ offset: 0, bytes: ascii('GIF89a') }]],
  },
  {
    type: 'image/webp',
    extension: '.webp',
    signatures: [
      [
        { offset: 0, bytes: ascii('RIFF') },
        { offset: 8, bytes: ascii('WEBP') },
      ],
    ],
  },
  {
    type: 'image/avif',
    extension: '.avif',
    signatures: [
      [{ offset: 4, bytes: ascii('ftypavif') }],
      [{ offset: 4, bytes: ascii('ftypavis') }],
    ],
  },
];

export function findImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  const format = KNOWN_FORMATS.find(({ signatures }) =>
    signatures.some((signature) => signature.every((part) => hasBytes(bytes, part))),
  );
  return format === undefined ? undefined : { type: format.type, extension: format.extension };
}

export function imageTypeOfName(name: string): ImageType | undefined {
  if (!UPLOAD_NAME_PATTERN.test(name)) {
    return undefined;
  }
  return KNOWN_FORMATS.find(({ extension }) => name.endsWith(extension))?.type;
}

function ascii(text: string): readonly number[] {
  return Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
}

function hasBytes(bytes: Uint8Array, { offset, bytes: expected }: Signature): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

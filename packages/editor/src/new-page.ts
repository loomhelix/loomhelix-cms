import type { PageDocument, TypeDefinition } from '@loomhelix-cms/schema';
import { defaultProps, randomIdPart } from './document-edits.ts';

const WORD_BREAK_PATTERN = /[^\p{L}\p{N}]+/u;

export interface NewPage {
  readonly id: string;
  readonly typeName: string;
  readonly type: TypeDefinition;
  readonly title: string;
  readonly path: string;
}

export function suggestPath(title: string): string {
  const words = title.normalize('NFC').toLowerCase().split(WORD_BREAK_PATTERN).filter(Boolean);
  return `/${words.join('-')}`;
}

export function createPageId(): string {
  return `page-${randomIdPart()}`;
}

export function createBlockDocument(
  id: string,
  typeName: string,
  type: TypeDefinition,
): PageDocument {
  return {
    formatVersion: 0,
    root: { id, type: typeName, version: type.version, props: defaultProps(type) },
  };
}

export function createPageDocument({ id, typeName, type, title, path }: NewPage): PageDocument {
  return {
    formatVersion: 0,
    root: {
      id,
      type: typeName,
      version: type.version,
      props: { ...defaultProps(type), title, path },
    },
  };
}

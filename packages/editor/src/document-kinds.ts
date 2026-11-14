import {
  currentTypeName,
  type PageDocument,
  type Schema,
  type TypeDefinition,
} from '@loomhelix-cms/schema';
import type { DocumentSummary } from './editor-storage.ts';

export function isBlockDocument(schema: Schema, document: PageDocument): boolean {
  return schema.blocks.has(document.root.type);
}

export function rootTypeOf(schema: Schema, document: PageDocument): TypeDefinition | undefined {
  const typeName = document.root.type;
  return schema.pages.get(typeName) ?? schema.blocks.get(typeName);
}

export function withoutBlockDocuments(
  pages: readonly DocumentSummary[],
  schema: Schema,
): readonly DocumentSummary[] {
  return pages.filter((page) => !schema.blocks.has(currentTypeName(schema, page.type ?? '')));
}

export interface BlockDocumentSummary {
  readonly id: string;
  readonly type: string;
}

export function blockDocumentsOf(
  schema: Schema,
  documents: readonly DocumentSummary[],
): readonly BlockDocumentSummary[] {
  return documents.flatMap(({ id, type }) => {
    const typeName = currentTypeName(schema, type ?? '');
    return schema.blocks.has(typeName) ? [{ id, type: typeName }] : [];
  });
}

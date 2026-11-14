import type { PageDocument } from '@loomhelix-cms/schema';

export interface DocumentSummary {
  readonly id: string;
  readonly type?: string;
  readonly title?: string;
  readonly path?: string;
}

export interface WriteOptions {
  readonly isNew: boolean;
}

export interface RecordSummary {
  readonly id: string;
  readonly label: string;
}

export type RecordQuery = { readonly text: string } | { readonly ids: readonly string[] };

export type RecordLookup = (
  source: string,
  query: RecordQuery,
) => Promise<readonly RecordSummary[]>;

export interface UploadResult {
  readonly src: string;
}

export type ImageUpload = (file: File) => Promise<UploadResult>;

export interface EditorStorage {
  read(id: string): Promise<unknown>;
  write(id: string, document: PageDocument, options: WriteOptions): Promise<void>;
  list?(): Promise<readonly DocumentSummary[]>;
  lookup?(source: string, query: RecordQuery): Promise<readonly RecordSummary[]>;
  upload?(file: File): Promise<UploadResult>;
}

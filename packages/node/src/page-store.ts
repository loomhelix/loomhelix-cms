import type { StoredDocument } from './page-rules.ts';

export interface StoredPage {
  readonly id: string;
  readonly text: string;
}

export interface PageStore {
  list(): Promise<readonly StoredPage[]>;
  read(id: string): Promise<string | undefined>;
  write(id: string, text: string): Promise<void>;
}

export async function readStoredDocument(
  store: PageStore,
  id: string,
): Promise<StoredDocument | undefined> {
  const text = await store.read(id);
  return text === undefined ? undefined : { id, document: parseStoredText(text) };
}

export async function readStoredDocuments(store: PageStore): Promise<StoredDocument[]> {
  return (await store.list()).map(({ id, text }) => ({ id, document: parseStoredText(text) }));
}

function parseStoredText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

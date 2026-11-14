import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPageId } from './page-rules.ts';
import type { PageStore, StoredPage } from './page-store.ts';

const PAGE_FILE_EXTENSION = '.json';

export function createFolderStore(folder: string): PageStore {
  return {
    list: () => listPages(folder),
    read: (id) => readPage(folder, id),
    write: (id, text) => writePage(folder, id, text),
  };
}

async function listPages(folder: string): Promise<StoredPage[]> {
  const ids = (await readdir(folder))
    .filter((name) => name.endsWith(PAGE_FILE_EXTENSION))
    .map((name) => name.slice(0, -PAGE_FILE_EXTENSION.length))
    .filter(isPageId)
    .toSorted();
  return Promise.all(
    ids.map(async (id) => ({ id, text: await readFile(pageFile(folder, id), 'utf8') })),
  );
}

async function readPage(folder: string, id: string): Promise<string | undefined> {
  try {
    return await readFile(pageFile(folder, id), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function writePage(folder: string, id: string, text: string): Promise<void> {
  const file = pageFile(folder, id);
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, text, 'utf8');
  await rename(temporaryFile, file);
}

function pageFile(folder: string, id: string): string {
  if (!isPageId(id)) {
    throw new TypeError(
      `The page id ${JSON.stringify(id)} can contain only letters, digits, hyphens, and underscores.`,
    );
  }
  return join(folder, `${id}${PAGE_FILE_EXTENSION}`);
}

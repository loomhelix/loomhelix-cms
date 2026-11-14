import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  DocumentError,
  loadDocumentSet,
  type BlockError,
  type PageDocument,
  type Schema,
} from '@loomhelix-cms/schema';

export type DocumentCheck =
  | { readonly kind: 'rejected'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly document: PageDocument;
      readonly errors: readonly BlockError[];
      readonly isChanged: boolean;
    };

export interface ContentFile {
  readonly file: string;
  readonly check: DocumentCheck;
}

const DOCUMENT_EXTENSION = '.json';

type ParsedJson = { readonly json: unknown } | { readonly error: SyntaxError };

async function checkDocument(
  schema: Schema,
  parsed: ParsedJson,
  read: (id: string) => Promise<unknown>,
): Promise<DocumentCheck> {
  if ('error' in parsed) {
    return { kind: 'rejected', message: `The file is not valid JSON. ${parsed.error.message}` };
  }
  try {
    const { document, errors } = (await loadDocumentSet(schema, parsed.json, read)).main;
    return {
      kind: 'loaded',
      document,
      errors,
      isChanged: !isDeepStrictEqual(document, parsed.json),
    };
  } catch (error) {
    if (error instanceof DocumentError) {
      return { kind: 'rejected', message: error.message };
    }
    throw error;
  }
}

export async function listDocumentFiles(folder: string): Promise<readonly string[]> {
  return (await readdir(folder))
    .filter((name) => name.endsWith(DOCUMENT_EXTENSION))
    .toSorted()
    .map((name) => join(folder, name));
}

export async function checkFiles(
  schema: Schema,
  files: readonly string[],
): Promise<readonly ContentFile[]> {
  const parsedFiles = await Promise.all(
    files.map(async (file) => ({ file, parsed: parseJson(await readFile(file, 'utf8')) })),
  );
  const jsonById = new Map(
    parsedFiles.flatMap(({ file, parsed }) =>
      'json' in parsed ? [[basename(file, DOCUMENT_EXTENSION), parsed.json] as const] : [],
    ),
  );
  const read = async (id: string) => jsonById.get(id);
  return Promise.all(
    parsedFiles.map(async ({ file, parsed }) => ({
      file,
      check: await checkDocument(schema, parsed, read),
    })),
  );
}

export async function writeDocument(file: string, document: PageDocument): Promise<void> {
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, file);
}

export function hasErrors(check: DocumentCheck): boolean {
  return check.kind === 'rejected' || check.errors.length > 0;
}

export function isChangedDocument(
  check: DocumentCheck,
): check is Extract<DocumentCheck, { readonly kind: 'loaded' }> {
  return check.kind === 'loaded' && check.isChanged;
}

export function errorMessages(check: DocumentCheck): readonly string[] {
  if (check.kind === 'rejected') {
    return [check.message];
  }
  return check.errors.map(({ message, code }) => `${message} (${code})`);
}

function parseJson(text: string): ParsedJson {
  try {
    return { json: JSON.parse(text) };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { error };
    }
    throw error;
  }
}

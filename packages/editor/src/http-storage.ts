import type { EditorStorage, RecordQuery, RecordSummary, UploadResult } from './editor-storage.ts';

export interface PageSummary {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly path: string;
}

export interface StoredPage {
  readonly document: unknown;
  readonly etag: string | undefined;
}

export type WriteCondition =
  | { readonly kind: 'create' }
  | { readonly kind: 'update'; readonly etag: string | undefined };

export type WriteResult =
  | { readonly status: 'saved'; readonly etag: string | undefined }
  | { readonly status: 'changed' }
  | { readonly status: 'pathTaken' }
  | { readonly status: 'rejected'; readonly message: string };

const MAX_MESSAGE_LENGTH = 300;

export async function listPages(apiUrl: string): Promise<readonly PageSummary[]> {
  const response = await fetch(`${baseAddress(apiUrl)}/pages`, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`The server answered the page list request with ${response.status}.`);
  }
  return readPageList(await response.json());
}

export async function readPage(apiUrl: string, id: string): Promise<StoredPage | undefined> {
  const response = await fetch(pageAddress(apiUrl, id), { credentials: 'same-origin' });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(
      `The server answered the request for the page "${id}" with ${response.status}.`,
    );
  }
  return { document: await response.json(), etag: response.headers.get('etag') ?? undefined };
}

export async function writePage(
  apiUrl: string,
  id: string,
  document: unknown,
  condition: WriteCondition,
): Promise<WriteResult> {
  const response = await fetch(pageAddress(apiUrl, id), {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...conditionHeaders(condition) },
    body: JSON.stringify(document),
  });
  if (response.ok) {
    return { status: 'saved', etag: response.headers.get('etag') ?? undefined };
  }
  if (response.status === 412) {
    return { status: 'changed' };
  }
  if (response.status === 409) {
    return { status: 'pathTaken' };
  }
  const message = (await response.text()).slice(0, MAX_MESSAGE_LENGTH);
  return { status: 'rejected', message: `${response.status}: ${message}` };
}

function conditionHeaders(condition: WriteCondition): Record<string, string> {
  if (condition.kind === 'create') {
    return { 'if-none-match': '*' };
  }
  return condition.etag === undefined ? {} : { 'if-match': condition.etag };
}

function readPageList(json: unknown): readonly PageSummary[] {
  const pages = isObject(json) ? json.pages : undefined;
  if (!Array.isArray(pages)) {
    throw new Error('The page list from the server must be an object with a "pages" list.');
  }
  return pages.filter(isObject).flatMap(({ id, type, title, path }) =>
    typeof id === 'string'
      ? [
          {
            id,
            type: typeof type === 'string' ? type : '',
            title: typeof title === 'string' ? title : '',
            path: typeof path === 'string' ? path : '',
          },
        ]
      : [],
  );
}

async function lookupRecords(
  apiUrl: string,
  source: string,
  query: RecordQuery,
): Promise<readonly RecordSummary[]> {
  const address = `${baseAddress(apiUrl)}/records/${encodeURIComponent(source)}?${recordSearch(query)}`;
  const response = await fetch(address, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(
      `The server answered the request for the records of "${source}" with ${response.status}.`,
    );
  }
  return readRecordList(await response.json());
}

function recordSearch(query: RecordQuery): URLSearchParams {
  return new URLSearchParams(
    'ids' in query ? query.ids.map((id) => ['id', id]) : [['text', query.text]],
  );
}

function readRecordList(json: unknown): readonly RecordSummary[] {
  const records = isObject(json) ? json.records : undefined;
  if (!Array.isArray(records)) {
    throw new Error('The record list from the server must be an object with a "records" list.');
  }
  return records
    .filter(isObject)
    .flatMap(({ id, label }) =>
      typeof id === 'string' && typeof label === 'string' ? [{ id, label }] : [],
    );
}

async function uploadImage(apiUrl: string, file: File): Promise<UploadResult> {
  const response = await fetch(`${baseAddress(apiUrl)}/uploads`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': file.type === '' ? 'application/octet-stream' : file.type },
    body: file,
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0, MAX_MESSAGE_LENGTH);
    throw new Error(`The server did not save the image. ${response.status}: ${message}`);
  }
  const json: unknown = await response.json();
  const src = isObject(json) ? json.src : undefined;
  if (typeof src !== 'string') {
    throw new Error('The answer to an upload must be an object with a "src" string.');
  }
  return { src };
}

function baseAddress(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

function pageAddress(apiUrl: string, id: string): string {
  return `${baseAddress(apiUrl)}/pages/${encodeURIComponent(id)}`;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createHttpStorage(apiUrl: string): EditorStorage {
  const etags = new Map<string, string | undefined>();
  return {
    list: () => listPages(apiUrl),
    lookup: (source, query) => lookupRecords(apiUrl, source, query),
    upload: (file) => uploadImage(apiUrl, file),
    read: async (id) => {
      const stored = await readPage(apiUrl, id);
      etags.set(id, stored?.etag);
      return stored?.document;
    },
    write: async (id, document, { isNew }) => {
      const condition: WriteCondition = isNew
        ? { kind: 'create' }
        : { kind: 'update', etag: etags.get(id) };
      const result = await writePage(apiUrl, id, document, condition);
      if (result.status !== 'saved') {
        throw new Error(writeFailureText(result, isNew));
      }
      etags.set(id, result.etag);
    },
  };
}

function writeFailureText(
  result: Exclude<WriteResult, { readonly status: 'saved' }>,
  isNew: boolean,
): string {
  switch (result.status) {
    case 'pathTaken':
      return 'A different page has this address. Change the address.';
    case 'changed':
      return isNew
        ? 'A document with the same id exists.'
        : 'The document changed after you opened it. Discard your changes to open the new version.';
    case 'rejected':
      return `The server did not save the document. ${result.message}`;
  }
}

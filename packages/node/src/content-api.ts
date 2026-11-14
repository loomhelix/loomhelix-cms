import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PageDocument, Schema } from '@loomhelix-cms/schema';
import { findSaveError, isPageId, readPageBody, summarizePages } from './page-rules.ts';
import { readStoredDocuments, type PageStore } from './page-store.ts';
import { hasBodyType, hasSiteOrigin, readBody } from './request-checks.ts';
import { JSON_TYPE, send, sendNoContent, sendText } from './responses.ts';

export type ContentApi = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
) => Promise<void>;

const PAGES_PATH = '/pages';
const MAX_PAGE_BYTES = 1024 * 1024;

export interface PagePaths {
  readonly read: () => Promise<ReadonlyMap<string, string>>;
  readonly change: (id: string, path: unknown) => void;
}

export function createContentApi(
  schema: Schema,
  store: PageStore,
  pagePaths: PagePaths,
): ContentApi {
  let pendingWrite = Promise.resolve();

  async function listPages(response: ServerResponse): Promise<void> {
    const pages = summarizePages(await readStoredDocuments(store));
    send(response, 200, { 'content-type': JSON_TYPE }, JSON.stringify({ pages }));
  }

  async function getPage(response: ServerResponse, id: string): Promise<void> {
    const text = await store.read(id);
    if (text === undefined) {
      sendText(response, 404, 'The page does not exist.');
      return;
    }
    send(response, 200, { 'content-type': JSON_TYPE, etag: entityTag(text) }, text);
  }

  async function putPage(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
  ): Promise<void> {
    if (!hasSiteOrigin(request)) {
      sendText(response, 403, 'The request must come from a page of this site.');
      return;
    }
    if (!hasBodyType(request, 'application/json')) {
      sendText(response, 415, 'The body must have the type application/json.');
      return;
    }
    const body = await readBody(request, MAX_PAGE_BYTES);
    if (body === undefined) {
      sendText(response, 413, 'The body is larger than 1 MB.');
      return;
    }
    const page = readPageBody(schema, body, id);
    if ('error' in page) {
      sendText(response, 400, page.error);
      return;
    }
    const write = pendingWrite.then(() => savePage(request, response, page.json, page.document));
    pendingWrite = write.catch(() => undefined);
    await write;
  }

  async function savePage(
    request: IncomingMessage,
    response: ServerResponse,
    json: unknown,
    document: PageDocument,
  ): Promise<void> {
    const { id } = document.root;
    const currentText = await store.read(id);
    const saveError = findSaveError({
      conditions: {
        ifMatch: request.headers['if-match'],
        ifNoneMatch: request.headers['if-none-match'],
      },
      currentTag: currentText === undefined ? undefined : entityTag(currentText),
      paths: await pagePaths.read(),
      document,
    });
    if (saveError !== undefined) {
      sendText(response, saveError.status, saveError.message);
      return;
    }
    const text = `${JSON.stringify(json, null, 2)}\n`;
    await store.write(id, text);
    pagePaths.change(id, document.root.props.path);
    sendNoContent(response, { etag: entityTag(text) });
  }

  return async (request, response, path) => {
    if (path === PAGES_PATH) {
      if (request.method !== 'GET') {
        sendText(response, 405, 'This address accepts only GET.', { allow: 'GET' });
        return;
      }
      await listPages(response);
      return;
    }
    const id = path.startsWith(`${PAGES_PATH}/`) ? path.slice(PAGES_PATH.length + 1) : '';
    if (!isPageId(id)) {
      sendText(response, 404, 'The page does not exist.');
      return;
    }
    if (request.method === 'GET') {
      await getPage(response, id);
      return;
    }
    if (request.method === 'PUT') {
      await putPage(request, response, id);
      return;
    }
    sendText(response, 405, 'This address accepts only GET and PUT.', { allow: 'GET, PUT' });
  };
}

function entityTag(text: string): string {
  return `"${createHash('sha256').update(text).digest('base64url')}"`;
}

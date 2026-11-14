import type { IncomingMessage, ServerResponse } from 'node:http';
import { readSchemaSource } from '@loomhelix-cms/cli';
import { createRenderer, type RenderMode, type Template } from '@loomhelix-cms/render-html';
import { currentTypeName, loadDocumentSet, loadRecords, parseSchema } from '@loomhelix-cms/schema';
import { defaultBlockPreviewPage } from './block-preview-page.ts';
import {
  API_PATH,
  CMS_PATH,
  PREVIEW_PATH,
  RECORDS_API_PATH,
  SCHEMA_PATH,
  STORAGE_SCRIPT_PATH,
  UPLOADS_API_PATH,
} from './cms-paths.ts';
import { createContentApi } from './content-api.ts';
import { EDITOR_PAGE } from './editor-page.ts';
import {
  findPageByPath,
  indexPaths,
  rootTypeOf,
  withPagePath,
  type StoredDocument,
} from './page-rules.ts';
import { readStoredDocument, readStoredDocuments, type PageStore } from './page-store.ts';
import { sendPreview } from './preview.ts';
import {
  createRecordsApi,
  findMissingSource,
  readersOf,
  type RecordSources,
} from './records-api.ts';
import { HTML_TYPE, JSON_TYPE, send, sendPage, sendText } from './responses.ts';
import { SCRIPT_FILES, SCRIPT_TYPE, sendScriptFile } from './script-files.ts';
import { storageScript } from './storage-script.ts';
import { createUploadsApi, sendUploadedFile, type UploadStore } from './uploads.ts';

export interface CmsOptions {
  readonly schemaFile: string;
  readonly templates: Readonly<Record<string, Template>>;
  readonly store: PageStore;
  readonly canEdit: (request: IncomingMessage) => boolean | Promise<boolean>;
  readonly blockPreviewPage?: (blockHtml: string) => string;
  readonly records?: RecordSources;
  readonly uploads?: UploadStore;
}

export type Next = (error?: unknown) => void;

export type Handle = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: Next,
) => Promise<void>;

export interface Cms {
  readonly handle: Handle;
  readonly renderBlock: (id: string) => Promise<string | undefined>;
}

type SendFile = (response: ServerResponse) => void | Promise<void>;

interface PathIndex {
  readonly paths: Promise<ReadonlyMap<string, string>>;
  readonly readAt: number;
}

const PATH_INDEX_LIFETIME = 5000;
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

export async function createCms(options: CmsOptions): Promise<Cms> {
  if (typeof options.canEdit !== 'function') {
    throw new TypeError(
      'createCms needs the option "canEdit": a function that tells if a request can use the editor.',
    );
  }
  const schemaJson = await readSchemaSource(process.cwd(), options.schemaFile);
  const schema = parseSchema(schemaJson);
  const recordSources = options.records ?? {};
  const missingSource = findMissingSource(schema, recordSources);
  if (missingSource !== undefined) {
    throw new TypeError(
      `The schema has a record field with the source "${missingSource}". Give createCms the option "records" with the functions lookup and read for "${missingSource}".`,
    );
  }
  const schemaText = JSON.stringify(schemaJson);
  const render = createRenderer(schema, options.templates);
  const blockPreviewPage = options.blockPreviewPage ?? defaultBlockPreviewPage;
  const isBlockDocument = (json: unknown) =>
    schema.blocks.has(currentTypeName(schema, String(rootTypeOf(json))));
  const readShownDocument = async (id: string) =>
    (await readStoredDocument(options.store, id))?.document;
  const recordReaders = readersOf(recordSources);
  const renderDocument = async (json: unknown, mode: RenderMode) => {
    const documents = await loadDocumentSet(schema, json, readShownDocument);
    return render(await loadRecords(schema, documents, recordReaders), mode);
  };
  const renderPreview = async (json: unknown) => {
    const html = await renderDocument(json, 'preview');
    return isBlockDocument(json) ? blockPreviewPage(html) : html;
  };
  let pathIndex: PathIndex | undefined;
  const contentApi = createContentApi(schema, options.store, {
    read: readPathIndex,
    change: (id, path) => {
      if (pathIndex !== undefined) {
        void keepPathIndex(
          pathIndex.paths.then((paths) => withPagePath(paths, id, path)),
          pathIndex.readAt,
        );
      }
    },
  });
  const recordsApi = createRecordsApi(recordSources);
  const uploadsApi = createUploadsApi(options.uploads);
  const uploadedFiles = options.uploads?.files;
  const sendEditorPage: SendFile = (response) =>
    send(response, 200, { 'content-type': HTML_TYPE }, EDITOR_PAGE);
  const editorFiles: ReadonlyMap<string, SendFile> = new Map([
    [CMS_PATH, sendEditorPage],
    [`${CMS_PATH}/`, sendEditorPage],
    [SCHEMA_PATH, (response) => send(response, 200, { 'content-type': JSON_TYPE }, schemaText)],
    [
      STORAGE_SCRIPT_PATH,
      (response) =>
        send(
          response,
          200,
          { 'content-type': SCRIPT_TYPE },
          storageScript(options.uploads !== undefined),
        ),
    ],
    ...[...SCRIPT_FILES].map(([path, script]): [string, SendFile] => [
      path,
      (response) => sendScriptFile(response, script),
    ]),
  ]);

  async function handleCmsRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    if (!(await options.canEdit(request))) {
      sendText(response, 403, 'This request cannot use the editor. Sign in as an editor first.');
      return;
    }
    if (pathname === UPLOADS_API_PATH) {
      await uploadsApi(request, response);
      return;
    }
    if (pathname.startsWith(RECORDS_API_PATH)) {
      await recordsApi(request, response, pathname.slice(RECORDS_API_PATH.length));
      return;
    }
    if (pathname === API_PATH || pathname.startsWith(`${API_PATH}/`)) {
      await contentApi(request, response, pathname.slice(API_PATH.length));
      return;
    }
    if (pathname === PREVIEW_PATH) {
      await sendPreview(renderPreview, request, response);
      return;
    }
    const sendFile = editorFiles.get(pathname);
    if (sendFile === undefined) {
      sendText(response, 404, 'The editor has nothing at this address.');
      return;
    }
    if (request.method !== 'GET') {
      sendText(response, 405, 'This address accepts only GET.', { allow: 'GET' });
      return;
    }
    await sendFile(response);
  }

  function readPathIndex(): Promise<ReadonlyMap<string, string>> {
    const now = Date.now();
    if (pathIndex === undefined || now - pathIndex.readAt >= PATH_INDEX_LIFETIME) {
      return keepPathIndex(readStoredDocuments(options.store).then(indexPaths), now);
    }
    return pathIndex.paths;
  }

  function keepPathIndex(
    paths: Promise<ReadonlyMap<string, string>>,
    readAt: number,
  ): Promise<ReadonlyMap<string, string>> {
    pathIndex = { paths, readAt };
    paths.catch(() => {
      if (pathIndex?.paths === paths) {
        pathIndex = undefined;
      }
    });
    return paths;
  }

  async function findLivePage(pathname: string): Promise<StoredDocument | undefined> {
    const path = decodePath(pathname);
    const id = path === undefined ? undefined : (await readPathIndex()).get(path);
    if (path === undefined || id === undefined) {
      return undefined;
    }
    const page = await readStoredDocument(options.store, id);
    return page === undefined ? undefined : findPageByPath([page], path);
  }

  async function route(request: IncomingMessage, response: ServerResponse, next?: Next) {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === CMS_PATH || pathname.startsWith(`${CMS_PATH}/`)) {
      await handleCmsRequest(request, response, pathname);
      return;
    }
    const isRead = READ_METHODS.has(request.method ?? '');
    if (uploadedFiles !== undefined && isRead && pathname.startsWith(`${uploadedFiles.path}/`)) {
      const name = pathname.slice(uploadedFiles.path.length + 1);
      await sendUploadedFile(request, response, uploadedFiles, name);
      return;
    }
    const page = isRead ? await findLivePage(pathname) : undefined;
    if (page !== undefined) {
      sendPage(response, await renderDocument(page.document, 'live'));
      return;
    }
    if (next === undefined) {
      sendText(response, 404, 'The page does not exist.');
      return;
    }
    next();
  }

  async function renderBlock(id: string): Promise<string | undefined> {
    const text = await options.store.read(id);
    if (text === undefined) {
      return undefined;
    }
    const json: unknown = JSON.parse(text);
    if (!isBlockDocument(json)) {
      throw new TypeError(
        `The document "${id}" is not a block document. renderBlock renders a document with a block type at the root.`,
      );
    }
    return renderDocument(json, 'live');
  }

  return {
    renderBlock,
    handle: async (request, response, next) => {
      try {
        await route(request, response, next);
      } catch (error) {
        if (next !== undefined) {
          next(error);
          return;
        }
        console.error(error);
        if (!response.headersSent) {
          sendText(response, 500, 'The server cannot answer this request.');
        }
      }
    },
  };
}

function decodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

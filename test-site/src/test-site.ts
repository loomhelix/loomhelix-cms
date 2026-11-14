import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCms,
  createFolderStore,
  createFolderUploads,
  type Cms,
  type RecordQuery,
  type RecordSource,
} from '@loomhelix-cms/node';
import schema from '../site/blocks.ts';
import { products } from '../site/products.ts';
import { templates } from '../site/templates.ts';
import {
  NOTICE_EDITOR_PAGE,
  NOTICE_EDITOR_PATH,
  NOTICE_ID,
  VISIT_PATH,
  visitPage,
} from './site-pages.ts';

export interface TestSite {
  readonly origin: string;
  readonly pagesFolder: string;
  readonly close: () => Promise<void>;
}

export type SchemaChange = (schema: Record<string, any>) => unknown;

const HOST = '127.0.0.1';
const PAGES_FOLDER = fileURLToPath(new URL('../site/pages', import.meta.url));
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
};

const productsWithIds = (ids: readonly string[]) => products.filter(({ id }) => ids.includes(id));

const productsWithText = (text: string) =>
  products.filter(({ name }) => name.toLowerCase().includes(text.toLowerCase()));

const productSource: RecordSource = {
  lookup: async (query: RecordQuery) =>
    ('ids' in query ? productsWithIds(query.ids) : productsWithText(query.text)).map(
      ({ id, name }) => ({ id, label: name }),
    ),
  read: async (ids) => productsWithIds(ids),
};

export async function startTestSite(changeSchema?: SchemaChange): Promise<TestSite> {
  const siteFolder = await mkdtemp(join(tmpdir(), 'lhcms-test-site-'));
  const pagesFolder = join(siteFolder, 'pages');
  const schemaFile = join(siteFolder, 'blocks.json');
  await cp(PAGES_FOLDER, pagesFolder, { recursive: true });
  await writeFile(
    schemaFile,
    JSON.stringify(changeSchema === undefined ? schema : changeSchema(structuredClone(schema))),
  );
  const cms = await createCms({
    schemaFile,
    templates,
    store: createFolderStore(pagesFolder),
    canEdit: () => true,
    records: { products: productSource },
    uploads: createFolderUploads(join(siteFolder, 'uploads'), '/uploads'),
  });
  const server = createServer((request, response) => {
    void handle(cms, request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  return {
    origin: `http://${HOST}:${typeof address === 'object' && address !== null ? address.port : 0}`,
    pagesFolder,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      await rm(siteFolder, { recursive: true, force: true });
    },
  };
}

async function handle(cms: Cms, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && pathname === VISIT_PATH) {
    response.writeHead(200, PAGE_HEADERS).end(visitPage((await cms.renderBlock(NOTICE_ID)) ?? ''));
    return;
  }
  if (request.method === 'GET' && pathname === NOTICE_EDITOR_PATH) {
    response.writeHead(200, PAGE_HEADERS).end(NOTICE_EDITOR_PAGE);
    return;
  }
  await cms.handle(request, response);
}

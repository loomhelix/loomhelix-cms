import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { html, type Template } from '@loomhelix-cms/render-html';
import {
  createCms,
  createFolderStore,
  type Cms,
  type CmsOptions,
  type Next,
} from '../src/index.ts';

export interface TestSite {
  readonly cms: Cms;
  readonly origin: string;
  readonly pagesFolder: string;
  readonly close: () => Promise<void>;
}

export const SCHEMA = {
  formatVersion: 0,
  pages: { Landing: { version: 1, slots: { main: { allow: ['Text'] } } } },
  blocks: { Text: { version: 1, oldNames: ['Note'], fields: { body: { type: 'text' } } } },
};

export const TEMPLATES = {
  Landing: ({ props, slots }) =>
    html`<html>
      <head>
        <title>${props.title}</title>
      </head>
      <body>
        ${slots.main}
      </body>
    </html>`,
  Text: ({ props }) => html`<p>${props.body}</p>`,
} satisfies Readonly<Record<string, Template>>;

export function pageDocument(id: string, path: string, title = `Page ${id}`) {
  return {
    formatVersion: 0,
    root: { id, type: 'Landing', version: 1, props: { title, path }, slots: {} },
  };
}

export async function startTestSite({
  options = {},
  withNext = false,
  siteHeaders = {},
  schema = SCHEMA,
}: {
  readonly options?: Partial<CmsOptions>;
  readonly withNext?: boolean;
  readonly siteHeaders?: Readonly<Record<string, string>>;
  readonly schema?: unknown;
} = {}): Promise<TestSite> {
  const folder = await mkdtemp(join(tmpdir(), 'lhcms-node-'));
  const pagesFolder = join(folder, 'pages');
  await mkdir(pagesFolder);
  await writeFile(join(folder, 'blocks.json'), JSON.stringify(schema));
  await writeFile(join(pagesFolder, 'home.json'), JSON.stringify(pageDocument('home', '/')));
  const cms = await createCms({
    schemaFile: join(folder, 'blocks.json'),
    templates: TEMPLATES,
    store: createFolderStore(pagesFolder),
    canEdit: () => true,
    ...options,
  }).catch(async (error: unknown) => {
    await rm(folder, { recursive: true, force: true });
    throw error;
  });
  const server = createServer((request, response) => {
    for (const [name, value] of Object.entries(siteHeaders)) {
      response.setHeader(name, value);
    }
    void cms.handle(request, response, withNext ? nextFor(response) : undefined);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`,
    cms,
    pagesFolder,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      await rm(folder, { recursive: true, force: true });
    },
  };
}

function nextFor(response: ServerResponse): Next {
  return (error) => {
    response.writeHead(error === undefined ? 200 : 500, { 'content-type': 'text/plain' });
    response.end(error instanceof Error ? `next: ${error.message}` : 'next');
  };
}

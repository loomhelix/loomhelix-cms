import { DocumentError, loadDocument, type PageDocument, type Schema } from '@loomhelix-cms/schema';

export interface StoredDocument {
  readonly id: string;
  readonly document: unknown;
}

export interface PageSummary {
  readonly id: string;
  readonly type: unknown;
  readonly title: unknown;
  readonly path: unknown;
}

export type PageBody =
  | { readonly json: unknown; readonly document: PageDocument }
  | { readonly error: string };

export interface SaveConditions {
  readonly ifMatch: string | undefined;
  readonly ifNoneMatch: string | undefined;
}

export interface SaveError {
  readonly status: 409 | 412;
  readonly message: string;
}

const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isPageId(text: string): boolean {
  return PAGE_ID_PATTERN.test(text);
}

export function summarizePages(pages: readonly StoredDocument[]): PageSummary[] {
  return pages
    .map(({ id, document }) => ({
      id,
      type: rootTypeOf(document),
      title: rootProp(document, 'title'),
      path: pathOf(document),
    }))
    .toSorted((first, second) => String(first.path).localeCompare(String(second.path)));
}

export function readPageBody(schema: Schema, body: string, id: string): PageBody {
  let json: unknown;
  let document: PageDocument;
  try {
    json = JSON.parse(body);
    document = loadDocument(schema, json).document;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DocumentError) {
      return { error: error.message };
    }
    throw error;
  }
  if (document.root.id !== id) {
    return {
      error: `The root block has the id "${document.root.id}", but the address has the page id "${id}".`,
    };
  }
  return { json, document };
}

export function findSaveError({
  conditions,
  currentTag,
  paths,
  document,
}: {
  readonly conditions: SaveConditions;
  readonly currentTag: string | undefined;
  readonly paths: ReadonlyMap<string, string>;
  readonly document: PageDocument;
}): SaveError | undefined {
  if (isOutdated(conditions, currentTag)) {
    return {
      status: 412,
      message: 'The page changed after the editor read it, or it exists already.',
    };
  }
  const { id } = document.root;
  const path = document.root.props.path;
  if (typeof path !== 'string') {
    return undefined;
  }
  const pageWithPath = paths.get(path);
  if (pageWithPath !== undefined && pageWithPath !== id) {
    return {
      status: 409,
      message: `The page "${pageWithPath}" has the path ${path} already.`,
    };
  }
  return undefined;
}

export function indexPaths(pages: readonly StoredDocument[]): ReadonlyMap<string, string> {
  const paths = new Map<string, string>();
  for (const page of pages) {
    const path = pathOf(page.document);
    if (typeof path === 'string' && !paths.has(path)) {
      paths.set(path, page.id);
    }
  }
  return paths;
}

export function withPagePath(
  paths: ReadonlyMap<string, string>,
  id: string,
  path: unknown,
): ReadonlyMap<string, string> {
  const otherPaths = new Map([...paths].filter(([, pageId]) => pageId !== id));
  if (typeof path === 'string' && !otherPaths.has(path)) {
    otherPaths.set(path, id);
  }
  return otherPaths;
}

export function findPageByPath(
  pages: readonly StoredDocument[],
  path: string,
): StoredDocument | undefined {
  return pages.find((page) => pathOf(page.document) === path);
}

export function rootTypeOf(document: unknown): unknown {
  return propertyOf(propertyOf(document, 'root'), 'type');
}

function pathOf(document: unknown): unknown {
  return rootProp(document, 'path');
}

function rootProp(document: unknown, name: string): unknown {
  const root = propertyOf(document, 'root');
  return propertyOf(propertyOf(root, 'props'), name);
}

function propertyOf(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null
    ? Object.getOwnPropertyDescriptor(value, name)?.value
    : undefined;
}

function isOutdated({ ifMatch, ifNoneMatch }: SaveConditions, currentTag: string | undefined) {
  if (ifNoneMatch === '*' && currentTag !== undefined) {
    return true;
  }
  return ifMatch !== undefined && ifMatch !== currentTag;
}

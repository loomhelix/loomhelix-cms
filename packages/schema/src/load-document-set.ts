import { isBlockReference } from './block-reference.ts';
import { loadDocument } from './load-document.ts';
import { DocumentError, MAX_BLOCK_LEVEL } from './read-document.ts';
import type {
  Block,
  BlockError,
  BlockErrorCode,
  BlockReference,
  LoadResult,
  Schema,
} from './types.ts';

export interface DocumentSet {
  readonly main: LoadResult;
  readonly shown: ReadonlyMap<string, LoadResult>;
}

type StoredDocument =
  | { readonly status: 'missing' }
  | { readonly status: 'rejected'; readonly message: string }
  | { readonly status: 'loaded'; readonly result: LoadResult };

interface PlacedReference {
  readonly reference: BlockReference;
  readonly level: number;
}

interface CheckedReference extends PlacedReference {
  readonly from: string;
  readonly error: BlockError | undefined;
}

const ROOT_LEVEL = 1;

export async function loadDocumentSet(
  schema: Schema,
  json: unknown,
  read: (id: string) => Promise<unknown>,
): Promise<DocumentSet> {
  const main = loadDocument(schema, json);
  const mainId = main.document.root.id;
  const stored = await readShownDocuments(schema, main, read);
  const loaded = new Map(
    [...stored].flatMap(([id, document]) =>
      document.status === 'loaded' ? [[id, document.result] as const] : [],
    ),
  );
  const references = checkLevels(loaded, checkLoops(checkDocuments(loaded, stored)));
  const withReferenceErrors = (id: string, result: LoadResult): LoadResult => ({
    document: result.document,
    errors: [
      ...result.errors,
      ...references.flatMap(({ from, error }) =>
        from === id && error !== undefined ? [error] : [],
      ),
    ],
  });
  const validReferences = references.filter(({ error }) => error === undefined);
  return {
    main: withReferenceErrors(mainId, main),
    shown: new Map(
      reachableIds(targetsOf(validReferences), mainId).flatMap((id) => {
        const result = loaded.get(id);
        return id === mainId || result === undefined
          ? []
          : [[id, withReferenceErrors(id, result)] as const];
      }),
    ),
  };
}

async function readShownDocuments(
  schema: Schema,
  main: LoadResult,
  read: (id: string) => Promise<unknown>,
): Promise<ReadonlyMap<string, StoredDocument>> {
  const stored = new Map<string, StoredDocument>([
    [main.document.root.id, { status: 'loaded', result: main }],
  ]);
  let results: readonly LoadResult[] = [main];
  while (results.length > 0) {
    const newIds = new Set(
      results
        .flatMap((result) => referencesOf(result).map(({ reference }) => reference.document))
        .filter((id) => !stored.has(id)),
    );
    const documents = await Promise.all(
      [...newIds].map(async (id) => [id, storedDocument(schema, await read(id))] as const),
    );
    documents.forEach(([id, document]) => stored.set(id, document));
    results = documents.flatMap(([, document]) =>
      document.status === 'loaded' ? [document.result] : [],
    );
  }
  return stored;
}

function storedDocument(schema: Schema, json: unknown): StoredDocument {
  if (json === undefined) {
    return { status: 'missing' };
  }
  try {
    return { status: 'loaded', result: loadDocument(schema, json) };
  } catch (error) {
    if (error instanceof DocumentError) {
      return { status: 'rejected', message: error.message };
    }
    throw error;
  }
}

function referencesOf({ document, errors }: LoadResult): PlacedReference[] {
  const invalidIds = new Set(errors.map(({ blockId }) => blockId));
  const walk = (item: Block | BlockReference, level: number): PlacedReference[] => {
    if (invalidIds.has(item.id)) {
      return [];
    }
    if (isBlockReference(item)) {
      return [{ reference: item, level }];
    }
    return Object.values(item.slots ?? {}).flatMap((items) =>
      items.flatMap((child) => walk(child, level + 1)),
    );
  };
  return walk(document.root, ROOT_LEVEL);
}

function checkDocuments(
  loaded: ReadonlyMap<string, LoadResult>,
  stored: ReadonlyMap<string, StoredDocument>,
): CheckedReference[] {
  return [...loaded].flatMap(([from, result]) =>
    referencesOf(result).map((placed) => ({
      ...placed,
      from,
      error: findDocumentError(placed.reference, stored.get(placed.reference.document)),
    })),
  );
}

function findDocumentError(
  reference: BlockReference,
  stored: StoredDocument | undefined,
): BlockError | undefined {
  const shows = `shows the document "${reference.document}"`;
  if (stored === undefined || stored.status === 'missing') {
    return referenceError(
      reference,
      'missingDocument',
      `${shows}, but the document does not exist.`,
    );
  }
  if (stored.status === 'rejected') {
    return referenceError(
      reference,
      'invalidReference',
      `${shows}, but the load rejects the document. ${stored.message}`,
    );
  }
  const { root } = stored.result.document;
  const rootError = stored.result.errors.find(({ blockId }) => blockId === root.id);
  if (rootError !== undefined) {
    return referenceError(
      reference,
      'invalidReference',
      `${shows}, but the root block of the document is invalid. ${rootError.message}`,
    );
  }
  if (root.type !== reference.type) {
    return referenceError(
      reference,
      'invalidReference',
      `has the type "${reference.type}", but the root block of the document "${reference.document}" has the type "${root.type}".`,
    );
  }
  return undefined;
}

function checkLoops(references: readonly CheckedReference[]): CheckedReference[] {
  const targets = targetsOf(references.filter(({ error }) => error === undefined));
  return references.map((checked) =>
    checked.error === undefined &&
    reachableIds(targets, checked.reference.document).includes(checked.from)
      ? { ...checked, error: loopError(checked) }
      : checked,
  );
}

function loopError({ from, reference }: CheckedReference): BlockError {
  const to = reference.document;
  const loop =
    from === to
      ? `shows "${to}", the document of this block.`
      : `shows "${to}", but "${to}" shows "${from}", the document of this block.`;
  return referenceError(reference, 'cyclicReference', `${loop} A document cannot show itself.`);
}

function checkLevels(
  loaded: ReadonlyMap<string, LoadResult>,
  references: readonly CheckedReference[],
): CheckedReference[] {
  const depths = findDepths(
    loaded,
    references.filter(({ error }) => error === undefined),
  );
  return references.map((checked) => {
    const level = shownLevel(checked, depths);
    return checked.error === undefined && level > MAX_BLOCK_LEVEL
      ? { ...checked, error: levelError(checked, level) }
      : checked;
  });
}

function levelError({ from, reference }: CheckedReference, level: number): BlockError {
  return referenceError(
    reference,
    'tooManyLevels',
    `shows "${reference.document}", and then the blocks of "${from}" go to level ${level}. A document with its shown documents can have no more than ${MAX_BLOCK_LEVEL} levels of blocks.`,
  );
}

function findDepths(
  loaded: ReadonlyMap<string, LoadResult>,
  references: readonly CheckedReference[],
): ReadonlyMap<string, number> {
  const outgoing = groupedBy(references, ({ from }) => from);
  const incoming = groupedBy(references, ({ reference }) => reference.document);
  const pendingCounts = new Map(
    [...loaded.keys()].map((id) => [id, outgoing.get(id)?.length ?? 0]),
  );
  const depths = new Map<string, number>();
  const ready = [...pendingCounts].flatMap(([id, count]) => (count === 0 ? [id] : []));
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    const root = loaded.get(id)?.document.root;
    depths.set(
      id,
      (outgoing.get(id) ?? [])
        .map((checked) => shownLevel(checked, depths))
        .filter((level) => level <= MAX_BLOCK_LEVEL)
        .reduce(
          (depth, level) => Math.max(depth, level),
          root === undefined ? ROOT_LEVEL : lowestLevel(root, ROOT_LEVEL),
        ),
    );
    for (const { from } of incoming.get(id) ?? []) {
      const count = (pendingCounts.get(from) ?? 0) - 1;
      pendingCounts.set(from, count);
      if (count === 0) {
        ready.push(from);
      }
    }
  }
  return depths;
}

function shownLevel(
  { level, reference }: CheckedReference,
  depths: ReadonlyMap<string, number>,
): number {
  return level - 1 + (depths.get(reference.document) ?? ROOT_LEVEL);
}

function lowestLevel(item: Block | BlockReference, level: number): number {
  if (isBlockReference(item)) {
    return level;
  }
  return Object.values(item.slots ?? {})
    .flat()
    .reduce((lowest, child) => Math.max(lowest, lowestLevel(child, level + 1)), level);
}

function groupedBy<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
): ReadonlyMap<string, readonly Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group === undefined) {
      groups.set(keyOf(item), [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

function targetsOf(
  references: readonly CheckedReference[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...groupedBy(references, ({ from }) => from)].map(([from, outgoing]) => [
      from,
      outgoing.map(({ reference }) => reference.document),
    ]),
  );
}

function reachableIds(targets: ReadonlyMap<string, readonly string[]>, start: string): string[] {
  const reached = new Set<string>();
  const pending = [...(targets.get(start) ?? [])];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (id !== undefined && !reached.has(id)) {
      reached.add(id);
      pending.push(...(targets.get(id) ?? []));
    }
  }
  return [...reached];
}

function referenceError(
  reference: BlockReference,
  code: BlockErrorCode,
  reason: string,
): BlockError {
  return { blockId: reference.id, code, message: `The block "${reference.id}" ${reason}` };
}

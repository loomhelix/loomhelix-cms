import { isBlockReference } from './block-reference.ts';
import type { DocumentSet } from './load-document-set.ts';
import type {
  Block,
  BlockError,
  BlockReference,
  LoadResult,
  RecordField,
  Schema,
  TypeDefinition,
} from './types.ts';

export type SiteRecord = { readonly id: string } & Readonly<Record<string, unknown>>;

export type RecordReader = (ids: readonly string[]) => Promise<readonly { readonly id: string }[]>;

export type RecordReaders = Readonly<Record<string, RecordReader>>;

type RecordsBySource = ReadonlyMap<string, ReadonlyMap<string, SiteRecord>>;

interface PlacedBlock {
  readonly block: Block;
  readonly isRoot: boolean;
}

interface RecordValue {
  readonly name: string;
  readonly field: RecordField;
  readonly id: string | undefined;
}

type BlockChange = { readonly block: Block } | { readonly error: BlockError };

export async function loadRecords(
  schema: Schema,
  set: DocumentSet,
  readers: RecordReaders,
): Promise<DocumentSet> {
  const sourceReaders = readersOf(schema, readers);
  const ids = idsBySource(schema, [set.main, ...set.shown.values()]);
  const records = await readRecords(sourceReaders, ids);
  return {
    main: withRecords(schema, set.main, records),
    shown: new Map(
      [...set.shown].map(([id, result]) => [id, withRecords(schema, result, records)] as const),
    ),
  };
}

function readersOf(schema: Schema, readers: RecordReaders): ReadonlyMap<string, RecordReader> {
  const sources = [...schema.pages.values(), ...schema.blocks.values()].flatMap((type) =>
    recordFieldsOf(type).map(({ field }) => field.source),
  );
  return new Map(
    sources.map((source) => {
      const reader = Object.hasOwn(readers, source) ? readers[source] : undefined;
      if (reader === undefined) {
        throw new TypeError(
          `The schema has record fields with the source "${source}". Give loadRecords a reader for "${source}".`,
        );
      }
      return [source, reader] as const;
    }),
  );
}

function recordFieldsOf(
  type: TypeDefinition,
): { readonly name: string; readonly field: RecordField }[] {
  return [...type.fields].flatMap(([name, field]) =>
    field.type === 'record' ? [{ name, field }] : [],
  );
}

function validBlocks(result: LoadResult): PlacedBlock[] {
  const invalidIds = new Set(result.errors.map(({ blockId }) => blockId));
  const walk = (item: Block | BlockReference, isRoot: boolean): PlacedBlock[] =>
    isBlockReference(item) || invalidIds.has(item.id)
      ? []
      : [
          { block: item, isRoot },
          ...Object.values(item.slots ?? {}).flatMap((items) =>
            items.flatMap((child) => walk(child, false)),
          ),
        ];
  return walk(result.document.root, true);
}

function recordValuesOf(schema: Schema, { block, isRoot }: PlacedBlock): RecordValue[] {
  const type = (isRoot ? schema.pages.get(block.type) : undefined) ?? schema.blocks.get(block.type);
  return (type === undefined ? [] : recordFieldsOf(type)).map(({ name, field }) => {
    const value = Object.hasOwn(block.props, name) ? block.props[name] : undefined;
    return { name, field, id: typeof value === 'string' ? value : undefined };
  });
}

function idsBySource(
  schema: Schema,
  results: readonly LoadResult[],
): ReadonlyMap<string, readonly string[]> {
  const ids = new Map<string, Set<string>>();
  for (const placed of results.flatMap(validBlocks)) {
    for (const { field, id } of recordValuesOf(schema, placed)) {
      if (id !== undefined) {
        ids.set(field.source, (ids.get(field.source) ?? new Set()).add(id));
      }
    }
  }
  return new Map([...ids].map(([source, sourceIds]) => [source, [...sourceIds]] as const));
}

async function readRecords(
  readers: ReadonlyMap<string, RecordReader>,
  ids: ReadonlyMap<string, readonly string[]>,
): Promise<RecordsBySource> {
  const entries = await Promise.all(
    [...readers].map(async ([source, reader]) => {
      const sourceIds = ids.get(source) ?? [];
      const records = sourceIds.length === 0 ? [] : await reader(sourceIds);
      return [source, recordsById(source, records)] as const;
    }),
  );
  return new Map(entries);
}

function recordsById(source: string, records: readonly unknown[]): ReadonlyMap<string, SiteRecord> {
  return new Map(
    records.map((record) => {
      if (!isSiteRecord(record)) {
        throw new TypeError(
          `The reader of the record source "${source}" must give objects with an "id" string.`,
        );
      }
      return [record.id, record] as const;
    }),
  );
}

function isSiteRecord(value: unknown): value is SiteRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly id?: unknown }).id === 'string'
  );
}

function withRecords(schema: Schema, result: LoadResult, records: RecordsBySource): LoadResult {
  const changes = validBlocks(result).flatMap((placed) => {
    const values = recordValuesOf(schema, placed);
    return values.length === 0 ? [] : [changeBlock(placed.block, values, records)];
  });
  const blocks = new Map(
    changes.flatMap((change) => ('block' in change ? [[change.block.id, change.block]] : [])),
  );
  return {
    document: { ...result.document, root: replaceBlocks(result.document.root, blocks) },
    errors: [
      ...result.errors,
      ...changes.flatMap((change) => ('error' in change ? [change.error] : [])),
    ],
  };
}

function changeBlock(
  block: Block,
  values: readonly RecordValue[],
  records: RecordsBySource,
): BlockChange {
  const recordOf = ({ field, id }: RecordValue) =>
    id === undefined ? undefined : records.get(field.source)?.get(id);
  const missing = values.find(
    (value) => !value.field.optional && value.id !== undefined && recordOf(value) === undefined,
  );
  if (missing !== undefined) {
    return { error: missingRecordError(block, missing) };
  }
  const names = new Set(values.map(({ name }) => name));
  const props = Object.fromEntries([
    ...Object.entries(block.props).filter(([name]) => !names.has(name)),
    ...values.flatMap((value) => {
      const record = recordOf(value);
      return record === undefined ? [] : [[value.name, record] as const];
    }),
  ]);
  return { block: { ...block, props } };
}

function replaceBlocks(block: Block, replacements: ReadonlyMap<string, Block>): Block {
  const replaced = replacements.get(block.id) ?? block;
  if (replaced.slots === undefined) {
    return replaced;
  }
  return {
    ...replaced,
    slots: Object.fromEntries(
      Object.entries(replaced.slots).map(([slotName, items]) => [
        slotName,
        items.map((item) => (isBlockReference(item) ? item : replaceBlocks(item, replacements))),
      ]),
    ),
  };
}

function missingRecordError(block: Block, { name, field, id }: RecordValue): BlockError {
  return {
    blockId: block.id,
    code: 'missingRecord',
    message: `The block "${block.id}" has the record "${id}" of the source "${field.source}" in the field "${name}", but the site has no record with this id.`,
  };
}

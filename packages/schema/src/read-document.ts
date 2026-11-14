import { isBlockReference } from './block-reference.ts';
import { describeValue, isRecord } from './json-values.ts';
import type { Block, BlockReference, PageDocument } from './types.ts';

const FORMAT_VERSION = 0;
const DOCUMENT_PROPERTIES: ReadonlySet<string> = new Set(['formatVersion', 'root']);
const BLOCK_PROPERTIES: ReadonlySet<string> = new Set(['id', 'type', 'version', 'props', 'slots']);
const REFERENCE_PROPERTIES: ReadonlySet<string> = new Set(['id', 'type', 'document']);
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const MAX_BLOCK_LEVEL = 32;
const ROOT_LEVEL = 1;

export class DocumentError extends Error {
  override readonly name = 'DocumentError';
}

export function readDocument(json: unknown): PageDocument {
  if (!isRecord(json)) {
    throw new DocumentError(`The page document must be an object, got ${describeValue(json)}.`);
  }
  failOnUnknownProperty(json, DOCUMENT_PROPERTIES, 'page document');
  if (json.formatVersion !== FORMAT_VERSION) {
    throw new DocumentError(
      `The page document has "formatVersion" ${describeValue(json.formatVersion)}, but this version of @loomhelix-cms/schema reads format version ${FORMAT_VERSION}.`,
    );
  }
  const root = readBlock(json.root, 'root block', ROOT_LEVEL);
  const repeatedId = findRepeatedId(root);
  if (repeatedId !== undefined) {
    throw new DocumentError(
      `The id "${repeatedId}" occurs more than one time in the page document. Give each block a unique id.`,
    );
  }
  return { formatVersion: FORMAT_VERSION, root };
}

function readSlotItem(value: unknown, where: string, level: number): Block | BlockReference {
  return isRecord(value) && Object.hasOwn(value, 'document')
    ? readReference(value, where, level)
    : readBlock(value, where, level);
}

function readReference(
  value: Readonly<Record<string, unknown>>,
  where: string,
  level: number,
): BlockReference {
  failOnDeepLevel(where, level);
  failOnUnknownProperty(value, REFERENCE_PROPERTIES, where);
  const id = readId(value.id, where);
  const type = readType(value.type, id);
  if (typeof value.document !== 'string' || !ID_PATTERN.test(value.document)) {
    throw new DocumentError(
      `The block "${id}" must have a "document" of letters, digits, hyphens, and underscores, got ${describeValue(value.document)}.`,
    );
  }
  return { id, type, document: value.document };
}

function readBlock(value: unknown, where: string, level: number): Block {
  failOnDeepLevel(where, level);
  if (!isRecord(value)) {
    throw new DocumentError(`The ${where} must be an object, got ${describeValue(value)}.`);
  }
  failOnUnknownProperty(value, BLOCK_PROPERTIES, where);
  const { version, props, slots } = value;
  const id = readId(value.id, where);
  const type = readType(value.type, id);
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DocumentError(
      `The block "${id}" must have a "version" that is an integer of 1 or more, got ${describeValue(version)}.`,
    );
  }
  if (!isRecord(props)) {
    throw new DocumentError(
      `The block "${id}" must have "props" that are an object, got ${describeValue(props)}.`,
    );
  }
  const block = { id, type, version, props };
  return slots === undefined ? block : { ...block, slots: readSlots(slots, id, level) };
}

function failOnDeepLevel(where: string, level: number): void {
  if (level > MAX_BLOCK_LEVEL) {
    throw new DocumentError(
      `The ${where} is at level ${level}, but a page document can have no more than ${MAX_BLOCK_LEVEL} levels of blocks.`,
    );
  }
}

function readId(id: unknown, where: string): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new DocumentError(
      `The ${where} must have an "id" of letters, digits, hyphens, and underscores, got ${describeValue(id)}.`,
    );
  }
  return id;
}

function readType(type: unknown, id: string): string {
  if (typeof type !== 'string' || type === '') {
    throw new DocumentError(
      `The block "${id}" must have a non-empty "type", got ${describeValue(type)}.`,
    );
  }
  return type;
}

function readSlots(value: unknown, blockId: string, level: number): NonNullable<Block['slots']> {
  if (!isRecord(value)) {
    throw new DocumentError(
      `The block "${blockId}" must have "slots" that are an object, got ${describeValue(value)}.`,
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([slotName, blocks]) => {
      if (!Array.isArray(blocks)) {
        throw new DocumentError(
          `The slot "${slotName}" of the block "${blockId}" must be a list of blocks, got ${describeValue(blocks)}.`,
        );
      }
      return [
        slotName,
        blocks.map((block: unknown, index) =>
          readSlotItem(
            block,
            `block ${index + 1} in the slot "${slotName}" of the block "${blockId}"`,
            level + 1,
          ),
        ),
      ];
    }),
  );
}

function failOnUnknownProperty(
  object: Readonly<Record<string, unknown>>,
  knownProperties: ReadonlySet<string>,
  where: string,
): void {
  const unknownProperty = Object.keys(object).find((property) => !knownProperties.has(property));
  if (unknownProperty !== undefined) {
    throw new DocumentError(`The ${where} has the unknown property "${unknownProperty}".`);
  }
}

function findRepeatedId(root: Block): string | undefined {
  const seenIds = new Set<string>();
  for (const id of collectIds(root)) {
    if (seenIds.has(id)) {
      return id;
    }
    seenIds.add(id);
  }
  return undefined;
}

function collectIds(item: Block | BlockReference): string[] {
  if (isBlockReference(item)) {
    return [item.id];
  }
  const childIds = Object.values(item.slots ?? {}).flatMap((items) => items.flatMap(collectIds));
  return [item.id, ...childIds];
}

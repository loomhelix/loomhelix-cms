import { isBlockReference } from './block-reference.ts';
import { migrateBlock } from './migrate.ts';
import { PAGE_FIELD_RULES } from './page-fields.ts';
import { fieldRule, findPropsError, type PropRule } from './props.ts';
import { readDocument } from './read-document.ts';
import type {
  Block,
  BlockError,
  BlockErrorCode,
  BlockReference,
  LoadResult,
  Schema,
  SlotDefinition,
  TypeDefinition,
} from './types.ts';

interface Placement {
  readonly types: ReadonlyMap<string, TypeDefinition>;
  readonly typeKind: 'page type' | 'block type' | 'page type or block type';
  readonly allow: readonly string[] | undefined;
  readonly builtInRules: ReadonlyMap<string, PropRule>;
}

interface Loaded<Item> {
  readonly block: Item;
  readonly errors: readonly BlockError[];
}

type TypeLookup =
  | { readonly status: 'found'; readonly typeName: string; readonly type: TypeDefinition }
  | { readonly status: 'invalid'; readonly code: BlockErrorCode; readonly reason: string };

export function loadDocument(schema: Schema, json: unknown): LoadResult {
  const document = readDocument(json);
  const placement = rootPlacement(schema, currentTypeName(schema, document.root.type));
  const { block, errors } = loadBlock(schema, document.root, placement);
  return { document: { ...document, root: block }, errors };
}

function rootPlacement(schema: Schema, typeName: string): Placement {
  if (schema.blocks.has(typeName)) {
    return {
      types: schema.blocks,
      typeKind: 'block type',
      allow: undefined,
      builtInRules: new Map(),
    };
  }
  return {
    types: schema.pages,
    typeKind: 'page type or block type',
    allow: undefined,
    builtInRules: PAGE_FIELD_RULES,
  };
}

export function currentTypeName(schema: Schema, typeName: string): string {
  return schema.renamedTypes.get(typeName) ?? typeName;
}

function findType(schema: Schema, typeName: string, placement: Placement): TypeLookup {
  const currentName = currentTypeName(schema, typeName);
  const type = placement.types.get(currentName);
  if (type === undefined) {
    return {
      status: 'invalid',
      code: 'unknownType',
      reason: unknownTypeReason(schema, typeName, placement),
    };
  }
  if (placement.allow !== undefined && !placement.allow.includes(currentName)) {
    return {
      status: 'invalid',
      code: 'notAllowed',
      reason: `has the type "${currentName}", but its slot allows only ${quoteNames(placement.allow)}.`,
    };
  }
  return { status: 'found', typeName: currentName, type };
}

function loadSlotItem(
  schema: Schema,
  item: Block | BlockReference,
  placement: Placement,
): Loaded<Block | BlockReference> {
  return isBlockReference(item)
    ? loadReference(schema, item, placement)
    : loadBlock(schema, item, placement);
}

function loadReference(
  schema: Schema,
  reference: BlockReference,
  placement: Placement,
): Loaded<BlockReference> {
  const lookup = findType(schema, reference.type, placement);
  if (lookup.status === 'invalid') {
    return invalid(reference, lookup.code, lookup.reason);
  }
  return { block: { ...reference, type: lookup.typeName }, errors: [] };
}

function loadBlock(schema: Schema, block: Block, placement: Placement): Loaded<Block> {
  const lookup = findType(schema, block.type, placement);
  if (lookup.status === 'invalid') {
    return invalid(block, lookup.code, lookup.reason);
  }
  const { typeName, type } = lookup;
  if (block.version > type.version) {
    return invalid(
      block,
      'newerVersion',
      `has version ${block.version}, but the schema has version ${type.version} of "${typeName}". Update the schema or the program that reads the document.`,
    );
  }
  const migration = migrateBlock(type, block);
  if (migration.status === 'failed') {
    return invalid(block, 'migrationFailed', migration.error);
  }
  const rules = new Map([...placement.builtInRules, ...fieldRules(type)]);
  const propsError = findPropsError(rules, migration.props);
  if (propsError !== undefined) {
    return invalid(block, 'invalidProps', propsError);
  }
  const loaded = { id: block.id, type: typeName, version: type.version, props: migration.props };
  const unknownSlotName = Object.keys(migration.slots ?? {}).find((name) => !type.slots.has(name));
  if (unknownSlotName !== undefined) {
    return invalid(
      block,
      'unknownSlot',
      `has the slot "${unknownSlotName}", but the type "${typeName}" does not define this slot.`,
    );
  }
  const keptSlots = Object.entries(migration.slots ?? {}).map(
    ([slotName, children]) =>
      [slotName, children.filter((child) => !schema.removedTypes.has(child.type))] as const,
  );
  const countError = findBlockCountError(type, new Map(keptSlots));
  if (countError !== undefined) {
    return invalid(block, 'invalidBlockCount', countError);
  }
  if (migration.slots === undefined) {
    return { block: loaded, errors: [] };
  }
  const loadedSlots = keptSlots.map(([slotName, children]) => {
    const childPlacement: Placement = {
      types: schema.blocks,
      typeKind: 'block type',
      allow: type.slots.get(slotName)?.allow ?? [],
      builtInRules: new Map(),
    };
    return [
      slotName,
      children.map((child) => loadSlotItem(schema, child, childPlacement)),
    ] as const;
  });
  return {
    block: {
      ...loaded,
      slots: Object.fromEntries(
        loadedSlots.map(([slotName, children]) => [slotName, children.map((child) => child.block)]),
      ),
    },
    errors: loadedSlots.flatMap(([, children]) => children.flatMap((child) => child.errors)),
  };
}

function findBlockCountError(
  type: TypeDefinition,
  slots: ReadonlyMap<string, readonly (Block | BlockReference)[]>,
): string | undefined {
  for (const [slotName, slot] of type.slots) {
    const count = slots.get(slotName)?.length ?? 0;
    if (count < (slot.min ?? 0) || count > (slot.max ?? Infinity)) {
      return `has ${count} ${count === 1 ? 'block' : 'blocks'} in the slot "${slotName}", but the slot allows ${describeLimits(slot)}.`;
    }
  }
  return undefined;
}

function describeLimits({ min, max }: SlotDefinition): string {
  if (min === max) {
    return `exactly ${min} ${min === 1 ? 'block' : 'blocks'}`;
  }
  if (max === undefined) {
    return `${min} or more blocks`;
  }
  if (min === undefined) {
    return `no more than ${max} ${max === 1 ? 'block' : 'blocks'}`;
  }
  return `from ${min} to ${max} blocks`;
}

function unknownTypeReason(schema: Schema, typeName: string, placement: Placement): string {
  if (schema.removedTypes.has(typeName)) {
    return `has the type "${typeName}", but the schema lists this type in "removedTypes".`;
  }
  return `has the type "${typeName}", but the schema has no ${placement.typeKind} with this name.`;
}

function fieldRules(type: TypeDefinition): [string, PropRule][] {
  return [...type.fields].map(([name, field]) => [name, fieldRule(field)]);
}

function invalid<Item extends Block | BlockReference>(
  item: Item,
  code: BlockErrorCode,
  reason: string,
): Loaded<Item> {
  return {
    block: item,
    errors: [{ blockId: item.id, code, message: `The block "${item.id}" ${reason}` }],
  };
}

function quoteNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

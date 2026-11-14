import type { Block, Operation, TypeDefinition } from './types.ts';

type Slots = NonNullable<Block['slots']>;
type SlotItems = Slots[string];

export type MigrationResult =
  | {
      readonly status: 'migrated';
      readonly props: Readonly<Record<string, unknown>>;
      readonly slots: Slots | undefined;
    }
  | { readonly status: 'failed'; readonly error: string };

export function migrateBlock(type: TypeDefinition, block: Block): MigrationResult {
  const props = new Map(Object.entries(block.props));
  const slots = block.slots === undefined ? undefined : new Map(Object.entries(block.slots));
  const pendingMigrations = [...type.migrations]
    .filter(([from]) => from >= block.version)
    .sort(([first], [second]) => first - second);
  for (const [from, operations] of pendingMigrations) {
    for (const operation of operations) {
      const error = applyOperation(operation, props, slots);
      if (error !== undefined) {
        return {
          status: 'failed',
          error: `cannot run the migration from version ${from}. The migration ${error}`,
        };
      }
    }
  }
  return {
    status: 'migrated',
    props: Object.fromEntries(props),
    slots: slots === undefined ? undefined : Object.fromEntries(slots),
  };
}

function applyOperation(
  operation: Operation,
  props: Map<string, unknown>,
  slots: Map<string, SlotItems> | undefined,
): string | undefined {
  switch (operation.op) {
    case 'renameField':
      return rename(props, operation.from, operation.to, 'field');
    case 'addField':
      if (!props.has(operation.field)) {
        props.set(operation.field, operation.value);
      }
      return undefined;
    case 'removeField':
      props.delete(operation.field);
      return undefined;
    case 'mapValues': {
      const value = props.get(operation.field);
      if (typeof value === 'string' && Object.hasOwn(operation.values, value)) {
        props.set(operation.field, operation.values[value]);
      }
      return undefined;
    }
    case 'renameSlot':
      return slots === undefined ? undefined : rename(slots, operation.from, operation.to, 'slot');
    case 'removeSlot':
      slots?.delete(operation.slot);
      return undefined;
  }
}

function rename<T>(
  entries: Map<string, T>,
  from: string,
  to: string,
  kind: 'field' | 'slot',
): string | undefined {
  const value = entries.get(from);
  if (value === undefined) {
    return undefined;
  }
  if (entries.has(to)) {
    return `renames the ${kind} "${from}" to "${to}", but the block has the ${kind} "${to}" already.`;
  }
  entries.delete(from);
  entries.set(to, value);
  return undefined;
}

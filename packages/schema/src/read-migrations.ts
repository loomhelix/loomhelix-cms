import { describeValue } from './json-values.ts';
import {
  expectKnownProperties,
  fail,
  readList,
  readName,
  readObject,
  readPositiveInteger,
} from './schema-json.ts';
import type { Operation } from './types.ts';

type OperationName = Operation['op'];

const MIGRATION_PROPERTIES: ReadonlySet<string> = new Set(['from', 'operations']);
const PROPERTIES_BY_OPERATION: Readonly<Record<OperationName, ReadonlySet<string>>> = {
  renameField: new Set(['op', 'from', 'to']),
  addField: new Set(['op', 'field', 'value']),
  removeField: new Set(['op', 'field']),
  mapValues: new Set(['op', 'field', 'values']),
  renameSlot: new Set(['op', 'from', 'to']),
  removeSlot: new Set(['op', 'slot']),
};

export function readMigrations(
  value: unknown,
  version: number,
  typeWhere: string,
): ReadonlyMap<number, readonly Operation[]> {
  const migrations = new Map<number, readonly Operation[]>();
  const list = value === undefined ? [] : readList(value, `"migrations" of the ${typeWhere}`);
  for (const [index, entry] of list.entries()) {
    const where = `migration ${index + 1} of the ${typeWhere}`;
    const migration = readObject(entry, where);
    expectKnownProperties(migration, MIGRATION_PROPERTIES, where);
    const from = readPositiveInteger(migration.from, `"from" of the ${where}`);
    if (from >= version) {
      fail(
        `The ${typeWhere} has a migration from version ${from}, but its version is ${version}. Remove the migration or increase the version.`,
      );
    }
    if (migrations.has(from)) {
      fail(`The ${typeWhere} has more than one migration from version ${from}. Keep one.`);
    }
    const operations = readList(migration.operations, `"operations" of the ${where}`);
    migrations.set(
      from,
      operations.map((operation, operationIndex) =>
        readOperation(operation, `operation ${operationIndex + 1} of the ${where}`),
      ),
    );
  }
  for (let from = 1; from < version; from += 1) {
    if (!migrations.has(from)) {
      fail(
        `The ${typeWhere} has version ${version}, but it has no migration from version ${from}. Add a migration with "from": ${from}.`,
      );
    }
  }
  return migrations;
}

function readOperation(value: unknown, where: string): Operation {
  const object = readObject(value, where);
  const { op } = object;
  if (!isOperationName(op)) {
    fail(
      `The ${where} must have an "op" that is renameField, addField, removeField, mapValues, renameSlot, or removeSlot, got ${describeValue(op)}.`,
    );
  }
  expectKnownProperties(object, PROPERTIES_BY_OPERATION[op], where);
  switch (op) {
    case 'renameField':
    case 'renameSlot':
      return {
        op,
        from: readName(object.from, `"from" of the ${where}`),
        to: readName(object.to, `"to" of the ${where}`),
      };
    case 'addField':
      if (object.value === undefined) {
        fail(`The ${where} must have a "value".`);
      }
      return { op, field: readName(object.field, `"field" of the ${where}`), value: object.value };
    case 'removeField':
      return { op, field: readName(object.field, `"field" of the ${where}`) };
    case 'mapValues':
      return {
        op,
        field: readName(object.field, `"field" of the ${where}`),
        values: readObject(object.values, `"values" of the ${where}`),
      };
    case 'removeSlot':
      return { op, slot: readName(object.slot, `"slot" of the ${where}`) };
  }
}

function isOperationName(value: unknown): value is OperationName {
  return typeof value === 'string' && Object.hasOwn(PROPERTIES_BY_OPERATION, value);
}

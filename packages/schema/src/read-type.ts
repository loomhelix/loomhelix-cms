import { readField } from './read-field.ts';
import { readMigrations } from './read-migrations.ts';
import {
  expectKnownProperties,
  fail,
  readLabel,
  readList,
  readName,
  readNamedEntries,
  readObject,
  readPositiveInteger,
  type JsonObject,
} from './schema-json.ts';
import type { SlotDefinition, TypeDefinition } from './types.ts';

const TYPE_PROPERTIES: ReadonlySet<string> = new Set([
  'version',
  'label',
  'fields',
  'slots',
  'migrations',
  'oldNames',
]);
const SLOT_PROPERTIES: ReadonlySet<string> = new Set(['allow', 'label', 'min', 'max']);

export function readType(value: unknown, where: string): TypeDefinition {
  const object = readObject(value, where);
  expectKnownProperties(object, TYPE_PROPERTIES, where);
  const version = readPositiveInteger(object.version, `"version" of the ${where}`);
  return {
    ...readLabel(object, where),
    version,
    fields: readNamedEntries(object.fields, `fields of the ${where}`, (name, field) =>
      readField(field, `field "${name}" of the ${where}`),
    ),
    slots: readNamedEntries(object.slots, `slots of the ${where}`, (name, slot) =>
      readSlot(slot, `slot "${name}" of the ${where}`),
    ),
    migrations: readMigrations(object.migrations, version, where),
  };
}

export function readOldNames(value: unknown, where: string): readonly string[] {
  const { oldNames } = readObject(value, where);
  if (oldNames === undefined) {
    return [];
  }
  const names = readList(oldNames, `"oldNames" of the ${where}`).map((name) =>
    readName(name, `"oldNames" of the ${where}`),
  );
  const repeatedName = names.find((name, index) => names.indexOf(name) !== index);
  if (repeatedName !== undefined) {
    fail(`The "oldNames" of the ${where} contain "${repeatedName}" more than one time.`);
  }
  return names;
}

function readSlot(value: unknown, where: string): SlotDefinition {
  const object = readObject(value, where);
  expectKnownProperties(object, SLOT_PROPERTIES, where);
  const allow = readList(object.allow, `"allow" list of the ${where}`);
  if (allow.length === 0) {
    fail(`The "allow" list of the ${where} must contain one or more block types.`);
  }
  return {
    ...readLabel(object, where),
    allow: allow.map((name) => readName(name, `"allow" list of the ${where}`)),
    ...readBlockCountLimits(object, where),
  };
}

function readBlockCountLimits(
  object: JsonObject,
  where: string,
): { readonly min?: number; readonly max?: number } {
  const min =
    object.min === undefined ? undefined : readPositiveInteger(object.min, `"min" of the ${where}`);
  const max =
    object.max === undefined ? undefined : readPositiveInteger(object.max, `"max" of the ${where}`);
  if (min !== undefined && max !== undefined && max < min) {
    fail(`The ${where} has "max" ${max}, which is smaller than "min" ${min}.`);
  }
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

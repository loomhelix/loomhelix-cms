import { describeValue, isRecord } from './json-values.ts';
import { SchemaError } from './schema-error.ts';

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const NAME_RULE = 'A name must start with a letter and contain only letters and digits.';

export type JsonObject = Readonly<Record<string, unknown>>;

export function fail(message: string): never {
  throw new SchemaError(message);
}

export function readObject(value: unknown, where: string): JsonObject {
  if (!isRecord(value)) {
    fail(`The ${where} must be an object, got ${describeValue(value)}.`);
  }
  return value;
}

export function expectKnownProperties(
  object: JsonObject,
  knownProperties: ReadonlySet<string>,
  where: string,
): void {
  const unknownProperty = Object.keys(object).find((property) => !knownProperties.has(property));
  if (unknownProperty !== undefined) {
    fail(
      `The ${where} has the unknown property "${unknownProperty}". Remove it or correct its name.`,
    );
  }
}

export function readList(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(`The ${where} must be a list, got ${describeValue(value)}.`);
  }
  return value;
}

export function readPositiveInteger(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    fail(`The ${where} must be an integer of 1 or more, got ${describeValue(value)}.`);
  }
  return value;
}

export function readFlag(value: unknown, where: string): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== 'boolean') {
    fail(`The ${where} must be true or false, got ${describeValue(value)}.`);
  }
  return value;
}

export function readLabel(object: JsonObject, where: string): { readonly label?: string } {
  const { label } = object;
  if (label === undefined) {
    return {};
  }
  if (typeof label !== 'string') {
    fail(`The "label" of the ${where} must be a string, got ${describeValue(label)}.`);
  }
  return { label };
}

export function readName(value: unknown, where: string): string {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value)) {
    fail(`The ${where} must be a name, got ${describeValue(value)}. ${NAME_RULE}`);
  }
  return value;
}

export function readNamedEntries<T>(
  value: unknown,
  where: string,
  readEntry: (name: string, entry: unknown) => T,
): ReadonlyMap<string, T> {
  if (value === undefined) {
    return new Map();
  }
  const object = readObject(value, where);
  return new Map(
    Object.entries(object).map(([name, entry]) => {
      if (!NAME_PATTERN.test(name)) {
        fail(`The ${where} contain the name "${name}". ${NAME_RULE}`);
      }
      return [name, readEntry(name, entry)];
    }),
  );
}

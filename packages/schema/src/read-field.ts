import { findValueError } from './field-values.ts';
import { describeValue } from './json-values.ts';
import {
  expectKnownProperties,
  fail,
  readFlag,
  readLabel,
  readList,
  readObject,
  readPositiveInteger,
  type JsonObject,
} from './schema-json.ts';
import type { ChoiceOption, Field } from './types.ts';

type FieldType = Field['type'];

const COMMON_PROPERTIES = ['type', 'label', 'optional', 'default'];
const PROPERTIES_BY_TYPE: Readonly<Record<FieldType, ReadonlySet<string>>> = {
  text: new Set([...COMMON_PROPERTIES, 'multiline', 'maxLength']),
  richText: new Set(COMMON_PROPERTIES),
  link: new Set(COMMON_PROPERTIES),
  image: new Set(COMMON_PROPERTIES),
  choice: new Set([...COMMON_PROPERTIES, 'options']),
  number: new Set([...COMMON_PROPERTIES, 'integer', 'min', 'max']),
  boolean: new Set(COMMON_PROPERTIES),
  record: new Set([...COMMON_PROPERTIES, 'source']),
};
const OPTION_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const OPTION_PROPERTIES: ReadonlySet<string> = new Set(['name', 'label']);
const OPTION_RULE =
  'An option name must start with a letter and contain only letters, digits, and hyphens.';
const SOURCE_RULE =
  'A source name must start with a letter and contain only letters, digits, and hyphens.';

export function readField(value: unknown, where: string): Field {
  const object = readObject(value, where);
  const { type } = object;
  if (!isFieldType(type)) {
    fail(
      `The ${where} must have a "type" that is text, richText, link, image, choice, number, boolean, or record, got ${describeValue(type)}.`,
    );
  }
  expectKnownProperties(object, PROPERTIES_BY_TYPE[type], where);
  const field = readFieldOfType(type, object, where);
  return withDefault(field, object.default, where);
}

function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && Object.hasOwn(PROPERTIES_BY_TYPE, value);
}

function readFieldOfType(type: FieldType, object: JsonObject, where: string): Field {
  const common = {
    ...readLabel(object, where),
    optional: readFlag(object.optional, `"optional" of the ${where}`),
  };
  switch (type) {
    case 'text': {
      const multiline = readFlag(object.multiline, `"multiline" of the ${where}`);
      if (object.maxLength === undefined) {
        return { type, ...common, multiline };
      }
      const maxLength = readPositiveInteger(object.maxLength, `"maxLength" of the ${where}`);
      return { type, ...common, multiline, maxLength };
    }
    case 'choice':
      return { type, ...common, options: readOptions(object.options, where) };
    case 'number':
      return {
        type,
        ...common,
        integer: readFlag(object.integer, `"integer" of the ${where}`),
        ...readNumberLimits(object, where),
      };
    case 'boolean':
      return { type, ...common, default: false };
    case 'record':
      return { type, ...common, source: readSource(object.source, where) };
    case 'richText':
    case 'link':
    case 'image':
      return { type, ...common };
  }
}

function readSource(value: unknown, where: string): string {
  if (!isOptionName(value)) {
    fail(`The ${where} must have a "source" name, got ${describeValue(value)}. ${SOURCE_RULE}`);
  }
  return value;
}

function readNumberLimits(
  object: JsonObject,
  where: string,
): { readonly min?: number; readonly max?: number } {
  const min = readOptionalNumber(object.min, `"min" of the ${where}`);
  const max = readOptionalNumber(object.max, `"max" of the ${where}`);
  if (min !== undefined && max !== undefined && max < min) {
    fail(`The ${where} has "max" ${max}, which is smaller than "min" ${min}.`);
  }
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

function readOptionalNumber(value: unknown, where: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`The ${where} must be a number, got ${describeValue(value)}.`);
  }
  return value;
}

function readOptions(value: unknown, where: string): readonly ChoiceOption[] {
  const items = readList(value, `"options" of the ${where}`);
  if (items.length === 0) {
    fail(`The "options" of the ${where} must contain one or more options.`);
  }
  const options = items.map((item) => readOption(item, where));
  const names = options.map(({ name }) => name);
  const repeatedName = names.find((name, index) => names.indexOf(name) !== index);
  if (repeatedName !== undefined) {
    fail(
      `The "options" of the ${where} contain ${describeValue(repeatedName)} more than one time.`,
    );
  }
  return options;
}

function readOption(value: unknown, where: string): ChoiceOption {
  if (typeof value === 'string') {
    return { name: readOptionName(value, where) };
  }
  const optionWhere = `option of the ${where}`;
  const object = readObject(value, optionWhere);
  expectKnownProperties(object, OPTION_PROPERTIES, optionWhere);
  const name = readOptionName(object.name, where);
  if (typeof object.label !== 'string') {
    fail(
      `The option "${name}" of the ${where} must have a "label" string, got ${describeValue(object.label)}.`,
    );
  }
  return { name, label: object.label };
}

function readOptionName(value: unknown, where: string): string {
  if (!isOptionName(value)) {
    fail(`The "options" of the ${where} contain ${describeValue(value)}. ${OPTION_RULE}`);
  }
  return value;
}

function isOptionName(value: unknown): value is string {
  return typeof value === 'string' && OPTION_PATTERN.test(value);
}

function withDefault(field: Field, value: unknown, where: string): Field {
  if (value === undefined) {
    return field;
  }
  const error = findValueError(field, value);
  if (error !== undefined) {
    fail(`The default value of the ${where} ${error}`);
  }
  return { ...field, default: value };
}

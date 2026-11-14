import { describeValue } from './json-values.ts';
import { BUILT_IN_PAGE_FIELDS } from './page-fields.ts';
import { readOldNames, readType } from './read-type.ts';
import {
  expectKnownProperties,
  fail,
  readList,
  readName,
  readNamedEntries,
  readObject,
  type JsonObject,
} from './schema-json.ts';
import type { Schema, TypeDefinition } from './types.ts';

const FORMAT_VERSION = 0;
const RESERVED_TYPE_NAME = 'LegacyHtml';
const SCHEMA_PROPERTIES: ReadonlySet<string> = new Set([
  'formatVersion',
  'pages',
  'blocks',
  'removedTypes',
]);
const TYPE_GROUPS = ['pages', 'blocks'];

export function parseSchema(json: unknown): Schema {
  const object = readObject(json, 'schema');
  expectKnownProperties(object, SCHEMA_PROPERTIES, 'schema');
  const missingGroup = TYPE_GROUPS.find((group) => object[group] === undefined);
  if (missingGroup !== undefined) {
    fail(`The schema must have "${missingGroup}".`);
  }
  if (object.formatVersion !== FORMAT_VERSION) {
    fail(
      `The schema has "formatVersion" ${describeValue(object.formatVersion)}, but this version of @loomhelix-cms/schema reads format version ${FORMAT_VERSION}.`,
    );
  }
  const pages = readNamedEntries(object.pages, '"pages" of the schema', (name, type) =>
    readType(type, `page type "${name}"`),
  );
  const blocks = readNamedEntries(object.blocks, '"blocks" of the schema', (name, type) =>
    readType(type, `block type "${name}"`),
  );
  const renamedTypes = readRenamedTypes(object, pages, blocks);
  const schema: Schema = {
    pages,
    blocks,
    renamedTypes,
    removedTypes: readRemovedTypes(object.removedTypes, { pages, blocks, renamedTypes }),
  };
  checkTypeNames(schema);
  checkPageFields(schema.pages);
  checkAllowLists(schema);
  return schema;
}

function readRenamedTypes(
  object: JsonObject,
  pages: ReadonlyMap<string, TypeDefinition>,
  blocks: ReadonlyMap<string, TypeDefinition>,
): ReadonlyMap<string, string> {
  const oldNamesByType = [
    ...readNamedEntries(object.pages, '"pages" of the schema', (name, type) =>
      readOldNames(type, `page type "${name}"`),
    ),
    ...readNamedEntries(object.blocks, '"blocks" of the schema', (name, type) =>
      readOldNames(type, `block type "${name}"`),
    ),
  ];
  const renamedTypes = new Map<string, string>();
  for (const [typeName, oldNames] of oldNamesByType) {
    for (const oldName of oldNames) {
      if (pages.has(oldName) || blocks.has(oldName)) {
        fail(
          `The old name "${oldName}" of "${typeName}" is the name of a type in the schema. Remove it from "oldNames".`,
        );
      }
      const otherType = renamedTypes.get(oldName);
      if (otherType !== undefined) {
        fail(
          `The old name "${oldName}" is in the "oldNames" of "${otherType}" and of "${typeName}". Keep it in one type.`,
        );
      }
      renamedTypes.set(oldName, typeName);
    }
  }
  return renamedTypes;
}

function readRemovedTypes(
  value: unknown,
  { pages, blocks, renamedTypes }: Omit<Schema, 'removedTypes'>,
): ReadonlySet<string> {
  if (value === undefined) {
    return new Set();
  }
  const where = '"removedTypes" of the schema';
  const names = readList(value, where).map((name) => readName(name, where));
  for (const [index, name] of names.entries()) {
    if (pages.has(name) || blocks.has(name)) {
      fail(
        `The ${where} contain "${name}", but the schema has a type with this name. Remove it from "removedTypes" or from the types.`,
      );
    }
    if (renamedTypes.has(name)) {
      fail(
        `The ${where} contain "${name}", but it is an old name of "${renamedTypes.get(name)}". Remove it from "removedTypes" or from "oldNames".`,
      );
    }
    if (names.indexOf(name) !== index) {
      fail(`The ${where} contain "${name}" more than one time.`);
    }
  }
  return new Set(names);
}

function checkTypeNames({ pages, blocks }: Schema): void {
  if (pages.size === 0) {
    fail('The schema must have one or more page types in "pages".');
  }
  const pageName = [...pages.keys()].find((name) => blocks.has(name));
  if (pageName !== undefined) {
    fail(
      `The schema has "${pageName}" in "pages" and in "blocks". Give the page type and the block type different names.`,
    );
  }
  if (pages.has(RESERVED_TYPE_NAME) || blocks.has(RESERVED_TYPE_NAME)) {
    fail(`The type name "${RESERVED_TYPE_NAME}" is reserved. Give the type a different name.`);
  }
}

function checkPageFields(pages: ReadonlyMap<string, TypeDefinition>): void {
  for (const [pageName, page] of pages) {
    const builtInName = [...page.fields.keys()].find((name) => BUILT_IN_PAGE_FIELDS.has(name));
    if (builtInName !== undefined) {
      fail(
        `The page type "${pageName}" defines the field "${builtInName}". Each page type has this field already, so remove it from "fields".`,
      );
    }
  }
}

function checkAllowLists({ pages, blocks }: Schema): void {
  for (const [typeName, type] of [...pages, ...blocks]) {
    for (const [slotName, slot] of type.slots) {
      const unknownName = slot.allow.find((name) => !blocks.has(name));
      if (unknownName !== undefined) {
        fail(
          `The "allow" list of the slot "${slotName}" of "${typeName}" contains "${unknownName}", but "blocks" has no type with this name.`,
        );
      }
    }
  }
}

import type { Field, Schema, TypeDefinition } from '@loomhelix-cms/schema';

type NamedType = readonly [string, TypeDefinition];

const PAGE_FIELD_LINES = [
  '  readonly title: string;',
  '  readonly description?: string;',
  '  readonly path: string;',
];
const EMPTY_PROPS = 'Readonly<Record<string, never>>';

export function writeSchemaTypes(schema: Schema): string {
  const types = [...schema.pages, ...schema.blocks];
  const sections = [
    `import type { ${importedNames(types).join(', ')} } from '@loomhelix-cms/render-html';`,
    ...[...schema.pages].map(([name, type]) => propsType(name, type, PAGE_FIELD_LINES)),
    ...[...schema.blocks].map(([name, type]) => propsType(name, type, [])),
    templatesType(types),
  ];
  return `${sections.join('\n\n')}\n`;
}

function propsType(name: string, type: TypeDefinition, builtInLines: readonly string[]): string {
  const fieldLines = [...type.fields].map(([fieldName, field]) => fieldLine(fieldName, field));
  const lines = [...builtInLines, ...fieldLines];
  if (lines.length === 0) {
    return `export type ${name}Props = ${EMPTY_PROPS};`;
  }
  return [`export type ${name}Props = {`, ...lines, '};'].join('\n');
}

function fieldLine(name: string, field: Field): string {
  return `  readonly ${name}${field.optional ? '?' : ''}: ${valueType(field)};`;
}

function valueType(field: Field): string {
  switch (field.type) {
    case 'text':
    case 'link':
      return 'string';
    case 'record':
      return 'SiteRecord';
    case 'richText':
      return 'RichText';
    case 'image':
      return 'Image';
    case 'choice':
      return quotedUnion(field.options.map(({ name }) => name));
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
  }
}

function templatesType(types: readonly NamedType[]): string {
  const lines = types.map(
    ([name, type]) => `  readonly ${name}: Template<${name}Props, ${slotNames(type)}>;`,
  );
  return ['export interface Templates {', ...lines, '}'].join('\n');
}

function slotNames(type: TypeDefinition): string {
  const names = [...type.slots.keys()];
  return names.length === 0 ? 'never' : quotedUnion(names);
}

function quotedUnion(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(' | ');
}

function importedNames(types: readonly NamedType[]): string[] {
  const fieldTypes = new Set(
    types.flatMap(([, type]) => [...type.fields.values()].map((field) => field.type)),
  );
  return [
    ...(fieldTypes.has('image') ? ['Image'] : []),
    ...(fieldTypes.has('richText') ? ['RichText'] : []),
    ...(fieldTypes.has('record') ? ['SiteRecord'] : []),
    'Template',
  ];
}

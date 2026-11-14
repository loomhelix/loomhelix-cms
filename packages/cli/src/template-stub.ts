import type { Field, Schema, TypeDefinition } from '@loomhelix-cms/schema';

const BLOCK_INDENT = '      ';
const PAGE_INDENT = '          ';

export function writeTemplateStub(schema: Schema, typeName: string): string | undefined {
  const pageType = schema.pages.get(typeName);
  if (pageType !== undefined) {
    return pageStub(typeName, pageType);
  }
  const blockType = schema.blocks.get(typeName);
  return blockType === undefined ? undefined : blockStub(typeName, blockType);
}

function blockStub(name: string, type: TypeDefinition): string {
  const propsName = type.fields.size > 0 ? ['props'] : [];
  return [
    `  ${name}: (${parameterList([...propsName, ...slotsName(type)])}) =>`,
    `    html\`<div class="${classList(name, type)}">`,
    ...contentLines(type, BLOCK_INDENT),
    '    </div>`,',
  ].join('\n');
}

function pageStub(name: string, type: TypeDefinition): string {
  return [
    `  ${name}: (${parameterList(['props', ...slotsName(type)])}) =>`,
    '    html`<!doctype html>',
    '      <html lang="en">',
    '        <head>',
    '          <meta charset="utf-8" />',
    '          <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '          <title>${props.title}</title>',
    '        </head>',
    `        <body class="${classList(name, type)}">`,
    ...contentLines(type, PAGE_INDENT),
    '        </body>',
    '      </html>`,',
  ].join('\n');
}

function slotsName(type: TypeDefinition): string[] {
  return type.slots.size > 0 ? ['slots'] : [];
}

function parameterList(names: readonly string[]): string {
  return names.length === 0 ? '' : `{ ${names.join(', ')} }`;
}

function classList(typeName: string, type: TypeDefinition): string {
  const className = kebabCase(typeName);
  const choiceClasses = [...type.fields]
    .filter(([, field]) => field.type === 'choice')
    .map(([fieldName]) => ` ${className}-\${props.${fieldName}}`);
  return `${className}${choiceClasses.join('')}`;
}

function contentLines(type: TypeDefinition, indent: string): string[] {
  const fieldLines = [...type.fields].flatMap(([name, field]) => fieldLine(name, field));
  const slotLines = [...type.slots.keys()].map((name) => `\${slots.${name}}`);
  return [...fieldLines, ...slotLines].map((line) => `${indent}${line}`);
}

function fieldLine(name: string, field: Field): string[] {
  const value = `props.${name}`;
  const markup = valueMarkup(value, field);
  if (markup === undefined) {
    return [];
  }
  return [field.optional ? `\${${value} === undefined ? '' : html\`${markup}\`}` : markup];
}

function valueMarkup(value: string, field: Field): string | undefined {
  switch (field.type) {
    case 'text':
      return `<p>\${${value}}</p>`;
    case 'richText':
      return `<div>\${richText(${value})}</div>`;
    case 'link':
      return `<a href="\${${value}}">\${${value}}</a>`;
    case 'image':
      return `<img src="\${${value}.src}" alt="\${${value}.alt}" />`;
    case 'number':
      return `<p>\${${value}}</p>`;
    case 'choice':
    case 'boolean':
    case 'record':
      return undefined;
  }
}

function kebabCase(name: string): string {
  return name.replace(/(?<=[a-z0-9])([A-Z])/g, '-$1').toLowerCase();
}

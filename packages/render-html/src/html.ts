import { isLink } from '@loomhelix-cms/schema';
import { TemplateScanner, type FilledAttribute, type Place } from './template-scanner.ts';

const ESCAPED_CHARACTERS: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);
const SPECIAL_CHARACTER_PATTERN = /[&<>"']/g;
const SRCSET_ATTRIBUTE = 'srcset';
const SRCSET_CANDIDATE_SEPARATOR = ',';
const SRCSET_DESCRIPTOR_SEPARATOR = /\s+/;
const EVENT_HANDLER_PREFIX = 'on';
const FORBIDDEN_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
  ['style', 'CSS can load addresses. Use a class name, for example class="hero-${background}".'],
  ['srcdoc', 'the browser reads its value as HTML.'],
]);
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'action',
  'background',
  'cite',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'srcset',
  'xlink:href',
]);

export class Html {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

export function html(literals: TemplateStringsArray, ...values: readonly unknown[]): Html {
  const scanner = new TemplateScanner();
  let text = '';
  for (const [index, literal] of literals.entries()) {
    scanner.read(literal);
    scanner.takeFilledAttributes().forEach(checkLinks);
    text += literal;
    if (index < values.length) {
      const place = scanner.place();
      text += renderValueAt(place, values[index]);
      if (place.kind === 'attribute') {
        scanner.addValue(rawText(values[index]));
      }
    }
  }
  if (!scanner.isClosed()) {
    throw new TypeError(
      'A template must close each tag, attribute value, script element, and style element that it opens.',
    );
  }
  return new Html(text);
}

function checkLinks({ name, value }: FilledAttribute): void {
  if (!URL_ATTRIBUTES.has(name)) {
    return;
  }
  const links =
    name === SRCSET_ATTRIBUTE
      ? value
          .split(SRCSET_CANDIDATE_SEPARATOR)
          .map((candidate) => candidate.trim().split(SRCSET_DESCRIPTOR_SEPARATOR)[0] ?? '')
      : [value];
  if (!links.every((link) => link === '' || isLink(link))) {
    throw new TypeError(
      `The "${name}" attribute cannot get ${JSON.stringify(value)}, because it is not a link that follows section 3.2 of the spec.`,
    );
  }
}

function rawText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function renderValueAt(place: Place, value: unknown): string {
  switch (place.kind) {
    case 'text':
      return renderText(value);
    case 'attribute':
      return renderAttributeValue(place.name, value);
    case 'tag':
      throw new TypeError(
        'A value in a tag must be inside the quotes of an attribute, for example class="${value}".',
      );
    case 'rawText':
      throw new TypeError(
        `A template cannot put a value into a ${place.element} element. Put the value into a data attribute.`,
      );
  }
}

function renderText(value: unknown): string {
  if (value instanceof Html) {
    return value.text;
  }
  if (Array.isArray(value)) {
    return value.map(renderText).join('');
  }
  if (typeof value === 'string') {
    return escape(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value === undefined || value === null || value === false) {
    return '';
  }
  throw new TypeError(
    `A template cannot put a value of the type "${typeof value}" into HTML. Put a string, a number, or the result of html.`,
  );
}

function renderAttributeValue(name: string, value: unknown): string {
  if (name.startsWith(EVENT_HANDLER_PREFIX)) {
    throw new TypeError(
      `A template cannot put a value into the "${name}" attribute, because the browser runs it as a script.`,
    );
  }
  const reason = FORBIDDEN_ATTRIBUTES.get(name);
  if (reason !== undefined) {
    throw new TypeError(
      `A template cannot put a value into the "${name}" attribute, because ${reason}`,
    );
  }
  if (value instanceof Html || Array.isArray(value)) {
    throw new TypeError(
      `A template cannot put HTML into the "${name}" attribute. Put a string or a number.`,
    );
  }
  return renderText(value);
}

function escape(text: string): string {
  return text.replace(
    SPECIAL_CHARACTER_PATTERN,
    (character) => ESCAPED_CHARACTERS.get(character) ?? character,
  );
}

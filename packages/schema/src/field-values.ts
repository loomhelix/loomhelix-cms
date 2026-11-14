import { isImageSource, isLink } from './addresses.ts';
import { countCodePoints, describeValue, isRecord } from './json-values.ts';
import type { ChoiceField, Field, NumberField, TextField } from './types.ts';

const LINE_BREAK_PATTERN = /[\n\r]/;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const MARKS: ReadonlySet<unknown> = new Set(['bold', 'italic']);
const SPAN_PROPERTIES: ReadonlySet<string> = new Set(['text', 'marks', 'link']);
const IMAGE_PROPERTIES: ReadonlySet<string> = new Set(['src', 'alt', 'width', 'height']);

export function findValueError(field: Field, value: unknown): string | undefined {
  switch (field.type) {
    case 'text':
      return findTextError(field, value);
    case 'richText':
      return findRichTextError(value);
    case 'link':
      return isLink(value)
        ? undefined
        : `must be a link that follows section 3.2 of the spec, got ${describeValue(value)}.`;
    case 'image':
      return findImageError(value);
    case 'choice':
      return findChoiceError(field, value);
    case 'number':
      return findNumberError(field, value);
    case 'boolean':
      return typeof value === 'boolean'
        ? undefined
        : `must be true or false, got ${describeValue(value)}.`;
    case 'record':
      return isRecordId(value)
        ? undefined
        : `must be the id of a record: a non-empty string without control characters, got ${describeValue(value)}.`;
  }
}

function isRecordId(value: unknown): boolean {
  return typeof value === 'string' && value !== '' && !CONTROL_CHARACTER_PATTERN.test(value);
}

function findNumberError(field: NumberField, value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `must be a number, got ${describeValue(value)}.`;
  }
  if (field.integer && !Number.isInteger(value)) {
    return `must be an integer, got ${value}.`;
  }
  if (value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)) {
    return `must be ${describeRange(field)}, got ${value}.`;
  }
  return undefined;
}

function describeRange({ min, max }: NumberField): string {
  if (max === undefined) {
    return `${min} or more`;
  }
  if (min === undefined) {
    return `${max} or less`;
  }
  return `from ${min} to ${max}`;
}

function hasLineBreak(text: string): boolean {
  return LINE_BREAK_PATTERN.test(text);
}

function findTextError(field: TextField, value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return `must be a string, got ${describeValue(value)}.`;
  }
  if (!field.multiline && hasLineBreak(value)) {
    return `must not contain line breaks, got ${describeValue(value)}.`;
  }
  const length = countCodePoints(value);
  if (field.maxLength !== undefined && length > field.maxLength) {
    return `must have no more than ${field.maxLength} Unicode code points, got ${length}.`;
  }
  return undefined;
}

function findRichTextError(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return `must be a list of one or more paragraphs, got ${describeValue(value)}.`;
  }
  for (const [paragraphIndex, paragraph] of value.entries()) {
    const paragraphNumber = paragraphIndex + 1;
    if (!Array.isArray(paragraph)) {
      return `must have paragraphs that are lists of spans. Paragraph ${paragraphNumber} is ${describeValue(paragraph)}.`;
    }
    if (paragraph.length === 0) {
      return `must not have empty paragraphs. Paragraph ${paragraphNumber} has no spans.`;
    }
    for (const [spanIndex, span] of paragraph.entries()) {
      const spanError = findSpanError(span);
      if (spanError !== undefined) {
        return `must follow section 3.3 of the spec. Span ${spanIndex + 1} of paragraph ${paragraphNumber} ${spanError}`;
      }
    }
  }
  return undefined;
}

function findSpanError(span: unknown): string | undefined {
  if (!isRecord(span)) {
    return `must be an object, got ${describeValue(span)}.`;
  }
  const unknownProperty = Object.keys(span).find((property) => !SPAN_PROPERTIES.has(property));
  if (unknownProperty !== undefined) {
    return `has the unknown property "${unknownProperty}".`;
  }
  const { text, marks, link } = span;
  if (typeof text !== 'string' || text === '' || hasLineBreak(text)) {
    return `must have a non-empty "text" without line breaks, got ${describeValue(text)}.`;
  }
  if (marks !== undefined && !isMarkList(marks)) {
    return `must have "marks" with "bold", "italic", or both, each one time.`;
  }
  if (link !== undefined && !isLink(link)) {
    return `must have a "link" that follows section 3.2 of the spec, got ${describeValue(link)}.`;
  }
  return undefined;
}

function isMarkList(marks: unknown): boolean {
  return (
    Array.isArray(marks) &&
    marks.length > 0 &&
    marks.every((mark) => MARKS.has(mark)) &&
    new Set(marks).size === marks.length
  );
}

function findImageError(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return `must be an object with "src" and "alt", got ${describeValue(value)}.`;
  }
  const unknownProperty = Object.keys(value).find((property) => !IMAGE_PROPERTIES.has(property));
  if (unknownProperty !== undefined) {
    return `has the unknown property "${unknownProperty}". An image has only "src", "alt", "width", and "height".`;
  }
  if (!isImageSource(value.src)) {
    return `must have a "src" with the scheme http or https or no scheme, got ${describeValue(value.src)}.`;
  }
  if (typeof value.alt !== 'string') {
    return `must have an "alt" string, got ${describeValue(value.alt)}.`;
  }
  return findImageSizeError(value.width, value.height);
}

function findImageSizeError(width: unknown, height: unknown): string | undefined {
  if (width === undefined && height === undefined) {
    return undefined;
  }
  if (!isPixelCount(width) || !isPixelCount(height)) {
    return `must have a "width" and a "height" that are integers of 1 or more, or neither of them, got ${describeValue(width)} and ${describeValue(height)}.`;
  }
  return undefined;
}

function isPixelCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function findChoiceError(field: ChoiceField, value: unknown): string | undefined {
  if (field.options.some(({ name }) => name === value)) {
    return undefined;
  }
  const options = field.options.map(({ name }) => `"${name}"`).join(', ');
  return `must be one of ${options}, got ${describeValue(value)}.`;
}

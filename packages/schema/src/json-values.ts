const MAX_DESCRIBED_STRING_LENGTH = 40;

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'no value';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? 'an empty list' : 'a list';
  }
  if (typeof value === 'string') {
    return JSON.stringify(shorten(value));
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return 'an object';
}

export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

function shorten(text: string): string {
  const codePoints = Array.from(text);
  return codePoints.length > MAX_DESCRIBED_STRING_LENGTH
    ? `${codePoints.slice(0, MAX_DESCRIBED_STRING_LENGTH).join('')}…`
    : text;
}

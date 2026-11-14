const LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);
const IMAGE_SCHEMES: ReadonlySet<string> = new Set(['http', 'https']);
const SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):/i;
const UNSAFE_LINK_CHARACTER_PATTERN = /[\s\p{Cc}\\]/u;
const UNSAFE_PATH_CHARACTER_PATTERN = /[\s\p{Cc}\\?#]/u;
const DOT_SEGMENTS: ReadonlySet<string> = new Set(['.', '..']);
const ROOT_PATH = '/';

export function isLink(value: unknown): value is string {
  return isAddressWithScheme(value, LINK_SCHEMES);
}

export function isImageSource(value: unknown): value is string {
  return isAddressWithScheme(value, IMAGE_SCHEMES);
}

export function isPath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.startsWith(ROOT_PATH) ||
    value.includes('//') ||
    UNSAFE_PATH_CHARACTER_PATTERN.test(value)
  ) {
    return false;
  }
  if (value === ROOT_PATH) {
    return true;
  }
  return !value.endsWith('/') && !value.split('/').some((segment) => DOT_SEGMENTS.has(segment));
}

function isAddressWithScheme(value: unknown, schemes: ReadonlySet<string>): value is string {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.startsWith('//') ||
    UNSAFE_LINK_CHARACTER_PATTERN.test(value)
  ) {
    return false;
  }
  const scheme = SCHEME_PATTERN.exec(value)?.[1];
  return scheme === undefined || schemes.has(scheme.toLowerCase());
}

import { isPath } from './addresses.ts';
import { describeValue } from './json-values.ts';
import { fieldRule, type PropRule } from './props.ts';

export const PAGE_FIELD_RULES: ReadonlyMap<string, PropRule> = new Map([
  ['title', fieldRule({ type: 'text', optional: false, multiline: false })],
  ['description', fieldRule({ type: 'text', optional: true, multiline: false })],
  [
    'path',
    {
      optional: false,
      findError: (value: unknown) =>
        isPath(value)
          ? undefined
          : `must be a path that follows section 3.4 of the spec, got ${describeValue(value)}.`,
    },
  ],
]);

export const BUILT_IN_PAGE_FIELDS: ReadonlySet<string> = new Set(PAGE_FIELD_RULES.keys());

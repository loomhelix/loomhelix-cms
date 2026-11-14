import { findValueError } from './field-values.ts';
import type { Field } from './types.ts';

export interface PropRule {
  readonly optional: boolean;
  readonly findError: (value: unknown) => string | undefined;
}

export function fieldRule(field: Field): PropRule {
  return { optional: field.optional, findError: (value) => findValueError(field, value) };
}

export function findPropsError(
  rules: ReadonlyMap<string, PropRule>,
  props: Readonly<Record<string, unknown>>,
): string | undefined {
  const unknownName = Object.keys(props).find((name) => !rules.has(name));
  if (unknownName !== undefined) {
    return `has the field "${unknownName}", but its type does not define this field.`;
  }
  for (const [name, rule] of rules) {
    if (!Object.hasOwn(props, name)) {
      if (!rule.optional) {
        return `has no value for the required field "${name}".`;
      }
      continue;
    }
    const error = rule.findError(props[name]);
    if (error !== undefined) {
      return `has a field "${name}" that ${error}`;
    }
  }
  return undefined;
}

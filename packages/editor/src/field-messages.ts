import { findValueError, isPath, type Field, type NumberField } from '@loomhelix-cms/schema';

export const MISSING_VALUE = 'Fill in this field.';
export const LINK_EXAMPLE = '/menu or https://…';
export const PATH_RULE = 'The address must start with /. It cannot contain spaces, ?, #, or //.';

export function describeFieldError(field: Field, value: unknown): string | undefined {
  if (value === undefined) {
    return field.optional ? undefined : MISSING_VALUE;
  }
  if (findValueError(field, value) === undefined) {
    return undefined;
  }
  switch (field.type) {
    case 'text':
      return describeTextError(field.maxLength, value);
    case 'link':
      return 'Enter an address that starts with /, #, ?, https://, http://, mailto:, or tel:, without spaces.';
    case 'image':
      return 'Enter an image address that starts with / or https://, without spaces.';
    case 'choice':
      return 'Select one of the options.';
    case 'richText':
      return 'The formatted text has an error. Change the text to correct it.';
    case 'number':
      return describeNumberError(field, value);
    case 'boolean':
      return 'Select or clear the check box.';
    case 'record':
      return 'Enter the id of a record. The id cannot contain line breaks or tabs.';
  }
}

function describeNumberError({ integer, min, max }: NumberField, value: unknown): string {
  if (typeof value !== 'number') {
    return 'Enter a number.';
  }
  if (integer && !Number.isInteger(value)) {
    return 'Enter a whole number.';
  }
  if (max === undefined) {
    return `Enter a number of ${min} or more.`;
  }
  if (min === undefined) {
    return `Enter a number of ${max} or less.`;
  }
  return `Enter a number from ${min} to ${max}.`;
}

export function describePathError(value: unknown): string | undefined {
  if (value === undefined || value === '') {
    return MISSING_VALUE;
  }
  return isPath(value) ? undefined : PATH_RULE;
}

function describeTextError(maxLength: number | undefined, value: unknown): string {
  if (typeof value !== 'string') {
    return 'Enter a text.';
  }
  const length = Array.from(value).length;
  if (maxLength !== undefined && length > maxLength) {
    return `Use no more than ${maxLength} characters. The text has ${length}.`;
  }
  return 'Remove the line breaks from this text.';
}

import {
  currentTypeName,
  findValueError,
  type Field,
  type Operation,
  type Schema,
  type SlotDefinition,
  type TypeDefinition,
} from '@loomhelix-cms/schema';

export interface SchemaChange {
  readonly level: 'error' | 'warning';
  readonly typeName: string;
  readonly message: string;
}

interface TrackedField {
  readonly field: Field | undefined;
  readonly isFilled: boolean;
  readonly values: readonly string[] | undefined;
  readonly addedValue?: { readonly value: unknown };
}

interface TypePair {
  readonly typeName: string;
  readonly oldType: TypeDefinition;
  readonly newType: TypeDefinition;
  readonly newSchema: Schema;
}

const CHECK_ADVICE = 'Run lhcms check to find the stored blocks that break it.';

export function diffSchemas(oldSchema: Schema, newSchema: Schema): readonly SchemaChange[] {
  return [
    ...diffGroup(oldSchema.pages, newSchema, 'pages'),
    ...diffGroup(oldSchema.blocks, newSchema, 'blocks'),
  ];
}

function diffGroup(
  oldTypes: ReadonlyMap<string, TypeDefinition>,
  newSchema: Schema,
  group: 'pages' | 'blocks',
): SchemaChange[] {
  return [...oldTypes].flatMap(([oldName, oldType]) => {
    const typeName = currentTypeName(newSchema, oldName);
    const newType = newSchema[group].get(typeName);
    if (newType !== undefined) {
      return diffType({ typeName, oldType, newType, newSchema });
    }
    if (newSchema.removedTypes.has(oldName)) {
      return [];
    }
    const otherGroup = group === 'pages' ? newSchema.blocks : newSchema.pages;
    const message = otherGroup.has(typeName)
      ? `The type moves between "pages" and "blocks", so its stored blocks become invalid.`
      : `The type is not in the new schema, so its blocks become invalid. Add it to "removedTypes", or to the "oldNames" of the type that replaces it.`;
    return [{ level: 'error', typeName: oldName, message }];
  });
}

function diffType(pair: TypePair): SchemaChange[] {
  const { oldType, newType } = pair;
  if (newType.version < oldType.version) {
    return [
      error(
        pair,
        `The version goes down from ${oldType.version} to ${newType.version}, so blocks of version ${oldType.version} become invalid.`,
      ),
    ];
  }
  const migrations = [...newType.migrations]
    .filter(([from]) => from >= oldType.version)
    .toSorted(([first], [second]) => first - second)
    .flatMap(([, operations]) => operations);
  return [
    ...diffFields(pair, trackFields(oldType.fields, migrations)),
    ...diffSlots(pair, trackSlots(oldType.slots, migrations)),
  ];
}

function trackFields(
  fields: ReadonlyMap<string, Field>,
  operations: readonly Operation[],
): ReadonlyMap<string, TrackedField> {
  const tracked = new Map(
    [...fields].map(([name, field]) => [
      name,
      { field, isFilled: !field.optional, values: optionNames(field) },
    ]),
  );
  for (const operation of operations) {
    applyFieldOperation(tracked, operation);
  }
  return tracked;
}

function applyFieldOperation(tracked: Map<string, TrackedField>, operation: Operation): void {
  switch (operation.op) {
    case 'renameField': {
      const entry = tracked.get(operation.from);
      if (entry !== undefined && !tracked.has(operation.to)) {
        tracked.delete(operation.from);
        tracked.set(operation.to, entry);
      }
      return;
    }
    case 'addField': {
      const entry = tracked.get(operation.field);
      tracked.set(operation.field, {
        field: entry?.field,
        isFilled: true,
        values: entry?.values,
        addedValue: { value: operation.value },
      });
      return;
    }
    case 'removeField':
      tracked.delete(operation.field);
      return;
    case 'mapValues': {
      const entry = tracked.get(operation.field);
      if (entry?.values !== undefined) {
        const values = entry.values.map((value) =>
          Object.hasOwn(operation.values, value) ? String(operation.values[value]) : value,
        );
        tracked.set(operation.field, { ...entry, values });
      }
      return;
    }
    case 'renameSlot':
    case 'removeSlot':
      return;
  }
}

function optionNames(field: Field | undefined): readonly string[] | undefined {
  return field?.type === 'choice' ? field.options.map(({ name }) => name) : undefined;
}

function diffFields(pair: TypePair, tracked: ReadonlyMap<string, TrackedField>): SchemaChange[] {
  const changes = [...tracked].flatMap(([name, entry]) => {
    const newField = pair.newType.fields.get(name);
    if (newField === undefined) {
      return [
        error(
          pair,
          `The field "${name}" is not in the new type, but the stored blocks have it. ${fix(pair, `{ "op": "removeField", "field": "${name}" }`)}`,
        ),
      ];
    }
    return diffField(pair, name, entry, newField);
  });
  const missing = [...pair.newType.fields]
    .filter(([name, field]) => !tracked.has(name) && !field.optional)
    .map(([name, field]) =>
      error(
        pair,
        `The new required field "${name}" has no value in the stored blocks. ${fix(pair, addFieldOperation(name, field))}`,
      ),
    );
  return [...changes, ...missing];
}

function diffField(
  pair: TypePair,
  name: string,
  { field: oldField, isFilled, values, addedValue }: TrackedField,
  newField: Field,
): SchemaChange[] {
  const addedValueError =
    addedValue === undefined ? undefined : findValueError(newField, addedValue.value);
  if (addedValueError !== undefined) {
    return [error(pair, `The value of "addField" for the field "${name}" ${addedValueError}`)];
  }
  if (oldField !== undefined && oldField.type !== newField.type) {
    return [
      error(
        pair,
        `The field "${name}" changes from ${oldField.type} to ${newField.type}. No operation converts the values, so the stored blocks with a value become invalid.`,
      ),
    ];
  }
  if (oldField === undefined) {
    return [];
  }
  const changes: SchemaChange[] = [];
  if (!isFilled && !newField.optional) {
    changes.push(
      warning(
        pair,
        `The field "${name}" is now required. ${fix(pair, addFieldOperation(name, newField))} ${CHECK_ADVICE}`,
      ),
    );
  }
  const removedValues = (values ?? []).filter(
    (value) => findValueError(newField, value) !== undefined,
  );
  if (newField.type === 'choice' && removedValues.length > 0) {
    const mapping = removedValues.map((value) => `"${value}": "…"`).join(', ');
    changes.push(
      error(
        pair,
        `The field "${name}" has no option ${removedValues.map((value) => `"${value}"`).join(', ')}. ${fix(pair, `{ "op": "mapValues", "field": "${name}", "values": { ${mapping} } }`)}`,
      ),
    );
  }
  const stricterRules = findStricterRules(oldField, newField);
  if (stricterRules.length > 0) {
    changes.push(
      warning(
        pair,
        `The field "${name}" has a stricter rule: ${stricterRules.join(', ')}. ${CHECK_ADVICE}`,
      ),
    );
  }
  return changes;
}

function findStricterRules(oldField: Field, newField: Field): string[] {
  if (oldField.type === 'text' && newField.type === 'text') {
    return [
      ...(newField.maxLength !== undefined && newField.maxLength < (oldField.maxLength ?? Infinity)
        ? [`"maxLength" ${newField.maxLength}`]
        : []),
      ...(oldField.multiline && !newField.multiline ? ['no line breaks'] : []),
    ];
  }
  if (oldField.type === 'number' && newField.type === 'number') {
    return [
      ...(newField.min !== undefined && newField.min > (oldField.min ?? -Infinity)
        ? [`"min" ${newField.min}`]
        : []),
      ...(newField.max !== undefined && newField.max < (oldField.max ?? Infinity)
        ? [`"max" ${newField.max}`]
        : []),
      ...(newField.integer && !oldField.integer ? ['integers only'] : []),
    ];
  }
  return [];
}

function addFieldOperation(name: string, field: Field): string {
  const value = field.default === undefined ? '…' : JSON.stringify(field.default);
  return `{ "op": "addField", "field": "${name}", "value": ${value} }`;
}

function trackSlots(
  slots: ReadonlyMap<string, SlotDefinition>,
  operations: readonly Operation[],
): ReadonlyMap<string, SlotDefinition> {
  const tracked = new Map(slots);
  for (const operation of operations) {
    if (operation.op === 'renameSlot') {
      const slot = tracked.get(operation.from);
      if (slot !== undefined && !tracked.has(operation.to)) {
        tracked.delete(operation.from);
        tracked.set(operation.to, slot);
      }
    }
    if (operation.op === 'removeSlot') {
      tracked.delete(operation.slot);
    }
  }
  return tracked;
}

function diffSlots(pair: TypePair, tracked: ReadonlyMap<string, SlotDefinition>): SchemaChange[] {
  const changes = [...tracked].flatMap(([name, oldSlot]) => {
    const newSlot = pair.newType.slots.get(name);
    if (newSlot === undefined) {
      return [
        error(
          pair,
          `The slot "${name}" is not in the new type, but the stored blocks have it. ${fix(pair, `{ "op": "removeSlot", "slot": "${name}" }`)}`,
        ),
      ];
    }
    return diffSlot(pair, name, oldSlot, newSlot);
  });
  const emptySlots = [...pair.newType.slots]
    .filter(([name, slot]) => !tracked.has(name) && slot.min !== undefined)
    .map(([name, slot]) =>
      error(
        pair,
        `The new slot "${name}" needs ${slot.min} or more blocks, but the stored blocks have no blocks in it. Remove "min" until the stored blocks have blocks in this slot.`,
      ),
    );
  return [...changes, ...emptySlots];
}

function diffSlot(
  pair: TypePair,
  name: string,
  oldSlot: SlotDefinition,
  newSlot: SlotDefinition,
): SchemaChange[] {
  const notAllowed = oldSlot.allow
    .filter((typeName) => !pair.newSchema.removedTypes.has(typeName))
    .map((typeName) => currentTypeName(pair.newSchema, typeName))
    .filter((typeName) => !newSlot.allow.includes(typeName));
  const hasStricterLimits =
    (newSlot.min ?? 0) > (oldSlot.min ?? 0) ||
    (newSlot.max ?? Infinity) < (oldSlot.max ?? Infinity);
  return [
    ...(notAllowed.length > 0
      ? [
          warning(
            pair,
            `The slot "${name}" does not allow ${notAllowed.map((typeName) => `"${typeName}"`).join(', ')} now. ${CHECK_ADVICE}`,
          ),
        ]
      : []),
    ...(hasStricterLimits
      ? [warning(pair, `The slot "${name}" has stricter limits for its blocks. ${CHECK_ADVICE}`)]
      : []),
  ];
}

function fix({ oldType, newType }: TypePair, operation: string): string {
  if (newType.version === oldType.version) {
    return `Increase "version" to ${oldType.version + 1}, and add ${operation} to a migration from version ${oldType.version}.`;
  }
  return `Add ${operation} to a migration from version ${oldType.version} or later.`;
}

function error({ typeName }: TypePair, message: string): SchemaChange {
  return { level: 'error', typeName, message };
}

function warning({ typeName }: TypePair, message: string): SchemaChange {
  return { level: 'warning', typeName, message };
}

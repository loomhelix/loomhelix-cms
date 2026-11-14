import type { OptionNameOf } from './schema-props.ts';
import type { Field, Image, Operation, RichText } from './types.ts';

type NoSettings = Readonly<Record<never, never>>;
type Names = readonly [string, ...string[]];
type ChoiceOptionSetting = string | { readonly name: string; readonly label: string };
type ChoiceOptionSettings = readonly [ChoiceOptionSetting, ...ChoiceOptionSetting[]];

interface FieldSettings<Value> {
  readonly label?: string;
  readonly optional?: boolean;
  readonly default?: Value;
}

interface TextSettings extends FieldSettings<string> {
  readonly multiline?: boolean;
  readonly maxLength?: number;
}

interface NumberSettings extends FieldSettings<number> {
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
}

interface RecordSettings extends FieldSettings<string> {
  readonly source: string;
}

interface SlotSettings {
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
}

interface TypeSettings {
  readonly label?: string;
  readonly version?: number;
  readonly oldNames?: Names;
  readonly fields?: Readonly<Record<string, { readonly type: Field['type'] }>>;
  readonly slots?: Readonly<Record<string, { readonly allow: Names }>>;
  readonly migrations?: readonly {
    readonly from: number;
    readonly operations: readonly Operation[];
  }[];
}

interface SchemaSettings {
  readonly removedTypes?: Names;
  readonly pages: Readonly<Record<string, TypeSettings & { readonly version: number }>>;
  readonly blocks: Readonly<Record<string, TypeSettings & { readonly version: number }>>;
}

const FIRST_VERSION = 1;

export function defineSchema<const Settings extends SchemaSettings>(
  settings: Settings,
): { readonly formatVersion: 0 } & Settings {
  return Object.assign({ formatVersion: 0 } as const, settings);
}

export function page<const Settings extends TypeSettings>(
  settings: Settings,
): { readonly version: number } & Settings {
  return block(settings);
}

export function block<const Settings extends TypeSettings>(
  settings: Settings,
): { readonly version: number } & Settings {
  return Object.assign({ version: FIRST_VERSION }, settings);
}

export function slot<const Allow extends Names, const Settings extends SlotSettings = NoSettings>(
  allow: Allow,
  settings?: Settings,
): { readonly allow: Allow } & Settings {
  return Object.assign({ allow }, settings);
}

export function text<const Settings extends TextSettings = NoSettings>(
  settings?: Settings,
): { readonly type: 'text' } & Settings {
  return Object.assign({ type: 'text' } as const, settings);
}

export function richText<const Settings extends FieldSettings<RichText> = NoSettings>(
  settings?: Settings,
): { readonly type: 'richText' } & Settings {
  return Object.assign({ type: 'richText' } as const, settings);
}

export function link<const Settings extends FieldSettings<string> = NoSettings>(
  settings?: Settings,
): { readonly type: 'link' } & Settings {
  return Object.assign({ type: 'link' } as const, settings);
}

export function image<const Settings extends FieldSettings<Image> = NoSettings>(
  settings?: Settings,
): { readonly type: 'image' } & Settings {
  return Object.assign({ type: 'image' } as const, settings);
}

export function number<const Settings extends NumberSettings = NoSettings>(
  settings?: Settings,
): { readonly type: 'number' } & Settings {
  return Object.assign({ type: 'number' } as const, settings);
}

export function boolean<const Settings extends FieldSettings<boolean> = NoSettings>(
  settings?: Settings,
): { readonly type: 'boolean' } & Settings {
  return Object.assign({ type: 'boolean' } as const, settings);
}

export function record<const Settings extends RecordSettings>(
  settings: Settings,
): { readonly type: 'record' } & Settings {
  return Object.assign({ type: 'record' } as const, settings);
}

export function choice<
  const Options extends ChoiceOptionSettings,
  const Settings extends FieldSettings<OptionNameOf<Options[number]>> = NoSettings,
>(
  options: Options,
  settings?: Settings,
): { readonly type: 'choice'; readonly options: Options } & Settings {
  return Object.assign({ type: 'choice', options } as const, settings);
}

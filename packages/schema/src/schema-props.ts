import type { SiteRecord } from './load-records.ts';
import type { Image, RichText } from './types.ts';

type NoFields = Readonly<Record<never, never>>;

export type RecordTypes = Readonly<Record<string, { readonly id: string }>>;

type NoRecordTypes = Readonly<Record<never, never>>;

type RecordValue<Source, Records> = Source extends keyof Records ? Records[Source] : SiteRecord;

type FieldValue<Field, Records> = Field extends { readonly type: 'text' | 'link' }
  ? string
  : Field extends { readonly type: 'richText' }
    ? RichText
    : Field extends { readonly type: 'image' }
      ? Image
      : Field extends { readonly type: 'choice'; readonly options: readonly (infer Option)[] }
        ? OptionNameOf<Option>
        : Field extends { readonly type: 'number' }
          ? number
          : Field extends { readonly type: 'boolean' }
            ? boolean
            : Field extends { readonly type: 'record'; readonly source: infer Source }
              ? RecordValue<Source, Records>
              : never;

export type OptionNameOf<Option> = Option extends { readonly name: infer Name } ? Name : Option;

type FieldsOf<Type> = Type extends { readonly fields: infer Fields } ? Fields : NoFields;

type OptionalNames<Fields> = {
  [Name in keyof Fields]: Fields[Name] extends { readonly optional: true } ? Name : never;
}[keyof Fields];

type Flatten<Value> = { [Key in keyof Value]: Value[Key] } & {};

interface PageFields {
  readonly title: string;
  readonly description?: string;
  readonly path: string;
}

export type PropsOf<Type, Records extends RecordTypes = NoRecordTypes> = Flatten<
  {
    readonly [Name in Exclude<keyof FieldsOf<Type>, OptionalNames<FieldsOf<Type>>>]: FieldValue<
      FieldsOf<Type>[Name],
      Records
    >;
  } & {
    readonly [Name in OptionalNames<FieldsOf<Type>>]?: FieldValue<FieldsOf<Type>[Name], Records>;
  }
>;

export type PagePropsOf<Type, Records extends RecordTypes = NoRecordTypes> = Flatten<
  PageFields & PropsOf<Type, Records>
>;

export type SlotNamesOf<Type> = Type extends { readonly slots: infer Slots }
  ? keyof Slots & string
  : never;

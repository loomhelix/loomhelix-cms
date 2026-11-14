export type Mark = 'bold' | 'italic';

export interface Span {
  readonly text: string;
  readonly marks?: readonly Mark[];
  readonly link?: string;
}

export type Paragraph = readonly Span[];

export type RichText = readonly Paragraph[];

export interface Image {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

interface FieldDefinition {
  readonly label?: string;
  readonly optional: boolean;
  readonly default?: unknown;
}

export interface TextField extends FieldDefinition {
  readonly type: 'text';
  readonly multiline: boolean;
  readonly maxLength?: number;
}

export interface RichTextField extends FieldDefinition {
  readonly type: 'richText';
}

export interface LinkField extends FieldDefinition {
  readonly type: 'link';
}

export interface ImageField extends FieldDefinition {
  readonly type: 'image';
}

export interface NumberField extends FieldDefinition {
  readonly type: 'number';
  readonly integer: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface BooleanField extends FieldDefinition {
  readonly type: 'boolean';
}

export interface RecordField extends FieldDefinition {
  readonly type: 'record';
  readonly source: string;
}

export interface ChoiceOption {
  readonly name: string;
  readonly label?: string;
}

export interface ChoiceField extends FieldDefinition {
  readonly type: 'choice';
  readonly options: readonly ChoiceOption[];
}

export type Field =
  | TextField
  | RichTextField
  | LinkField
  | ImageField
  | ChoiceField
  | NumberField
  | BooleanField
  | RecordField;

export interface SlotDefinition {
  readonly label?: string;
  readonly allow: readonly string[];
  readonly min?: number;
  readonly max?: number;
}

export type Operation =
  | { readonly op: 'renameField'; readonly from: string; readonly to: string }
  | { readonly op: 'addField'; readonly field: string; readonly value: unknown }
  | { readonly op: 'removeField'; readonly field: string }
  | {
      readonly op: 'mapValues';
      readonly field: string;
      readonly values: Readonly<Record<string, unknown>>;
    }
  | { readonly op: 'renameSlot'; readonly from: string; readonly to: string }
  | { readonly op: 'removeSlot'; readonly slot: string };

export interface TypeDefinition {
  readonly label?: string;
  readonly version: number;
  readonly fields: ReadonlyMap<string, Field>;
  readonly slots: ReadonlyMap<string, SlotDefinition>;
  readonly migrations: ReadonlyMap<number, readonly Operation[]>;
}

export interface Schema {
  readonly pages: ReadonlyMap<string, TypeDefinition>;
  readonly blocks: ReadonlyMap<string, TypeDefinition>;
  readonly renamedTypes: ReadonlyMap<string, string>;
  readonly removedTypes: ReadonlySet<string>;
}

export interface Block {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly props: Readonly<Record<string, unknown>>;
  readonly slots?: Readonly<Record<string, readonly (Block | BlockReference)[]>>;
}

export interface BlockReference {
  readonly id: string;
  readonly type: string;
  readonly document: string;
}

export interface PageDocument {
  readonly formatVersion: 0;
  readonly root: Block;
}

export type BlockErrorCode =
  | 'unknownType'
  | 'notAllowed'
  | 'newerVersion'
  | 'migrationFailed'
  | 'invalidProps'
  | 'unknownSlot'
  | 'invalidBlockCount'
  | 'missingDocument'
  | 'invalidReference'
  | 'cyclicReference'
  | 'tooManyLevels'
  | 'missingRecord';

export interface BlockError {
  readonly blockId: string;
  readonly code: BlockErrorCode;
  readonly message: string;
}

export interface LoadResult {
  readonly document: PageDocument;
  readonly errors: readonly BlockError[];
}

import type { PagePropsOf, PropsOf, RecordTypes, SlotNamesOf } from '@loomhelix-cms/schema';
import type { Template } from './renderer.ts';

interface SchemaTypes {
  readonly pages: object;
  readonly blocks: object;
}

export type TemplatesOf<
  Schema extends SchemaTypes,
  Records extends RecordTypes = Readonly<Record<never, never>>,
> = {
  readonly [Name in keyof Schema['pages']]: Template<
    PagePropsOf<Schema['pages'][Name], Records>,
    SlotNamesOf<Schema['pages'][Name]>
  >;
} & {
  readonly [Name in keyof Schema['blocks']]: Template<
    PropsOf<Schema['blocks'][Name], Records>,
    SlotNamesOf<Schema['blocks'][Name]>
  >;
};

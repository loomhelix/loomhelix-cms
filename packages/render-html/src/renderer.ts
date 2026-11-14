import {
  isBlockReference,
  type Block,
  type BlockError,
  type BlockReference,
  type DocumentSet,
  type LoadResult,
  type Schema,
  type TypeDefinition,
} from '@loomhelix-cms/schema';
import { Html, html } from './html.ts';

export type RenderMode = 'live' | 'preview';

export interface TemplateInput<
  Props = Readonly<Record<string, unknown>>,
  SlotName extends string = string,
> {
  readonly id: string;
  readonly type: string;
  readonly props: Props;
  readonly slots: Readonly<Record<SlotName, Html>>;
}

interface TemplateMethod<Input> {
  render(block: Input): Html;
}

export type Template<
  Props = Readonly<Record<string, unknown>>,
  SlotName extends string = string,
> = TemplateMethod<TemplateInput<Props, SlotName>>['render'];

export type Render = (documents: DocumentSet, mode: RenderMode) => string;

export class RenderError extends Error {
  override readonly name = 'RenderError';
}

const RENDER_MODES: ReadonlySet<unknown> = new Set(['live', 'preview']);
const FIRST_TAG_PATTERN = /^\s*<[a-z][a-z0-9-]*(?=[\s/>])/i;

export function createRenderer(
  schema: Schema,
  templates: Readonly<Record<string, Template>>,
): Render {
  const templatesByType = readTemplates(schema, templates);
  return ({ main, shown }, mode) => {
    if (!RENDER_MODES.has(mode)) {
      throw new TypeError(
        `The render mode must be "live" or "preview", got ${JSON.stringify(mode)}.`,
      );
    }
    const { document, errors } = main;
    const errorsById = errorsByIdOf(errors);
    const rootError = errorsById.get(document.root.id);
    const isBlockDocument = schema.blocks.has(document.root.type);
    if (rootError !== undefined && isBlockDocument && mode === 'preview') {
      return renderFallback(document.root.id, rootError.message).text;
    }
    if (rootError !== undefined) {
      throw new RenderError(`The document cannot be rendered. ${rootError.message}`);
    }
    const page = { schema, templatesByType, errorsById, shown, mode };
    const output = renderType(page, document.root, isBlockDocument ? schema.blocks : schema.pages);
    return (isBlockDocument && mode === 'preview' ? markBlock(output, document.root) : output).text;
  };
}

interface Page {
  readonly schema: Schema;
  readonly templatesByType: ReadonlyMap<string, Template>;
  readonly errorsById: ReadonlyMap<string, BlockError>;
  readonly shown: ReadonlyMap<string, LoadResult>;
  readonly mode: RenderMode;
}

function errorsByIdOf(errors: readonly BlockError[]): ReadonlyMap<string, BlockError> {
  return new Map(errors.map((error) => [error.blockId, error]));
}

function readTemplates(
  schema: Schema,
  templates: Readonly<Record<string, Template>>,
): ReadonlyMap<string, Template> {
  const typeNames = [...schema.pages.keys(), ...schema.blocks.keys()];
  const missingName = typeNames.find((name) => !Object.hasOwn(templates, name));
  if (missingName !== undefined) {
    throw new RenderError(
      `The schema has the type "${missingName}", but the templates have no "${missingName}". Add a template for it.`,
    );
  }
  const unknownName = Object.keys(templates).find((name) => !typeNames.includes(name));
  if (unknownName !== undefined) {
    throw new RenderError(
      `The templates have "${unknownName}", but the schema has no type with this name. Remove the template or correct its name.`,
    );
  }
  return new Map(Object.entries(templates));
}

function renderType(page: Page, block: Block, types: ReadonlyMap<string, TypeDefinition>): Html {
  const type = types.get(block.type);
  const template = page.templatesByType.get(block.type);
  if (type === undefined || template === undefined) {
    throw new RenderError(
      `The block "${block.id}" has the type "${block.type}", but it has no template.`,
    );
  }
  const slots = Object.fromEntries(
    [...type.slots.keys()].map((slotName) => [
      slotName,
      html`${childrenOf(block, slotName).map((child) => renderChild(page, child))}`,
    ]),
  );
  const output: unknown = template({ id: block.id, type: block.type, props: block.props, slots });
  if (!(output instanceof Html)) {
    throw new RenderError(`The template of "${block.type}" must return the result of html.`);
  }
  return output;
}

function childrenOf(block: Block, slotName: string): readonly (Block | BlockReference)[] {
  const slots = block.slots ?? {};
  return Object.hasOwn(slots, slotName) ? (slots[slotName] ?? []) : [];
}

function renderChild(page: Page, block: Block | BlockReference): Html {
  const error = page.errorsById.get(block.id) ?? shownRootError(page, block);
  if (error !== undefined) {
    return page.mode === 'preview' ? renderFallback(block.id, error.message) : html``;
  }
  const output = isBlockReference(block)
    ? renderShownDocument(page, block)
    : renderType(page, block, page.schema.blocks);
  return page.mode === 'preview' ? markBlock(output, block) : output;
}

function shownRootError(page: Page, block: Block | BlockReference): BlockError | undefined {
  const shown = isBlockReference(block) ? page.shown.get(block.document) : undefined;
  return shown?.errors.find(({ blockId }) => blockId === shown.document.root.id);
}

function renderShownDocument(page: Page, reference: BlockReference): Html {
  const shown = page.shown.get(reference.document);
  if (shown === undefined) {
    throw new RenderError(
      `The block "${reference.id}" shows the document "${reference.document}", but the document set does not have it. Load the documents with loadDocumentSet.`,
    );
  }
  const shownPage = { ...page, errorsById: errorsByIdOf(shown.errors), mode: 'live' as const };
  return renderType(shownPage, shown.document.root, page.schema.blocks);
}

function markBlock(output: Html, block: Block | BlockReference): Html {
  const firstTag = FIRST_TAG_PATTERN.exec(output.text)?.[0];
  if (firstTag === undefined) {
    throw new RenderError(
      `The template of "${block.type}" must return markup that starts with an element, because the preview marks this element with data-lhcms-block.`,
    );
  }
  return new Html(
    `${firstTag} data-lhcms-block="${block.id}"${output.text.slice(firstTag.length)}`,
  );
}

function renderFallback(blockId: string, message: string): Html {
  return html`<div
    data-lhcms-block="${blockId}"
    class="lhcms-fallback"
    style="border: 2px dashed #b42318; padding: 1rem; font: 1rem sans-serif"
  >
    <p>This block cannot be shown.</p>
    <details>
      <summary>Details</summary>
      <p>${message}</p>
    </details>
  </div>`;
}

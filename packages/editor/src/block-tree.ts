import {
  isBlockReference,
  type Block,
  type BlockError,
  type BlockReference,
  type PageDocument,
  type Schema,
  type SlotDefinition,
  type TypeDefinition,
} from '@loomhelix-cms/schema';
import { html, nothing, type TemplateResult } from 'lit';
import { rootTypeOf, type BlockDocumentSummary } from './document-kinds.ts';
import { slotChildren, type MoveDirection } from './document-edits.ts';
import { toProseMirror } from './rich-text-conversion.ts';

const SUMMARY_LENGTH = 40;

export interface BlockTree {
  readonly schema: Schema;
  readonly document: PageDocument;
  readonly errors: ReadonlyMap<string, BlockError>;
  readonly blockDocuments: readonly BlockDocumentSummary[];
  readonly selectedBlockId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onHover: (id: string | null) => void;
  readonly onAdd: (parentId: string, slotName: string, typeName: string) => void;
  readonly onAddReference: (
    parentId: string,
    slotName: string,
    shown: BlockDocumentSummary,
  ) => void;
  readonly onRemove: (id: string) => void;
  readonly onMove: (id: string, direction: MoveDirection) => void;
}

export function renderBlockTree(tree: BlockTree): TemplateResult {
  const rootType = rootTypeOf(tree.schema, tree.document);
  return html`<section class="tree" aria-label="Blocks">
    <h2>Blocks</h2>
    ${rootType === undefined ? nothing : renderSlots(tree, tree.document.root, rootType)}
  </section>`;
}

function renderSlots(tree: BlockTree, block: Block, type: TypeDefinition): TemplateResult[] {
  return [...type.slots].map(([slotName, slot]) => {
    const children = slotChildren(block, slotName);
    const isFull = children.length >= (slot.max ?? Infinity);
    return html`<div class="slot">
      <p class="slot-name">${slot.label ?? slotName}</p>
      <ol>
        ${children.map((child, index) => renderBlock(tree, child, index, children.length))}
      </ol>
      ${
        isFull
          ? nothing
          : html`<div class="add">
              ${slot.allow.map(
                (typeName) =>
                  html`<button
                    type="button"
                    @click=${() => tree.onAdd(block.id, slotName, typeName)}
                  >
                    + ${tree.schema.blocks.get(typeName)?.label ?? typeName}
                  </button>`,
              )}
            </div>`
      }
      ${isFull ? nothing : renderBlockDocuments(tree, block, slotName, slot)}
    </div>`;
  });
}

function renderBlockDocuments(
  tree: BlockTree,
  block: Block,
  slotName: string,
  slot: SlotDefinition,
): TemplateResult | typeof nothing {
  const shared = tree.blockDocuments.filter(
    (shown) => slot.allow.includes(shown.type) && shown.id !== tree.document.root.id,
  );
  if (shared.length === 0) {
    return nothing;
  }
  return html`<details class="shared">
    <summary>Shared blocks</summary>
    <div class="add">
      ${shared.map(
        (shown) =>
          html`<button type="button" @click=${() => tree.onAddReference(block.id, slotName, shown)}>
            + ${tree.schema.blocks.get(shown.type)?.label ?? shown.type}: ${shown.id}
          </button>`,
      )}
    </div>
  </details>`;
}

function renderBlock(
  tree: BlockTree,
  block: Block | BlockReference,
  index: number,
  count: number,
): TemplateResult {
  const type = tree.schema.blocks.get(block.type);
  const label = type?.label ?? block.type;
  const summary = summaryOf(block, type);
  const error = tree.errors.get(block.id);
  const isSelected = block.id === tree.selectedBlockId;
  return html`<li>
    <div
      class=${isSelected ? 'block selected' : 'block'}
      @mouseenter=${() => tree.onHover(block.id)}
      @mouseleave=${() => tree.onHover(null)}
    >
      <button
        type="button"
        class="block-name"
        aria-pressed=${isSelected ? 'true' : 'false'}
        @click=${() => tree.onSelect(block.id)}
      >
        ${label}${summary === '' ? nothing : html`<span class="summary">${summary}</span>`}
      </button>
      ${
        error === undefined
          ? nothing
          : html`<span
              class="block-error"
              title=${error.message}
              aria-label="This block has an error"
            >
              !
            </span>`
      }
      <button
        type="button"
        aria-label=${`Move ${label} up`}
        ?disabled=${index === 0}
        @click=${() => tree.onMove(block.id, 'up')}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label=${`Move ${label} down`}
        ?disabled=${index === count - 1}
        @click=${() => tree.onMove(block.id, 'down')}
      >
        ↓
      </button>
      <button type="button" aria-label=${`Remove ${label}`} @click=${() => tree.onRemove(block.id)}>
        ✕
      </button>
    </div>
    ${type === undefined || isBlockReference(block) ? nothing : renderSlots(tree, block, type)}
  </li>`;
}

function summaryOf(block: Block | BlockReference, type: TypeDefinition | undefined): string {
  if (isBlockReference(block)) {
    return `Shared: ${block.document}`;
  }
  return type === undefined ? '' : summarize(block, type);
}

function summarize(block: Block, type: TypeDefinition): string {
  for (const [name, field] of type.fields) {
    const value = Object.hasOwn(block.props, name) ? block.props[name] : undefined;
    if (field.type === 'text' && typeof value === 'string') {
      return shorten(value);
    }
    if (field.type === 'richText' && Array.isArray(value)) {
      return shorten(toProseMirror(value).child(0).textContent);
    }
  }
  return '';
}

function shorten(text: string): string {
  const characters = Array.from(text.replaceAll(/\s+/g, ' ').trim());
  return characters.length > SUMMARY_LENGTH
    ? `${characters.slice(0, SUMMARY_LENGTH).join('')}…`
    : characters.join('');
}

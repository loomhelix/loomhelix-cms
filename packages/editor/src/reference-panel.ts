import type { BlockError, BlockReference } from '@loomhelix-cms/schema';
import { html, nothing, type TemplateResult } from 'lit';

export interface ReferencePanel {
  readonly heading: string;
  readonly reference: BlockReference;
  readonly error: BlockError | undefined;
  readonly hasChanges: boolean;
  readonly onOpen: () => void;
  readonly onBack: () => void;
}

export function renderReferencePanel(panel: ReferencePanel): TemplateResult {
  return html`<section class="fields" aria-label=${panel.heading}>
    <button type="button" class="link" @click=${panel.onBack}>← Blocks</button>
    <h2>${panel.heading}</h2>
    <p class="hint">${sharedBlockText(panel.reference)}</p>
    ${panel.error === undefined ? nothing : html`<p class="error">${panel.error.message}</p>`}
    ${panel.error?.code === 'missingDocument' ? nothing : renderOpenButton(panel)}
  </section>`;
}

function renderOpenButton(panel: ReferencePanel): TemplateResult {
  return html`<div class="actions">
      <button type="button" @click=${panel.onOpen} ?disabled=${panel.hasChanges}>
        Edit the shared block
      </button>
    </div>
    ${
      panel.hasChanges
        ? html`<p class="hint">Save or discard the changes to edit the shared block.</p>`
        : nothing
    }`;
}

function sharedBlockText(reference: BlockReference): string {
  return `This block shows the shared block "${reference.document}". A change of the shared block shows on each page with it.`;
}

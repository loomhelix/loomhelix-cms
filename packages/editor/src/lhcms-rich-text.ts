import type { LinkField, RichText } from '@loomhelix-cms/schema';
import { html, LitElement, nothing, type PropertyDeclarations, type PropertyValues } from 'lit';
import { baseKeymap, splitBlock, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { MarkType, Slice } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describeFieldError, LINK_EXAMPLE } from './field-messages.ts';
import {
  fromProseMirror,
  richTextSchema,
  toPlainTextSlice,
  toProseMirror,
} from './rich-text-conversion.ts';
import { findLinkRange, removeLink, setLink } from './rich-text-links.ts';

const { bold, italic } = richTextSchema.marks;
const LINK_ADDRESS: LinkField = { type: 'link', optional: false };
const NO_SELECTION = 'Select the text for the link.';

interface LinkForm {
  readonly address: string;
  readonly error: string | undefined;
}

export class LhcmsRichText extends LitElement {
  static override properties: PropertyDeclarations = {
    value: { attribute: false },
    labelId: { attribute: false },
    errorId: { attribute: false },
    isInvalid: { attribute: false },
    onChange: { attribute: false },
    editorState: { state: true },
    linkForm: { state: true },
  };

  declare value: unknown;
  declare labelId: string;
  declare errorId: string;
  declare isInvalid: boolean;
  declare onChange: ((value: RichText | undefined) => void) | undefined;
  declare private editorState: EditorState;
  declare private linkForm: LinkForm | undefined;

  private readonly area = document.createElement('div');
  private editorView: EditorView | undefined = undefined;
  private shownValue: unknown = undefined;

  constructor() {
    super();
    this.value = undefined;
    this.labelId = '';
    this.errorId = '';
    this.isInvalid = false;
    this.onChange = undefined;
    this.editorState = createEditorState(undefined, this.openLinkForm);
    this.linkForm = undefined;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    this.editorView?.destroy();
    this.editorView = undefined;
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && this.value !== this.shownValue) {
      this.shownValue = this.value;
      this.editorState = createEditorState(this.value, this.openLinkForm);
      this.linkForm = undefined;
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (this.editorView === undefined) {
      this.editorView = new EditorView(
        { mount: this.area },
        {
          state: this.editorState,
          attributes: this.textboxAttributes(),
          dispatchTransaction: this.dispatch,
          handlePaste: pastePlainText,
          handleDrop: dropPlainText,
        },
      );
      return;
    }
    if (this.editorView.state !== this.editorState) {
      this.editorView.updateState(this.editorState);
    }
    if (changed.has('isInvalid') || changed.has('labelId') || changed.has('errorId')) {
      this.editorView.setProps({ attributes: this.textboxAttributes() });
    }
  }

  override render() {
    return html`<div class="format-buttons" role="toolbar" aria-label="Formatting">
        ${this.renderMarkButton('Bold', bold)} ${this.renderMarkButton('Italic', italic)}
        <button
          type="button"
          aria-expanded=${String(this.linkForm !== undefined)}
          ?disabled=${findLinkRange(this.editorState) === undefined}
          @mousedown=${keepFocus}
          @click=${this.openLinkForm}
        >
          Link
        </button>
      </div>
      ${this.linkForm === undefined ? nothing : this.renderLinkForm(this.linkForm)} ${this.area}`;
  }

  private renderLinkForm(form: LinkForm) {
    const hasLink = findLinkRange(this.editorState)?.href !== undefined;
    return html`<div class="link-form">
      <label>
        Link address
        <input
          .value=${form.address}
          placeholder=${LINK_EXAMPLE}
          aria-invalid=${String(form.error !== undefined)}
          @input=${this.changeLinkAddress}
          @keydown=${this.handleLinkKey}
        />
      </label>
      ${form.error === undefined ? nothing : html`<p class="error" role="alert">${form.error}</p>`}
      <div class="actions">
        <button type="button" class="primary" @click=${this.applyLinkForm}>Apply</button>
        ${
          hasLink
            ? html`<button type="button" @click=${this.removeSelectedLink}>Remove link</button>`
            : nothing
        }
        <button type="button" @click=${this.closeLinkForm}>Cancel</button>
      </div>
    </div>`;
  }

  private renderMarkButton(label: string, type: MarkType) {
    return html`<button
      type="button"
      aria-pressed=${String(hasMark(this.editorState, type))}
      @mousedown=${keepFocus}
      @click=${() => this.formatSelection(type)}
    >
      ${label}
    </button>`;
  }

  private formatSelection(type: MarkType): void {
    toggleMark(type)(this.editorState, this.dispatch);
    this.editorView?.focus();
  }

  private readonly openLinkForm = (): void => {
    this.linkForm = { address: findLinkRange(this.editorState)?.href ?? '', error: undefined };
    void this.updateComplete.then(() =>
      this.querySelector<HTMLInputElement>('.link-form input')?.focus(),
    );
  };

  private readonly changeLinkAddress = (event: Event): void => {
    this.linkForm = { address: (event.target as HTMLInputElement).value, error: undefined };
  };

  private readonly handleLinkKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyLinkForm();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeLinkForm();
    }
  };

  private readonly applyLinkForm = (): void => {
    const address = this.linkForm?.address.trim() ?? '';
    const error = describeFieldError(LINK_ADDRESS, address === '' ? undefined : address);
    const range = findLinkRange(this.editorState);
    if (error !== undefined || range === undefined) {
      this.linkForm = { address, error: error ?? NO_SELECTION };
      return;
    }
    this.dispatch(setLink(this.editorState, range, address));
    this.closeLinkForm();
  };

  private readonly removeSelectedLink = (): void => {
    const range = findLinkRange(this.editorState);
    if (range !== undefined) {
      this.dispatch(removeLink(this.editorState, range));
    }
    this.closeLinkForm();
  };

  private readonly closeLinkForm = (): void => {
    this.linkForm = undefined;
    this.editorView?.focus();
  };

  private readonly dispatch = (transaction: Transaction): void => {
    this.editorState = this.editorState.apply(transaction);
    this.editorView?.updateState(this.editorState);
    if (transaction.docChanged) {
      this.reportValue();
    }
  };

  private reportValue(): void {
    const value = fromProseMirror(this.editorState.doc);
    if (JSON.stringify(value) !== JSON.stringify(this.shownValue)) {
      this.shownValue = value;
      this.onChange?.(value);
    }
  }

  private textboxAttributes(): Record<string, string> {
    return {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': this.labelId,
      'aria-describedby': this.errorId,
      'aria-invalid': String(this.isInvalid),
    };
  }
}

function createEditorState(value: unknown, openLinkForm: () => void): EditorState {
  return EditorState.create({
    doc: toProseMirror(value),
    plugins: [
      history(),
      keymap({
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-y': redo,
        'Mod-b': toggleMark(bold),
        'Mod-i': toggleMark(italic),
        'Shift-Enter': splitBlock,
        'Mod-k': (state) => {
          if (findLinkRange(state) === undefined) {
            return false;
          }
          openLinkForm();
          return true;
        },
      }),
      keymap(baseKeymap),
    ],
  });
}

function hasMark(state: EditorState, type: MarkType): boolean {
  const { empty, from, to, $from } = state.selection;
  if (empty) {
    return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
  }
  return state.doc.rangeHasMark(from, to, type);
}

function pastePlainText(view: EditorView, event: ClipboardEvent): boolean {
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (text !== '') {
    const { state } = view;
    const marks = state.storedMarks ?? state.selection.$from.marks();
    view.dispatch(state.tr.replaceSelection(toPlainTextSlice(text, marks)).scrollIntoView());
  }
  return true;
}

function dropPlainText(view: EditorView, event: DragEvent, _: Slice, isMoved: boolean): boolean {
  if (isMoved) {
    return false;
  }
  const text = event.dataTransfer?.getData('text/plain') ?? '';
  const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (text !== '' && target !== null) {
    const marks = view.state.doc.resolve(target.pos).marks();
    view.dispatch(view.state.tr.replace(target.pos, target.pos, toPlainTextSlice(text, marks)));
    view.focus();
  }
  return true;
}

function keepFocus(event: Event): void {
  event.preventDefault();
}

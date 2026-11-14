import {
  DocumentError,
  isBlockReference,
  loadDocument,
  loadDocumentSet,
  parseSchema,
  type Block,
  type BlockReference,
  type PageDocument,
  type BlockError,
  type Schema,
} from '@loomhelix-cms/schema';
import { html, LitElement, nothing, type PropertyDeclarations, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { renderBlockTree } from './block-tree.ts';
import {
  addBlock,
  createBlock,
  createBlockId,
  findItem,
  moveBlock,
  removeBlock,
  restoreBlock,
  setProp,
  type MoveDirection,
  type Removal,
} from './document-edits.ts';
import {
  blockDocumentsOf,
  isBlockDocument,
  rootTypeOf,
  withoutBlockDocuments,
  type BlockDocumentSummary,
} from './document-kinds.ts';
import { editorStyles } from './editor-styles.ts';
import {
  PAGE_DESCRIPTION_FIELD,
  PAGE_TITLE_FIELD,
  renderFieldForm,
  type FieldFormView,
} from './field-form.ts';
import type {
  DocumentSummary,
  EditorStorage,
  ImageUpload,
  RecordLookup,
} from './editor-storage.ts';
import { errorText } from './error-text.ts';
import type { LhcmsEditorElement } from './lhcms-editor-element.ts';
import { createBlockDocument, createPageDocument, createPageId } from './new-page.ts';
import { createPageForm, renderPageForm, type PageForm } from './page-form.ts';
import { readBridgeMessage, type EditorMessage } from './preview-messages.ts';
import { renderReferencePanel } from './reference-panel.ts';

interface OpenPage {
  readonly id: string;
  readonly document: PageDocument;
  readonly isNew: boolean;
  readonly errors: ReadonlyMap<string, BlockError>;
}

interface OpenedFrom {
  readonly documentId: string;
  readonly blockId: string;
}

interface Message {
  readonly kind: 'error' | 'status';
  readonly text: string;
}

const SETUP_ERROR =
  'The editor needs a storage and a schema. Set the property storage, and the property schema or the attribute schema-url.';
const NO_PAGES_STATUS = 'The site has no pages yet. To make a page, select "New page".';
const PREVIEW_DELAY = 500;
const PREVIEW_FIELD = 'document';

let previewFrameCount = 0;

export class LhcmsEditor extends LitElement implements LhcmsEditorElement {
  static override properties: PropertyDeclarations = {
    schemaUrl: { attribute: 'schema-url' },
    previewUrl: { attribute: 'preview-url' },
    pageId: { attribute: 'page-id' },
    documentId: { attribute: 'document-id' },
    documentType: { attribute: 'document-type' },
    schema: { attribute: false },
    storage: { attribute: false },
    parsedSchema: { state: true },
    documents: { state: true },
    page: { state: true },
    isDirty: { state: true },
    selectedBlockId: { state: true },
    removal: { state: true },
    pageForm: { state: true },
    message: { state: true },
    isBusy: { state: true },
    view: { state: true },
    isConfirmingSave: { state: true },
    phoneView: { state: true },
    openedFrom: { state: true },
  };

  static override styles = editorStyles;

  declare schemaUrl: string;
  declare previewUrl: string;
  declare pageId: string | undefined;
  declare documentId: string | undefined;
  declare documentType: string | undefined;
  declare schema: unknown;
  declare storage: EditorStorage | undefined;
  declare private parsedSchema: Schema | undefined;
  declare private documents: readonly DocumentSummary[];
  declare private page: OpenPage | undefined;
  declare private isDirty: boolean;
  declare private selectedBlockId: string | undefined;
  declare private removal: Removal | undefined;
  declare private pageForm: PageForm | undefined;
  declare private message: Message | undefined;
  declare private isBusy: boolean;
  declare private view: 'tree' | 'fields';
  declare private isConfirmingSave: boolean;
  declare private phoneView: 'edit' | 'preview';
  declare private openedFrom: readonly OpenedFrom[];

  private activeStorage: EditorStorage | undefined = undefined;
  private lookupRecords: RecordLookup | undefined = undefined;
  private uploadImage: ImageUpload | undefined = undefined;
  private readonly previewFrameName = `lhcms-preview-${(previewFrameCount += 1)}`;
  private previewTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private readonly shownDocuments = new Map<string, Promise<unknown>>();

  constructor() {
    super();
    this.schemaUrl = '';
    this.previewUrl = '';
    this.pageId = undefined;
    this.documentId = undefined;
    this.documentType = undefined;
    this.schema = undefined;
    this.storage = undefined;
    this.parsedSchema = undefined;
    this.documents = [];
    this.page = undefined;
    this.isDirty = false;
    this.selectedBlockId = undefined;
    this.removal = undefined;
    this.pageForm = undefined;
    this.message = undefined;
    this.isBusy = false;
    this.view = 'tree';
    this.isConfirmingSave = false;
    this.phoneView = 'edit';
    this.openedFrom = [];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('beforeunload', this.warnBeforeUnload);
    window.addEventListener('message', this.handlePreviewMessage);
    void this.start();
  }

  override disconnectedCallback(): void {
    window.removeEventListener('beforeunload', this.warnBeforeUnload);
    window.removeEventListener('message', this.handlePreviewMessage);
    clearTimeout(this.previewTimer);
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    const hasNewError = changed.has('message') && this.message?.kind === 'error';
    const hasNewWarning = changed.has('isConfirmingSave') && this.isConfirmingSave;
    if (hasNewError || hasNewWarning) {
      this.phoneView = 'edit';
    }
  }

  protected override updated(changed: PropertyValues): void {
    const isPreviewShown = changed.has('phoneView') && this.phoneView === 'preview';
    if (changed.has('selectedBlockId') || isPreviewShown) {
      this.showSelection();
    }
    if (this.activeStorage === undefined && (changed.has('storage') || changed.has('schema'))) {
      void this.start();
      return;
    }
    if (changed.has('schema') && changed.get('schema') !== undefined) {
      this.applySchemaJson(this.schema);
    }
    if (changed.has('schemaUrl') && changed.get('schemaUrl') !== undefined) {
      void this.reloadSchema();
    }
  }

  private readonly warnBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.isDirty) {
      event.preventDefault();
    }
  };

  private async start(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    const storage = this.storage;
    if (this.activeStorage !== undefined) {
      return;
    }
    if (storage === undefined || (this.schema === undefined && this.schemaUrl === '')) {
      this.message = { kind: 'error', text: SETUP_ERROR };
      return;
    }
    this.activeStorage = storage;
    this.lookupRecords = storage.lookup?.bind(storage);
    this.uploadImage = storage.upload?.bind(storage);
    this.message = undefined;
    try {
      this.parsedSchema =
        this.schema === undefined ? await readSchema(this.schemaUrl) : parseSchema(this.schema);
      this.documents = await this.readDocumentList();
    } catch (error) {
      this.message = { kind: 'error', text: `The editor cannot start. ${errorText(error)}` };
      return;
    }
    const id = this.documentId ?? this.pageId ?? this.pageList()[0]?.id;
    if (id !== undefined) {
      await this.loadPage(id);
      return;
    }
    if (this.activeStorage?.list === undefined) {
      this.message = {
        kind: 'error',
        text: 'Set the document-id attribute, or give the storage a list function.',
      };
      return;
    }
    this.message = { kind: 'status', text: NO_PAGES_STATUS };
  }

  private async readDocumentList(): Promise<readonly DocumentSummary[]> {
    return (await this.activeStorage?.list?.()) ?? [];
  }

  private pageList(): readonly DocumentSummary[] {
    return this.parsedSchema === undefined
      ? []
      : withoutBlockDocuments(this.documents, this.parsedSchema);
  }

  private applySchemaJson(json: unknown): void {
    try {
      this.applySchema(parseSchema(json));
    } catch (error) {
      this.message = {
        kind: 'error',
        text: `The editor cannot read the schema. ${errorText(error)}`,
      };
    }
  }

  private async reloadSchema(): Promise<void> {
    const url = this.schemaUrl;
    try {
      const schema = await readSchema(url);
      if (url === this.schemaUrl) {
        this.applySchema(schema);
      }
    } catch (error) {
      if (url === this.schemaUrl) {
        this.message = {
          kind: 'error',
          text: `The editor cannot read the schema. ${errorText(error)}`,
        };
      }
    }
  }

  private applySchema(schema: Schema): void {
    this.parsedSchema = schema;
    this.message = undefined;
    if (this.page !== undefined) {
      const { document, errors } = loadDocument(schema, this.page.document);
      this.page = { ...this.page, document, errors: errorsById(errors) };
      void this.showReferenceErrors(schema, document);
      this.postPreview();
    }
  }

  private async loadPage(id: string): Promise<void> {
    const storage = this.activeStorage;
    if (this.parsedSchema === undefined || storage === undefined) {
      return;
    }
    this.pageId = id;
    try {
      const stored = await storage.read(id);
      if (this.pageId !== id) {
        return;
      }
      if (stored === undefined) {
        this.openNewDocument(this.parsedSchema, id);
        return;
      }
      const { document, errors } = loadDocument(this.parsedSchema, stored);
      this.shownDocuments.clear();
      this.page = {
        id,
        document,
        isNew: false,
        errors: errorsById(errors),
      };
      void this.showReferenceErrors(this.parsedSchema, document);
      this.isDirty = false;
      this.view = this.hasOnlyFields(this.parsedSchema, document) ? 'fields' : 'tree';
      this.isConfirmingSave = false;
      this.selectedBlockId = this.view === 'fields' ? document.root.id : undefined;
      this.removal = undefined;
      this.message = undefined;
      await this.updateComplete;
      this.postPreview();
    } catch (error) {
      if (this.pageId !== id) {
        return;
      }
      const reason =
        error instanceof DocumentError
          ? `The document "${id}" cannot be opened.`
          : `The editor cannot read the document "${id}".`;
      this.page = undefined;
      this.message = { kind: 'error', text: `${reason} ${errorText(error)}` };
    }
  }

  private openNewDocument(schema: Schema, id: string): void {
    const typeName = this.documentType;
    const type = typeName === undefined ? undefined : schema.blocks.get(typeName);
    if (id !== this.documentId || typeName === undefined || type === undefined) {
      this.page = undefined;
      this.message = {
        kind: 'error',
        text:
          typeName === undefined || id !== this.documentId
            ? `The document "${id}" does not exist.`
            : `The document "${id}" does not exist, and the schema has no block type "${typeName}" to create it.`,
      };
      return;
    }
    const document = createBlockDocument(id, typeName, type);
    this.page = { id, document, isNew: true, errors: new Map() };
    this.isDirty = true;
    this.view = this.hasOnlyFields(schema, document) ? 'fields' : 'tree';
    this.selectedBlockId = this.view === 'fields' ? id : undefined;
    this.message = { kind: 'status', text: 'This block is new. Save it to show it on the site.' };
    void this.updateComplete.then(this.postPreview);
  }

  private async showReferenceErrors(schema: Schema, document: PageDocument): Promise<void> {
    const errors = await this.loadWithShownDocuments(schema, document);
    if (errors !== undefined && this.page?.document === document) {
      this.page = { ...this.page, errors: errorsById(errors) };
    }
  }

  private async loadWithShownDocuments(
    schema: Schema,
    document: PageDocument,
  ): Promise<readonly BlockError[] | undefined> {
    try {
      return (await loadDocumentSet(schema, document, this.readShownDocument)).main.errors;
    } catch (error) {
      this.message = {
        kind: 'error',
        text: `The editor cannot read a shown document. ${errorText(error)}`,
      };
      return undefined;
    }
  }

  private readonly readShownDocument = (id: string): Promise<unknown> => {
    const cached = this.shownDocuments.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const stored = Promise.resolve(this.activeStorage?.read(id));
    this.shownDocuments.set(id, stored);
    stored.catch(() => {
      if (this.shownDocuments.get(id) === stored) {
        this.shownDocuments.delete(id);
      }
    });
    return stored;
  };

  private hasOnlyFields(schema: Schema, document: PageDocument): boolean {
    return isBlockDocument(schema, document) && rootTypeOf(schema, document)?.slots.size === 0;
  }

  override render() {
    return html`<div class="layout" data-phone-view=${this.phoneView}>
      <div class="phone-bar">
        <div class="view-switch" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed=${String(this.phoneView === 'edit')}
            @click=${this.showEditView}
          >
            Edit
          </button>
          <button
            type="button"
            aria-pressed=${String(this.phoneView === 'preview')}
            @click=${this.showPreviewView}
          >
            Preview
          </button>
        </div>
        ${this.renderSaveButton()}
      </div>
      <aside class="panel">
        ${this.renderToolbar()}
        ${
          this.pageForm === undefined || this.parsedSchema === undefined
            ? nothing
            : renderPageForm({
                form: this.pageForm,
                pageTypes: this.parsedSchema.pages,
                isBusy: this.isBusy,
                onChange: this.changePageForm,
                onSubmit: this.createPage,
                onCancel: this.closePageForm,
              })
        }
        ${this.renderMessage()} ${this.renderBlocks()}
      </aside>
      <section class="preview" aria-label="Preview">${this.renderPreview()}</section>
    </div>`;
  }

  private renderToolbar() {
    if (this.openedFrom.length > 0) {
      return html`${this.renderBackBar()} ${this.renderDocumentToolbar()}`;
    }
    if (this.documentId !== undefined || this.activeStorage?.list === undefined) {
      return this.renderDocumentToolbar();
    }
    const pages = this.pageList();
    return html`<label>
        Page
        <select @change=${this.selectPage} ?disabled=${pages.length === 0 || this.isDirty}>
          ${pages.map(
            (page) =>
              html`<option value=${page.id} ?selected=${page.id === this.pageId}>
                ${page.title === undefined || page.title === '' ? 'Untitled page' : page.title}
                (${page.path ?? ''})
              </option>`,
          )}
        </select>
      </label>
      ${
        this.isDirty
          ? html`<p class="hint">Save or discard the changes to open a different page.</p>`
          : nothing
      }
      <div class="actions">
        ${this.renderSaveButton()}
        ${
          this.isDirty
            ? html`<button type="button" @click=${this.discardChanges} ?disabled=${this.isBusy}>
                Discard changes
              </button>`
            : nothing
        }
        <button
          type="button"
          @click=${this.openPageForm}
          ?disabled=${this.parsedSchema === undefined || this.isDirty}
        >
          New page
        </button>
        <button type="button" @click=${this.openPageSettings} ?disabled=${this.page === undefined}>
          Page settings
        </button>
      </div>
      ${this.isConfirmingSave ? this.renderSaveWarning() : nothing}`;
  }

  private renderDocumentToolbar() {
    const { page, parsedSchema: schema } = this;
    const isBlock =
      page !== undefined && schema !== undefined && isBlockDocument(schema, page.document);
    const type =
      page === undefined || schema === undefined ? undefined : rootTypeOf(schema, page.document);
    const hasSettings =
      page !== undefined && schema !== undefined && !this.hasOnlyFields(schema, page.document);
    return html`<div class="actions">
        ${this.renderSaveButton()}
        ${
          this.isDirty && page?.isNew === false
            ? html`<button type="button" @click=${this.discardChanges} ?disabled=${this.isBusy}>
                Discard changes
              </button>`
            : nothing
        }
        ${
          hasSettings
            ? html`<button type="button" @click=${this.openPageSettings}>
                ${isBlock ? `${type?.label ?? page.document.root.type} settings` : 'Page settings'}
              </button>`
            : nothing
        }
      </div>
      ${this.isConfirmingSave ? this.renderSaveWarning() : nothing}`;
  }

  private renderBackBar() {
    return html`<div class="actions">
        <button type="button" @click=${this.goBack} ?disabled=${this.isDirty || this.isBusy}>
          ← Back
        </button>
      </div>
      <p class="hint">
        ${
          this.isDirty
            ? 'Save or discard the changes to go back.'
            : `This is the shared block "${this.pageId}". A change shows on each page with it.`
        }
      </p>`;
  }

  private renderSaveButton() {
    return html`<button
      type="button"
      class="primary save"
      @click=${this.savePage}
      ?disabled=${!this.isDirty || this.isBusy}
    >
      Save
    </button>`;
  }

  private renderSaveWarning() {
    return html`<p class="error" role="alert">
      ${saveWarningText(this.page, this.parsedSchema)}
      <button type="button" class="link" @click=${this.saveAnyway}>Save anyway</button>
      <button type="button" class="link" @click=${this.cancelSave}>Cancel</button>
    </p>`;
  }

  private renderBlocks() {
    const { page, parsedSchema: schema } = this;
    if (page === undefined || schema === undefined) {
      return nothing;
    }
    const selected =
      this.view === 'fields' && this.selectedBlockId !== undefined
        ? findItem(page.document.root, this.selectedBlockId)
        : undefined;
    if (selected !== undefined && isBlockReference(selected)) {
      return renderReferencePanel({
        heading: schema.blocks.get(selected.type)?.label ?? selected.type,
        reference: selected,
        error: page.errors.get(selected.id),
        hasChanges: this.isDirty,
        onOpen: () => this.openShownDocument(page.id, selected),
        onBack: this.showTree,
      });
    }
    if (selected !== undefined) {
      return keyed(
        `${page.id}/${selected.id}`,
        renderFieldForm(this.fieldFormView(schema, page.document, selected)),
      );
    }
    return renderBlockTree({
      schema,
      document: page.document,
      errors: page.errors,
      blockDocuments: blockDocumentsOf(schema, this.documents),
      selectedBlockId: this.selectedBlockId,
      onSelect: this.selectBlock,
      onHover: this.hoverBlock,
      onAdd: this.addBlock,
      onAddReference: this.addReference,
      onRemove: this.removeBlock,
      onMove: this.moveBlock,
    });
  }

  private fieldFormView(schema: Schema, document: PageDocument, block: Block): FieldFormView {
    const isRoot = block.id === document.root.id;
    const isPageRoot = isRoot && !isBlockDocument(schema, document);
    const type = isRoot ? rootTypeOf(schema, document) : schema.blocks.get(block.type);
    const ownFields = type?.fields ?? new Map();
    return {
      heading: isPageRoot ? 'Page settings' : (type?.label ?? block.type),
      fields: isPageRoot
        ? new Map([
            ['title', PAGE_TITLE_FIELD],
            ['description', PAGE_DESCRIPTION_FIELD],
            ...ownFields,
          ])
        : ownFields,
      props: block.props,
      hasPath: isPageRoot,
      onChange: (name, value) => this.changeField(block.id, name, value),
      onBack: this.hasOnlyFields(schema, document) ? undefined : this.showTree,
      lookup: this.lookupRecords,
      upload: this.uploadImage,
    };
  }

  private renderMessage() {
    if (this.message === undefined) {
      return nothing;
    }
    return html`<p
      class=${this.message.kind}
      role=${this.message.kind === 'error' ? 'alert' : 'status'}
    >
      ${this.message.text}
      ${
        this.removal === undefined
          ? nothing
          : html`<button type="button" class="link" @click=${this.undoRemoval}>Undo</button>`
      }
    </p>`;
  }

  private renderPreview() {
    if (this.previewUrl === '') {
      return html`<p class="empty">Add the preview-url attribute to see the preview.</p>`;
    }
    if (this.page === undefined) {
      return html`<p class="empty">No page is open.</p>`;
    }
    return html`<iframe title="Preview of the page" name=${this.previewFrameName}></iframe>
      <form
        class="preview-form"
        method="post"
        action=${this.previewUrl}
        target=${this.previewFrameName}
        hidden
      >
        <input type="hidden" name=${PREVIEW_FIELD} />
      </form>`;
  }

  private readonly postPreview = (): void => {
    clearTimeout(this.previewTimer);
    const form = this.renderRoot.querySelector<HTMLFormElement>('.preview-form');
    if (form === null || this.page === undefined) {
      return;
    }
    const field = form.elements.namedItem(PREVIEW_FIELD) as HTMLInputElement;
    field.value = JSON.stringify(this.page.document);
    form.submit();
  };

  private schedulePreview(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(this.postPreview, PREVIEW_DELAY);
  }

  private postToPreview(message: EditorMessage): void {
    const frame = this.renderRoot.querySelector('iframe');
    frame?.contentWindow?.postMessage(message, this.previewOrigin());
  }

  private previewOrigin(): string {
    return new URL(this.previewUrl, document.baseURI).origin;
  }

  private showSelection(): void {
    const blockId = this.selectedBlockId ?? null;
    this.postToPreview({ type: 'lhcms:highlight', blockId });
    if (blockId !== null) {
      this.postToPreview({ type: 'lhcms:scroll-to', blockId });
    }
  }

  private readonly handlePreviewMessage = (event: MessageEvent): void => {
    const frame = this.renderRoot.querySelector('iframe');
    if (
      frame === null ||
      event.source !== frame.contentWindow ||
      event.origin !== this.previewOrigin()
    ) {
      return;
    }
    const message = readBridgeMessage(event.data);
    if (message?.type === 'lhcms:ready') {
      this.showSelection();
    }
    if (
      message?.type === 'lhcms:select' &&
      this.page !== undefined &&
      findItem(this.page.document.root, message.blockId) !== undefined
    ) {
      this.selectBlock(message.blockId);
      this.phoneView = 'edit';
    }
  };

  private readonly showEditView = (): void => {
    this.phoneView = 'edit';
  };

  private readonly showPreviewView = (): void => {
    this.phoneView = 'preview';
  };

  private readonly hoverBlock = (blockId: string | null): void => {
    this.postToPreview({ type: 'lhcms:hover', blockId });
  };

  private changeDocument(document: PageDocument): boolean {
    if (this.page === undefined || this.parsedSchema === undefined) {
      return false;
    }
    let errors: readonly BlockError[];
    try {
      errors = loadDocument(this.parsedSchema, document).errors;
    } catch (error) {
      if (error instanceof DocumentError) {
        this.message = {
          kind: 'error',
          text: `The editor cannot make this change. ${error.message}`,
        };
        return false;
      }
      throw error;
    }
    this.page = { ...this.page, document, errors: errorsById(errors) };
    void this.showReferenceErrors(this.parsedSchema, document);
    this.isDirty = true;
    this.isConfirmingSave = false;
    this.removal = undefined;
    this.message = undefined;
    this.schedulePreview();
    return true;
  }

  private readonly selectPage = (event: Event): void => {
    void this.loadPage((event.target as HTMLSelectElement).value);
  };

  private readonly selectBlock = (id: string): void => {
    this.selectedBlockId = id;
    this.view = 'fields';
  };

  private readonly showTree = (): void => {
    this.view = 'tree';
  };

  private readonly openPageSettings = (): void => {
    if (this.page !== undefined) {
      this.selectedBlockId = this.page.document.root.id;
      this.view = 'fields';
    }
  };

  private changeField(blockId: string, name: string, value: unknown): void {
    if (this.page !== undefined && findItem(this.page.document.root, blockId) !== undefined) {
      this.changeDocument(setProp(this.page.document, blockId, name, value));
    }
  }

  private readonly addBlock = (parentId: string, slotName: string, typeName: string): void => {
    const type = this.parsedSchema?.blocks.get(typeName);
    if (this.page === undefined || type === undefined) {
      return;
    }
    const block = createBlock(createBlockId(this.page.document), typeName, type);
    if (this.changeDocument(addBlock(this.page.document, parentId, slotName, block))) {
      this.selectedBlockId = block.id;
      this.view = 'fields';
    }
  };

  private readonly addReference = async (
    parentId: string,
    slotName: string,
    shown: BlockDocumentSummary,
  ): Promise<void> => {
    const { page, parsedSchema: schema } = this;
    if (page === undefined || schema === undefined) {
      return;
    }
    const reference: BlockReference = {
      id: createBlockId(page.document),
      type: shown.type,
      document: shown.id,
    };
    const document = addBlock(page.document, parentId, slotName, reference);
    const errors = await this.loadWithShownDocuments(schema, document);
    if (errors === undefined || this.page?.document !== page.document) {
      return;
    }
    if (
      errors.some(({ blockId, code }) => blockId === reference.id && code === 'cyclicReference')
    ) {
      this.message = {
        kind: 'error',
        text: `The shared block "${shown.id}" cannot go here, because it shows this block.`,
      };
      return;
    }
    if (this.changeDocument(document)) {
      this.selectedBlockId = reference.id;
    }
  };

  private readonly removeBlock = (id: string): void => {
    const result = this.page === undefined ? undefined : removeBlock(this.page.document, id);
    if (result === undefined) {
      return;
    }
    this.changeDocument(result.document);
    this.removal = result.removal;
    this.selectedBlockId = undefined;
    this.message = { kind: 'status', text: 'The block is removed.' };
  };

  private readonly moveBlock = (id: string, direction: MoveDirection): void => {
    if (this.page !== undefined) {
      this.changeDocument(moveBlock(this.page.document, id, direction));
    }
  };

  private readonly undoRemoval = (): void => {
    const { page, removal } = this;
    if (page !== undefined && removal !== undefined) {
      if (this.changeDocument(restoreBlock(page.document, removal))) {
        this.selectedBlockId = removal.block.id;
      }
    }
  };

  private openShownDocument(fromId: string, reference: BlockReference): void {
    this.openedFrom = [...this.openedFrom, { documentId: fromId, blockId: reference.id }];
    void this.loadPage(reference.document);
  }

  private readonly goBack = async (): Promise<void> => {
    const previous = this.openedFrom.at(-1);
    if (previous === undefined) {
      return;
    }
    this.openedFrom = this.openedFrom.slice(0, -1);
    await this.loadPage(previous.documentId);
    this.selectedBlockId = previous.blockId;
    this.view = 'fields';
  };

  private readonly discardChanges = (): void => {
    if (this.page !== undefined) {
      void this.loadPage(this.page.id);
    }
  };

  private readonly savePage = async (): Promise<void> => {
    if (this.page !== undefined && this.page.errors.size > 0) {
      this.isConfirmingSave = true;
      return;
    }
    await this.writeOpenPage();
  };

  private readonly saveAnyway = async (): Promise<void> => {
    this.isConfirmingSave = false;
    await this.writeOpenPage();
  };

  private readonly cancelSave = (): void => {
    this.isConfirmingSave = false;
  };

  private async writeOpenPage(): Promise<void> {
    const page = this.page;
    const storage = this.activeStorage;
    if (page === undefined || storage === undefined) {
      return;
    }
    this.isBusy = true;
    try {
      await storage.write(page.id, page.document, { isNew: page.isNew });
    } catch (error) {
      this.message = { kind: 'error', text: `The changes are not saved. ${errorText(error)}` };
      return;
    } finally {
      this.isBusy = false;
    }
    const current = this.page ?? page;
    this.page = { ...current, isNew: false };
    this.isDirty = current.document !== page.document;
    this.removal = undefined;
    this.message = { kind: 'status', text: savedText(this.parsedSchema, page.document) };
    await this.refreshDocumentList();
  }

  private async refreshDocumentList(): Promise<void> {
    try {
      this.documents = await this.readDocumentList();
    } catch (error) {
      this.message = {
        kind: 'error',
        text: `The editor cannot read the list of documents. ${errorText(error)}`,
      };
    }
  }

  private readonly openPageForm = (): void => {
    const firstPageType = this.parsedSchema?.pages.keys().next().value;
    if (firstPageType !== undefined) {
      this.message = undefined;
      this.pageForm = createPageForm(firstPageType);
    }
  };

  private readonly changePageForm = (form: PageForm): void => {
    this.pageForm = form;
  };

  private readonly closePageForm = (): void => {
    this.pageForm = undefined;
  };

  private readonly createPage = async (): Promise<void> => {
    const form = this.pageForm;
    const type = form === undefined ? undefined : this.parsedSchema?.pages.get(form.typeName);
    const storage = this.activeStorage;
    if (form === undefined || type === undefined || storage === undefined) {
      return;
    }
    const id = createPageId();
    const title = form.title.trim();
    const document = createPageDocument({
      id,
      typeName: form.typeName,
      type,
      title,
      path: form.path,
    });
    this.isBusy = true;
    try {
      await storage.write(id, document, { isNew: true });
    } catch (error) {
      this.message = { kind: 'error', text: `The page is not created. ${errorText(error)}` };
      return;
    } finally {
      this.isBusy = false;
    }
    this.pageForm = undefined;
    await this.loadPage(id);
    await this.refreshDocumentList();
    this.message ??= { kind: 'status', text: `The page "${title}" is created.` };
  };
}

async function readSchema(url: string): Promise<Schema> {
  const response = await fetch(url, { credentials: 'same-origin' });
  return parseSchema(await response.json());
}

function savedText(schema: Schema | undefined, document: PageDocument): string {
  return schema !== undefined && isBlockDocument(schema, document)
    ? 'The block is saved.'
    : 'The page is saved.';
}

function errorsById(errors: readonly BlockError[]): ReadonlyMap<string, BlockError> {
  return new Map(errors.map((error) => [error.blockId, error]));
}

function saveWarningText(page: OpenPage | undefined, schema: Schema | undefined): string {
  if (page === undefined || schema === undefined) {
    return '';
  }
  if (page.errors.has(page.document.root.id)) {
    return isBlockDocument(schema, page.document)
      ? 'The block has an error, so the site cannot show it.'
      : 'The page settings have an error, so the site cannot show this page.';
  }
  const count = page.errors.size;
  return count === 1
    ? '1 block has an error and does not show on the site.'
    : `${count} blocks have errors and do not show on the site.`;
}

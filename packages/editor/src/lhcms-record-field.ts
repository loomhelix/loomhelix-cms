import { html, LitElement, nothing, type PropertyDeclarations, type PropertyValues } from 'lit';
import type { RecordLookup, RecordSummary } from './editor-storage.ts';
import { errorText } from './error-text.ts';

type Choice =
  | { readonly status: 'empty' }
  | { readonly status: 'loading' }
  | { readonly status: 'found'; readonly record: RecordSummary }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string };

type Search =
  | { readonly status: 'idle' }
  | { readonly status: 'done'; readonly text: string; readonly records: readonly RecordSummary[] }
  | { readonly status: 'failed'; readonly message: string };

const SEARCH_DELAY = 300;
const EMPTY_CHOICE: Choice = { status: 'empty' };
const IDLE_SEARCH: Search = { status: 'idle' };

export class LhcmsRecordField extends LitElement {
  static override properties: PropertyDeclarations = {
    value: { attribute: false },
    source: { attribute: false },
    lookup: { attribute: false },
    inputId: { attribute: false },
    errorId: { attribute: false },
    isInvalid: { attribute: false },
    isOptional: { attribute: false },
    onChange: { attribute: false },
    choice: { state: true },
    search: { state: true },
    text: { state: true },
  };

  declare value: unknown;
  declare source: string;
  declare lookup: RecordLookup | undefined;
  declare inputId: string;
  declare errorId: string;
  declare isInvalid: boolean;
  declare isOptional: boolean;
  declare onChange: ((value: string | undefined) => void) | undefined;
  declare private choice: Choice;
  declare private search: Search;
  declare private text: string;

  private searchTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor() {
    super();
    this.value = undefined;
    this.source = '';
    this.lookup = undefined;
    this.inputId = '';
    this.errorId = '';
    this.isInvalid = false;
    this.isOptional = false;
    this.onChange = undefined;
    this.choice = EMPTY_CHOICE;
    this.search = IDLE_SEARCH;
    this.text = '';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    clearTimeout(this.searchTimer);
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') || changed.has('source')) {
      void this.showChoice();
    }
  }

  override render() {
    const choiceId = `${this.inputId}-choice`;
    return html`<p class="record-choice" id=${choiceId}>${this.choiceText()}</p>
      <input
        type="search"
        id=${this.inputId}
        placeholder="Search"
        .value=${this.text}
        aria-describedby=${`${choiceId} ${this.errorId}`}
        aria-invalid=${this.isInvalid ? 'true' : 'false'}
        @focus=${this.startSearch}
        @input=${this.changeText}
      />
      ${this.renderResults()}
      ${
        this.isOptional && this.value !== undefined
          ? html`<button type="button" class="link" @click=${this.removeRecord}>Remove</button>`
          : nothing
      }`;
  }

  private choiceText(): string {
    const id = String(this.value);
    switch (this.choice.status) {
      case 'empty':
        return 'No record is selected.';
      case 'loading':
        return `The record "${id}" is loading.`;
      case 'found':
        return this.choice.record.label;
      case 'missing':
        return `The record "${id}" does not exist. Select a different record.`;
      case 'failed':
        return `The editor cannot read the record "${id}". ${this.choice.message}`;
    }
  }

  private renderResults() {
    switch (this.search.status) {
      case 'idle':
        return nothing;
      case 'failed':
        return html`<p class="error">
          The editor cannot search the records. ${this.search.message}
        </p>`;
      case 'done':
        if (this.search.records.length === 0) {
          return html`<p class="hint">${noRecordsText(this.search.text)}</p>`;
        }
        return html`<ul class="record-results">
          ${this.search.records.map(
            (record) =>
              html`<li>
                <button type="button" @click=${() => this.selectRecord(record)}>
                  ${record.label}
                </button>
              </li>`,
          )}
        </ul>`;
    }
  }

  private async showChoice(): Promise<void> {
    const { value, source, lookup } = this;
    if (typeof value !== 'string' || lookup === undefined) {
      this.choice = EMPTY_CHOICE;
      return;
    }
    if (this.choice.status === 'found' && this.choice.record.id === value) {
      return;
    }
    this.choice = { status: 'loading' };
    try {
      const record = (await lookup(source, { ids: [value] })).find(({ id }) => id === value);
      if (this.value === value) {
        this.choice = record === undefined ? { status: 'missing' } : { status: 'found', record };
      }
    } catch (error) {
      if (this.value === value) {
        this.choice = { status: 'failed', message: errorText(error) };
      }
    }
  }

  private async searchRecords(): Promise<void> {
    const { text, source, lookup } = this;
    if (lookup === undefined) {
      return;
    }
    try {
      const records = await lookup(source, { text });
      if (this.text === text) {
        this.search = { status: 'done', text, records };
      }
    } catch (error) {
      if (this.text === text) {
        this.search = { status: 'failed', message: errorText(error) };
      }
    }
  }

  private readonly startSearch = (): void => {
    if (this.search.status === 'idle') {
      void this.searchRecords();
    }
  };

  private readonly changeText = (event: Event): void => {
    this.text = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.searchRecords(), SEARCH_DELAY);
  };

  private selectRecord(record: RecordSummary): void {
    clearTimeout(this.searchTimer);
    this.choice = { status: 'found', record };
    this.text = '';
    this.search = IDLE_SEARCH;
    this.onChange?.(record.id);
  }

  private readonly removeRecord = (): void => {
    this.onChange?.(undefined);
  };
}

function noRecordsText(text: string): string {
  return text === '' ? 'The source has no records.' : `No records match "${text}".`;
}

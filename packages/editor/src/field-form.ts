import type {
  ChoiceField,
  ChoiceOption,
  Field,
  Image,
  ImageField,
  NumberField,
  RecordField,
  RichText,
  TextField,
} from '@loomhelix-cms/schema';
import { html, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type { ImageUpload, RecordLookup } from './editor-storage.ts';
import { describeFieldError, describePathError, LINK_EXAMPLE } from './field-messages.ts';

const MAX_RADIO_OPTIONS = 4;
const PATH_FIELD = 'path';
const RECORD_ID_HINT = 'The id of a record';

export const PAGE_TITLE_FIELD: TextField = {
  type: 'text',
  label: 'Title',
  optional: false,
  multiline: false,
};

export const PAGE_DESCRIPTION_FIELD: TextField = {
  type: 'text',
  label: 'Description for search engines',
  optional: true,
  multiline: false,
};

export interface FieldFormView {
  readonly heading: string;
  readonly fields: ReadonlyMap<string, Field>;
  readonly props: Readonly<Record<string, unknown>>;
  readonly hasPath: boolean;
  readonly onChange: (name: string, value: unknown) => void;
  readonly onBack: (() => void) | undefined;
  readonly lookup: RecordLookup | undefined;
  readonly upload: ImageUpload | undefined;
}

export function renderFieldForm(view: FieldFormView): TemplateResult {
  return html`<section class="fields" aria-label=${view.heading}>
    ${
      view.onBack === undefined
        ? nothing
        : html`<button type="button" class="link" @click=${view.onBack}>← Blocks</button>`
    }
    <h2>${view.heading}</h2>
    ${[...view.fields].map(([name, field]) => renderField(view, name, field))}
    ${view.hasPath ? renderPathField(view) : nothing}
    ${
      view.fields.size === 0 && !view.hasPath
        ? html`<p class="hint">This block has no fields.</p>`
        : nothing
    }
  </section>`;
}

function valueOf(props: Readonly<Record<string, unknown>>, name: string): unknown {
  return Object.hasOwn(props, name) ? props[name] : undefined;
}

function renderField(view: FieldFormView, name: string, field: Field): TemplateResult {
  const value = valueOf(view.props, name);
  const error = describeFieldError(field, value);
  const label = field.label ?? name;
  switch (field.type) {
    case 'text':
      return renderTextField(view, name, field, label, value, error);
    case 'link':
      return renderInput(view, name, label, value, error, field.optional, LINK_EXAMPLE);
    case 'image':
      return renderImageField(view, name, field, label, value, error);
    case 'choice':
      return renderChoiceField(view, name, field, label, value, error);
    case 'number':
      return renderNumberField(view, name, field, label, value, error);
    case 'boolean':
      return renderBooleanField(view, name, label, value, error);
    case 'record':
      return view.lookup === undefined
        ? renderInput(view, name, label, value, error, field.optional, RECORD_ID_HINT)
        : renderRecordField(view, name, field, label, value, error);
    case 'richText':
      return html`<div class="field">
        <span class="field-label" id=${labelId(name)}>${label}</span>
        <lhcms-rich-text
          .value=${value}
          .labelId=${labelId(name)}
          .errorId=${errorId(name)}
          .isInvalid=${error !== undefined}
          .onChange=${(next: RichText | undefined) => view.onChange(name, next)}
        ></lhcms-rich-text>
        ${renderError(name, error)}
      </div>`;
  }
}

function renderRecordField(
  view: FieldFormView,
  name: string,
  field: RecordField,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  return html`<div class="field">
    <label for=${inputId(name)}>${label}</label>
    <lhcms-record-field
      .value=${value}
      .source=${field.source}
      .lookup=${view.lookup}
      .inputId=${inputId(name)}
      .errorId=${errorId(name)}
      .isInvalid=${error !== undefined}
      .isOptional=${field.optional}
      .onChange=${(next: string | undefined) => view.onChange(name, next)}
    ></lhcms-record-field>
    ${renderError(name, error)}
  </div>`;
}

function renderTextField(
  view: FieldFormView,
  name: string,
  field: TextField,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  if (!field.multiline) {
    return renderInput(view, name, label, value, error, field.optional, '');
  }
  const change = (event: Event) =>
    view.onChange(name, textValue((event.target as HTMLTextAreaElement).value, field.optional));
  return html`<div class="field">
    <label for=${inputId(name)}>${label}</label>
    <textarea
      id=${inputId(name)}
      rows="3"
      .value=${typeof value === 'string' ? value : ''}
      @input=${change}
      aria-invalid=${error === undefined ? 'false' : 'true'}
      aria-describedby=${errorId(name)}
    ></textarea>
    ${renderError(name, error)}
  </div>`;
}

function renderInput(
  view: FieldFormView,
  name: string,
  label: string,
  value: unknown,
  error: string | undefined,
  isOptional: boolean,
  placeholder: string,
): TemplateResult {
  const change = (event: Event) =>
    view.onChange(name, textValue((event.target as HTMLInputElement).value, isOptional));
  return html`<div class="field">
    <label for=${inputId(name)}>${label}</label>
    <input
      id=${inputId(name)}
      .value=${typeof value === 'string' ? value : ''}
      placeholder=${placeholder}
      @input=${change}
      aria-invalid=${error === undefined ? 'false' : 'true'}
      aria-describedby=${errorId(name)}
    />
    ${renderError(name, error)}
  </div>`;
}

function renderNumberField(
  view: FieldFormView,
  name: string,
  field: NumberField,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  const change = (event: Event) => {
    const number = (event.target as HTMLInputElement).valueAsNumber;
    view.onChange(name, Number.isNaN(number) ? undefined : number);
  };
  return html`<div class="field">
    <label for=${inputId(name)}>${label}</label>
    <input
      id=${inputId(name)}
      type="number"
      inputmode=${field.integer ? 'numeric' : 'decimal'}
      step=${field.integer ? '1' : 'any'}
      min=${field.min ?? nothing}
      max=${field.max ?? nothing}
      .value=${live(typeof value === 'number' ? String(value) : '')}
      @input=${change}
      aria-invalid=${error === undefined ? 'false' : 'true'}
      aria-describedby=${errorId(name)}
    />
    ${renderError(name, error)}
  </div>`;
}

function renderBooleanField(
  view: FieldFormView,
  name: string,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  const change = (event: Event) => view.onChange(name, (event.target as HTMLInputElement).checked);
  return html`<div class="field">
    <label class="choice">
      <input
        id=${inputId(name)}
        type="checkbox"
        .checked=${value === true}
        @change=${change}
        aria-describedby=${errorId(name)}
      />
      ${label}
    </label>
    ${renderError(name, error)}
  </div>`;
}

function renderPathField(view: FieldFormView): TemplateResult {
  const value = valueOf(view.props, PATH_FIELD);
  const error = describePathError(value);
  const change = (event: Event) =>
    view.onChange(PATH_FIELD, (event.target as HTMLInputElement).value);
  return html`<div class="field">
    <label for=${inputId(PATH_FIELD)}>Address</label>
    <input
      id=${inputId(PATH_FIELD)}
      .value=${typeof value === 'string' ? value : ''}
      @input=${change}
      aria-invalid=${error === undefined ? 'false' : 'true'}
      aria-describedby=${errorId(PATH_FIELD)}
    />
    ${renderError(PATH_FIELD, error)}
  </div>`;
}

function renderImageField(
  view: FieldFormView,
  name: string,
  field: ImageField,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  return html`<fieldset class="field">
    <legend>${label}</legend>
    <lhcms-image-field
      .value=${value}
      .inputId=${inputId(name)}
      .errorId=${errorId(name)}
      .isInvalid=${error !== undefined}
      .isOptional=${field.optional}
      .upload=${view.upload}
      .onChange=${(next: Image | undefined) => view.onChange(name, next)}
    ></lhcms-image-field>
    ${renderError(name, error)}
  </fieldset>`;
}

function renderChoiceField(
  view: FieldFormView,
  name: string,
  field: ChoiceField,
  label: string,
  value: unknown,
  error: string | undefined,
): TemplateResult {
  const options: readonly (ChoiceOption | undefined)[] = field.optional
    ? [undefined, ...field.options]
    : field.options;
  const optionLabel = (option: ChoiceOption | undefined) =>
    option === undefined ? 'None' : (option.label ?? option.name);
  if (options.length > MAX_RADIO_OPTIONS) {
    const change = (event: Event) => {
      const selected = (event.target as HTMLSelectElement).value;
      view.onChange(name, selected === '' ? undefined : selected);
    };
    return html`<div class="field">
      <label for=${inputId(name)}>${label}</label>
      <select id=${inputId(name)} @change=${change} aria-describedby=${errorId(name)}>
        ${
          value === undefined && !field.optional
            ? html`<option value="" selected disabled>Select an option</option>`
            : nothing
        }
        ${options.map(
          (option) =>
            html`<option value=${option?.name ?? ''} ?selected=${option?.name === value}>
              ${optionLabel(option)}
            </option>`,
        )}
      </select>
      ${renderError(name, error)}
    </div>`;
  }
  return html`<fieldset class="field" aria-describedby=${errorId(name)}>
    <legend>${label}</legend>
    <div class="choices">
      ${options.map(
        (option) =>
          html`<label class="choice">
            <input
              type="radio"
              name=${inputId(name)}
              .checked=${option?.name === value}
              @change=${() => view.onChange(name, option?.name)}
            />
            ${optionLabel(option)}
          </label>`,
      )}
    </div>
    ${renderError(name, error)}
  </fieldset>`;
}

function renderError(name: string, error: string | undefined): TemplateResult {
  return html`<p class="error field-error" id=${errorId(name)}>${error ?? ''}</p>`;
}

function textValue(text: string, isOptional: boolean): string | undefined {
  return isOptional && text === '' ? undefined : text;
}

function inputId(name: string): string {
  return `field-${name}`;
}

function labelId(name: string): string {
  return `field-${name}-label`;
}

function errorId(name: string): string {
  return `field-${name}-error`;
}

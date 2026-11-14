import { isPath, type TypeDefinition } from '@loomhelix-cms/schema';
import { html, nothing, type TemplateResult } from 'lit';
import { PATH_RULE } from './field-messages.ts';
import { suggestPath } from './new-page.ts';

export interface PageForm {
  readonly typeName: string;
  readonly title: string;
  readonly path: string;
  readonly isPathEdited: boolean;
}

export interface PageFormView {
  readonly form: PageForm;
  readonly pageTypes: ReadonlyMap<string, TypeDefinition>;
  readonly isBusy: boolean;
  readonly onChange: (form: PageForm) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}

export function createPageForm(typeName: string): PageForm {
  return { typeName, title: '', path: '/', isPathEdited: false };
}

export function renderPageForm(view: PageFormView): TemplateResult {
  const { form } = view;
  const isPathValid = isPath(form.path);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    view.onSubmit();
  };
  const changeTitle = (event: Event) => {
    const title = (event.target as HTMLInputElement).value;
    view.onChange({ ...form, title, path: form.isPathEdited ? form.path : suggestPath(title) });
  };
  const changePath = (event: Event) => {
    view.onChange({ ...form, path: (event.target as HTMLInputElement).value, isPathEdited: true });
  };
  const changeType = (event: Event) => {
    view.onChange({ ...form, typeName: (event.target as HTMLSelectElement).value });
  };
  return html`<form @submit=${submit} aria-label="New page">
    ${
      view.pageTypes.size > 1
        ? html`<label>
            Page type
            <select @change=${changeType}>
              ${[...view.pageTypes].map(
                ([name, type]) =>
                  html`<option value=${name} ?selected=${name === form.typeName}>
                    ${type.label ?? name}
                  </option>`,
              )}
            </select>
          </label>`
        : nothing
    }
    <label>
      Title
      <input name="title" required .value=${form.title} @input=${changeTitle} />
    </label>
    <label>
      Address
      <input
        name="path"
        required
        .value=${form.path}
        @input=${changePath}
        aria-invalid=${isPathValid ? 'false' : 'true'}
      />
      <span class="hint">
        ${isPathValid ? 'The page opens at this address of the site.' : PATH_RULE}
      </span>
    </label>
    <div class="actions">
      <button
        type="submit"
        class="primary"
        ?disabled=${view.isBusy || !isPathValid || form.title.trim() === ''}
      >
        Create page
      </button>
      <button type="button" @click=${view.onCancel}>Cancel</button>
    </div>
  </form>`;
}

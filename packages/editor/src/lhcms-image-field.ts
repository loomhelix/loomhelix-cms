import type { Image } from '@loomhelix-cms/schema';
import { html, LitElement, nothing, type PropertyDeclarations } from 'lit';
import type { ImageUpload } from './editor-storage.ts';
import { errorText } from './error-text.ts';
import { imageFieldValue, imagePartsOf, withSize, withSource } from './image-value.ts';

type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'uploading' }
  | { readonly status: 'failed'; readonly message: string };

const MIN_PIXELS = 1;
const IDLE: UploadState = { status: 'idle' };

export class LhcmsImageField extends LitElement {
  static override properties: PropertyDeclarations = {
    value: { attribute: false },
    inputId: { attribute: false },
    errorId: { attribute: false },
    isInvalid: { attribute: false },
    isOptional: { attribute: false },
    upload: { attribute: false },
    onChange: { attribute: false },
    uploadState: { state: true },
  };

  declare value: unknown;
  declare inputId: string;
  declare errorId: string;
  declare isInvalid: boolean;
  declare isOptional: boolean;
  declare upload: ImageUpload | undefined;
  declare onChange: ((value: Image | undefined) => void) | undefined;
  declare private uploadState: UploadState;

  private sourceToMeasure: string | undefined = undefined;

  constructor() {
    super();
    this.value = undefined;
    this.inputId = '';
    this.errorId = '';
    this.isInvalid = false;
    this.isOptional = false;
    this.upload = undefined;
    this.onChange = undefined;
    this.uploadState = IDLE;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override render() {
    const image = imagePartsOf(this.value);
    return html`<label for=${`${this.inputId}-src`}>Image address</label>
      <input
        id=${`${this.inputId}-src`}
        .value=${image.src}
        placeholder="/images/photo.jpg or https://…"
        @input=${this.changeSource}
        aria-invalid=${this.isInvalid ? 'true' : 'false'}
        aria-describedby=${this.errorId}
      />
      ${this.upload === undefined ? nothing : this.renderUpload()}
      <label for=${`${this.inputId}-alt`}>Text for people who cannot see the image</label>
      <input id=${`${this.inputId}-alt`} .value=${image.alt} @input=${this.changeAlt} />
      ${
        !this.isInvalid && image.src !== ''
          ? html`<img class="thumbnail" src=${image.src} alt="" @load=${this.measure} />`
          : nothing
      }`;
  }

  private renderUpload() {
    return html`<div class="actions">
        <button
          type="button"
          @click=${this.chooseFile}
          ?disabled=${this.uploadState.status === 'uploading'}
        >
          Upload an image
        </button>
        <input
          type="file"
          id=${`${this.inputId}-file`}
          accept="image/*"
          hidden
          @change=${this.uploadFile}
        />
      </div>
      ${this.renderUploadState()}`;
  }

  private renderUploadState() {
    switch (this.uploadState.status) {
      case 'idle':
        return nothing;
      case 'uploading':
        return html`<p class="hint" role="status">The image is uploading.</p>`;
      case 'failed':
        return html`<p class="error" role="alert">
          The image is not uploaded. ${this.uploadState.message}
        </p>`;
    }
  }

  private readonly chooseFile = (): void => {
    this.querySelector<HTMLInputElement>('input[type=file]')?.click();
  };

  private readonly uploadFile = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const upload = this.upload;
    input.value = '';
    if (file === undefined || upload === undefined) {
      return;
    }
    this.uploadState = { status: 'uploading' };
    try {
      const { src } = await upload(file);
      this.uploadState = IDLE;
      this.changeSourceTo(src);
    } catch (error) {
      this.uploadState = { status: 'failed', message: errorText(error) };
    }
  };

  private emit(image: Image): void {
    this.onChange?.(imageFieldValue(image, this.isOptional));
  }

  private readonly changeSource = (event: Event): void => {
    this.changeSourceTo((event.target as HTMLInputElement).value);
  };

  private changeSourceTo(src: string): void {
    const image = imagePartsOf(this.value);
    if (src === image.src) {
      return;
    }
    this.sourceToMeasure = src;
    this.emit(withSource(image, src));
  }

  private readonly changeAlt = (event: Event): void => {
    this.emit({ ...imagePartsOf(this.value), alt: (event.target as HTMLInputElement).value });
  };

  private readonly measure = (event: Event): void => {
    const thumbnail = event.target as HTMLImageElement;
    const image = imagePartsOf(this.value);
    if (image.src !== this.sourceToMeasure || thumbnail.getAttribute('src') !== image.src) {
      return;
    }
    this.sourceToMeasure = undefined;
    if (thumbnail.naturalWidth >= MIN_PIXELS && thumbnail.naturalHeight >= MIN_PIXELS) {
      this.emit(withSize(image, thumbnail.naturalWidth, thumbnail.naturalHeight));
    }
  };
}

import type { EditorStorage } from './editor-storage.ts';

export interface LhcmsEditorElement extends HTMLElement {
  schemaUrl: string;
  previewUrl: string;
  pageId: string | undefined;
  documentId: string | undefined;
  documentType: string | undefined;
  schema: unknown;
  storage: EditorStorage | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'lhcms-editor': LhcmsEditorElement;
  }
}

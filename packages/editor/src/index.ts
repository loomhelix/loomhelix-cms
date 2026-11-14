export type {
  DocumentSummary,
  EditorStorage,
  RecordQuery,
  RecordSummary,
  UploadResult,
  WriteOptions,
} from './editor-storage.ts';
export { createHttpStorage } from './http-storage.ts';
export type { LhcmsEditorElement } from './lhcms-editor-element.ts';
import { LhcmsEditor } from './lhcms-editor.ts';
import { LhcmsImageField } from './lhcms-image-field.ts';
import { LhcmsRecordField } from './lhcms-record-field.ts';
import { LhcmsRichText } from './lhcms-rich-text.ts';

defineElement('lhcms-rich-text', LhcmsRichText);
defineElement('lhcms-record-field', LhcmsRecordField);
defineElement('lhcms-image-field', LhcmsImageField);
defineElement('lhcms-editor', LhcmsEditor);

function defineElement(name: string, element: CustomElementConstructor): void {
  if (customElements.get(name) === undefined) {
    customElements.define(name, element);
  }
}

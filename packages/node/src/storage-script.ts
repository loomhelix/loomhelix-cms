import { API_PATH, EDITOR_SCRIPT_PATH } from './cms-paths.ts';

export function storageScript(acceptsUploads: boolean): string {
  const storage = acceptsUploads
    ? `createHttpStorage('${API_PATH}')`
    : `{ ...createHttpStorage('${API_PATH}'), upload: undefined }`;
  return `import { createHttpStorage } from '${EDITOR_SCRIPT_PATH}';

const storage = ${storage};
for (const editor of document.querySelectorAll('lhcms-editor')) {
  editor.storage ??= storage;
}
`;
}

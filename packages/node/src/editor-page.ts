import { EDITOR_SCRIPT_PATH, PREVIEW_PATH, SCHEMA_PATH, STORAGE_SCRIPT_PATH } from './cms-paths.ts';

export const EDITOR_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Edit the site</title>
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
      }
    </style>
    <script type="module" src="${EDITOR_SCRIPT_PATH}"></script>
    <script type="module" src="${STORAGE_SCRIPT_PATH}"></script>
  </head>
  <body>
    <lhcms-editor
      schema-url="${SCHEMA_PATH}"
      preview-url="${PREVIEW_PATH}"
    ></lhcms-editor>
  </body>
</html>
`;

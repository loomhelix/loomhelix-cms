export const NOTICE_ID = 'opening-hours';
export const VISIT_PATH = '/visit';
export const NOTICE_EDITOR_PATH = `/edit/${NOTICE_ID}`;

export function visitPage(noticeHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Visit us</title>
  </head>
  <body>
    <main>
      <h1>Visit us</h1>
      ${noticeHtml}
    </main>
  </body>
</html>
`;
}

export const NOTICE_EDITOR_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Edit the opening hours</title>
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
      }
    </style>
    <script type="module" src="/cms/editor.js"></script>
    <script type="module" src="/cms/storage.js"></script>
  </head>
  <body>
    <lhcms-editor
      document-id="${NOTICE_ID}"
      document-type="Notice"
      schema-url="/cms/blocks.json"
      preview-url="/cms/preview"
    ></lhcms-editor>
  </body>
</html>
`;

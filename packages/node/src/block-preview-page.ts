export function defaultBlockPreviewPage(blockHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Block preview</title>
  </head>
  <body>
    ${blockHtml}
  </body>
</html>
`;
}

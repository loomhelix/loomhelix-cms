const BODY_END = '</body>';

export function withBridgeScript(html: string, scriptPath: string): string {
  const tag = `<script type="module" src="${scriptPath}"></script>`;
  const bodyEnd = html.lastIndexOf(BODY_END);
  if (bodyEnd === -1) {
    return `${html}${tag}`;
  }
  return `${html.slice(0, bodyEnd)}${tag}${html.slice(bodyEnd)}`;
}

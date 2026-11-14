import type { IncomingMessage, ServerResponse } from 'node:http';
import { RenderError } from '@loomhelix-cms/render-html';
import { DocumentError } from '@loomhelix-cms/schema';
import { withBridgeScript } from './bridge-script.ts';
import { BRIDGE_SCRIPT_PATH } from './cms-paths.ts';
import { hasBodyType, hasSiteOrigin, readBody } from './request-checks.ts';
import { sendPage, sendText } from './responses.ts';

const FORM_TYPE = 'application/x-www-form-urlencoded';
const DOCUMENT_FIELD = 'document';
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const PREVIEW_HEADERS = { 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' };

export type RenderPreview = (json: unknown) => Promise<string>;

export async function sendPreview(
  renderPreview: RenderPreview,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    sendText(response, 405, 'This address accepts only POST.', { allow: 'POST' });
    return;
  }
  if (!hasSiteOrigin(request)) {
    sendText(response, 403, 'The request must come from a page of this site.');
    return;
  }
  if (!hasBodyType(request, FORM_TYPE)) {
    sendText(response, 415, `The body must have the type ${FORM_TYPE}.`);
    return;
  }
  const body = await readBody(request, MAX_PREVIEW_BYTES);
  if (body === undefined) {
    sendText(response, 413, 'The body is larger than 2 MB.');
    return;
  }
  const documentText = new URLSearchParams(body).get(DOCUMENT_FIELD);
  if (documentText === null) {
    sendText(response, 400, `The form must have the field "${DOCUMENT_FIELD}".`);
    return;
  }
  let html: string;
  try {
    html = await renderPreview(JSON.parse(documentText));
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof DocumentError ||
      error instanceof RenderError
    ) {
      sendText(response, 400, error.message);
      return;
    }
    throw error;
  }
  sendPage(response, withBridgeScript(html, BRIDGE_SCRIPT_PATH), PREVIEW_HEADERS);
}

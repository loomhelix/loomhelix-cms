import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';

const EDITOR_HEADERS: OutgoingHttpHeaders = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
};

export const HTML_TYPE = 'text/html; charset=utf-8';
export const JSON_TYPE = 'application/json; charset=utf-8';

const TEXT_TYPE = 'text/plain; charset=utf-8';

export function send(
  response: ServerResponse,
  status: number,
  headers: OutgoingHttpHeaders,
  body: string | Buffer,
): void {
  response.writeHead(status, { ...EDITOR_HEADERS, ...headers });
  response.end(body);
}

export function sendText(
  response: ServerResponse,
  status: number,
  text: string,
  headers: OutgoingHttpHeaders = {},
): void {
  send(response, status, { ...headers, 'content-type': TEXT_TYPE }, text);
}

export function sendNoContent(response: ServerResponse, headers: OutgoingHttpHeaders): void {
  response.writeHead(204, { ...EDITOR_HEADERS, ...headers });
  response.end();
}

export function sendPage(
  response: ServerResponse,
  html: string,
  headers: OutgoingHttpHeaders = {},
): void {
  response.writeHead(200, {
    ...headers,
    'content-type': HTML_TYPE,
    'x-content-type-options': 'nosniff',
  });
  response.end(html);
}

import type { IncomingMessage } from 'node:http';

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export function hasSiteOrigin(request: IncomingMessage): boolean {
  const { origin, host } = request.headers;
  if (origin === undefined || host === undefined) {
    return false;
  }
  try {
    const url = new URL(origin);
    return WEB_PROTOCOLS.has(url.protocol) && url.host === host;
  } catch {
    return false;
  }
}

export function hasBodyType(request: IncomingMessage, type: string): boolean {
  return request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() === type;
}

export async function readBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<string | undefined> {
  return (await readBytes(request, maxBytes))?.toString('utf8');
}

export async function readBytes(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= maxBytes) {
      chunks.push(chunk);
    }
  }
  return size > maxBytes ? undefined : Buffer.concat(chunks);
}

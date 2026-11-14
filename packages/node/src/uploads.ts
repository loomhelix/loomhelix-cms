import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { findImageFormat, imageTypeOfName, type ImageFormat } from './image-files.ts';
import { hasSiteOrigin, readBytes } from './request-checks.ts';
import { JSON_TYPE, send, sendText } from './responses.ts';

export interface UploadedImage extends ImageFormat {
  readonly bytes: Uint8Array;
}

export interface UploadedFile {
  readonly size: number;
  readonly stream: () => Readable;
}

export interface UploadedFiles {
  readonly path: string;
  readonly open: (name: string) => Promise<UploadedFile | undefined>;
}

export interface UploadStore {
  readonly save: (image: UploadedImage) => Promise<string>;
  readonly files?: UploadedFiles;
}

export type UploadsApi = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CLOSED_BY_CLIENT = 'ERR_STREAM_PREMATURE_CLOSE';
const FILE_HEADERS = {
  'cache-control': 'public, max-age=31536000, immutable',
  'content-security-policy': "default-src 'none'",
  'x-content-type-options': 'nosniff',
};

export function createFolderUploads(folder: string, path: string): UploadStore {
  const basePath = path.replace(/\/+$/, '');
  if (!basePath.startsWith('/')) {
    throw new TypeError(
      `The path of the uploaded files must start with / and contain a folder name, for example /uploads, got ${JSON.stringify(path)}.`,
    );
  }
  return {
    save: async ({ bytes, extension }) => {
      const name = `${randomUUID().replaceAll('-', '')}${extension}`;
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, name), bytes, { flag: 'wx' });
      return `${basePath}/${name}`;
    },
    files: {
      path: basePath,
      open: async (name) =>
        imageTypeOfName(name) === undefined ? undefined : openExistingFile(join(folder, name)),
    },
  };
}

async function openExistingFile(file: string): Promise<UploadedFile | undefined> {
  try {
    const { size } = await stat(file);
    return { size, stream: () => createReadStream(file) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function createUploadsApi(store: UploadStore | undefined): UploadsApi {
  return async (request, response) => {
    if (request.method !== 'POST') {
      sendText(response, 405, 'This address accepts only POST.', { allow: 'POST' });
      return;
    }
    if (store === undefined) {
      sendText(response, 404, 'The site does not accept uploads.');
      return;
    }
    if (!hasSiteOrigin(request)) {
      sendText(response, 403, 'The request must come from a page of this site.');
      return;
    }
    const bytes = await readBytes(request, MAX_UPLOAD_BYTES);
    if (bytes === undefined) {
      sendText(response, 413, 'The file is larger than 10 MB.');
      return;
    }
    const format = findImageFormat(bytes);
    if (format === undefined) {
      sendText(response, 415, 'The file is not a PNG, JPEG, WebP, GIF, or AVIF image.');
      return;
    }
    const src = await store.save({ ...format, bytes });
    send(response, 201, { 'content-type': JSON_TYPE }, JSON.stringify({ src }));
  };
}

export async function sendUploadedFile(
  request: IncomingMessage,
  response: ServerResponse,
  files: UploadedFiles,
  name: string,
): Promise<void> {
  const type = imageTypeOfName(name);
  const file = type === undefined ? undefined : await files.open(name);
  if (type === undefined || file === undefined) {
    sendText(response, 404, 'The file does not exist.');
    return;
  }
  const entityTag = `"${name}"`;
  const headers = { ...FILE_HEADERS, etag: entityTag };
  if (hasEntityTag(request.headers['if-none-match'], entityTag)) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, { ...headers, 'content-type': type, 'content-length': file.size });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  try {
    await pipeline(file.stream(), response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== CLOSED_BY_CLIENT) {
      throw error;
    }
  }
}

function hasEntityTag(header: string | undefined, entityTag: string): boolean {
  return (header ?? '')
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === entityTag || tag === '*');
}

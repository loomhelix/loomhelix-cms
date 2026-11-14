import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RecordReader, RecordReaders, Schema } from '@loomhelix-cms/schema';
import { JSON_TYPE, send, sendText } from './responses.ts';

export interface RecordSummary {
  readonly id: string;
  readonly label: string;
}

export type RecordQuery = { readonly text: string } | { readonly ids: readonly string[] };

export interface RecordSource {
  readonly lookup: (query: RecordQuery) => Promise<readonly RecordSummary[]>;
  readonly read: RecordReader;
}

export type RecordSources = Readonly<Record<string, RecordSource>>;

export type RecordsApi = (
  request: IncomingMessage,
  response: ServerResponse,
  source: string,
) => Promise<void>;

export function findMissingSource(schema: Schema, sources: RecordSources): string | undefined {
  return [...schema.pages.values(), ...schema.blocks.values()]
    .flatMap((type) => [...type.fields.values()])
    .flatMap((field) => (field.type === 'record' ? [field.source] : []))
    .find((source) => !hasFunctions(Object.hasOwn(sources, source) ? sources[source] : undefined));
}

function hasFunctions(source: RecordSource | undefined): boolean {
  return typeof source?.lookup === 'function' && typeof source.read === 'function';
}

export function readersOf(sources: RecordSources): RecordReaders {
  return Object.fromEntries(Object.entries(sources).map(([name, { read }]) => [name, read]));
}

export function readRecordQuery(search: URLSearchParams): RecordQuery {
  const ids = search.getAll('id');
  return ids.length > 0 ? { ids } : { text: search.get('text') ?? '' };
}

export function createRecordsApi(sources: RecordSources): RecordsApi {
  return async (request, response, source) => {
    if (request.method !== 'GET') {
      sendText(response, 405, 'This address accepts only GET.', { allow: 'GET' });
      return;
    }
    const recordSource = Object.hasOwn(sources, source) ? sources[source] : undefined;
    if (recordSource === undefined) {
      sendText(response, 404, 'The site has no record source with this name.');
      return;
    }
    const query = readRecordQuery(new URL(request.url ?? '', 'http://localhost').searchParams);
    const records = (await recordSource.lookup(query)).map(({ id, label }) => ({ id, label }));
    send(response, 200, { 'content-type': JSON_TYPE }, JSON.stringify({ records }));
  };
}

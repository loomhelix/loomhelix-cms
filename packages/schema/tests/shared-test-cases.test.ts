import { expect, it } from 'vite-plus/test';
import {
  DocumentError,
  loadDocument,
  loadDocumentSet,
  loadRecords,
  parseSchema,
  SchemaError,
  type SiteRecord,
} from '../src/index.ts';

interface ExpectedError {
  readonly blockId: string;
  readonly code: string;
}

type ExpectedShown = Readonly<Record<string, { readonly errors: readonly ExpectedError[] }>>;

interface SharedTestCase {
  readonly schema: unknown;
  readonly document?: unknown;
  readonly documents?: Readonly<Record<string, unknown>>;
  readonly records?: Readonly<Record<string, readonly SiteRecord[]>>;
  readonly expected:
    | { readonly error: 'invalidSchema' | 'invalidDocument' }
    | {
        readonly errors: readonly ExpectedError[];
        readonly document?: unknown;
        readonly shown?: ExpectedShown;
      };
}

const testCases = Object.entries(
  import.meta.glob<SharedTestCase>('../../../spec/test-cases/*.json', {
    eager: true,
    import: 'default',
  }),
).map(([path, testCase]) => [path.slice(path.lastIndexOf('/') + 1), testCase] as const);

function expectedErrorOf(testCase: SharedTestCase): string | undefined {
  return 'error' in testCase.expected ? testCase.expected.error : undefined;
}

function sortErrors(errors: readonly ExpectedError[]): ExpectedError[] {
  return errors
    .map(({ blockId, code }) => ({ blockId, code }))
    .toSorted((first, second) =>
      `${first.blockId} ${first.code}`.localeCompare(`${second.blockId} ${second.code}`),
    );
}

const invalidSchemaCases = testCases.filter(
  ([, testCase]) => expectedErrorOf(testCase) === 'invalidSchema',
);
const invalidDocumentCases = testCases.filter(
  ([, testCase]) => expectedErrorOf(testCase) === 'invalidDocument',
);
function isSetCase(testCase: SharedTestCase): boolean {
  return testCase.documents !== undefined || testCase.records !== undefined;
}

const loadCases = testCases.flatMap(([fileName, testCase]) =>
  'errors' in testCase.expected && !isSetCase(testCase)
    ? [[fileName, testCase.schema, testCase.document, testCase.expected] as const]
    : [],
);
const setCases = testCases.flatMap(([fileName, testCase]) =>
  'errors' in testCase.expected && isSetCase(testCase)
    ? [[fileName, testCase, testCase.documents ?? {}, testCase.expected] as const]
    : [],
);

function recordReaders(records: Readonly<Record<string, readonly SiteRecord[]>>) {
  return Object.fromEntries(
    Object.entries(records).map(([source, sourceRecords]) => [
      source,
      async (ids: readonly string[]) => sourceRecords.filter(({ id }) => ids.includes(id)),
    ]),
  );
}

function shownErrors(
  shown: Iterable<readonly [string, { readonly errors: readonly ExpectedError[] }]>,
) {
  return Object.fromEntries([...shown].map(([id, { errors }]) => [id, sortErrors(errors)]));
}

it('finds each kind of shared test case', () => {
  expect(invalidSchemaCases.length).toBeGreaterThan(0);
  expect(invalidDocumentCases.length).toBeGreaterThan(0);
  expect(loadCases.length).toBeGreaterThan(0);
  expect(setCases.length).toBeGreaterThan(0);
});

it.each(invalidSchemaCases)('%s: rejects the schema', (_, testCase) => {
  expect(() => parseSchema(testCase.schema)).toThrow(SchemaError);
});

it.each(invalidDocumentCases)('%s: rejects the document', (_, testCase) => {
  const schema = parseSchema(testCase.schema);
  expect(() => loadDocument(schema, testCase.document)).toThrow(DocumentError);
});

it.each(loadCases)('%s: gives the expected result', (_, schemaJson, document, expected) => {
  const inputCopy = structuredClone(document);

  const result = loadDocument(parseSchema(schemaJson), document);

  expect(sortErrors(result.errors)).toStrictEqual(sortErrors(expected.errors));
  expect(result.document).toStrictEqual(expected.document ?? document);
  expect(document).toStrictEqual(inputCopy);
});

it.each(setCases)(
  '%s: gives the expected shown documents and records',
  async (_, testCase, documents, expected) => {
    const schema = parseSchema(testCase.schema);
    const documentSet = await loadDocumentSet(schema, testCase.document, async (id) =>
      Object.hasOwn(documents, id) ? documents[id] : undefined,
    );
    const set =
      testCase.records === undefined
        ? documentSet
        : await loadRecords(schema, documentSet, recordReaders(testCase.records));

    expect(sortErrors(set.main.errors)).toStrictEqual(sortErrors(expected.errors));
    expect(set.main.document).toStrictEqual(expected.document ?? testCase.document);
    expect(shownErrors(set.shown)).toStrictEqual(shownErrors(Object.entries(expected.shown ?? {})));
  },
);

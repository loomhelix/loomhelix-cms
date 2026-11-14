import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { expect, it } from 'vite-plus/test';
import pageDocumentJsonSchema from '../page-document.schema.json' with { type: 'json' };
import schemaJsonSchema from '../schema.schema.json' with { type: 'json' };
import testCaseJsonSchema from './test-case.schema.json' with { type: 'json' };

interface StoredBlock {
  readonly id: string;
  readonly slots?: Readonly<Record<string, readonly StoredBlock[]>>;
}

interface PageDocument {
  readonly root: StoredBlock;
}

interface TestCase {
  readonly schema: unknown;
  readonly document?: unknown;
  readonly expected:
    | { readonly error: 'invalidSchema' | 'invalidDocument' }
    | { readonly errors: readonly unknown[]; readonly document?: unknown };
}

const testCases = Object.entries(
  import.meta.glob<TestCase>('../test-cases/*.json', { eager: true, import: 'default' }),
).map(([path, testCase]) => [path.slice(path.lastIndexOf('/') + 1), testCase] as const);

const MAX_BLOCK_LEVEL = 32;
const ajv = new Ajv2020({ allErrors: true });
const isTestCase = ajv.compile(testCaseJsonSchema);
const isSchema = ajv.compile(schemaJsonSchema);
const isPageDocument = ajv.compile<PageDocument>(pageDocumentJsonSchema);

function expectValid(validate: ValidateFunction, value: unknown): void {
  expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
}

function collectIds(block: StoredBlock): string[] {
  return [
    block.id,
    ...Object.values(block.slots ?? {}).flatMap((blocks) => blocks.flatMap(collectIds)),
  ];
}

function deepestLevel(block: StoredBlock): number {
  const childLevels = Object.values(block.slots ?? {}).flatMap((blocks) =>
    blocks.map(deepestLevel),
  );
  return 1 + Math.max(0, ...childLevels);
}

function passesDocumentCheck(document: unknown): boolean {
  if (!isPageDocument(document)) {
    return false;
  }
  const ids = collectIds(document.root);
  return new Set(ids).size === ids.length && deepestLevel(document.root) <= MAX_BLOCK_LEVEL;
}

function expectedErrorOf(testCase: TestCase): string | undefined {
  return 'error' in testCase.expected ? testCase.expected.error : undefined;
}

const casesWithValidSchema = testCases.filter(
  ([, testCase]) => expectedErrorOf(testCase) !== 'invalidSchema',
);
const documentErrorCases = testCases.filter(
  ([, testCase]) => expectedErrorOf(testCase) === 'invalidDocument',
);
const loadCases = testCases.filter(([, testCase]) => expectedErrorOf(testCase) === undefined);
const expectedDocuments = testCases.flatMap(([fileName, testCase]) =>
  'document' in testCase.expected ? [[fileName, testCase.expected.document] as const] : [],
);

it('finds the test cases', () => {
  expect(testCases.length).toBeGreaterThan(0);
});

it.each(testCases)('%s follows the test case format', (_, testCase) => {
  expectValid(isTestCase, testCase);
});

it.each(casesWithValidSchema)('%s has a schema that follows schema.schema.json', (_, testCase) => {
  expectValid(isSchema, testCase.schema);
});

it.each(loadCases)('%s has a document that passes step 1 of the load', (_, testCase) => {
  expect(passesDocumentCheck(testCase.document), ajv.errorsText(isPageDocument.errors)).toBe(true);
});

it.each(expectedDocuments)(
  '%s expects a document that passes step 1 of the load',
  (_, document) => {
    expect(passesDocumentCheck(document), ajv.errorsText(isPageDocument.errors)).toBe(true);
  },
);

it.each(documentErrorCases)('%s has a document that fails step 1 of the load', (_, testCase) => {
  expect(passesDocumentCheck(testCase.document)).toBe(false);
});

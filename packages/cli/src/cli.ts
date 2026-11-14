import { writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parseSchema, SchemaError, type Schema } from '@loomhelix-cms/schema';
import {
  checkFiles,
  errorMessages,
  hasErrors,
  isChangedDocument,
  listDocumentFiles,
  writeDocument,
  type ContentFile,
} from './content-folder.ts';
import { diffSchemas, type SchemaChange } from './schema-diff.ts';
import { writeSchemaTypes } from './schema-types.ts';
import { findDefaultSchemaFile, readSchemaSource, SchemaSourceError } from './schema-source.ts';
import { writeTemplateStub } from './template-stub.ts';

export interface CliOutput {
  readonly cwd: string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

class CliError extends Error {
  override readonly name = 'CliError';
}

interface CommandResult {
  readonly text: string;
  readonly code: number;
}

interface ContentReport {
  readonly changedLine: (file: string) => string;
  readonly changedLabel: string;
}

const CHECK_REPORT: ContentReport = {
  changedLine: (file) => `${file}: The migrations change this document.`,
  changedLabel: 'to migrate',
};
const MIGRATE_REPORT: ContentReport = {
  changedLine: (file) => `Wrote ${file}.`,
  changedLabel: 'written',
};

const SCHEMA_MODULE = 'blocks.ts';
const SCHEMA_FILES = [SCHEMA_MODULE, 'blocks.json'];
const HELP_COMMANDS: ReadonlySet<string | undefined> = new Set(['help', '--help', '-h']);
const FOLDER_ERROR_CODES: ReadonlySet<unknown> = new Set(['ENOENT', 'ENOTDIR']);
const USAGE = `Usage:
  lhcms build [schema-module]
      Write the schema JSON file from the default export of a TypeScript schema file.
      The default schema module is ${SCHEMA_MODULE}.
  lhcms types [schema-file]
      Write the types of the templates to a .types.ts file next to the schema file.
  lhcms template <type> [schema-file]
      Print a first template for a page type or a block type.
  lhcms check <folder> [schema-file]
      Load each JSON document in the folder with the schema. Print the errors of the blocks
      and the documents that the migrations change.
  lhcms migrate <folder> [schema-file]
      Apply the migrations to each JSON document in the folder, and write the changed documents.
      Invalid blocks stay without changes.
  lhcms diff <old-schema-file> [schema-file]
      Compare the schema with an earlier version of it. Print each change that makes stored
      blocks invalid, and the migration operation that prevents it.

A schema file is a JSON file or a TypeScript module. The default schema file is
${SCHEMA_FILES.join(', or else ')}.
`;

export async function runCli(args: readonly string[], output: CliOutput): Promise<number> {
  const [command, ...operands] = args;
  if (HELP_COMMANDS.has(command)) {
    output.write(USAGE);
    return 0;
  }
  try {
    const result = await runCommand(output.cwd, command, operands);
    if (result !== undefined) {
      output.write(`${result.text}\n`);
      return result.code;
    }
  } catch (error) {
    if (
      error instanceof CliError ||
      error instanceof SchemaError ||
      error instanceof SchemaSourceError
    ) {
      output.writeError(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
  output.writeError(USAGE);
  return 1;
}

async function runCommand(
  cwd: string,
  command: string | undefined,
  operands: readonly string[],
): Promise<CommandResult | undefined> {
  if (command === 'build' && operands.length <= 1) {
    return succeeded(await buildSchemaFile(cwd, operands[0] ?? SCHEMA_MODULE));
  }
  if (command === 'types' && operands.length <= 1) {
    return succeeded(
      await writeTypesFile(cwd, operands[0] ?? (await findDefaultSchemaFile(cwd, SCHEMA_FILES))),
    );
  }
  const [operand, schemaFile] = operands;
  if (operand === undefined || operands.length > 2) {
    return undefined;
  }
  if (command === 'template') {
    return succeeded(templateStub(await readSchema(cwd, schemaFile), operand));
  }
  if (command === 'check') {
    return reportContent(cwd, await readContent(cwd, operand, schemaFile), CHECK_REPORT);
  }
  if (command === 'diff') {
    const oldSchema = await readSchema(cwd, operand);
    return reportSchemaChanges(diffSchemas(oldSchema, await readSchema(cwd, schemaFile)));
  }
  if (command === 'migrate') {
    const files = await readContent(cwd, operand, schemaFile);
    await Promise.all(
      files.flatMap(({ file, check }) =>
        isChangedDocument(check) ? [writeDocument(file, check.document)] : [],
      ),
    );
    return reportContent(cwd, files, MIGRATE_REPORT);
  }
  return undefined;
}

function succeeded(text: string): CommandResult {
  return { text, code: 0 };
}

async function readSchema(cwd: string, schemaFile: string | undefined): Promise<Schema> {
  const file = schemaFile ?? (await findDefaultSchemaFile(cwd, SCHEMA_FILES));
  return parseSchema(await readSchemaSource(cwd, file));
}

async function readContent(
  cwd: string,
  folder: string,
  schemaFile: string | undefined,
): Promise<readonly ContentFile[]> {
  const schema = await readSchema(cwd, schemaFile);
  return checkFiles(schema, await listFolder(resolve(cwd, folder), folder));
}

async function listFolder(absoluteFolder: string, folder: string): Promise<readonly string[]> {
  try {
    return await listDocumentFiles(absoluteFolder);
  } catch (error) {
    if (error instanceof Error && 'code' in error && FOLDER_ERROR_CODES.has(error.code)) {
      throw new CliError(`The folder ${folder} does not exist.`);
    }
    throw error;
  }
}

function reportContent(
  cwd: string,
  files: readonly ContentFile[],
  report: ContentReport,
): CommandResult {
  const lines = files.flatMap(({ file, check }) => {
    const shownFile = relative(cwd, file);
    return [
      ...errorMessages(check).map((message) => `${shownFile}: ${message}`),
      ...(isChangedDocument(check) ? [report.changedLine(shownFile)] : []),
    ];
  });
  const errorCount = files.filter(({ check }) => hasErrors(check)).length;
  const changedCount = files.filter(({ check }) => isChangedDocument(check)).length;
  const summary = `${count(files.length, 'document')}: ${errorCount} with errors, ${changedCount} ${report.changedLabel}.`;
  return { text: [...lines, summary].join('\n'), code: errorCount === 0 ? 0 : 1 };
}

function reportSchemaChanges(changes: readonly SchemaChange[]): CommandResult {
  if (changes.length === 0) {
    return succeeded('No change of the schema makes stored blocks invalid.');
  }
  const lines = changes.map(({ typeName, level, message }) => `${typeName}: ${level}: ${message}`);
  const errorCount = changes.filter(({ level }) => level === 'error').length;
  const summary = `${count(errorCount, 'error')} and ${count(changes.length - errorCount, 'warning')}.`;
  return { text: [...lines, summary].join('\n'), code: errorCount === 0 ? 0 : 1 };
}

async function buildSchemaFile(cwd: string, schemaModule: string): Promise<string> {
  if (extname(schemaModule) === '.json') {
    throw new CliError(
      `${schemaModule} is a JSON file already. Give the TypeScript file of the schema, for example ${SCHEMA_MODULE}.`,
    );
  }
  const json = await readSchemaSource(cwd, schemaModule);
  const schema = parseSchema(json);
  const jsonFile = siblingFile(resolve(cwd, schemaModule), '.json');
  await writeFile(jsonFile, `${JSON.stringify(json, null, 2)}\n`);
  return `Wrote ${relative(cwd, jsonFile)}: ${describeTypes(schema)}.`;
}

async function writeTypesFile(cwd: string, schemaFile: string): Promise<string> {
  const schema = parseSchema(await readSchemaSource(cwd, schemaFile));
  const typesFile = siblingFile(resolve(cwd, schemaFile), '.types.ts');
  await writeFile(typesFile, writeSchemaTypes(schema));
  return `Wrote ${relative(cwd, typesFile)}: ${describeTypes(schema)}.`;
}

function templateStub(schema: Schema, typeName: string): string {
  const stub = writeTemplateStub(schema, typeName);
  if (stub === undefined) {
    const names = [...schema.pages.keys(), ...schema.blocks.keys()].join(', ');
    throw new CliError(`The schema has no type "${typeName}". Its types are ${names}.`);
  }
  return stub;
}

function siblingFile(file: string, extension: string): string {
  return join(dirname(file), `${basename(file, extname(file))}${extension}`);
}

function describeTypes(schema: Schema): string {
  return `${count(schema.pages.size, 'page type')} and ${count(schema.blocks.size, 'block type')}`;
}

function count(total: number, name: string): string {
  return `${total} ${name}${total === 1 ? '' : 's'}`;
}

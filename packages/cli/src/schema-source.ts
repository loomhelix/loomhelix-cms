import { access, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export class SchemaSourceError extends Error {
  override readonly name = 'SchemaSourceError';
}

const JSON_EXTENSION = '.json';

export async function readSchemaSource(cwd: string, file: string): Promise<unknown> {
  const absoluteFile = resolve(cwd, file);
  if (!(await exists(absoluteFile))) {
    throw new SchemaSourceError(`The schema file ${file} does not exist.`);
  }
  if (extname(file) === JSON_EXTENSION) {
    return parseJson(await readFile(absoluteFile, 'utf8'), file);
  }
  const schemaModule: Readonly<Record<string, unknown>> = await import(
    pathToFileURL(absoluteFile).href
  );
  if (!Object.hasOwn(schemaModule, 'default')) {
    throw new SchemaSourceError(
      `The schema module ${file} must export the schema as its default export.`,
    );
  }
  return schemaModule.default;
}

export async function findDefaultSchemaFile(
  cwd: string,
  files: readonly string[],
): Promise<string> {
  for (const file of files) {
    if (await exists(resolve(cwd, file))) {
      return file;
    }
  }
  return files[files.length - 1] ?? '';
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SchemaSourceError(`The schema file ${file} is not valid JSON. ${error.message}`);
    }
    throw error;
  }
}

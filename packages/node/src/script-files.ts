import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { BRIDGE_SCRIPT_PATH, EDITOR_SCRIPT_PATH } from './cms-paths.ts';
import { send, sendText } from './responses.ts';

export interface ScriptFile {
  readonly packageName: string;
  readonly file: string;
}

export const SCRIPT_TYPE = 'text/javascript; charset=utf-8';
const require = createRequire(import.meta.url);

export const SCRIPT_FILES: ReadonlyMap<string, ScriptFile> = new Map([
  [EDITOR_SCRIPT_PATH, builtFile('@loomhelix-cms/editor', 'editor.js')],
  [BRIDGE_SCRIPT_PATH, builtFile('@loomhelix-cms/bridge', 'bridge.js')],
]);

export async function sendScriptFile(
  response: ServerResponse,
  { packageName, file }: ScriptFile,
): Promise<void> {
  let script: Buffer;
  try {
    script = await readFile(file);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      sendText(response, 404, `The script is not built. Run the build of ${packageName}.`);
      return;
    }
    throw error;
  }
  send(response, 200, { 'content-type': SCRIPT_TYPE }, script);
}

function builtFile(packageName: string, fileName: string): ScriptFile {
  const packageFolder = dirname(require.resolve(`${packageName}/package.json`));
  return { packageName, file: join(packageFolder, 'dist', fileName) };
}

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUNDLE_FILE = new URL('../dist/editor.js', import.meta.url);
const MAX_GZIP_BYTES = 100_000;

const size = gzipSync(readFileSync(BUNDLE_FILE)).length;
if (size > MAX_GZIP_BYTES) {
  console.error(
    `The editor bundle is ${size} bytes after gzip, and the limit is ${MAX_GZIP_BYTES}. Make the bundle smaller, or change the limit in scripts/check-size.js.`,
  );
  process.exit(1);
}
console.log(`The editor bundle is ${size} bytes after gzip. The limit is ${MAX_GZIP_BYTES}.`);

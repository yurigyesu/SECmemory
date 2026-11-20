import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'node_modules/sql.js/dist');
const destDir = resolve(rootDir, 'public/wasm');

const wasmFiles = ['sql-wasm.wasm', 'sql-wasm-browser.wasm'];

mkdirSync(destDir, { recursive: true });

for (const fileName of wasmFiles) {
  const srcPath = resolve(srcDir, fileName);
  const destPath = resolve(destDir, fileName);

  if (!existsSync(srcPath)) {
    console.error(`[copy-wasm] Missing source WASM file: ${srcPath}`);
    process.exit(1);
  }

  copyFileSync(srcPath, destPath);
  console.log(`[copy-wasm] Copied ${srcPath} -> ${destPath}`);
}

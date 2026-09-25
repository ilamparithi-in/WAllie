const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. Compile TypeScript sources for preload
execSync('tsc -p tsconfig.preload.json', { cwd: rootDir, stdio: 'inherit' });

// 2. Read compiled whatsappMainWorld.js
const injectJsPath = path.join(rootDir, 'dist/preload/preload/inject/whatsappMainWorld.js');
const injectCode = fs.readFileSync(injectJsPath, 'utf-8');

// 3. Read compiled preload index.js
const preloadJsPath = path.join(rootDir, 'dist/preload/preload/index.js');
let preloadCode = fs.readFileSync(preloadJsPath, 'utf-8');

// 4. In sandboxed renderers, preload cannot use Node APIs (fs, path, etc.) or relative requires.
// Embed compiled main-world script by replacing the build placeholder.
const placeholder = "'__MAIN_WORLD_SCRIPT__'";
if (!preloadCode.includes(placeholder) && !preloadCode.includes('"__MAIN_WORLD_SCRIPT__"')) {
  throw new Error(`Placeholder ${placeholder} not found in compiled preload script`);
}
preloadCode = preloadCode.includes(placeholder)
  ? preloadCode.replace(placeholder, JSON.stringify(injectCode))
  : preloadCode.replace('"__MAIN_WORLD_SCRIPT__"', JSON.stringify(injectCode));

// 5. Write self-contained dist/preload/index.cjs
const targetCjsPath = path.join(rootDir, 'dist/preload/index.cjs');
fs.writeFileSync(targetCjsPath, preloadCode, 'utf-8');

// 6. Clean up temporary directories
fs.rmSync(path.join(rootDir, 'dist/preload/preload'), { recursive: true, force: true });
fs.rmSync(path.join(rootDir, 'dist/preload/shared'), { recursive: true, force: true });
fs.rmSync(path.join(rootDir, 'dist/preload/inject'), { recursive: true, force: true });

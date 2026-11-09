const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { build } = require('vite');

const rootDir = path.resolve(__dirname, '..');

async function main() {
  // 1. Verify TypeScript types for preload
  execSync('tsc -p tsconfig.preload.json', { cwd: rootDir, stdio: 'inherit' });

  // 2. Bundle modular whatsappMainWorld.ts sources into a self-contained IIFE script
  const viteBuild = await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(rootDir, 'src/preload/inject/whatsappMainWorld.ts'),
        formats: ['iife'],
        name: 'WAllieMainWorld',
      },
    },
  });
  const output = Array.isArray(viteBuild) ? viteBuild[0].output : viteBuild.output;
  const chunk = output.find((o) => o.fileName.endsWith('.js') || o.type === 'chunk');
  if (!chunk || !chunk.code) {
    throw new Error('Failed to bundle main-world injection script');
  }
  const injectCode = chunk.code;

  // 3. Bundle modular src/preload/index.ts into a single self-contained CJS bundle
  const preloadBuild = await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        external: ['electron'],
      },
      lib: {
        entry: path.join(rootDir, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
    },
  });
  const preloadOutput = Array.isArray(preloadBuild) ? preloadBuild[0].output : preloadBuild.output;
  const preloadChunk = preloadOutput.find((o) => o.fileName.endsWith('.js') || o.fileName.endsWith('.cjs'));
  if (!preloadChunk || !preloadChunk.code) {
    throw new Error('Failed to bundle preload script');
  }
  let preloadCode = preloadChunk.code;

  // 4. In sandboxed renderers, preload cannot use Node APIs or relative requires.
  // Embed compiled main-world script by replacing the build placeholder.
  const placeholder = "'__MAIN_WORLD_SCRIPT__'";
  if (!preloadCode.includes(placeholder) && !preloadCode.includes('"__MAIN_WORLD_SCRIPT__"')) {
    throw new Error(`Placeholder ${placeholder} not found in compiled preload script`);
  }
  preloadCode = preloadCode.includes(placeholder)
    ? preloadCode.replace(placeholder, () => JSON.stringify(injectCode))
    : preloadCode.replace('"__MAIN_WORLD_SCRIPT__"', () => JSON.stringify(injectCode));

  // 5. Ensure target directory exists and write self-contained dist/preload/index.cjs
  const distPreloadDir = path.join(rootDir, 'dist/preload');
  if (!fs.existsSync(distPreloadDir)) {
    fs.mkdirSync(distPreloadDir, { recursive: true });
  }
  const targetCjsPath = path.join(distPreloadDir, 'index.cjs');
  fs.writeFileSync(targetCjsPath, preloadCode, 'utf-8');

  console.log(`[build-preload] Successfully bundled self-contained dist/preload/index.cjs (${preloadCode.length} bytes)`);
}

main().catch((err) => {
  console.error('[build-preload] Error:', err);
  process.exit(1);
});

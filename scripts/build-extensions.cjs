const { build } = require('vite');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const extensionsDir = path.join(rootDir, 'extensions');
const distBuiltinDir = path.join(rootDir, 'dist/builtin-extensions');

function findFiles(dir, filter) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.name === '.git' || item.name === 'node_modules') continue;
    if (item.isDirectory()) {
      results = results.concat(findFiles(fullPath, filter));
    } else if (filter(item.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function buildExtensionDirectory(extDirName) {
  const extSourceDir = path.join(extensionsDir, extDirName);
  const manifestPath = path.join(extSourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    // Not an extension (missing manifest.json)
    console.warn(`[build-extensions] Warning: Directory 'extensions/${extDirName}' is missing manifest.json (uninitialized git submodule?). Skipping.`);
    return false;
  }

  const outDir = path.join(distBuiltinDir, extDirName);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`[build-extensions] Auto-building extension: ${extDirName}...`);

  // 1. Check if extension has its own package.json with a build script
  const pkgPath = path.join(extSourceDir, 'package.json');
  let hasCustomBuild = false;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.build) {
        hasCustomBuild = true;
      }
    } catch {}
  }

  if (hasCustomBuild) {
    console.log(`[build-extensions] Running custom npm build script for: ${extDirName}...`);
    try {
      execSync('npm run build', { cwd: extSourceDir, stdio: 'inherit' });
      const customDistDir = path.join(extSourceDir, 'dist');
      if (fs.existsSync(customDistDir)) {
        fs.cpSync(customDistDir, outDir, { recursive: true });
        console.log(`[build-extensions] Successfully built (custom script): ${extDirName} -> dist/builtin-extensions/${extDirName}`);
        return true;
      }
    } catch (err) {
      console.warn(`[build-extensions] Custom build failed for ${extDirName}, falling back to built-in builder:`, err);
    }
  }

  // 2. Discover if any .ts files exist in the extension
  const tsFiles = findFiles(extSourceDir, (name) => name.endsWith('.ts'));

  if (tsFiles.length === 0) {
    // Pure JS / Minimal Extension: copy all relevant files maintaining directory structure
    fs.cpSync(extSourceDir, outDir, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(extSourceDir, src);
        if (!rel) return true;
        if (rel.startsWith('.git') || rel.startsWith('node_modules')) return false;
        if (rel === 'README.md' || rel === 'LICENSE' || rel === '.gitignore') return false;
        return true;
      },
    });
    console.log(`[build-extensions] Successfully copied pure JS extension: ${extDirName} -> dist/builtin-extensions/${extDirName}`);
    return true;
  }

  // 3. TypeScript extension without custom build: compile .ts files and copy static assets
  fs.copyFileSync(manifestPath, path.join(outDir, 'manifest.json'));

  for (const tsFile of tsFiles) {
    const relPath = path.relative(extSourceDir, tsFile);
    let targetRel = relPath.replace(/\.ts$/, '.js');
    if (targetRel.startsWith('src' + path.sep)) {
      targetRel = targetRel.substring(4);
    }
    const targetFile = path.join(outDir, targetRel);
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const baseName = path.basename(tsFile, '.ts');
    const viteBuild = await build({
      configFile: false,
      logLevel: 'warn',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: tsFile,
          formats: ['iife'],
          name: `WAExt_${extDirName.replace(/[^a-zA-Z0-9_]/g, '_')}_${baseName}`,
          fileName: () => path.basename(targetFile),
        },
      },
    });

    const output = Array.isArray(viteBuild) ? viteBuild[0].output : viteBuild.output;
    const chunk = output.find((o) => o.fileName.endsWith('.js') || o.type === 'chunk');
    if (!chunk || !chunk.code) {
      throw new Error(`Failed to bundle ${tsFile} for ${extDirName}`);
    }

    fs.writeFileSync(targetFile, chunk.code, 'utf8');
  }

  // Copy static assets (.html, .css, .json, icons, media)
  const staticFiles = findFiles(extSourceDir, (name) =>
    name.endsWith('.html') ||
    name.endsWith('.css') ||
    name.endsWith('.svg') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    (name.endsWith('.js') && !tsFiles.some((t) => t.replace(/\.ts$/, '.js') === path.join(extSourceDir, name)))
  );

  for (const staticFile of staticFiles) {
    const relPath = path.relative(extSourceDir, staticFile);
    let targetRel = relPath;
    if (targetRel.startsWith('src' + path.sep)) {
      targetRel = targetRel.substring(4);
    }
    const targetFile = path.join(outDir, targetRel);
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(staticFile, targetFile);
  }

  console.log(`[build-extensions] Successfully compiled TypeScript extension: ${extDirName} -> dist/builtin-extensions/${extDirName}`);
  return true;
}

async function main() {
  if (!fs.existsSync(extensionsDir)) {
    console.log('[build-extensions] No extensions directory found. Skipping.');
    return;
  }

  if (!fs.existsSync(distBuiltinDir)) {
    fs.mkdirSync(distBuiltinDir, { recursive: true });
  }

  // Dynamically iterate over ALL subdirectories inside extensions/
  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue; // Skip hidden dirs like .git

    const built = await buildExtensionDirectory(entry.name);
    if (built) count++;
  }

  if (count === 0 && entries.some((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    console.warn('[build-extensions] Warning: Subdirectories found in extensions/ but 0 extensions were compiled. Check if git submodules need to be initialized (git submodule update --init --recursive).');
  }

  console.log(`[build-extensions] All extensions built successfully (${count} extension(s) compiled).`);
}

main().catch((err) => {
  console.error('[build-extensions] Build failed:', err);
  process.exit(1);
});

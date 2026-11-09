const { spawnSync } = require('child_process');
const path = require('path');
const { getVersionInfo } = require('./version-helper.cjs');

// Auto-patch electron-builder's snap core24 desktop file bug if needed
try {
  const patchSnapCore24 = require('./patch-snap-core24.cjs');
  if (typeof patchSnapCore24 === 'function') {
    patchSnapCore24();
  }
} catch (e) {
  console.warn(`[WAllie Builder] Warning: Snap core24 patch skipped or failed: ${e.message}`);
}

const versionInfo = getVersionInfo();
const userArgs = process.argv.slice(2);

console.log(`[WAllie Builder] Resolved Version: ${versionInfo.version} (${versionInfo.displayVersion})`);
console.log(`[WAllie Builder] Release Mode: ${versionInfo.isRelease ? 'YES' : 'NO (Dev Build)'}`);

const args = [
  'electron-builder',
  `-c.extraMetadata.version=${versionInfo.version}`,
  ...userArgs,
];

const result = spawnSync('npx', args, {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error('[WAllie Builder] Failed to execute electron-builder:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

process.exit(0);

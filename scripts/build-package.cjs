const { spawnSync } = require('child_process');
const path = require('path');
const { getVersionInfo } = require('./version-helper.cjs');

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

process.exit(result.status ?? 0);

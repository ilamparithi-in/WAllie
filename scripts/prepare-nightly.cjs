const fs = require('fs');
const path = require('path');

const DIST_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist-pack');
const NIGHTLY_DIR = path.join(DIST_DIR, 'nightly');

function findFile(files, predicate) {
  return files.find(file => {
    const fullPath = path.join(DIST_DIR, file);
    return fs.statSync(fullPath).isFile() && predicate(file);
  });
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[Nightly Prep] Error: Directory ${DIST_DIR} does not exist.`);
    process.exit(1);
  }

  if (!fs.existsSync(NIGHTLY_DIR)) {
    fs.mkdirSync(NIGHTLY_DIR, { recursive: true });
  }

  const allFiles = fs.readdirSync(DIST_DIR).filter(f => f !== 'nightly');

  console.log(`[Nightly Prep] Scanning ${allFiles.length} artifacts in ${DIST_DIR}...`);

  const mappings = [
    // macOS DMGs
    {
      alias: 'WAllie-nightly-arm64.dmg',
      matcher: f => f.endsWith('.dmg') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-universal.dmg',
      matcher: f => f.endsWith('.dmg') && f.includes('universal'),
    },
    {
      alias: 'WAllie-nightly.dmg',
      matcher: f => f.endsWith('.dmg') && !f.includes('arm64') && !f.includes('universal'),
    },

    // Linux AppImages
    {
      alias: 'WAllie-nightly-arm64.AppImage',
      matcher: f => f.endsWith('.AppImage') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly.AppImage',
      matcher: f => f.endsWith('.AppImage') && !f.includes('arm64'),
    },

    // Windows Setup EXEs
    {
      alias: 'WAllie-nightly-arm64-Setup.exe',
      matcher: f => f.endsWith('.exe') && f.includes('Setup') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-Setup.exe',
      matcher: f => f.endsWith('.exe') && f.includes('Setup') && !f.includes('arm64'),
    },

    // Windows Portable EXEs
    {
      alias: 'WAllie-nightly-arm64-portable.exe',
      matcher: f => f.endsWith('.exe') && f.toLowerCase().includes('portable') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-portable.exe',
      matcher: f => f.endsWith('.exe') && f.toLowerCase().includes('portable') && !f.includes('arm64'),
    },

    // Linux Debian packages
    {
      alias: 'WAllie-nightly-arm64.deb',
      matcher: f => f.endsWith('.deb') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-amd64.deb',
      matcher: f => f.endsWith('.deb') && (f.includes('amd64') || f.includes('x86_64') || !f.includes('arm64')),
    },

    // Linux RPM packages
    {
      alias: 'WAllie-nightly-aarch64.rpm',
      matcher: f => f.endsWith('.rpm') && (f.includes('aarch64') || f.includes('arm64')),
    },
    {
      alias: 'WAllie-nightly-x86_64.rpm',
      matcher: f => f.endsWith('.rpm') && (f.includes('x86_64') || (!f.includes('aarch64') && !f.includes('arm64'))),
    },

    // Linux Pacman packages
    {
      alias: 'WAllie-nightly-arm64.pkg.tar.zst',
      matcher: f => f.endsWith('.pkg.tar.zst') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-x86_64.pkg.tar.zst',
      matcher: f => f.endsWith('.pkg.tar.zst') && !f.includes('arm64'),
    },

    // Linux Flatpak
    {
      alias: 'WAllie-nightly-arm64.flatpak',
      matcher: f => f.endsWith('.flatpak') && (f.includes('arm64') || f.includes('aarch64')),
    },
    {
      alias: 'WAllie-nightly-x86_64.flatpak',
      matcher: f => f.endsWith('.flatpak') && (f.includes('x86_64') || f.includes('x64') || (!f.includes('arm64') && !f.includes('aarch64'))),
    },
    {
      alias: 'WAllie-nightly.flatpak',
      matcher: f => f.endsWith('.flatpak') && (f.includes('x86_64') || f.includes('x64') || (!f.includes('arm64') && !f.includes('aarch64'))),
    },

    // Snaps
    {
      alias: 'WAllie-nightly-arm64.snap',
      matcher: f => f.endsWith('.snap') && f.includes('arm64'),
    },
    {
      alias: 'WAllie-nightly-amd64.snap',
      matcher: f => f.endsWith('.snap') && (f.includes('amd64') || f.includes('x86_64') || !f.includes('arm64')),
    },
  ];

  let copiedCount = 0;

  for (const { alias, matcher } of mappings) {
    const matched = findFile(allFiles, matcher);
    if (matched) {
      const srcPath = path.join(DIST_DIR, matched);
      const destPath = path.join(NIGHTLY_DIR, alias);
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ✓ ${matched} -> nightly/${alias}`);
      copiedCount++;
    }
  }

  console.log(`[Nightly Prep] Successfully prepared ${copiedCount} standardized nightly artifacts in ${NIGHTLY_DIR}`);

  if (copiedCount === 0) {
    console.error(`[Nightly Prep] Error: No artifacts could be matched for nightly release.`);
    process.exit(1);
  }
}

main();

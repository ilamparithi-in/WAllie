const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Finds ELF64 section header offset and size for a given section name.
 */
function findElfSection(filePath, targetSectionName) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      return null;
    }

    const classBuf = Buffer.alloc(1);
    fs.readSync(fd, classBuf, 0, 1, 4);
    if (classBuf[0] !== 2) {
      // 1 = 32-bit, 2 = 64-bit
      return null;
    }

    const header = Buffer.alloc(64);
    fs.readSync(fd, header, 0, 64, 0);

    const e_shoff = Number(header.readBigUInt64LE(40));
    const e_shentsize = header.readUInt16LE(58);
    const e_shnum = header.readUInt16LE(60);
    const e_shstrndx = header.readUInt16LE(62);

    if (!e_shoff || !e_shentsize || !e_shnum) return null;

    // Read section name string table header
    const strTabHdr = Buffer.alloc(e_shentsize);
    fs.readSync(fd, strTabHdr, 0, e_shentsize, e_shoff + e_shstrndx * e_shentsize);
    const strTabOffset = Number(strTabHdr.readBigUInt64LE(24));
    const strTabSize = Number(strTabHdr.readBigUInt64LE(32));

    const strTab = Buffer.alloc(strTabSize);
    fs.readSync(fd, strTab, 0, strTabSize, strTabOffset);

    const shBuf = Buffer.alloc(e_shentsize);
    for (let i = 0; i < e_shnum; i++) {
      fs.readSync(fd, shBuf, 0, e_shentsize, e_shoff + i * e_shentsize);
      const nameIdx = shBuf.readUInt32LE(0);
      const end = strTab.indexOf(0, nameIdx);
      const name = strTab.toString('latin1', nameIdx, end === -1 ? undefined : end);
      if (name === targetSectionName) {
        const offset = Number(shBuf.readBigUInt64LE(24));
        const size = Number(shBuf.readBigUInt64LE(32));
        return { offset, size };
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

/**
 * Embeds update information into .upd_info and generates .zsync if zsyncmake is available.
 * Returns the path to the created .zsync file, or null.
 */
function processAppImage(appImagePath, updateInfo) {
  console.log(`[AppImage Updater] Processing: ${appImagePath}`);
  const sec = findElfSection(appImagePath, '.upd_info');
  if (!sec) {
    console.warn(`[AppImage Updater] Warning: .upd_info section not found in ${appImagePath}`);
    return null;
  }

  const updateBuf = Buffer.from(updateInfo, 'utf8');
  if (updateBuf.length >= sec.size) {
    throw new Error(`Update information too long (${updateBuf.length} bytes >= ${sec.size} bytes)`);
  }

  const fd = fs.openSync(appImagePath, 'r+');
  try {
    const padded = Buffer.alloc(sec.size, 0);
    updateBuf.copy(padded, 0);
    fs.writeSync(fd, padded, 0, sec.size, sec.offset);
    console.log(`[AppImage Updater] Embedded update info into .upd_info: "${updateInfo}"`);
  } finally {
    fs.closeSync(fd);
  }

  // Generate .zsync file with zsyncmake
  const baseName = path.basename(appImagePath);
  const zsyncPath = `${appImagePath}.zsync`;
  const zsyncCheck = spawnSync('which', ['zsyncmake'], { stdio: 'pipe' });
  if (zsyncCheck.status === 0) {
    console.log(`[AppImage Updater] Generating ${zsyncPath} with zsyncmake...`);
    const zsyncResult = spawnSync('zsyncmake', ['-u', baseName, '-o', zsyncPath, appImagePath], {
      stdio: 'inherit',
    });
    if (zsyncResult.status === 0 && fs.existsSync(zsyncPath)) {
      console.log(`[AppImage Updater] Successfully created ${zsyncPath}`);
      return zsyncPath;
    } else {
      console.warn(`[AppImage Updater] Warning: zsyncmake failed with status ${zsyncResult.status}`);
    }
  } else {
    console.warn('[AppImage Updater] zsyncmake not found on PATH, skipping .zsync generation.');
  }
  return null;
}

/**
 * Standard electron-builder afterAllArtifactBuild hook.
 */
module.exports = async function afterAllArtifactBuild(buildResult) {
  const artifactPaths = buildResult?.artifactPaths || [];
  const newArtifacts = [];

  for (const artifactPath of artifactPaths) {
    if (artifactPath.endsWith('.AppImage')) {
      const isArm64 = artifactPath.includes('arm64') || artifactPath.includes('aarch64');
      const pattern = isArm64 ? 'WAllie-*-arm64.AppImage.zsync' : 'WAllie-*.AppImage.zsync';
      const updateInfo = `gh-releases-zsync|ilamparithi-in|WAllie|latest|${pattern}`;
      const zsyncPath = processAppImage(artifactPath, updateInfo);
      if (zsyncPath) {
        newArtifacts.push(zsyncPath);
      }
    }
  }

  return newArtifacts;
};

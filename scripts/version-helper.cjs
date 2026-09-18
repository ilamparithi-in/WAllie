const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runGit(cmd) {
  try {
    return execSync(`git ${cmd}`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function getPackageJson() {
  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return { version: '1.0.0' };
  }
}

function bumpPatchVersion(versionStr) {
  const parts = versionStr.split('.');
  if (parts.length >= 3) {
    const patchNum = parseInt(parts[2], 10);
    if (!isNaN(patchNum)) {
      return `${parts[0]}.${parts[1]}.${patchNum + 1}`;
    }
  }
  return `${versionStr}.1`;
}

function getVersionInfo() {
  const pkg = getPackageJson();
  const baseVersion = pkg.version || '1.0.0';
  const now = new Date().toISOString();

  // Try checking git
  const exactTag = runGit('describe --tags --exact-match');
  const latestTag = runGit('describe --tags --abbrev=0');
  const shortHash = runGit('rev-parse --short HEAD') || 'unknown';
  const porcelain = runGit('status --porcelain');
  const isDirty = Boolean(porcelain && porcelain.length > 0);

  // In GitHub Actions release workflow: GITHUB_REF_TYPE === 'tag'
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    const cleanTag = process.env.GITHUB_REF_NAME.replace(/^v/, '');
    return {
      version: cleanTag,
      displayVersion: `v${cleanTag}`,
      commitHash: shortHash,
      commitCount: 0,
      baseVersion,
      targetVersion: cleanTag,
      isRelease: true,
      isDirty: false,
      buildDate: now,
    };
  }

  // If we are exactly on a tag (e.g. v1.0.0) without uncommitted changes
  if (exactTag && exactTag.startsWith('v') && !isDirty) {
    const cleanTag = exactTag.replace(/^v/, '');
    return {
      version: cleanTag,
      displayVersion: `v${cleanTag}`,
      commitHash: shortHash,
      commitCount: 0,
      baseVersion,
      targetVersion: cleanTag,
      isRelease: true,
      isDirty: false,
      buildDate: now,
    };
  }

  // Count commits since latest tag, or total commits if no tag
  let commitCount = 0;
  if (latestTag) {
    const countStr = runGit(`rev-list --count ${latestTag}..HEAD`);
    if (countStr) {
      commitCount = parseInt(countStr, 10) || 0;
    }
  } else {
    const totalCountStr = runGit('rev-list --count HEAD');
    if (totalCountStr) {
      commitCount = parseInt(totalCountStr, 10) || 0;
    }
  }

  // Target next patch release for SemVer monotonicity:
  // e.g. baseVersion 1.0.0 -> targetVersion 1.0.1
  const targetTagBase = latestTag ? latestTag.replace(/^v/, '') : baseVersion;
  const nextTargetVersion = bumpPatchVersion(targetTagBase);

  // Format: 1.0.1-dev.11.g7441551 (and .dirty if uncommitted files exist)
  const dirtySuffix = isDirty ? '.dirty' : '';
  const version = `${nextTargetVersion}-dev.${commitCount}.g${shortHash}${dirtySuffix}`;
  const displayVersion = `v${nextTargetVersion}-dev.${commitCount} (${shortHash}${isDirty ? '*' : ''})`;

  return {
    version,
    displayVersion,
    commitHash: shortHash,
    commitCount,
    baseVersion,
    targetVersion: nextTargetVersion,
    isRelease: false,
    isDirty,
    buildDate: now,
  };
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const info = getVersionInfo();

  if (args.includes('--version')) {
    process.stdout.write(info.version);
  } else if (args.includes('--json')) {
    console.log(JSON.stringify(info, null, 2));
  } else if (args.includes('--display')) {
    console.log(info.displayVersion);
  } else {
    console.log(JSON.stringify(info, null, 2));
  }
}

module.exports = {
  getVersionInfo,
};

const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../node_modules/app-builder-lib/out/targets/snap/core24.js');

if (!fs.existsSync(targetFile)) {
  // If app-builder-lib is not installed, do nothing
  process.exit(0);
}

let content = fs.readFileSync(targetFile, 'utf8');

const needle = 'const desktopFilePath = path.join(guiOutput, `${this.helper.getDesktopFileName(snap.name)}.desktop`);\n        await this.helper.writeDesktopEntry(this.options, this.packager.executableName + " %U", desktopFilePath, desktopExtraProps);';

const patch = `const desktopFilePath = path.join(guiOutput, \`\${this.helper.getDesktopFileName(snap.name)}.desktop\`);
        await this.helper.writeDesktopEntry(this.options, this.packager.executableName + " %U", desktopFilePath, desktopExtraProps);
        // Ensure snap/meta/gui exists and contains the desktop file and icon
        // Snapcraft 8/9 resolves apps.<app>.desktop relative to the snap/ directory, looking for snap/meta/gui/<file>.desktop
        const metaGuiOutput = path.resolve(stageDir, this.configRelativePath, "meta", "gui");
        await (0, fs_extra_1.mkdir)(metaGuiOutput, { recursive: true });
        await (0, fs_extra_1.copy)(guiOutput, metaGuiOutput);
        const altDesktop = path.join(metaGuiOutput, \`\${snap.name}.desktop\`);
        if (!(await (0, fs_extra_1.pathExists)(altDesktop))) {
            await (0, fs_extra_1.copy)(desktopFilePath, altDesktop);
        }`;

if (content.includes('const metaGuiOutput = path.resolve(stageDir, this.configRelativePath, "meta", "gui");')) {
  // Already patched
  process.exit(0);
}

if (!content.includes(needle)) {
  console.warn('[patch-snap-core24] Could not find patch location in core24.js');
  process.exit(0);
}

content = content.replace(needle, patch);
fs.writeFileSync(targetFile, content, 'utf8');
console.log('[patch-snap-core24] Successfully patched electron-builder snap core24 desktop file path.');


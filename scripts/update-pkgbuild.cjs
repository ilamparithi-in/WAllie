const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const pkgbuildPath = path.resolve(__dirname, '../PKGBUILD');

if (!fs.existsSync(pkgPath) || !fs.existsSync(pkgbuildPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const newVersion = pkg.version;

let content = fs.readFileSync(pkgbuildPath, 'utf8');
content = content.replace(/^pkgver=.*$/m, `pkgver=${newVersion}`);
content = content.replace(/^pkgrel=.*$/m, `pkgrel=1`);

fs.writeFileSync(pkgbuildPath, content, 'utf8');
console.log(`[Version Hook] Updated PKGBUILD pkgver to ${newVersion} (pkgrel=1)`);


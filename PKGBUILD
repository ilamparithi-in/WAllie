# Maintainer: Ilamparithi Murali <ilamparithi.in@gmail.com>

pkgname=wallie
pkgver=1.0.0
pkgrel=1
pkgdesc="Electron-based WhatsApp Client for Linux with Multi-account and Extensions Support"
arch=('any')
url="https://github.com/ilamparithi-in/WAllie"
license=('MIT')
depends=('electron34')
makedepends=('npm' 'nodejs')
source=("${pkgname}-${pkgver}.tar.gz::${url}/archive/refs/tags/v${pkgver}.tar.gz")
sha256sums=('COMPUTE_WITH_updpkgsums_OR_sha256sum')

prepare() {
  cd "WAllie-${pkgver}"
  npm ci
}

build() {
  cd "WAllie-${pkgver}"
  npm run build
  npm prune --omit=dev
}

package() {
  cd "WAllie-${pkgver}"
  
  # App directory
  install -d "${pkgdir}/usr/lib/${pkgname}"
  cp -r dist package.json node_modules "${pkgdir}/usr/lib/${pkgname}/"

  # Binary launcher script
  install -d "${pkgdir}/usr/bin"
  cat <<EOF > "${pkgdir}/usr/bin/${pkgname}"
#!/bin/sh
exec electron34 /usr/lib/${pkgname}/dist/main/index.js "\$@"
EOF
  chmod 755 "${pkgdir}/usr/bin/${pkgname}"

  # Desktop launcher & icons
  install -Dm644 "build/${pkgname}.desktop" "${pkgdir}/usr/share/applications/${pkgname}.desktop"
  install -Dm644 "build/icons/512x512.png" "${pkgdir}/usr/share/icons/hicolor/512x512/apps/${pkgname}.png"

  # License file (Mandatory for MIT license)
  install -Dm644 LICENSE "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE"
}

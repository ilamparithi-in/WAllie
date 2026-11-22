# Maintainer: Ilamparithi Murali <ilamparithi.in@gmail.com>

pkgname=wallie
pkgver=1.4.0
pkgrel=1
pkgdesc="Unofficial Electron-based WhatsApp Client for Linux with Multi-account and Extensions Support"
arch=('any')
url="https://github.com/ilamparithi-in/WAllie"
license=('MIT')
depends=('electron45')
makedepends=('npm' 'nodejs' 'git')
source=("${pkgname}::git+${url}.git#tag=v${pkgver}")
sha256sums=('SKIP')

prepare() {
  cd "${srcdir}/${pkgname}"
  git submodule update --init --recursive
  npm ci
}

build() {
  cd "${srcdir}/${pkgname}"
  npm run build
  npm prune --omit=dev
}

package() {
  cd "${srcdir}/${pkgname}"
  
  # App directory
  install -d "${pkgdir}/usr/lib/${pkgname}"
  cp -r dist package.json node_modules "${pkgdir}/usr/lib/${pkgname}/"

  # Binary launcher script
  install -d "${pkgdir}/usr/bin"
  cat <<EOF > "${pkgdir}/usr/bin/${pkgname}"
#!/bin/sh
exec electron45 /usr/lib/${pkgname}/dist/main/index.js "\$@"
EOF
  chmod 755 "${pkgdir}/usr/bin/${pkgname}"

  # Desktop launcher & icons
  install -Dm644 "build/${pkgname}.desktop" "${pkgdir}/usr/share/applications/${pkgname}.desktop"
  for size in 16 32 48 64 128 256 512; do
    install -Dm644 "build/icons/${size}x${size}.png" \
      "${pkgdir}/usr/share/icons/hicolor/${size}x${size}/apps/${pkgname}.png"
  done

  # License file (Mandatory for MIT license)
  install -Dm644 LICENSE "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE"
}

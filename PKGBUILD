# Maintainer: Ilamparithi Murali (ilamparithi-in) <ilamparithi.in@gmail.com>
pkgname=wali
pkgver=1.0.0
pkgrel=1
pkgdesc="Lightweight, multi-account WhatsApp Web client for Linux with Chrome extensions support"
arch=('x86_64')
url="https://github.com/ilamparithi-in/WALi"
license=('MIT')
depends=('electron')
makedepends=('npm' 'nodejs')
source=() # Built from local source

build() {
  cd "${srcdir}/.."
  npm install
  npm run build
}

package() {
  cd "${srcdir}/.."
  install -d "${pkgdir}/usr/lib/${pkgname}"
  cp -r dist package.json node_modules "${pkgdir}/usr/lib/${pkgname}/"
  
  install -d "${pkgdir}/usr/bin"
  cat <<EOF > "${pkgdir}/usr/bin/${pkgname}"
#!/bin/sh
exec electron /usr/lib/${pkgname}/dist/main/index.js "\$@"
EOF
  chmod +x "${pkgdir}/usr/bin/${pkgname}"
  
  install -Dm644 "build/${pkgname}.desktop" "${pkgdir}/usr/share/applications/${pkgname}.desktop"
  install -Dm644 "build/icons/512x512.png" "${pkgdir}/usr/share/icons/hicolor/512x512/apps/${pkgname}.png"
}

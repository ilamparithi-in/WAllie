# WAllie 🐧

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**WAllie** is a lightweight, feature-rich, and highly customizable desktop WhatsApp client designed specifically for Linux. Built on Electron, React, and TypeScript, it addresses common shortcomings of unofficial wrappers by providing complete account session isolation and native integration with the Linux desktop ecosystem.

<insert image here>

---

## Key Features

- 👤 **Multi-Account Session Isolation**: Run multiple WhatsApp accounts concurrently. Each tab runs inside an isolated, persisted session partition (`session.fromPartition('persist:account_<id>')`), preventing cookies, storage, and cache overlap.
- ⚙️ **Ultra-Thin Custom Titlebar (~28px)**: Native-feeling custom window controls, active tab switching, and inline account renaming.
- 🧩 **Chrome Extensions Support**: Inject Chrome Extensions (e.g. Privacy Extension, WA Web Plus) directly from unpacked local folders or directly from the Chrome Web Store.
- 🎨 **Live Custom CSS Engine**: Make the app truly yours. Inject custom CSS stylesheets live, with pre-configured themes such as **OLED Dark** or **Compact UI**.
- 📊 **Storage & Cache Dashboard**: Keep your system clean. Inspect cache, IndexedDB, cookies, and local storage sizes per account, and clear cache or media storage with one click without losing your logins.
- 🔔 **Smart Notifications with Linux Integration**: Receive native desktop notifications tagged with account-specific labels (e.g. `[Work] John: Hey`). Logs notification history locally with full search capabilities.
- 📥 **Native Downloads Manager**: Downloads files directly to your default `Downloads` folder, tracking progress and status with a clean overlay list.
- 🔗 **Link Delegation**: Safely delegates normal links to open in your system's default browser rather than opening them inside the WhatsApp frame.

---

## Build & Installation Guide

WAllie can be compiled and installed on most popular Linux distributions.

### Prerequisites

Ensure you have Node.js (v18+) and npm installed:
```bash
# Verify installation
node -v
npm -v
```

---

### 1. Arch Linux
The repository includes a ready-to-use `PKGBUILD` for Arch users. To build and install:
```bash
# Clone the repository
git clone https://github.com/ilamparithi-in/WAllie.git
cd WAllie

# Compile and install package using makepkg
makepkg -si
```

---

### 2. Debian / Ubuntu (APT)
To package WAllie as a `.deb` installer:
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Generate Debian package
npx electron-builder --linux deb

# Install the package
sudo dpkg -i dist/wallie_*.deb
# Or using apt to automatically resolve local dependencies
sudo apt install ./dist/wallie_*.deb
```

---

### 3. Fedora / CentOS / RHEL (RPM)
To package WAllie as an `.rpm` package:
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Generate RPM package
npx electron-builder --linux rpm

# Install the package
sudo dnf install ./dist/wallie-*.rpm
```

---

### 4. Universal AppImage
If you prefer not to install the package system-wide:
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Generate AppImage
npx electron-builder --linux AppImage

# Make executable and run
chmod +x dist/WAllie-*.AppImage
./dist/WAllie-*.AppImage
```

---

### 5. Running in Development Mode
To run WAllie locally for development or testing:
```bash
# Install dependencies
npm install

# Start the Electron application in hot-reload mode
npm run dev
```

---

## Important Legal Disclaimer

**WAllie is an unofficial, third-party client wrapper for WhatsApp Web.** 

- **No Affiliation**: This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp LLC, Meta Platforms, Inc., or any of their subsidiaries or affiliates. The official WhatsApp website can be found at [https://whatsapp.com](https://whatsapp.com).
- **Limitation of Liability**: All operations and actions performed on this client are the sole responsibility of the user. The developers and contributors of this application are not liable for any data loss, settings disruptions, or other issues arising from the use of this software.
- **Terms of Service**: WAllie is a standard client wrapper that loads the official WhatsApp Web interface. It does not use any automation, spamming, or scraping APIs. You are responsible for ensuring your usage adheres to WhatsApp's Terms of Service.

---

## License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.

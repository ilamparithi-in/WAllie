import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getVersionInfo } = require('./scripts/version-helper.cjs');
const versionInfo = getVersionInfo();
const isDevBridgeEnabled = process.env.ENABLE_DEV_BRIDGE === 'true';

if (isDevBridgeEnabled) {
  console.warn('\n\x1b[1;37;41m                                                                                \x1b[0m');
  console.warn('\x1b[1;37;41m  🚨  CRITICAL SECURITY WARNING: DEV BRIDGE ENABLED IN THIS BUILD!             🚨  \x1b[0m');
  console.warn('\x1b[1;37;41m                                                                                \x1b[0m');
  console.warn('\x1b[1;31m  ⚠️  DO NOT DISTRIBUTE OR SHARE PACKAGES/BINARIES PRODUCED BY THIS BUILD!      \x1b[0m');
  console.warn('\x1b[1;31m  ⚠️  Arbitrary JS execution and DOM/CDP inspection are compiled into WAllie!  \x1b[0m');
  console.warn('\x1b[1;31m  ⚠️  NEVER USE THIS BUILD AS A DAILY DRIVER FOR CONFIDENTIAL CHATS!           \x1b[0m');
  console.warn('\x1b[1;37;41m                                                                                \x1b[0m\n');
}

export default defineConfig({
  define: {
    __APP_VERSION_INFO__: JSON.stringify(versionInfo),
    __ENABLE_DEV_BRIDGE__: JSON.stringify(isDevBridgeEnabled),
  },
  plugins: [
    tailwindcss(),
    react(),
    electron([
      {
        // Main process entry point
        entry: 'src/main/index.ts',
        vite: {
          define: {
            __APP_VERSION_INFO__: JSON.stringify(versionInfo),
            __ENABLE_DEV_BRIDGE__: JSON.stringify(isDevBridgeEnabled),
          },
          build: {
            outDir: 'dist/main',
            emptyOutDir: true,
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ['x11'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});

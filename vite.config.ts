import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getVersionInfo } = require('./scripts/version-helper.cjs');
const versionInfo = getVersionInfo();

export default defineConfig({
  define: {
    __APP_VERSION_INFO__: JSON.stringify(versionInfo),
  },
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'src/main/index.ts',
        vite: {
          define: {
            __APP_VERSION_INFO__: JSON.stringify(versionInfo),
          },
          build: {
            outDir: 'dist/main',
            sourcemap: true,
            minify: false,
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});

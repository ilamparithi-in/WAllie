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

export default defineConfig({
  define: {
    __APP_VERSION_INFO__: JSON.stringify(versionInfo),
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
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});

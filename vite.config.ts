import { defineConfig } from 'vite';
export default defineConfig({
  define: { __ASSET_VER__: JSON.stringify(Date.now().toString(36)) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { globals: true, include: ['tests/unit/**/*.test.ts'], testTimeout: 120000 },
} as any);

import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { globals: true, include: ['tests/unit/**/*.test.ts'], testTimeout: 120000 },
} as any);

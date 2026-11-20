import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    include: ['sql.js'],
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
});

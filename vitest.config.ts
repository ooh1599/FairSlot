import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'api/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
})

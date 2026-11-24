import { defineConfig, devices } from '@playwright/test'

// Serves the production build and checks that the pages work under the ENFORCED Content-Security-Policy from vercel.json.
// Run with: bunx playwright test -c playwright.csp.config.ts
export default defineConfig({
  testDir: './e2e-csp',
  timeout: 45_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'csp', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx vite build && bunx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 240_000,
  },
})

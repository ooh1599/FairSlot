import { defineConfig, devices } from '@playwright/test'

// Runs the organizer wallet flow against a PRODUCTION build with the headers from vercel.json enforced.
// Run with: E2E_CSP=1 bunx playwright test -c playwright.cspflow.config.ts
export default defineConfig({
  testDir: './e2e-flow',
  testMatch: /wallet\.spec\.ts/,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4175', screenshot: 'only-on-failure' },
  projects: [{ name: 'csp-flow', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx vite build --outDir dist-fake --emptyOutDir && bunx vite preview --outDir dist-fake --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 240_000,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'fake-anon-key' },
  },
})

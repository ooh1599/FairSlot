import { defineConfig, devices } from '@playwright/test'

// Organizer flow against an in-memory Supabase stand-in. Starts its own dev server on port 5175 pointed at the fake URL.
// Run with: bunx playwright test -c playwright.flow.config.ts
export default defineConfig({
  testDir: './e2e-flow',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'flow', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx vite --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'fake-anon-key' },
  },
})

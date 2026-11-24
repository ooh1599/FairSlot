import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke tests run against the Vite dev server on port 5173.
// Pages that need Supabase are tested in their "backend not configured" state;
// flows that need a database and a wallet are covered by docs/deployment.md's rehearsal checklist.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'bun run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})

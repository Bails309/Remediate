import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, 'tests', 'e2e', '.auth', 'user.json');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './tests/e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:3000',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        // Auth setup — logs in and saves session state
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        // Tests that do NOT need authentication (login page, 404, health API)
        {
            name: 'unauthenticated',
            testMatch: /\.(unauthenticated|spec)\.ts$/,
            use: { ...devices['Desktop Chrome'] },
        },
        // Tests that need authentication
        {
            name: 'chromium',
            testMatch: /\.authenticated\.ts$/,
            use: {
                ...devices['Desktop Chrome'],
                storageState: authFile,
            },
            dependencies: ['setup'],
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        env: {
            NODE_ENV: 'test',
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://remediate:remediate_password@localhost:5432/remediate',
            REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
            AUTH_SECRET: 'test-secret',
            LOCAL_AUTH_ENABLED: 'true',
            LOCAL_AUTH_USER: 'admin',
            LOCAL_AUTH_PASS: 'admin',
            LOCAL_AUTH_EMAIL: 'admin@example.com',
            LOCAL_AUTH_NAME: 'Test Admin',
        }
    },
});

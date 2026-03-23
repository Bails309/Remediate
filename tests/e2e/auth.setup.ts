import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'user.json');

const username = process.env.TEST_AUTH_USER || process.env.LOCAL_AUTH_USER || 'admin';
const password = process.env.TEST_AUTH_PASS || process.env.LOCAL_AUTH_PASS || 'admin';

setup('authenticate', async ({ page }) => {
    await page.goto('/login');

    // Wait for the local auth form to appear
    await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in locally' }).click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 30000 });

    // Save signed-in state
    await page.context().storageState({ path: authFile });
});

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
    test('loads the dashboard page', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveTitle(/Dashboard/);
    });

    test('displays stat cards', async ({ page }) => {
        await page.goto('/dashboard');
        // StatCards show risk counts — look for the heading text
        await expect(page.getByText('Critical', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    });

    test('shows the bucket filter', async ({ page }) => {
        await page.goto('/dashboard');
        // BucketFilter renders as a MultiSelect trigger button (aria-haspopup=listbox)
        await expect(page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({ timeout: 15000 });
    });

    test('root path redirects to dashboard', async ({ page }) => {
        await page.goto('/');
        await page.waitForURL('**/dashboard', { timeout: 15000 });
        expect(page.url()).toContain('/dashboard');
    });
});

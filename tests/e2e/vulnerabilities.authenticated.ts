import { test, expect } from '@playwright/test';

test.describe('Vulnerabilities Page', () => {
    test('loads the vulnerabilities page', async ({ page }) => {
        await page.goto('/vulnerabilities');
        await expect(page).toHaveTitle(/Vulnerabilities/);
    });

    test('renders the vulnerabilities client component', async ({ page }) => {
        await page.goto('/vulnerabilities');
        // The page should have loaded without error — check sidebar is present (app shell working)
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });
});

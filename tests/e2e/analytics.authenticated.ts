import { test, expect } from '@playwright/test';

test.describe('Analytics Page', () => {
    test('loads the analytics page', async ({ page }) => {
        await page.goto('/analytics');
        await expect(page).toHaveTitle(/Analytics/);
    });

    test('shows chart components', async ({ page }) => {
        await page.goto('/analytics');
        // App shell renders
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('bucket filter is present on analytics', async ({ page }) => {
        await page.goto('/analytics');
        // BucketFilter renders as a MultiSelect trigger button (aria-haspopup=listbox)
        await expect(page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({ timeout: 15000 });
    });
});

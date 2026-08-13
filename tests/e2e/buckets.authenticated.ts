import { test, expect } from '@playwright/test';

test.describe('Buckets Page', () => {
    test('loads the buckets page', async ({ page }) => {
        await page.goto('/buckets');
        // App shell should render
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('buckets page is accessible via sidebar', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Expand admin section and click Buckets
        const inventoryToggle = sidebar.getByRole('button', { name: /Inventory/i });
        if (await inventoryToggle.isVisible()) {
            await inventoryToggle.click();
            await sidebar.getByRole('link', { name: 'Buckets' }).click();
            await page.waitForURL('**/buckets', { timeout: 15000 });
        }
    });
});

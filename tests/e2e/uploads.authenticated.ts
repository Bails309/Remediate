import { test, expect } from '@playwright/test';

test.describe('Uploads Page', () => {
    test('loads the uploads page', async ({ page }) => {
        await page.goto('/uploads');
        // App shell should render
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('uploads page is accessible via sidebar', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Expand admin section and click Uploads
        const adminToggle = sidebar.getByRole('button', { name: /Administration/i });
        if (await adminToggle.isVisible()) {
            await adminToggle.click();
            await sidebar.getByRole('link', { name: 'Uploads' }).click();
            await page.waitForURL('**/uploads', { timeout: 15000 });
        }
    });
});

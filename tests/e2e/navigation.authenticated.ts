import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
    test('sidebar shows workspace links', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Base nav items
        await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
        await expect(sidebar.getByRole('link', { name: 'Analytics' })).toBeVisible();
        await expect(sidebar.getByRole('link', { name: 'Vulnerabilities' })).toBeVisible();
    });

    test('sidebar shows security tools links for admin', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        await expect(sidebar.getByRole('link', { name: 'Intelligence' })).toBeVisible();
        await expect(sidebar.getByRole('link', { name: 'Tools' })).toBeVisible();
    });

    test('clicking Analytics navigates to analytics page', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('link', { name: 'Analytics' }).click();
        await page.waitForURL('**/analytics', { timeout: 15000 });
    });

    test('clicking Vulnerabilities navigates to vulnerabilities page', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('link', { name: 'Vulnerabilities' }).click();
        await page.waitForURL('**/vulnerabilities', { timeout: 15000 });
    });

    test('admin section is expandable and shows admin links', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Click the Administration expander
        const adminToggle = sidebar.getByRole('button', { name: /Administration/i });
        if (await adminToggle.isVisible()) {
            await adminToggle.click();
            // Admin nav items should become visible
            await expect(sidebar.getByRole('link', { name: 'Uploads' })).toBeVisible({ timeout: 5000 });
            await expect(sidebar.getByRole('link', { name: 'Buckets' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible();
        }
    });
});

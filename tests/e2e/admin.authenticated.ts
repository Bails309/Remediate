import { test, expect } from '@playwright/test';

test.describe('Admin Pages', () => {
    test('admin settings page loads', async ({ page }) => {
        await page.goto('/admin/settings');
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('admin users page loads', async ({ page }) => {
        await page.goto('/admin/users');
        await expect(page).toHaveTitle(/User Management/);
    });

    test('admin health page loads', async ({ page }) => {
        await page.goto('/admin/health');
        await expect(page).toHaveTitle(/System Health/);
    });

    test('admin operations page loads', async ({ page }) => {
        await page.goto('/admin/operations');
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('admin import page loads', async ({ page }) => {
        await page.goto('/admin/import');
        await expect(page).toHaveTitle(/Import Settings/);
    });

    test('admin reports page loads', async ({ page }) => {
        await page.goto('/admin/reports');
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('admin dead-letter page loads', async ({ page }) => {
        await page.goto('/admin/dead-letter');
        await expect(page).toHaveTitle(/Dead Letter Queue/);
    });

    test('admin storage page loads', async ({ page }) => {
        await page.goto('/admin/storage');
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('admin oidc page loads', async ({ page }) => {
        await page.goto('/admin/oidc');
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('admin audit log page loads', async ({ page }) => {
        await page.goto('/admin/audit-log');
        await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible({ timeout: 15000 });
    });

    test('admin ai insights page loads', async ({ page }) => {
        await page.goto('/admin/ai');
        await expect(page).toHaveTitle(/AI Insights/);
    });
});

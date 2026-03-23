import { test, expect } from '@playwright/test';

test.describe('Threat Intelligence Page', () => {
    test('loads the threat intelligence page', async ({ page }) => {
        await page.goto('/threat-intelligence');
        await expect(page.getByRole('heading', { name: /Threat Intelligence Centre/i })).toBeVisible({ timeout: 15000 });
    });

    test('shows source context section', async ({ page }) => {
        await page.goto('/threat-intelligence');
        await expect(page.getByText('Source Context')).toBeVisible({ timeout: 15000 });
    });

    test('accessible via sidebar Intelligence link', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('link', { name: 'Intelligence' }).click();
        await page.waitForURL('**/threat-intelligence', { timeout: 15000 });
    });
});

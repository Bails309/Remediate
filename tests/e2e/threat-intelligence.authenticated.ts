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

    test('accessible via sidebar Intelligence flyout', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('button', { name: /Intelligence/i }).hover();
        await sidebar.getByRole('link', { name: 'Threat Feed' }).click();
        await page.waitForURL('**/threat-intelligence', { timeout: 15000 });
    });

    test('threat actors page loads with MITRE attribution notice', async ({ page }) => {
        await page.goto('/threat-intelligence/actors');
        await expect(page.getByRole('heading', { name: 'Threat Actors' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Actors by MITRE Tactic')).toBeVisible({ timeout: 10000 });
    });
});

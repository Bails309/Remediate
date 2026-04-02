import { test, expect } from '@playwright/test';

test.describe('Footer Links', () => {
    test('login page shows privacy and accessibility links', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('link', { name: 'Accessibility' })).toBeVisible();
    });

    test('privacy link on login page navigates to /privacy', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: 'Privacy Policy' }).click();
        await page.waitForURL('**/privacy', { timeout: 10000 });
        expect(page.url()).toContain('/privacy');
    });
});

test.describe('Footer Links (authenticated)', () => {
    test('dashboard shows footer privacy and accessibility links', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.getByRole('link', { name: 'Privacy Policy' }).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('link', { name: 'Accessibility' }).first()).toBeVisible();
    });
});

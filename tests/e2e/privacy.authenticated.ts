import { test, expect } from '@playwright/test';

test.describe('Privacy Policy Page', () => {
    test('loads the privacy policy page', async ({ page }) => {
        await page.goto('/privacy');
        await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible({ timeout: 10000 });
    });

    test('displays all required sections', async ({ page }) => {
        await page.goto('/privacy');
        await expect(page.getByRole('heading', { name: 'Data We Collect' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Legal Basis for Processing' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Data Retention' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Your Rights' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Data Sharing' })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Cookies/ })).toBeVisible();
    });

    test('mentions GDPR rights endpoints', async ({ page }) => {
        await page.goto('/privacy');
        await expect(page.getByText('GET /api/account')).toBeVisible();
        await expect(page.getByText('DELETE /api/account')).toBeVisible();
    });
});

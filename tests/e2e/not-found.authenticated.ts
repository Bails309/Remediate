import { test, expect } from '@playwright/test';

test.describe('404 Not Found', () => {
    test('shows 404 page for unknown routes', async ({ page }) => {
        await page.goto('/this-page-does-not-exist');
        await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
        await expect(page.getByText('Page Not Found')).toBeVisible();
    });

    test('has Return Home link that navigates to root', async ({ page }) => {
        await page.goto('/this-page-does-not-exist');
        const homeLink = page.getByRole('link', { name: 'Return Home' });
        await expect(homeLink).toBeVisible();
        await homeLink.click();
        await page.waitForURL('**/dashboard', { timeout: 15000 });
    });
});

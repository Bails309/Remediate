import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('should load the login page', async ({ page }) => {
        await page.goto('/auth/login');

        // Expect the page to have a login header or specific text
        await expect(page).toHaveTitle(/Login/);
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    });
});

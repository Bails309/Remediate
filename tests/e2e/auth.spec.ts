import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('should load the login page', async ({ page }) => {
        await page.goto('/login');

        // Expect the page to have the correct title and heading
        await expect(page).toHaveTitle(/Remediate/);
        await expect(page.getByRole('heading', { name: 'Sign in to Remediate' })).toBeVisible();
    });
});

import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
    test('should display the sign-in heading', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Sign in to Remediate' })).toBeVisible();
    });

    test('should show local credentials form when LOCAL_AUTH_ENABLED', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 10000 });
        await expect(page.getByPlaceholder('Password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign in locally' })).toBeVisible();
    });

    test('should show error on invalid credentials', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 10000 });
        await page.getByPlaceholder('Username').fill('wrong');
        await page.getByPlaceholder('Password').fill('wrong');
        await page.getByRole('button', { name: 'Sign in locally' }).click();
        await expect(page.getByText('Invalid local credentials')).toBeVisible({ timeout: 10000 });
    });

    test('should redirect to dashboard on successful login', async ({ page }) => {
        const username = process.env.TEST_AUTH_USER || process.env.LOCAL_AUTH_USER || 'admin';
        const password = process.env.TEST_AUTH_PASS || process.env.LOCAL_AUTH_PASS || 'admin';
        await page.goto('/login');
        await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 10000 });
        await page.getByPlaceholder('Username').fill(username);
        await page.getByPlaceholder('Password').fill(password);
        await page.getByRole('button', { name: 'Sign in locally' }).click();
        await page.waitForURL('**/dashboard', { timeout: 30000 });
        expect(page.url()).toContain('/dashboard');
    });
});

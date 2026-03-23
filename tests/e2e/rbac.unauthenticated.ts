import { test, expect } from '@playwright/test';

test.describe('RBAC - Unauthenticated Access', () => {
    test('unauthenticated user is redirected to login from dashboard', async ({ page }) => {
        await page.goto('/dashboard');
        // Should redirect to login page
        await page.waitForURL('**/login**', { timeout: 15000 });
    });

    test('unauthenticated user is redirected to login from vulnerabilities', async ({ page }) => {
        await page.goto('/vulnerabilities');
        await page.waitForURL('**/login**', { timeout: 15000 });
    });

    test('unauthenticated user is redirected to login from admin pages', async ({ page }) => {
        await page.goto('/admin/users');
        await page.waitForURL('**/login**', { timeout: 15000 });
    });

    test('unauthenticated user is redirected to login from analytics', async ({ page }) => {
        await page.goto('/analytics');
        await page.waitForURL('**/login**', { timeout: 15000 });
    });

    test('unauthenticated user is redirected to login from uploads', async ({ page }) => {
        await page.goto('/uploads');
        await page.waitForURL('**/login**', { timeout: 15000 });
    });

    test('unauthenticated user can access login page directly', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Sign in to Remediate' })).toBeVisible({ timeout: 10000 });
        // Should NOT redirect away from login
        expect(page.url()).toContain('/login');
    });
});

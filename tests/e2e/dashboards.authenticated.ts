import { test, expect } from '@playwright/test';

test.describe('Dashboards', () => {
    test('create, add a widget, publish and delete', async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto('/dashboards');
        await expect(page.getByRole('heading', { name: 'Dashboards', exact: true })).toBeVisible({ timeout: 15000 });

        const name = `E2E Dashboard ${Date.now()}`;
        await page.getByLabel('New dashboard name').fill(name);
        await page.getByRole('button', { name: 'Create' }).click();

        await page.waitForURL('**/dashboards/**', { timeout: 15000 });
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(page.getByText('No widgets yet')).toBeVisible();

        // Build a widget from the predefined picker
        await page.getByRole('button', { name: 'Add widget' }).click();
        await expect(page.getByRole('heading', { name: 'Add widget' })).toBeVisible();
        await page.getByPlaceholder('Open critical findings').fill('Findings by severity');
        await page.getByRole('button', { name: 'Add to dashboard' }).click();

        await expect(page.getByText('Findings by severity')).toBeVisible({ timeout: 15000 });

        // Publish, then confirm the state flips
        await page.getByRole('button', { name: 'Private' }).click();
        await expect(page.getByRole('button', { name: 'Published' })).toBeVisible({ timeout: 10000 });

        await page.getByTitle('Delete dashboard').click();
        await page.waitForURL('**/dashboards', { timeout: 15000 });
        await expect(page.getByText(name)).toHaveCount(0);
    });

    test('dashboards are reachable from the Insights menu', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('button', { name: /Insights/i }).hover();
        await sidebar.getByRole('link', { name: 'My Dashboards' }).click();
        await page.waitForURL('**/dashboards', { timeout: 15000 });
    });

    test('rejects a widget spec outside the allowlist', async ({ page }) => {
        await page.goto('/dashboards');
        const response = await page.request.post('/api/dashboards/preview', {
            data: { source: 'users', groupBy: 'password' },
        });
        expect(response.status()).toBe(400);
    });

    test('runs an allowlisted spec and returns grouped rows', async ({ page }) => {
        await page.goto('/dashboards');
        const response = await page.request.post('/api/dashboards/preview', {
            data: { source: 'vulnerabilities', groupBy: 'risk' },
        });
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.rows)).toBe(true);
    });

    test('AI planner reports availability', async ({ page }) => {
        await page.goto('/dashboards');
        const response = await page.request.get('/api/dashboards/plan');
        expect(response.status()).toBe(200);
        expect(await response.json()).toHaveProperty('available');
    });
});

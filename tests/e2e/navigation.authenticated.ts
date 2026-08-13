import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
    test('sidebar shows workspace links', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Base nav item plus the Insights flyout
        await expect(sidebar.getByRole('link', { name: 'Vulnerabilities' })).toBeVisible();
        await sidebar.getByRole('button', { name: /Insights/i }).hover();
        await expect(sidebar.getByRole('link', { name: 'Command Centre' })).toBeVisible({ timeout: 5000 });
        await expect(sidebar.getByRole('link', { name: 'Analytics' })).toBeVisible();
        await expect(sidebar.getByRole('link', { name: 'My Dashboards' })).toBeVisible();
    });

    test('sidebar shows security tools links for admin', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        await sidebar.getByRole('button', { name: /Intelligence/i }).hover();
        await expect(sidebar.getByRole('link', { name: 'Threat Feed' })).toBeVisible({ timeout: 5000 });
        await expect(sidebar.getByRole('link', { name: 'Threat Actors' })).toBeVisible();
    });

    test('clicking Analytics navigates to analytics page', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('button', { name: /Insights/i }).hover();
        await sidebar.getByRole('link', { name: 'Analytics' }).click();
        await page.waitForURL('**/analytics', { timeout: 15000 });
    });

    test('clicking Vulnerabilities navigates to vulnerabilities page', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });
        await sidebar.getByRole('link', { name: 'Vulnerabilities' }).click();
        await page.waitForURL('**/vulnerabilities', { timeout: 15000 });
    });

    test('admin section is expandable and shows admin links', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Click the Settings expander
        const adminToggle = sidebar.getByRole('button', { name: /Settings/i });
        if (await adminToggle.isVisible()) {
            await adminToggle.click();
            // Admin nav items should become visible
            await expect(sidebar.getByRole('link', { name: 'Authentication' })).toBeVisible({ timeout: 5000 });
            await expect(sidebar.getByRole('link', { name: 'Logs' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible();
        }
    });

    test('settings flyout opens on hover', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        const adminToggle = sidebar.getByRole('button', { name: /Settings/i });
        if (await adminToggle.isVisible()) {
            await adminToggle.hover();
            await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible({ timeout: 5000 });
        }
    });

    test('settings flyout stays open when pinned', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        const adminToggle = sidebar.getByRole('button', { name: /^Settings$/i });
        if (await adminToggle.isVisible()) {
            await adminToggle.hover();
            const panel = page.locator('#admin-nav-group');
            await expect(panel).toBeVisible({ timeout: 5000 });

            await page.getByRole('button', { name: 'Keep Settings menu open' }).click();
            await page.mouse.move(900, 400);
            await expect(panel).toBeVisible();

            // Clicking elsewhere on the page must not close a pinned menu
            await page.mouse.click(900, 400);
            await expect(panel).toBeVisible();

            await page.getByRole('button', { name: 'Close Settings menu' }).click();
            await expect(panel).toBeHidden({ timeout: 5000 });
        }
    });

    test('automation flyout lists upload automations', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        const automationToggle = sidebar.getByRole('button', { name: /Automation/i });
        if (await automationToggle.isVisible()) {
            await automationToggle.hover();
            await expect(sidebar.getByRole('link', { name: 'Nessus File Share' })).toBeVisible({ timeout: 5000 });
            await expect(sidebar.getByRole('link', { name: 'ACR Blob Ingest' })).toBeVisible();
        }
    });

    test('inventory flyout lists manual uploads', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        const inventoryToggle = sidebar.getByRole('button', { name: /Inventory/i });
        if (await inventoryToggle.isVisible()) {
            await inventoryToggle.hover();
            await expect(sidebar.getByRole('link', { name: 'Nessus CSV' })).toBeVisible({ timeout: 5000 });
            await expect(sidebar.getByRole('link', { name: 'Pentest PDF' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'ACR CSV' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'Dead Letter Queue' })).toBeVisible();
            await expect(sidebar.getByRole('link', { name: 'Tools' })).toBeVisible();
        }
    });
});

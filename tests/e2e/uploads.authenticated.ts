import { test, expect } from '@playwright/test';

test.describe('Uploads Page', () => {
    test('loads the uploads page', async ({ page }) => {
        await page.goto('/uploads');
        // Legacy route redirects to the Nessus upload page
        await page.waitForURL('**/uploads/nessus', { timeout: 15000 });
        await expect(page.locator('#tour-sidebar')).toBeVisible({ timeout: 15000 });
    });

    test('uploads pages are accessible via sidebar', async ({ page }) => {
        await page.goto('/dashboard');
        const sidebar = page.locator('#tour-sidebar');
        await expect(sidebar).toBeVisible({ timeout: 15000 });

        // Expand the Inventory section and click Nessus CSV
        const inventoryToggle = sidebar.getByRole('button', { name: /Inventory/i });
        if (await inventoryToggle.isVisible()) {
            await inventoryToggle.click();
            await sidebar.getByRole('link', { name: 'Nessus CSV' }).click();
            await page.waitForURL('**/uploads/nessus', { timeout: 15000 });
        }
    });

    test('acr uploads page is manual only', async ({ page }) => {
        await page.goto('/uploads/acr');
        await expect(page.getByRole('heading', { name: 'ACR CSV' })).toBeVisible({ timeout: 15000 });
        await expect(page.locator('main').getByRole('button', { name: 'Automation' })).toHaveCount(0);
    });

    test('acr automation page shows blob ingest config', async ({ page }) => {
        await page.goto('/automation/acr');
        await expect(page.getByRole('heading', { name: 'ACR Blob Ingest' })).toBeVisible({ timeout: 15000 });
    });

    test('nessus automation page shows file share config', async ({ page }) => {
        await page.goto('/automation/nessus');
        await expect(page.getByRole('heading', { name: 'Nessus File Share' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Azure File Share' })).toBeVisible();
    });

    test('pentest uploads page has no automation tab', async ({ page }) => {
        await page.goto('/uploads/pentest');
        await expect(page.getByRole('heading', { name: 'Pentest PDF' })).toBeVisible({ timeout: 15000 });
        await expect(page.locator('main').getByRole('button', { name: 'Automation' })).toHaveCount(0);
    });
});

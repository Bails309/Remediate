import { test, expect } from '@playwright/test';

test.describe('Accessibility Statement Page', () => {
    test('loads the accessibility statement page', async ({ page }) => {
        await page.goto('/accessibility');
        await expect(page.getByRole('heading', { name: 'Accessibility Statement' })).toBeVisible({ timeout: 10000 });
    });

    test('displays WCAG conformance target', async ({ page }) => {
        await page.goto('/accessibility');
        await expect(page.getByText('WCAG 2.1 Level AA')).toBeVisible();
    });

    test('displays all required sections', async ({ page }) => {
        await page.goto('/accessibility');
        await expect(page.getByRole('heading', { name: 'Conformance Target' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Measures Taken' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Known Limitations' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Compatibility' })).toBeVisible();
    });
});

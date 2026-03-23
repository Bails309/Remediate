import { test, expect } from '@playwright/test';

test.describe('Health API', () => {
    test('GET /api/health returns 200 with ok:true', async ({ request }) => {
        const response = await request.get('/api/health');
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ ok: true });
    });
});

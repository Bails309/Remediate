import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as listTools } from '../../app/api/tools/list/route';
import { POST as executeTool } from '../../app/api/tools/execute/route';
import { GET as getConfig, PUT as updateConfig } from '../../app/api/tools/config/route';
import { requirePentestUser, requirePentestAdmin } from '@/lib/rbac';

// Mock dependencies
vi.mock('@/lib/rbac', () => ({
    requirePentestUser: vi.fn(),
    requirePentestAdmin: vi.fn(),
}));

vi.mock('@/lib/pentest', () => ({
    getPentestBackendUrl: vi.fn(() => 'http://backend'),
    signPentestToken: vi.fn(() => 'mock-token'),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Tools API Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (requirePentestUser as any).mockResolvedValue({ user: { email: 'test@example.com' } });
        (requirePentestAdmin as any).mockResolvedValue({ user: { email: 'admin@example.com' } });
    });

    describe('GET /api/tools/list', () => {
        it('should return 500 and log error when backend returns HTML', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 502,
                text: async () => '<html><body>Bad Gateway</body></html>',
            });

            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const response = await listTools();
            const body = await response.json();

            expect(response.status).toBe(502);
            expect(body.error).toBe('Backend Error (502): Backend service unavailable');
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('[Backend Error] Status: 502'));
            spy.mockRestore();
        });

        it('should return 404 when backend returns 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => 'Not Found',
            });

            const response = await listTools();
            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/tools/execute', () => {
        it('should handle backend timeout or failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 504,
                text: async () => 'Gateway Timeout',
            });

            const req = new Request('http://localhost/api/tools/execute', {
                method: 'POST',
                body: JSON.stringify({ toolId: 'nmap' }),
            });

            const response = await executeTool(req);
            expect(response.status).toBe(504);
        });
    });

    describe('/api/tools/config', () => {
        it('should handle unauthorized access from backend', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Unauthorized' }),
                text: async () => 'Unauthorized',
            });

            const response = await getConfig();
            expect(response.status).toBe(401);
        });

        it('should handle update failures', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Invalid Configuration' }),
                text: async () => 'Invalid Configuration',
            });

            const req = new Request('http://localhost/api/tools/config', {
                method: 'PUT',
                body: JSON.stringify({ config: {} }),
            });

            const response = await updateConfig(req);
            expect(response.status).toBe(400);
        });
    });
});

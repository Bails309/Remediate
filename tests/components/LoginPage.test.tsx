import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';
import { signIn } from 'next-auth/react';

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
    signIn: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: SSO and Local disabled
        mockFetch.mockResolvedValue({
            json: async () => ({ ssoEnabled: false, localEnabled: false }),
        });
    });

    it('should show loading state and then disabled message if no methods available', async () => {
        render(<LoginPage />);
        expect(screen.getByText(/Loading authentication methods/)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText(/No authentication methods are enabled/)).toBeInTheDocument();
        });
    });

    it('should show SSO button if SSO is enabled', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ ssoEnabled: true, localEnabled: false }),
        });

        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByText(/Continue with SSO/)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText(/Continue with SSO/));
        expect(signIn).toHaveBeenCalledWith('keycloak', expect.any(Object));
    });

    it('should show local login form and handle local sign in', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ ssoEnabled: false, localEnabled: true }),
        });

        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Username/)).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText(/Username/), { target: { value: 'testuser' } });
        fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: 'password123' } });
        fireEvent.click(screen.getByText(/Sign in locally/));

        expect(signIn).toHaveBeenCalledWith('credentials', expect.objectContaining({
            username: 'testuser',
            password: 'password123',
        }));
    });

    it('should display error message on local login failure', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ ssoEnabled: false, localEnabled: true }),
        });
        (signIn as any).mockResolvedValue({ error: 'OAuthSignin' });

        render(<LoginPage />);

        await waitFor(() => {
            fireEvent.click(screen.getByText(/Sign in locally/));
        });

        await waitFor(() => {
            expect(screen.getByText(/Invalid local credentials/)).toBeInTheDocument();
        });
    });

    it('should handle fetch error and show disabled message', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByText(/No authentication methods are enabled/)).toBeInTheDocument();
        });
    });

    it('should auto-start SSO when ?sso=keycloak is in URL', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({ ssoEnabled: true, localEnabled: false }),
        });

        // Set URL search params
        const originalSearch = window.location.search;
        Object.defineProperty(window, 'location', {
            value: { ...window.location, search: '?sso=keycloak' },
            writable: true,
            configurable: true,
        });

        render(<LoginPage />);

        await waitFor(() => {
            expect(signIn).toHaveBeenCalledWith('keycloak', expect.objectContaining({ callbackUrl: '/dashboard' }));
        }, { timeout: 5000 });

        // Restore
        Object.defineProperty(window, 'location', {
            value: { ...window.location, search: originalSearch },
            writable: true,
            configurable: true,
        });
    });
});

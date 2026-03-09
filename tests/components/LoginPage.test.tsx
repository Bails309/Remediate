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
global.fetch = mockFetch;

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
        expect(screen.getByText(/Loading authentication methods/)).toBeInViewport();

        await waitFor(() => {
            expect(screen.getByText(/No authentication methods are enabled/)).toBeInViewport();
        });
    });

    it('should show SSO button if SSO is enabled', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ ssoEnabled: true, localEnabled: false }),
        });

        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByText(/Continue with SSO/)).toBeInViewport();
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
            expect(screen.getByPlaceholderText(/Username/)).toBeInViewport();
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
            expect(screen.getByText(/Invalid local credentials/)).toBeInViewport();
        });
    });
});

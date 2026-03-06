import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Cleanup DOM after each test
afterEach(() => {
    cleanup();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
    }),
    usePathname: () => "",
    useSearchParams: () => new URLSearchParams(),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
    useTheme: () => ({
        theme: "light",
        setTheme: vi.fn(),
        systemTheme: "light",
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock ResizeObserver for charts/UI libraries
global.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

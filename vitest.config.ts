import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        include: ["**/*.test.{ts,tsx}"],
        exclude: ["node_modules", ".next", ".git"],
        alias: {
            "@": path.resolve(__dirname, "."),
        },
        coverage: {
            provider: "c8",
            reporter: ["text", "html"],
            all: true,
            include: ["lib/**", "app/**", "components/**"],
            exclude: ["**/tests/**", "**/*.test.*", "node_modules"],
            lines: 80,
            functions: 80,
            branches: 75,
            statements: 80,
        },
    },
});

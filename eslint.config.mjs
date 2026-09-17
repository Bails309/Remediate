import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Project-specific overrides
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "tests/**",
      "tests/**/*.*",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tests/e2e/.auth/**",
    // Fixture directory contains non-source files (.gitignore, README.md) that
    // ESLint's default file matcher attempts to parse as JS otherwise.
    "tests/lib/__fixtures__/**",
  ]),
]);

export default eslintConfig;

import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist/**",
    "dev-dist/**",
    "coverage/**",
    ".vite/**",
    ".tmp-lint/**",
    "archive/**",
    "android/**",
    "ios/**",
    "apps/**",
    "public/**",
    "resources/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        __BUILD_TIMESTAMP__: "readonly",
        __PRECHECK_SCHEMA_VERSION__: "readonly",
      },
    },
  },
  {
    ...pluginReact.configs.flat.recommended,
    files: ["**/*.{js,jsx}"],
    settings: { react: { version: "detect" } },
  },
  {
    ...pluginReact.configs.flat["jsx-runtime"],
    files: ["**/*.{js,jsx}"],
  },
  {
    files: ["**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(_|React$)",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.{js,jsx}"],
    languageOptions: { globals: globals.vitest },
  },
  {
    files: ["scripts/**", ".cursor/hooks/**", "*.config.{js,mjs,cjs}", "src/service-worker.js"],
    languageOptions: { globals: { ...globals.node, ...globals.serviceworker } },
  },
]);

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/generated/**", "templates/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { languageOptions: { globals: globals.node } },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }] } },
);

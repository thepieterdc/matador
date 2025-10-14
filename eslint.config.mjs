import pluginJs from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylisticJs from "@stylistic/eslint-plugin";

export default [
  {
    ignores: ["eslint.config.mjs", "build", ".react-router"],
  },
  { files: ["app/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@stylistic/js/quotes": [1, "double", { avoidEscape: true }],
      "@stylistic/js/semi": [2, "always"],
      "no-debugger": [2],
      "no-console": 1,
      "@stylistic/js/comma-dangle": [1, "always-multiline"],
      "@typescript-eslint/ban-ts-comment": 0,
      "@typescript-eslint/consistent-type-imports": [
        2,
        {
          disallowTypeAnnotations: true,
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
    },
  },
  // Override for scripts directory
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  {
    plugins: {
      "@stylistic/js": stylisticJs,
    },
  },
];

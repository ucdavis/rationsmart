// Type-aware lint for unhandled promises (audit B-36). Kept separate from
// eslint.config.mjs because it needs the TypeScript program (slower), so it
// runs as its own `npm run lint:promises` step in CI. A deliberate
// fire-and-forget call is written `void doThing()`; the called function must
// handle its own errors.
import tseslint from "typescript-eslint";

const config = [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
];

export default config;

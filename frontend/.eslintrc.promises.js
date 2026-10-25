// Type-aware lint for unhandled promises (audit B-36). Kept separate from
// .eslintrc.json because it needs the TypeScript program (slower), so it runs
// as its own `npm run lint:promises` step in CI. A deliberate fire-and-forget
// call is written `void doThing()`; the called function must handle its own
// errors.
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { project: "./tsconfig.json", tsconfigRootDir: __dirname },
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
  },
};

// ESLint 9 flat config — the same rules as the old .eslintrc.json
// (next/core-web-vitals + @typescript-eslint/recommended). Next 16 removed
// `next lint`, so `npm run lint` calls the ESLint CLI on src/ directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const config = [
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@next/next/no-img-element": "off",
      // React Compiler rules new in eslint-plugin-react-hooks 7 (eslint-config-next
      // 16). They were not in the Next 14 rule set; meeting them means rewriting
      // effects in Android-parity screens, so that is its own planned change.
      // rules-of-hooks / exhaustive-deps stay on as before.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "no-console": ["warn", { allow: ["error", "debug"] }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;

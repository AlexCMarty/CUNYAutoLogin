import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts", "e2e/**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.property.name='then']",
        message: "Use async/await instead of .then()",
      },
    ],

    // Single-letter variable names make code unreadable. Name things after
    // what they contain, not what type they are. Exceptions: `_` (intentionally
    // unused), `i` (indexed for-loop counter), and single-letter generic type
    // params (T, E, K, V, R) which TypeScript convention allows.
    "id-length": [
      "warn",
      {
        min: 2,
        properties: "never",
        exceptions: ["_", "i", "T", "E", "K", "V", "R"],
      },
    ],

    // Functions must do one thing. Hard cap is 80 lines per the style guide.
    // Blank lines and comments are excluded so well-documented functions are
    // not penalised — only code lines count toward the limit.
    "max-lines-per-function": [
      "warn",
      { max: 80, skipBlankLines: true, skipComments: true },
    ],

    // Console output leaks internals to the browser console in production.
    // All console calls must be gated by `if (import.meta.env.MODE !== "production")`
    // or `if (isDevMode())`. Add eslint-disable-next-line only when the guard
    // is present and you are certain no credential-shaped data is logged.
    "no-console": "warn",
  },
});

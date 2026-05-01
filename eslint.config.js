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
  },
});

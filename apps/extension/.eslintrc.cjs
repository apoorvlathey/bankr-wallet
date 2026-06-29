module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  globals: {
    AddEventListenerOptions: "readonly",
    BlobPart: "readonly",
    BufferSource: "readonly",
    JSX: "readonly",
    React: "readonly",
    RequestInfo: "readonly",
    RequestInit: "readonly",
    __dirname: "readonly",
    chrome: "readonly",
    process: "readonly",
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "prefer-const": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "no-undef": "error",
  },
};

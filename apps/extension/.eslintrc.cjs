module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  globals: {
    AddEventListenerOptions: "readonly",
    BlobPart: "readonly",
    BodyInit: "readonly",
    BufferSource: "readonly",
    HeadersInit: "readonly",
    JSX: "readonly",
    React: "readonly",
    RequestInfo: "readonly",
    RequestInit: "readonly",
    ScrollLogicalPosition: "readonly",
    __dirname: "readonly",
    chrome: "readonly",
    process: "readonly",
  },
  overrides: [
    {
      files: ["tests/**/*.ts", "tests/**/*.tsx"],
      env: { node: true },
    },
  ],
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

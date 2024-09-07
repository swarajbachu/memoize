import baseConfig from "@memoize/eslint-config/base";
import reactConfig from "@memoize/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: ["dist/**"],
  },
  ...baseConfig,
  ...reactConfig,
];

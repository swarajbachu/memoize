import baseConfig, { restrictEnvAccess } from "@memoize/eslint-config/base";
import nextjsConfig from "@memoize/eslint-config/nextjs";
import reactConfig from "@memoize/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: [".next/**"],
  },
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  ...restrictEnvAccess,
];

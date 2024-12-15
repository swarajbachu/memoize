import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

import baseConfig from "@memoize/tailwind-config/web";

export default {
  // We need to append the path to the UI package to the content array so that
  // those classes are included correctly.
  content: [
    ...baseConfig.content,
    "../../packages/ui/src/*.{ts,tsx}",
    "../../packages/validators/src/*.{ts,tsx}",
  ],
  presets: [baseConfig],
  safelist: [
    {
      pattern:
        /bg-(green|blue|red|yellow|purple|emerald|pink|violet|teal|amber|gray|sky|indigo|rose|cyan|slate|fuchsia)-400\/10/,
    },
    {
      pattern:
        /text-(green|blue|red|yellow|purple|emerald|pink|violet|teal|amber|gray|sky|indigo|rose|cyan|slate|fuchsia)-700/,
    },
    {
      pattern:
        /hover:bg-(green|blue|red|yellow|purple|emerald|pink|violet|teal|amber|gray|sky|indigo|rose|cyan|slate|fuchsia)-400\/30/,
    },
    {
      pattern:
        /dark:bg-(green|blue|red|yellow|purple|emerald|pink|violet|teal|amber|gray|sky|indigo|rose|cyan|slate|fuchsia)-400\/20/,
    },
    {
      pattern:
        /dark:text-(green|blue|red|yellow|purple|emerald|pink|violet|teal|amber|gray|sky|indigo|rose|cyan|slate|fuchsia)-300/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
        mono: ["var(--font-geist-mono)", ...fontFamily.mono],
      },
    },
  },
} satisfies Config;

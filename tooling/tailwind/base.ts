import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      sm: "0 1px 2px 0 rgb(0,22.35,30.59,0.02)",
      DEFAULT:
        "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgb(0,22.35,30.59,0.01)",
      md: "0 2px 4px -1px rgb(0,22.35,30.59,0.02), 0 2px 4px -1px rgb(0,22.35,30.59,0.02)",
      lg: "0 10px 10px -1px rgb(0,22.35,30.59,0.02), 0 4px 6px -2px rgb(0,22.35,30.59,0.02)",
      xl: "0 20px 25px -1px rgb(0,22.35,30.59,0.02), 0 8px 10px -6px rgb(0,22.35,30.59,0.02)",
      "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
      inner: "inset 0 2px 4px 0 rgb(0,22.35,30.59,0.02)",
      "inner-top": "inset 0 2px 4px -2px rgba(0, 0, 0, 0.06)",
      "inner-bottom": "inset 0 -2px 4px -2px rgba(0, 0, 0, 0.06)",
      "inner-3d":
        "inset 0 -4px 6px -1px rgba(0, 0, 0, 0.1), inset 0 2px 4px -1px rgba(255, 255, 255, 0.1)",
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderColor: {
        DEFAULT: "hsl(var(--border))",
      },
    },
  },
} satisfies Config;

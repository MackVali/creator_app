import type { Config } from "tailwindcss";

const withOpacityValue = (variable: string) =>
  `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: withOpacityValue("--color-surface"),
          foreground: withOpacityValue("--color-surface-foreground"),
          elevated: withOpacityValue("--color-surface-elevated"),
        },
        primary: {
          DEFAULT: withOpacityValue("--color-primary"),
          foreground: withOpacityValue("--color-primary-foreground"),
        },
        accent: {
          DEFAULT: withOpacityValue("--color-accent"),
          foreground: withOpacityValue("--color-accent-foreground"),
        },
        muted: withOpacityValue("--color-muted"),
        border: withOpacityValue("--color-border"),
        highlight: withOpacityValue("--color-highlight"),
      },
    },
  },
} satisfies Config;

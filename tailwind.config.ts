import type { Config } from "tailwindcss";

const withA = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // re-point the neutrals you actually use
        neutral: {
          50: withA("--twc-neutral-50"),
          100: withA("--twc-neutral-100"),
          200: withA("--twc-neutral-200"),
          300: withA("--twc-neutral-300"),
          400: withA("--twc-neutral-400"),
          500: withA("--twc-neutral-500"),
          600: withA("--twc-neutral-600"),
          700: withA("--twc-neutral-700"),
          800: withA("--twc-neutral-800"),
          900: withA("--twc-neutral-900"),
          950: withA("--twc-neutral-950"),
        },
        zinc: {
          200: withA("--twc-zinc-200"),
          300: withA("--twc-zinc-300"),
          400: withA("--twc-zinc-400"),
          500: withA("--twc-zinc-500"),
          600: withA("--twc-zinc-600"),
        },
        slate: {
          600: withA("--twc-slate-600"),
          700: withA("--twc-slate-700"),
          800: withA("--twc-slate-800"),
        },
      },
    },
  },
} satisfies Config;

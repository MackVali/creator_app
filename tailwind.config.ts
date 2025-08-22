import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Optional: small tweak to keep dark neutrals consistent
      },
    },
  },
  safelist: [
    // Keep dynamic gradient/neutral/button classes from being purged in Preview builds
    { pattern: /^(from|via|to)-(slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^bg-(slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^text-(slate|gray|zinc|neutral|stone|white|black|blue|emerald|red|yellow)-(50|100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^(hover:|active:)?(bg|text)-(white|black)$/ },
    { pattern: /^border-(slate|gray|zinc|neutral|stone)-(200|300|400|500)$/ },
    { pattern: /^shadow(-(sm|md|lg|xl|2xl))?$/ },
    { pattern: /^rounded(-(sm|md|lg|xl|2xl|full))?$/ },
    { pattern: /^backdrop-blur(-(sm|md|lg|xl|2xl))?$/ },
  ],
  plugins: [],
};
export default config;

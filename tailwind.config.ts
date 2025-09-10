import type { Config } from "tailwindcss";

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
          DEFAULT: "#0E0E10",
          elevated: "#151517",
        },
        textc: {
          primary: "#EFEFF2",
          muted: "#9A9AA2",
        },
        accent: {
          red: "#FF453A",
        },
      },
    },
  },
} satisfies Config;

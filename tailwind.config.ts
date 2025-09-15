import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
    fontWeight: {
      thin: "200",
      extralight: "300",
      light: "400",
      normal: "500",
      medium: "600",
      semibold: "675",
      bold: "750",
      extrabold: "825",
      black: "900",
    },
  },
} satisfies Config;

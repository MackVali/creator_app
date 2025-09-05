import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#121417",       // page background
          panel: "#181b20",    // card fill
          rail: "#0f1114",     // left rail strip
          line: "#22262b",     // separators
        },
      },
      borderRadius: { card: "18px" },
      boxShadow: {
        // soft neumorphic depth + faint outline
        'elev-1': "0 1px 0 rgba(255,255,255,0.05), 0 6px 14px rgba(0,0,0,0.45)",
        'elev-2': "0 1px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(0,0,0,0.55)",
        'inset-soft': "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.5)",
      },
      keyframes: {
        press: { "0%": { transform:"translateY(0) scale(1)" }, "100%": { transform:"translateY(1px) scale(0.985)" } },
        shimmer: { "0%": { transform:"translateX(-100%)" }, "100%": { transform:"translateX(100%)" } },
      },
      animation: {
        press: "press .08s ease-out both",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        card: "var(--card)",
        cardho: "var(--card-ho)",
        border: "var(--border)",
        track: "var(--track)",
        fill: "var(--fill)",
        texthi: "var(--text-hi)",
        textmed: "var(--text-med)",
        textlo: "var(--text-lo)",
        pill: "var(--pill)",
        icon: "var(--icon)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-sm)",
      },
      boxShadow: {
        soft: "var(--shadow)",
      },
      spacing: {
        gaplg: "var(--gap-lg)",
        gapsm: "var(--gap-sm)",
      },
      fontFamily: {
        ui: ["Inter", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
      letterSpacing: {
        section: ".08em",
      },
    },
  },
  plugins: [],
}

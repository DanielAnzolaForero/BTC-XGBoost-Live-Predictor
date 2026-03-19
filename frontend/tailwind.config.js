/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:     "#060a10",
        card:   "#0b1118",
        card2:  "#0e1520",
        line:   "#0f172a",
        faint:  "#1e293b",
        ink:    "#f1f5f9",
        sub:    "#b0bec5",
        dim:    "#64748b",
        buy:    "#00d97e",
        sell:   "#ff4d6d",
        hold:   "#ffb703",
        brand:  "#818cf8",
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

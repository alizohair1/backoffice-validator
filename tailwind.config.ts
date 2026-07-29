import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFAF8",
        panel: "#F1F3F4",
        ink: "#16213E",
        inkmuted: "#5B6478",
        hairline: "#DDE2E6",
        match: "#1F8A5F",
        matchbg: "#E7F4EE",
        mismatch: "#C4432B",
        mismatchbg: "#FBEAE6",
        review: "#B9791A",
        reviewbg: "#FBF0DE",
        onlyone: "#5B6478",
        onlyonebg: "#EEF0F2",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        stamp: "0 1px 0 rgba(22,33,62,0.04), 0 2px 6px rgba(22,33,62,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;

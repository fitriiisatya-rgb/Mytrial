import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#14213D", 2: "#1E2E52", 3: "#28395F" },
        gold: { DEFAULT: "#C9A227", dim: "#E4C558" },
        surface: "#F4F5F7",
        border: "#E1E4EA",
      },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      colors: {
        midnight: {
          900: "#04060b",
          800: "#060a13",
          700: "#0b1424",
        },
        brand: {
          500: "#6366f1",
          400: "#818cf8",
          300: "#a5b4fc",
        },
      },
      backgroundImage: {
        "grid-glow":
          "radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.35), transparent 55%), radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.25), transparent 50%), radial-gradient(circle at 50% 100%, rgba(236, 72, 153, 0.2), transparent 60%)",
      },
      boxShadow: {
        glow: "0 20px 45px rgba(99, 102, 241, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;

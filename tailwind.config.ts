import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        cyan: {
          50: "#f0f9ff",
          100: "#e0f8ff",
          400: "#00D9FF",
          500: "#00C2E0",
          600: "#00B8CC",
        },
        magenta: {
          400: "#FF006E",
          500: "#FF0066",
          600: "#E60060",
        },
        accent: "#00F5FF",
        primary: "#00D9FF",
        dark: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#030712",
          base: "#0a0e27",
        },
      },
      backgroundColor: {
        glass: "rgba(17, 24, 39, 0.5)",
        "glass-xl": "rgba(17, 24, 39, 0.5)",
      },
      backdropBlur: {
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(0, 217, 255, 0.4), inset 0 0 20px rgba(0, 217, 255, 0.1)",
        "glow-magenta": "0 0 20px rgba(255, 0, 110, 0.4), inset 0 0 20px rgba(255, 0, 110, 0.1)",
        "cyan-lg": "0 0 30px rgba(0, 217, 255, 0.3)",
      },
      keyframes: {
        gradientFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        textGradient: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        gradientFlow: "gradientFlow 3s ease-in-out infinite",
        float: "float 8s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.6s ease-out",
        slideUp: "slideUp 0.6s ease-out",
        textGradient: "textGradient 3s ease-in-out infinite",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;

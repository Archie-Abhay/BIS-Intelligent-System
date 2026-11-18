import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        bis: {
          50: '#F0F5FA', 
          100: '#D1E1F0',
          500: '#1C60C0', // Bright Blue (Secondary)
          600: '#0A3A82', // BIS Official Blue (Primary)
          900: '#051D41',
        },
        accent: {
          50: '#F0F5FA',
          500: '#1C60C0',
          600: '#0A3A82', 
        }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;

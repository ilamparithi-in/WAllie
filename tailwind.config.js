/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        whatsapp: {
          dark: '#111b21',
          panel: '#202c33',
          accent: '#00a884',
          hover: '#2a3942',
          light: '#e9edef',
        },
      },
    },
  },
  plugins: [],
};

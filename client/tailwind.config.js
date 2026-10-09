/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class', // dark mode is switched by adding "dark" to <html>
  theme: {
    extend: {
      colors: {
        // fresh green brand color
        brand: {
          50: '#effdf3', 100: '#d9f9e3', 200: '#b4f1c8', 300: '#7fe3a3', 400: '#43cc77',
          500: '#22b35a', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

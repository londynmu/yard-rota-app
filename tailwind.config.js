/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: false,
  theme: {
    extend: {
      colors: {
        cream: '#F5F5F0',
        offwhite: '#FAFAFA',
        charcoal: '#2D2D2D',
        softgray: '#E0E0E0',
        mediumgray: '#9E9E9E',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
} 
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b14',
          900: '#0B1120',
          850: '#0e1628',
          800: '#141E33',
          700: '#1e2b48',
          600: '#2c3e66',
        },
      },
    },
  },
  plugins: [],
}

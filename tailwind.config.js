/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          light: '#818cf8',
        },
        admin: {
          DEFAULT: '#b45309',
          light: '#d97706',
        },
        surface: {
          DEFAULT: '#0f1117',
          elevated: '#161922',
          border: '#232733',
        },
      },
      keyframes: {
        shrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        }
      },
      animation: {
        'shrink': 'shrink 5s linear forwards',
      }
    },
  },
  plugins: [],
}

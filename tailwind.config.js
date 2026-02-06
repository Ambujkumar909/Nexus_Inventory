
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        nexus: {
          cream: '#FDFBF7',
          sand: '#F9F6F0',
          border: '#EAE3D5',
          dark: '#2C2C2C',
        }
      }
    },
  },
  plugins: [],
}

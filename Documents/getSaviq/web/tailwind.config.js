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
        page: '#F9F8F6',
        surface: '#FFFFFF',
        'surface-hover': '#F2EFEB',
        'text-primary': '#2B2A28',
        'text-secondary': '#73716D',
        'brand-primary': '#4A6D5C',
        'brand-hover': '#3D594B',
        'brand-accent': '#E07A5F',
        'income': '#3D8B61',
        'income-bg': '#E9F5EF',
        'expense': '#E63946',
        'expense-bg': '#FBEAEC',
        'transfer': '#457B9D',
        'transfer-bg': '#EAF2F6',
        'warning': '#F4A261',
        'border-color': '#E5E2DC',
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'card': '1rem',
        'button': '9999px',
        'input': '0.5rem',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#EEF3FA',
          100: '#DCE6F4',
          200: '#B7C9E4',
          300: '#8CA7D0',
          500: '#3A5F96',
          600: '#26467A',
          700: '#183560',
          800: '#102A4C',
          900: '#0A1B33',
          950: '#06101F',
        },
        teal: {
          50: '#E9FAF8',
          100: '#C7F2EE',
          200: '#93E4DC',
          400: '#2CC4B8',
          500: '#13A89C',
          600: '#0E8A80',
          700: '#0D6C65',
        },
        gold: {
          100: '#FDF1D3',
          300: '#F8D27A',
          400: '#F4B942',
          500: '#E39F1F',
          700: '#8A5A06',
        },
        canvas: '#F5F2EA',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Anuphan', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', '"IBM Plex Sans Thai"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(10,27,51,0.05), 0 18px 40px -22px rgba(10,27,51,0.28)',
        lift: '0 1px 0 rgba(255,255,255,0.14) inset, 0 10px 22px -10px rgba(10,27,51,0.65)',
        glow: '0 0 0 1px rgba(244,185,66,0.5), 0 0 22px 2px rgba(244,185,66,0.45)',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          50: '#e8ecf5',
          100: '#c5cee0',
          200: '#9aabc8',
          300: '#6f88b0',
          400: '#4d6a9e',
          500: '#34518a',
          600: '#233d6e',
          700: '#1a2d56',
          800: '#101B35',
          900: '#0a1224',
        },
        brand: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd6fe',
          300: '#93bbfd',
          400: '#6098fa',
          500: '#2563EB',
          600: '#1e4fd6',
          700: '#1a40ad',
          800: '#1a3a8a',
          900: '#19356e',
        },
        amber: {
          50: '#fef9ee',
          100: '#fef0c7',
          200: '#fde08a',
          300: '#fbc94d',
          400: '#f9b325',
          500: '#F5A623',
          600: '#d9800e',
          700: '#b45c0c',
          800: '#924810',
          900: '#783c11',
        },
      },
      boxShadow: {
        'premium': '0 1px 3px rgba(16,27,53,0.06), 0 1px 2px rgba(16,27,53,0.04)',
        'premium-md': '0 4px 16px rgba(16,27,53,0.08), 0 2px 6px rgba(16,27,53,0.04)',
        'premium-lg': '0 12px 40px rgba(16,27,53,0.12), 0 4px 12px rgba(16,27,53,0.06)',
        'navy-glow': '0 8px 32px rgba(37,99,235,0.15)',
        'amber-glow': '0 8px 32px rgba(245,166,35,0.2)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'count-up': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'scan-line': {
          '0%': { top: '0%' },
          '50%': { top: '100%' },
          '100%': { top: '0%' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.1)', opacity: '0' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'count-up': 'count-up 0.6s cubic-bezier(0.16,1,0.3,1) forwards',
        'scan-line': 'scan-line 2.5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};

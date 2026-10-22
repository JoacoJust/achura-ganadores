/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cinzel', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        gold: '#d4af37',
        cyan: '#12c7e4',
        ink: '#06070c',
        teal2: '#0f2b3a',
      },
      boxShadow: {
        glow: '0 0 70px rgba(18,199,228,.22)',
        goldglow: '0 0 60px rgba(212,175,55,.25)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        reveal: {
          '0%': { opacity: '0', transform: 'scale(.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shine: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up .6s ease-out both',
        reveal: 'reveal .8s cubic-bezier(.2,.7,.3,1) both',
        shine: 'shine 6s linear infinite',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'pulse-red': 'pulseRed 2s infinite',
        'pulse-yellow': 'pulseYellow 3s infinite',
        'pulse-green': 'pulseGreen 2s infinite',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeInUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          },
        },
        slideIn: {
          '0%': {
            opacity: '0',
            transform: 'translateX(30px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateX(0)'
          },
        },
        pulseRed: {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)'
          },
          '50%': {
            boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.2)'
          },
        },
        pulseYellow: {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(234, 179, 8, 0.3)'
          },
          '50%': {
            boxShadow: '0 0 0 3px rgba(234, 179, 8, 0.15)'
          },
        },
        pulseGreen: {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)'
          },
          '50%': {
            boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.2)'
          },
        },
      },
    },
  },
  plugins: [],
} 
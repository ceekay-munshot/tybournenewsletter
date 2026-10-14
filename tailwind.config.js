/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // body = Inter, display (headings + numbers) = Space Grotesk
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // direction semantics (green = up, red = down, slate = flat)
        up: '#10B981',
        down: '#F43F5E',
        flat: '#94A3B8',
        // sector accents
        tech: '#6366F1',
        ind: '#F59E0B',
        fin: '#10B981',
        macro: '#EC4899',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 6px 20px rgba(15,23,42,0.06)',
        'card-hover': '0 2px 6px rgba(15,23,42,0.06), 0 16px 40px rgba(15,23,42,0.10)',
        pop: '0 10px 34px rgba(15,23,42,0.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

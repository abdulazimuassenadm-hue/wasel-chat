/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // هوية "واصل شات" المستقلة (لا تعتمد على ألوان أو شعار أي منصة أخرى)
        brand: {
          50: '#eefdf9',
          100: '#d5f8ef',
          200: '#aef0e0',
          300: '#78e2cd',
          400: '#3ecbb4',
          500: '#1fb09c',
          600: '#148d7f',
          700: '#147167',
          800: '#155c55',
          900: '#154c47',
          950: '#052e2c',
        },
        accent: {
          50: '#fff8eb',
          100: '#ffecc6',
          200: '#ffd688',
          300: '#ffba4a',
          400: '#ffa220',
          500: '#f97f07',
          600: '#dd5c02',
          700: '#b73e06',
          800: '#94300c',
          900: '#7a290d',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c8',
          400: '#8591a8',
          500: '#66738d',
          600: '#515c74',
          700: '#424b5e',
          800: '#394050',
          900: '#333845',
          950: '#0f1117',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 24px -6px rgba(15, 17, 23, 0.12)',
        glow: '0 0 0 4px rgba(31, 176, 156, 0.15)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'fade-up': 'fade-up 300ms ease-out',
        'slide-in': 'slide-in 200ms ease-out',
        'pop-in': 'pop-in 150ms ease-out',
        'pulse-ring': 'pulseRing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-dot': 'bounceDot 1.2s infinite',
      },
    },
  },
  plugins: [],
}

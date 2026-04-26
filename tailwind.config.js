/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Electrolize', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Electrolize', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        carbon: '#0A0A0A',
        graphite: '#161616',
        steel: '#8E9387',
        nickel: '#D7D9D0',
        ember: '#D6FF00',
        signal: '#BFFF00',
      },
      boxShadow: {
        insetLine: 'inset 0 0 0 1px rgba(214, 255, 0, 0.08)',
        neon: '0 0 8px rgba(214, 255, 0, 0.6), 0 0 16px rgba(214, 255, 0, 0.3)',
        neonSoft: '0 0 6px rgba(214, 255, 0, 0.34), 0 0 14px rgba(214, 255, 0, 0.18)',
        neonInset: 'inset 0 0 12px rgba(214, 255, 0, 0.12)',
      },
    },
  },
  plugins: [],
};

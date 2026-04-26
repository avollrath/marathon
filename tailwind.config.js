/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        carbon: '#111111',
        graphite: '#181818',
        steel: '#9A9A92',
        nickel: '#CAC7BC',
        ember: '#D7A15B',
        signal: '#7EA7A6',
      },
      boxShadow: {
        insetLine: 'inset 0 0 0 1px rgba(202, 199, 188, 0.12)',
      },
    },
  },
  plugins: [],
};

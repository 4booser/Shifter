/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // One source of truth with constants/theme.ts: the CSS variables are
      // declared in global.css for light and dark, and classes read them —
      // so `bg-element text-ink` follows the system scheme by itself.
      colors: {
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        canvas: 'var(--canvas)',
        element: 'var(--element)',
        chosen: 'var(--chosen)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        good: 'var(--good)',
        danger: 'var(--danger)',
      },
    },
  },
  plugins: [],
};

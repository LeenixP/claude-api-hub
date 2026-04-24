/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src-ui/**/*.{tsx,ts,html}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
          glow: 'rgba(42, 162, 193, 0.15)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
        },
        border: 'var(--color-border)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"SF Mono"', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};

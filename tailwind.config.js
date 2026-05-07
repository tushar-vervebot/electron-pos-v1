/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Design tokens (map CSS variables → Tailwind utilities) ──────────
        // Usage: bg-pos-bg, text-pos-text, border-pos-border, etc.
        'pos-bg':       'var(--color-bg)',
        'pos-surface':  'var(--color-surface)',
        'pos-card':     'var(--color-card)',
        'pos-border':   'var(--color-border)',
        'pos-text':     'var(--color-text)',
        'pos-muted':    'var(--color-muted)',
        'pos-blue':     'var(--color-primary)',
        'pos-blue-h':   'var(--color-primary-hover)',
        'pos-green':    'var(--color-success)',
        'pos-green-h':  'var(--color-success-hover)',
        'pos-red':      'var(--color-danger)',
        'pos-red-h':    'var(--color-danger-hover)',
        'pos-yellow':   'var(--color-warning)',
      },
      spacing: {
        'pos-xs':  'var(--space-xs)',
        'pos-sm':  'var(--space-sm)',
        'pos-md':  'var(--space-md)',
        'pos-lg':  'var(--space-lg)',
        'pos-xl':  'var(--space-xl)',
        'pos-2xl': 'var(--space-2xl)',
      },
      borderRadius: {
        'pos-sm':   'var(--radius-sm)',
        'pos-md':   'var(--radius-md)',
        'pos-lg':   'var(--radius-lg)',
        'pos-xl':   'var(--radius-xl)',
        'pos-full': 'var(--radius-full)',
      },
      fontSize: {
        'pos-xs':  'var(--font-size-xs)',
        'pos-sm':  'var(--font-size-sm)',
        'pos-md':  'var(--font-size-md)',
        'pos-lg':  'var(--font-size-lg)',
        'pos-xl':  'var(--font-size-xl)',
        'pos-2xl': 'var(--font-size-2xl)',
      },
      zIndex: {
        'pos-overlay': 'var(--z-overlay)',
        'pos-modal':   'var(--z-modal)',
        'pos-toast':   'var(--z-toast)',
      },
    },
  },
  plugins: [],
};

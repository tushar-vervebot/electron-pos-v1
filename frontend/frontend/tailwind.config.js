/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        pos: {
          bg:       '#0F172A',
          surface:  '#1E293B',
          card:     '#334155',
          border:   '#475569',
          text:     '#F8FAFC',
          muted:    '#94A3B8',
          blue:     '#3B82F6',
          green:    '#10B981',
          red:      '#EF4444',
          yellow:   '#F59E0B',
          purple:   '#8B5CF6'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}

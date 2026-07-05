import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'void-black': '#0c0c0b',
        graphite: '#1f2228',
        charcoal: '#141619',
        smoke: '#474747',
        ash: '#7d8187',
        bone: '#71717a',
        'stellar-white': '#ffffff',
        'signal-blue': '#2563eb',
        'horizon-amber': '#ff6308',
        'alert-red': '#f87171',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'mono-badge': ['12px', { lineHeight: '1.33', letterSpacing: '0.1em' }],
        'mono-label': ['14px', { lineHeight: '1.43', letterSpacing: '0.1em' }],
        body: ['16px', { lineHeight: '1.4', letterSpacing: '-0.025em' }],
        'body-lg': ['20px', { lineHeight: '1.5', letterSpacing: '-0.025em' }],
        heading: ['36px', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        'heading-lg': ['48px', { lineHeight: '1.11', letterSpacing: '-0.025em' }],
        display: ['80px', { lineHeight: '1', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        input: '24px',
      },
      boxShadow: {
        focus: '0 0 0 2px #71717a',
      },
      backgroundImage: {
        horizon: 'linear-gradient(to top, rgba(255,99,8,0.1), rgba(189,201,230,0.1), rgba(151,196,255,0.1))',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [animate],
};

export default config;

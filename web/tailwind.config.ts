import type { Config } from 'tailwindcss';

// ZAPUSK design tokens. All colours are CSS variables (RGB triplets) so the
// same Tailwind class works in both light and dark themes — themes only swap
// values, never component code. See index.css for the variable bindings.
//
// Style language across themes:
//   • dark  — premium fintech cockpit (default, deep ink + warm accent)
//   • light — premium B2B SaaS (Linear / Stripe / Notion feel)
//
// Brand accents (zapusk launch-orange, ai-violet) stay constant — they read
// well on both surfaces and carry product identity.

const channel = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Surfaces
        canvas:   channel('canvas'),
        ink:      channel('ink'),
        surface:  channel('surface'),
        elevated: channel('elevated'),
        line:     channel('line'),
        hairline: channel('hairline'),

        // Text
        primary:   channel('text-primary'),
        secondary: channel('text-secondary'),
        muted:     channel('text-muted'),
        faint:     channel('text-faint'),

        // Brand — ZAPUSK launch
        zapusk: {
          DEFAULT: channel('zapusk'),
          dim:     channel('zapusk-dim'),
          glow:    channel('zapusk-glow'),
          50:      channel('zapusk-50'),
          100:     channel('zapusk-100'),
          400:     channel('zapusk-400'),
          500:     channel('zapusk'),
          600:     channel('zapusk-600'),
          700:     channel('zapusk-700'),
        },

        // AI / generated content — violet
        ai: {
          DEFAULT: channel('ai'),
          dim:     channel('ai-dim'),
          glow:    channel('ai-glow'),
        },

        // Semantic
        success: { DEFAULT: channel('success'), dim: channel('success-dim') },
        warning: { DEFAULT: channel('warning'), dim: channel('warning-dim') },
        danger:  { DEFAULT: channel('danger'),  dim: channel('danger-dim')  },
        info:    { DEFAULT: channel('info'),    dim: channel('info-dim')    },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        soft:      'var(--shadow-soft)',
        card:      'var(--shadow-card)',
        lifted:    'var(--shadow-lifted)',
        glow:      'var(--shadow-glow)',
        'ai-glow': 'var(--shadow-ai-glow)',
      },
      backgroundImage: {
        'grad-zapusk':
          'linear-gradient(135deg, rgb(var(--color-zapusk-glow)) 0%, rgb(var(--color-zapusk)) 50%, rgb(var(--color-zapusk-dim)) 100%)',
        'grad-ai':
          'linear-gradient(135deg, rgb(var(--color-ai-glow)) 0%, rgb(var(--color-ai)) 50%, rgb(var(--color-ai-dim)) 100%)',
        'grad-ink':   'var(--grad-ink)',
        'grid-faint': 'radial-gradient(circle at 1px 1px, var(--grid-dot-color) 1px, transparent 0)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        sidebar: '260px',
      },
      maxWidth: {
        content: '1280px',
        readable: '720px',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;

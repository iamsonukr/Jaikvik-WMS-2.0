/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        brand: {
          DEFAULT: '#25D366',
          dark:    '#128C7E',
          light:   '#dcfce7',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#f9fafb',
          border:  '#e5e7eb',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 10px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 45px -24px rgb(15 23 42 / 0.45)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.15), 0 8px 24px -8px hsl(var(--primary) / 0.35)',
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 12px 32px -16px rgb(15 23 42 / 0.12)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
        'brand-radial': 'radial-gradient(circle at top left, rgb(37 211 102 / 0.15), transparent 60%)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'overlay-show': { from: { opacity: 0 }, to: { opacity: 1 } },
        'content-show': {
          from: { opacity: 0, transform: 'translate(-50%, -46%) scale(0.96)' },
          to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        },
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'overlay-show': 'overlay-show 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'content-show': 'content-show 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.25s ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

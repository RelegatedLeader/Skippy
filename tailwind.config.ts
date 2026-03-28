import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#060d1a',
        surface: {
          DEFAULT: '#0a1a35',
          2: '#0f2759',
          3: '#163070',
        },
        border: '#1e3a6e',
        accent: {
          DEFAULT: '#29c2e6',
          hover: '#1fb0d4',
          muted: 'rgba(41, 194, 230, 0.12)',
          glow: 'rgba(41, 194, 230, 0.3)',
        },
        navy: {
          DEFAULT: '#0a1a35',
          light: '#0f2759',
          bright: '#29c2e6',
        },
        foreground: '#d8e8f8',
        muted: '#4d7099',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cyan': 'linear-gradient(135deg, #29c2e6, #1fb0d4)',
        'gradient-navy-cyan': 'linear-gradient(135deg, #0a1a35, #0f2759)',
        'gradient-skippy': 'linear-gradient(135deg, #29c2e6 0%, #5dd9f5 50%, #29c2e6 100%)',
        'gradient-hero': 'radial-gradient(ellipse at 50% 0%, rgba(41,194,230,0.1) 0%, transparent 60%)',
        'gradient-card': 'linear-gradient(135deg, rgba(15,39,89,0.6), rgba(10,26,53,0.6))',
        'gradient-main': 'linear-gradient(135deg, #0f2759, #0a1a35, rgba(88,28,135,0.4))',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.5s ease forwards',
        'pulse-cyan': 'pulseCyan 3s ease-in-out infinite',
        'pulse-gold': 'pulseCyan 3s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s infinite',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 4s linear infinite',
        'orb': 'orbFloat 8s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'spin-slow': 'spin 8s linear infinite',
        'ring-pulse': 'ringPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseCyan: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(41,194,230,0.15), 0 0 40px rgba(41,194,230,0.06)' },
          '50%': { boxShadow: '0 0 40px rgba(41,194,230,0.45), 0 0 80px rgba(41,194,230,0.2)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to: { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        orbFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -20px) scale(1.05)' },
          '66%': { transform: 'translate(-20px, 15px) scale(0.97)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        ringPulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.08)' },
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 30px rgba(41,194,230,0.3), 0 0 60px rgba(41,194,230,0.12)',
        'glow-cyan-sm': '0 0 15px rgba(41,194,230,0.25)',
        'glow-gold': '0 0 30px rgba(41,194,230,0.3), 0 0 60px rgba(41,194,230,0.12)',
        'glow-gold-sm': '0 0 15px rgba(41,194,230,0.25)',
        'glow-navy': '0 0 30px rgba(15,39,89,0.5)',
        'card': '0 4px 24px rgba(0,0,0,0.6)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.8)',
        'inner-cyan': 'inset 0 0 20px rgba(41,194,230,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config

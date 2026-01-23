import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk dark theme
        background: {
          DEFAULT: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a24',
        },
        // Neon accents
        neon: {
          cyan: '#00f5ff',
          purple: '#bf00ff',
          green: '#39ff14',
          pink: '#ff00ff',
          orange: '#ff6600',
        },
        // Status colors
        status: {
          success: '#39ff14',
          warning: '#ffaa00',
          error: '#ff3366',
          info: '#00f5ff',
        },
        // Glass effect borders
        glass: {
          border: 'rgba(255, 255, 255, 0.1)',
          bg: 'rgba(255, 255, 255, 0.05)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(0, 245, 255, 0.03) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(0, 245, 255, 0.03) 1px, transparent 1px)`,
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glow-cyan': 'radial-gradient(ellipse at center, rgba(0, 245, 255, 0.15) 0%, transparent 70%)',
        'glow-purple': 'radial-gradient(ellipse at center, rgba(191, 0, 255, 0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid': '50px 50px',
      },
      boxShadow: {
        'neon-cyan': '0 0 5px #00f5ff, 0 0 20px rgba(0, 245, 255, 0.3)',
        'neon-purple': '0 0 5px #bf00ff, 0 0 20px rgba(191, 0, 255, 0.3)',
        'neon-green': '0 0 5px #39ff14, 0 0 20px rgba(57, 255, 20, 0.3)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 8s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
}

export default config

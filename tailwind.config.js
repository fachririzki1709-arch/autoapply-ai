module.exports = {
  content: ['./views/**/*.ejs', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        void: '#0A0F14',
        abyssal: '#0F3D3E',
        lagoon: '#2E6F73',
        seafoam: '#7FB3B8',
        sand: '#EADCC8',
        amber: '#C6601F',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
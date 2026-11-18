const MOTION_TOKENS = {
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeOutExpoCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
  springTactile: {
    type: 'spring',
    stiffness: 380,
    damping: 28,
    mass: 0.8,
  },
  springSmooth: {
    type: 'spring',
    stiffness: 260,
    damping: 26,
  },
  staggerDelayMs: 55,
  initialDelayMs: 40,
  durationFast: 0.18,
  durationNormal: 0.35,
  durationChart: 0.85,
};

module.exports = { MOTION_TOKENS };
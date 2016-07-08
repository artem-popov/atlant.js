/**
 * Small polyfill for 'performance'.
 */

let performance = typeof window !== 'undefined' && (window.performance || window.msPerformance || window.webkitPerformance);

if (!performance || !performance.now) {
  performance = Date;
}


export default performance;

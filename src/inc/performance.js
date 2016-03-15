"use strict";

var performance =
  window.performance ||
  window.msPerformance ||
  window.webkitPerformance;

if (!performance || !performance.now) {
  performance = Date;
}


module.exports = performance;

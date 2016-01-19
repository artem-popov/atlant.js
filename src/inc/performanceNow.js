"use strict";

var performance =
  window.performance ||
  window.msPerformance ||
  window.webkitPerformance;

if (!performance || !performance.now) {
  performance = Date;
}

var performanceNow = performance.now.bind(performance);

module.exports = performanceNow;

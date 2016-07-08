import { Console as console, error } from '../utils/log';

// https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {

  if ('undefined' === typeof window) return;
  if (typeof window.CustomEvent === 'function') return;

  function CustomEvent(event, params) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return evt;
  }

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();

/**
 * Create fake push state
 * Use like that:
 * require('fakePushState')(window);
 * It will patch window.history to rise "pushstate" event when pushstate is happend.
 **/
var wrapHistoryApi = function (window) {
  var pushState = window.history.pushState;
  var replaceState = window.history.replaceState;

  var tryState = function (params) {
    try {
      return pushState.apply(window.history, params);
    } catch (e) {
      error::console.error("Can't push state:", e.message, e.stack);
      if (params[2]) {
        window.location.assign(params[2]); // Fallback to location Api
      } else {
        window.location.replace(window.location.toString());  // Fallback to location Api
      }
      return void 0;
    }
  };

  window.history.pushState = function (state, title, url) {
    var eventless = state && state.eventless;
    if (!eventless) {
      var onpushstate = new CustomEvent('pushstate', { detail: { state: { url: url, referrer: window.location.pathname, scrollTop: state.scrollTop, forceRouteChange: state.forceRouteChange }, title: title, url: url } });
      window.dispatchEvent(onpushstate);
    }

    return tryState(arguments);
  };
  window.history.pushState.overloaded = true;

  window.history.replaceState = function (...params) {
    try {
      return replaceState.apply(window.history, params);
    } catch (e) {
      error::console.error('Can\'t replace state:', e.message, e.stack, 'Fallback to location Api');
      if (params[2]) {
        window.location.replace(params[2]);  // Fallback to location Api
      }
      else {
        window.location.replace(window.location.toString());  // Fallback to location Api
      }
      return void 0;
    }
  };
  window.history.replaceState.overloaded = true;


};

module.exports = { wrapHistoryApi: wrapHistoryApi };

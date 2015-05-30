"use strict";
//https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   };

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();

/**
 * Create fake push state
 * Use like that:
 * require('fakePushState')(window);
 * It will patch window.history to rise "pushstate" event when pushstate is happend.
 **/
var wrapPushState = function(window){
    var pushState = window.history.pushState;

    var tryState = function(params) {
        try { 
           return pushState.apply(window.history, params); 
        } catch (e) {
           console.error('Can\'t push state:', e);
           return void 0;
        }
    };

    window.history.pushState = function(state, title, url) {
        var eventless = state && state.eventless;
        if ( !eventless ) {
            var onpushstate = new CustomEvent('pushstate', { detail: { state: {referrer: window.location.pathname, scrollTop: document.querySelector('body').scrollTop, forceRouteChange: state.forceRouteChange}, title: title, url: url } } );
            window.dispatchEvent(onpushstate);
        }

        return tryState(arguments);
    };

};

var wrapPopState = function(window){
    var popState = window.history.popState;

    var tryState = function(params) {
        try { 
           return popState.apply(window.history, params); 
        } catch (e) {
           console.error('Can\'t push state:', e);
           return void 0;
        }
    };

    window.history.popState = function(state, title, url) {
        var onpopstate = new CustomEvent('popstate', { detail: { state: {referrer: window.location.pathname, scrollTop: document.querySelector('body').scrollTop, forceRouteChange: state.forceRouteChange}, title: title, url: url } } );
        window.dispatchEvent(onpopstate);

        return tryState(arguments);
    };

};


module.exports = { wrapPushState: wrapPushState, wrapPopState: wrapPopState };

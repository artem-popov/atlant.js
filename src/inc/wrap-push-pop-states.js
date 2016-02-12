"use strict";

//https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {

    if( 'undefined' === typeof window ) return;
    if ( typeof window.CustomEvent === "function" ) return;

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
           console.error("Can't push state:", e);
           return void 0;
        }
    }

    window.history.pushState = function(state, title, url) {
        var eventless = state && state.eventless;
        if ( !eventless ) {
            var onpushstate = new CustomEvent('pushstate', { detail: { state: {url: url, referrer: window.location.pathname, scrollTop: state.scrollTop, forceRouteChange: state.forceRouteChange}, title: title, url: url} } );
            window.dispatchEvent(onpushstate);
        }

        return tryState(arguments);
    };

};

module.exports = { wrapPushState: wrapPushState };

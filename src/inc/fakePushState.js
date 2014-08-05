
/**
 * Create fake push state
 * Use like that:
 * require('fakePushState')(window);
 * It will patch window.history to rise "pushstate" event when pushstate is happend.
 **/
var fakePushState = function(window){
    var pushState = window.history.pushState;
    window.history.pushState = function(state, title, url) {
        var onpushstate = new CustomEvent('pushstate', { detail: { state: state, title: title, url: url } } );
        window.dispatchEvent(onpushstate);
        var state;
        try { 
           state = pushState.apply(window.history, arguments); 
        } catch (e) {
           console.log('Can\'t push state:', e);
        }
        return state; 
    };
};


module.exports = fakePushState;

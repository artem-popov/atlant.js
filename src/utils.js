"use strict";

var s = require('./lib');
var _ = require('lodash')

var utils = function() {
    return {
        /**
         * @returns interpolation of the redirect path with the parametrs
         */
        interpolate: function(template, params) {
            var result = [];
            template.split(':').map( function(segment, i) {
                if (i == 0) {
                    result.push(segment);
                } else {
                    var segmentMatch = segment.match(/(\w+)(.*)/);
                    var key = segmentMatch[1];
                    result.push(params[key]);
                    result.push(segmentMatch[2] || '');
                    delete params[key];
                }
            });
            return result.join('');
        }
        ,getPossiblePath: function (route) {
            return (route[route.length-1] == '/')
                ? route.substr(0, route.length-1)
                : route +'/';
        }
        ,parseURL: s.memoize( function(url) {
            if (!url) return void 0;

            var q = url.indexOf('?');
            var and = url.indexOf('&');

            if (-1 === q) q = Infinity;
            if (-1 === and) and = Infinity;
            q = (q > and) ? and : q;

            return { 
                pathname: url.substring(0, q).trim()
                ,search: url.substring(q+1).trim() 
            }
        })
        /**
         *  URL query parser for old links to post and story
         * */
        ,parseSearch: s.memoize( function(search){
            return search
                        .replace('?', '&')
                        .split('&')
                        .reduce( function(obj, pair) { 
                            pair = pair.split('=');
                            if (pair[0]) obj[pair[0]] = pair[1]; 
                            return obj; 
                        }, {});
        })
        ,getLocation: function() {
            return window.location.pathname + window.location.search;
        }
        ,rebuildURL: function(path) {
            path = this.parseURL( path ); 
            if(path) { 
                path = path.pathname + ( path.search ? '?' + path.search : ''); 
                if( '/' === path[path.length - 1] && 1 !== path.length ) path = path.slice(0, path.length - 1);
            }

            return path
        }
        ,parseURLDeprecated: function(url) {
            var urlParseRE = /^(((([^:\/#\?]+:)?(?:(\/\/)((?:(([^:@\/#\?]+)(?:\:([^:@\/#\?]+))?)@)?(([^:\/#\?\]\[]+|\[[^\/\]@#?]+\])(?:\:([0-9]+))?))?)?)?((\/?(?:[^\/\?#]+\/+)*)([^\?#]*)))?(\?[^#]+)?)(#.*)?/;
            var matches = urlParseRE.exec(url);
            return {
                protocol: matches[4] ? matches[4].slice(0, matches[4].length-1) : ''
                ,host: matches[10] || ''
                ,hostname: matches[11] || ''
                ,port: matches[12] || ''
                ,pathname: matches[13] || ''
                ,search: matches[16] || '' 
                ,hashes: matches[17] || ''
            };
        }
        ,getReferrer: function(){
            if( 'undefined' !== typeof window) {
                if (!window.document.referrer) return void 0;
                else return "/" + window.document.referrer.split('/').slice(3).join('/');
            }
            return void 0;
        }
       
    };
}();

utils.isIE = function()
{
    var isIE11 = navigator.userAgent.indexOf(".NET") > -1;      
    var isIELess11 = navigator.appVersion.indexOf("MSIE") > -1;
    var isMobileIE = navigator.userAgent.indexOf('IEMobile') > -1
    return isIE11 || isIELess11 || isMobileIE;
     
}

/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.goTo = function(awaitLoad, url, awaitLoadForce, redirectForce) { // @TODO scrollTop should be not 0, but from preferences

    if ('undefined' === typeof window) return;
    if ( !redirectForce && (window.location.origin + url) === window.location.href )  return;

    if ('undefined' !== typeof awaitLoadForce) awaitLoad = awaitLoadForce;

    if(!awaitLoad) {
        if (utils.isIE()) {
          window.document.execCommand('Stop');
        } else {
          window.stop();
        }
    }

    var state = { url: url, scrollTop: 0, referrer: window.location.href, forceRouteChange: redirectForce };

    if (!('scrollRestoration' in history)) { 
        console.log('setting progress');
        utils.body.style.position = 'fixed'; // freezing view;
        utils.body.style.width = '100%'; // freezing view;
        utils.body.style.marginTop = - window.scrollY;
    }

    history.pushState(state, null, url)

    
}


utils.newPage = true;

utils.saveType = function(field){
    window.history.replaceState({[field]: true, ...window.history.state}, null);
}

utils.clearState = function(){
    var state = { ...window.history.state };
    delete state.scrollTop;
    delete state.forceRouteChange;
    delete state.referrer;
    delete state.url;
    window.history.replaceState(state, null);
}

utils.saveScroll = _.debounce(function(event){
    console.log('event:', event)
    var state = { ...history.state, scrollTop: window.pageYOffset};

    window.history.replaceState(state, null);
}, 50)

utils.body = document.querySelector('body');
utils.html = document.documentElement;

utils.getPageHeight = function height(_) {
    return Math.max(utils.body.scrollHeight, utils.body.offsetHeight, utils.html.clientHeight, utils.html.scrollHeight, utils.html.offsetHeight);
}


/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.replace = function(url) {

    if ('undefined' === typeof window) return;
    if ( (window.location.origin + url) === window.location.href)  return;

    setTimeout( history.replaceState.bind(history, null, null, url), 0);
}

/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.change = function(url) {

    if ('undefined' === typeof window) return;
    if ( (window.location.origin + url) === window.location.href) return;

    setTimeout( history.pushState.bind(history, { eventless: true }, null, url), 0);

}

utils.getPattern = function(masks) {
    return s.head(masks.filter(function(mask){ return '*' !== mask}));
}

utils.attachGuardToLinks = function() {
    
    var linkDefender = function(event){
        if (event.ctrlKey || event.metaKey || 2 == event.which || 3 == event.which ) return;
        var element = event.target;
        var awaitLoad = void 0;

        while ( 'a' !== element.nodeName.toLowerCase() ){
            if (element === document || ! (element = element.parentNode) ) return; 
        }

        var loc = element.getAttribute('href'); 
        if ( !loc ) return;

        if ( event instanceof KeyboardEvent && 13 !== event.keyCode) return;

        if(element.getAttribute('target')) return;

        var linkProps = element.getAttribute('data-atlant');
        if (linkProps && 'ignore' === linkProps) return;
        if (linkProps && 'await' === linkProps) awaitLoad = true;

        if ( (window.location.origin + loc ) === window.location.href) {
            event.preventDefault();
            return;
        } 

        // In case of it is the same link with hash - do not involve the atlant, just scroll to id. 
        // @TODO? don't prevent default and understand that route not changed at routeChanged state?
        if ( '#' === loc[0] || ( -1 !== loc.indexOf('#') && element.baseURI === location.origin + location.pathname )) {

            var elem;
            var begin = loc.indexOf('#');  
            var id = loc.slice( -1 === begin ? 1 : begin + 1, loc.length );
            if( '' !== id) elem = document.getElementById(id)
            if(elem) elem.scrollIntoView();

            event.preventDefault();
            return false;
        }

        if ( loc && element.host === location.host ) {
            event.preventDefault();
            event.stopPropagation();
            utils.goTo( loc, awaitLoad);
        }
    }
    document.addEventListener('click', linkDefender );
    document.addEventListener('keydown', linkDefender );
}


/**
 * Pure Matching function
 * @param on - current locatin url
 * @param when - compare mask
 * @returns (*)
 */
utils.matchRoute = s.memoize( function(path, mask){ //@TODO add real match, now works only for routes without params
    // TODO(i): this code is convoluted and inefficient, we should construct the route matching
    //   regex only once and then reuse it
    var negate = '!' === mask[0];
    if (negate) {
        mask = mask.slice(1, mask.length-1);
    }

    var parsed = utils.parseURL( path );
    path = parsed.pathname;
    path = decodeURIComponent(path);
    path = utils.stripLastSlash(path).replace(/\/\/+/g, '/'); // remove slash on end on string and replace multiple slashes with one

    // Successefully find *
    if ( '*' === mask[0] ) return {};

    // Escape regexp special characters.
    var when = '^' + mask.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + '$';
    var regex = '',
        params = [],
        dst = {};

    var re = /:(\w+)/g,
        paramMatch,
        lastMatchedIndex = 0;

    while ((paramMatch = re.exec(when)) !== null) {
        // Find each :param in `when` and replace it with a capturing group.
        // Append all other sections of when unchanged.
        regex += when.slice(lastMatchedIndex, paramMatch.index);
        regex += '([^\\/]*)';
        params.push(paramMatch[1]);
        lastMatchedIndex = re.lastIndex;
    }
    // Append trailing path part.
    regex += when.substr(lastMatchedIndex);

    var isMatched = false;
    var match = path.match(new RegExp(regex));
    if (match) {
        isMatched = true;
        params.map(function(name, index) {
            dst[name] = match[index + 1];
        });
        var searches = _.clone( utils.parseSearch(parsed.search), true); // add search params
        dst = _.extend(searches, dst);
    } else if( negate ) {
        dst = {}
        isMatched = true;
    }

    return isMatched ? dst  : null;
});

// Utility function
// Adding slashes at the end, i.e. ['/story'] became [['/story/', '/story']]
// addSlashes :: [mask] -> [mask]
utils.addSlashes = function(masks){
    return masks
        .map(function(i){ 
            return [i, ('/' !== i[i.length-1]) ? i + '/' : i.slice(0, i.length-1)];  
        })
        .reduce(function(v, i) { return v.concat(i); }, [])
}

utils.stripLastSlash = function(_){ if( 1 !== _.length && '/' === _[_.length-1] ) return _.substring(0, _.length - 1 ); else return _ }

utils.sanitizeUrl = function(url){
    if (!url || '' === url) throw new Error('Atlant.js: url cannot be empty')
        var escapedRoute = url
    .toLowerCase()
    .replace(/\/+$/, "");  // replacing last /
    if ('' === escapedRoute) escapedRoute = '/';
    return escapedRoute;
}


module.exports = utils;

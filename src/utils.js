var utils = function() {
    return {
        /**
         * Redirect to the other path using $location
         * @param upstream
         * @returns {*}
         */
        goTo: function(url) {
            history.pushState(null, null, url);
        }
        /**
         * @returns interpolation of the redirect path with the parametrs
         */
        ,interpolate: function(template, params) {
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
        /**
         *  URL query parser for old links to post and story
         * */
        ,parseURLQuery: function(url){
            var query = location.search.substring(1);
            var params = query.split('&');
            var result = {};
            for(var i = 0; i < params.length; i++){
                var item = params[i].split('=');
                result[item[0]] = item[1];
            }
            return result;
        }
        ,getLocation: function() {
            return window.location.pathname;
        }
        ,parseUrl: function(url) {
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
    };
}();

utils.attachGuardToLinks = function() {
    
    var linkDefender = function(event){
        if (event.ctrlKey || event.metaKey || 2 == event.which || 3 == event.which ) return;
        var element = event.target;

        while ( 'a' !== element.nodeName.toLowerCase() ){
            if (element === document || ! (element = element.parentNode) ) return; 
        }

        var loc = element.getAttribute('href'); 
        if ( !loc ) return;
        // In case of it is the same link with hash - do not involve the atlant, just scroll to id. 
        // @TODO? don't prevent default and understand that route not changed at routeChanged state?
        if ( '#' === loc[0] || ( -1 !== loc.indexOf('#') && element.baseURI === location.origin + location.pathname )) {
            var begin = loc.indexOf('#');  
            document.getElementById( loc.slice( -1 === begin ? 1 : begin + 1, loc.length )).scrollIntoView();
            event.preventDefault();
            return false;
        }

        if ( loc && element.host === location.host ) {
            event.preventDefault();
            utils.goTo( loc );
        }
    }
    document.addEventListener('click', linkDefender );
    document.addEventListener('keydown', linkDefender );
}

module.exports = utils;

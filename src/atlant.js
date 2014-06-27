/**

 *
 * @TODO: fast switching generate console.error.
 */

var s = require('./atlant-utils')
    ,simpleRender = require('./atlant-render')
    ,reactRender = require('./atlant-react')
//    ,State = require('./state.js')

var atlant = (function(){
    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,streams = {} // Streams collected
        ,renderNames = []
        ,viewNames = [];


    var prefs = {
            parentOf: {}
            ,view: ''
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,render: { render: simpleRender.render, clear: simpleRender.clear }
    }

//    var log = s.nop;
    var log = console.log.bind(console, '--');

    var state
        ,states
        ,oldStates = [];

    //Action should be performed at route change.
    var onRouteChange = function() {
        scopeAttached = {};
        lastScopes = {};
    }

    var StateType = function(state) {
        _.extend( this, {lastWhen: void 0, lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastWhenName: void 0, lastInjects: void 0} );
        _.merge( this, state );
    };
    var State = function(){
        return {
            first: function(){
                states = [];
                state = new StateType();
                states.push(state);
            },
            divide: function() {
                state = new StateType(state);
                state.lastDep = void 0;

                states.push(state);
            },
            rollback: function() {
                var oldState = states.pop();
                oldStates.push(oldState);
                state = states[states.length-1];
            },
            print: function(message, state) {
                //log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
            }
        }
    }();

    // Streams specific vars
    var viewRendered = {}  // Flag that this view is rendered. Stops other streams to perform render then.
        ,dependViews = {}  // Set the views hirearchy. Both for streams and for render.
        ,defaultRoutes = {}
        ,isLastWasMatched = false // Allow lastWhen to stop other when's execution/
        ,renders = {}  // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
 		,lastRedirect
        ,viewReady = {}

    // Render specific vars
    var lastScopes = {}   // Each viewName has it's own scope - used on render.
        ,dataByView = {}  // This data will be injected into scope when render occurs.
        ,scopeAttached = {}; // Registering view templateUrl to know that this url was rendered in that view. Stops rendering this URL in this view then.


    // Matching enum for when.
    var Matching = {
        stop: _.uniqueId(),
        continue: _.uniqueId()
    }

    // Depends enum
    var Depends = {
        parallel: _.uniqueId(),
        continue: _.uniqueId()
    }

    // Save/restore state of the stream.
    var Upstream = function() {
        var data = {};
        return {
            // join :: containerName -> propertyName -> upstream
            join: s.curry( function(containerName, propertyName, upstream) {

                if ( containerName && propertyName ) {
                    if ( ! data[containerName] ) data[containerName] = {};
                    if ( ! data[containerName][propertyName] ) data[containerName][propertyName] = {};

                    data[containerName][propertyName] = upstream;
                }

                if ( ! containerName && ! propertyName ){
                    s.merge(data, upstream);
                }

                if ( containerName && ! propertyName ){
                    if ( ! data[containerName] ) data[containerName] = {};
                    s.merge(data[containerName], upstream);
                }

                if (containerName,propertyName && data[containerName][propertyName] && upstream !== data[containerName][propertyName]) {
                    var e = new Error('E001: Upstream join equality test failed! ');
                    console.error(e.stack)
                    throw e;
                }

                upstream = data;
                data = {};
                return upstream;
            })
            // fmap :: fn -> obj
            ,fmap: s.curry(function(fn, obj) {
                data = fn.call(this, data, obj);
                return data;
            })
            ,clear: function(upstream){
                data = {};
                return upstream;
            }
        }
    };

    var utils = function() {
        return {
            /**
             * Redirect to the other path using $location
             * @param upstream
             * @returns {*}
             */
            goTo: function(url) {
                history.pushState(null, null, url);
            },
            redirectTo: function(url, params) {
                history.pushState(null, null, '/story/');
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
            ,parseURLQuery: function(){
                var query = location.search.substring(1);
                var params = query.split('&');
                var result = {};
                for(var i = 0; i < params.length; i++){
                    var item = params[i].split('=');
                    result[item[0]] = item[1];
                }
                return result;
            }

            /**
             * Main function for parse new path
             * @param path
             * @returns {bool} false | {*}
             */
            ,matchRoutes: function(path, routes, matchingBehaviour){
                matchingBehaviour = matchingBehaviour || Matching.continue;
                var routes =  routes
                    .map(function(route) {
                        return matchRouteLast( path, matchingBehaviour, route );
                    })
                    .filter(s.notEmpty)

                return s.head(routes);
            }
            ,getLocation: function() {
                return window.location.pathname;
            }
            ,parseUrl: function(url) {
                var urlParseRE = /^(((([^:\/#\?]+:)?(?:(\/\/)((?:(([^:@\/#\?]+)(?:\:([^:@\/#\?]+))?)@)?(([^:\/#\?\]\[]+|\[[^\/\]@#?]+\])(?:\:([0-9]+))?))?)?)?((\/?(?:[^\/\?#]+\/+)*)([^\?#]*)))?(\?[^#]+)?)(#.*)?/;
                var matches = urlParseRE.exec(url);
                return {
                    protocol: matches[4] ? matches[4].slice(0, matches[4].length-1) : undefined
                    ,host: matches[10]
                    ,hostname: matches[11]
                    ,port: matches[12]
                    ,pathname: matches[13]
                    ,search: matches[16] 
                    ,hashes: matches[17]
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
            var location = element.getAttribute('href'); 
            console.log('location',location);
            if ( location ) {
                event.preventDefault();
                utils.goTo( location );
            }
        }
        document.addEventListener('click', linkDefender );
        document.addEventListener('keydown', linkDefender );
    }


    var clientFuncs = function() {

        var convertPromiseD = s.curry(function(promiseProvider, upstream) {
            var promise = promiseProvider( upstream );
            if ( void 0 === promise || void 0 === promise.then )
                return Bacon.Error('Depend should provide promise,');
            else    
                return Bacon.fromPromise( promise );
        });

        var safeD = function(fn){
            return function() {
                try {
                    return fn.apply(this, arguments);
                } catch(e) {
                    console.error('"User function wasn\'t successefull: ', e.message, e.stack);
                    return Bacon.Error('Exception');;
                }
            }
        };

        // Provides last depend data as param for .if command
        var injectParamsD = s.curry(function(lastDepName, fn) {
            return function(upstream) {
                var args = [{ params:upstream.params, mask:upstream.route.mask }];

                if (lastDepName && upstream.depends && upstream.depends[lastDepName]) {
                    args.push( upstream.depends[lastDepName] );
                }

                args.push( upstream );
                return fn.apply(this, args);
            }
        });


        var simpleType = function(data, key) {
            return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
        }
        
        /**
         * Injects depend values from upstream into object which is supplyed first.
         */
        var injectDependsIntoScope = function ( scope, upstream ) {
            var viewName =  upstream.render.viewId;

            var injects = s.compose( s.reduce(s.extend, {}), s.dot('injects') )(upstream);
            var error = function(inject) { throw Error('Wrong inject accessor.' + inject) }
            var data = s.map( s.compose( /*s.if(s.empty, error),*/  s.flipDot(upstream) ), injects );

            var saveData4Childs = s.set(viewName, dataByView)(data);
            s.extend( data, dataByView[prefs.parentOf[viewName]])

            s.extend( scope, data );
            Object.keys(data).filter(simpleType.bind(this, data)).map(function(key){
                Object.defineProperty(scope, key, {
                    get: function () {
                        return s.flipDot( upstream, injects[key] );
                    }
                });
            });
        };

        var injectInfoIntoScope = function(scope, upstream) {
            scope.__info = { 
                params: upstream.params
                ,route: {
                    mask: upstream.route.mask    
                    ,path: upstream.path
                }
            }
        }

        return { 
            convertPromiseD: convertPromiseD
            ,safeD: safeD
            ,injectParamsD: injectParamsD
            ,injectDependsIntoScope: injectDependsIntoScope
            ,injectInfoIntoScope: injectInfoIntoScope
       };
    }();


    var add = function(name, value) {
        if (exports.streams[name]) throw new Error('This stream is already defined!:', name);
        state.lastName = name;
        streams[name] = { name:name, stream: value }
    }


    /* Exports */
    var exports = {
        streams:streams
        ,info:[]
        ,routes:{}
    }

    /* Helpers */
    


    var assignRenders = function(){
        var renderStopper = function(upstream) {
            if ( viewRendered[upstream.render.viewName] || isRedirected ) return false;
            else viewRendered[upstream.render.viewName] = true;
            return true;
        };

        var animate = {
            before: function( clone, targetElement) {
                return new Promise( function( resolve, reject ) {
                    console.log('animating', clone, targetElement);
   /*                 
                    console.log( 'props:', prev.offsetTop, prev.offsetLeft );
                    cloned.style.position = 'absolute';
                    cloned.style.top = 10;
                    cloned.style.left = 10;
                    cloned.classList.add("disappearedClass");
    
                    prev.innerHtml = ''; // innerHtml is the fastest, prove: http://jsperf.com/innerhtml-vs-removechild/167
                    prev.appendChild(newly);
                    prev.classList.add("appearedClass");
                    resolve();
                    */
                })
            }
            /* If after returns the Promise, then the signal to render childView will be chined to that promise. */
            ,after: function( clone, targetElement) {
                return new Promise( function( resolve, reject) {
                    clone.parentNode.removeChild(clone);
                    resolve();
                })
            }
        };

        var finishSignal = function() {
            if (viewReady[viewName]) {
                viewReady[viewName].push(upstream);
            }
        };

        // Registering render for view.
        var assignRender = function(stream) {
            stream
                .filter( renderStopper )
                .onValue( function(upstream){
                    try{ 
                        var scope = {}; // @TODO use cached scope
                        clientFuncs.injectDependsIntoScope(scope, upstream);
                        clientFuncs.injectInfoIntoScope(scope, upstream);
                        var viewProvider = s.dot('.render.renderProvider', upstream); 
                        var viewName = s.dot('.render.viewName', upstream);

                        var targetElement = document.querySelector( '#' + viewName );

                        if ( !animate ) {
                            var rendered = prefs.render.render(viewProvider, targetElement, scope);
                            if ( ! ( rendered instanceof Promise ) ) throw new Error('Atlant: render should return Promise.'); 
                            rendered.then( finishSignal );
                        } else {
                            var cloned = targetElement.cloneNode(true);
                            animate.before(cloned, targetElement);

                            var rendered = prefs.render.render(viewProvider, targetElement, scope);
                            if ( ! ( rendered instanceof Promise ) ) throw new Error('Atlant: render should return Promise.'); 

                            var animated;
                            rendered.then( function() {
                                animated = animate.after( cloned, targetElement );
                            });

                            if ( animated instanceof Promise ) {
                                animated.then( finishSignal );
                            } else {
                                rendered.then( finishSignal );
                            }
                        } 
                    } catch (e) { 
                        console.error(e);
                    }
                });                
        };

        var assignLastRedirect = function() {
            if (!lastRedirect) return;
            lastRedirect.onValue(function(upstream){
                log('Redirecting!', utils.interpolate(upstream.redirectUrl, upstream.params));
                isRedirected = true;
                utils.redirectTo(upstream.redirectUrl, upstream.params);
            });
        };

        var yC = function(x,y) {
            return x.id === y.id ? y : false;
        };

        var getOrderedStreams = function(name, stream) {
            if (! prefs.parentOf[name] ) return stream;

            log('View dependentions:', name, JSON.stringify(stream), 'are depends on', prefs.parentOf[name], JSON.stringify(renders[prefs.parentOf[name]]));
            var parentStream = viewReady[prefs.parentOf[name]];
            stream = Bacon.combineWith(yC, parentStream, stream).changes().filter(function(x){return x});

            return stream;
        };

        return function() {
            if ( isRenderApplyed ) return;

            isRenderApplyed = true
            for(var viewName in renders) {
                var orderedStreams = s.map(getOrderedStreams.bind(this, viewName), renders[viewName]);
                s.map(assignRender, orderedStreams);
            }

            for(var viewName in defaultRoutes) {
                assignRender(defaultRoutes[viewName]);
            }

            assignLastRedirect();
        };
    }();

	/* matchRouteLast */
    var matchRouteLast = function(){
        var matchRouteWrapper = function(path, route){
            var match = matchRoute(path, route.mask);

            return match ? { params:match, route:route } : null;
        }

        /**
         * Pure Matching function
         * @param on - current locatin url
         * @param when - compare mask
         * @returns (*)
         */
        var matchRoute = s.memoize( function(path, mask){ //@TODO add real match, now works only for routes without params
            // TODO(i): this code is convoluted and inefficient, we should construct the route matching
            //   regex only once and then reuse it
            var negate = '!' === mask[0];
            if (negate) {
                mask = mask.slice(1, mask.length-1);
            }

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
            
            var match = path.match(new RegExp(regex));
            if (match) {
                params.map(function(name, index) {
                    dst[name] = match[index + 1];
                });

                dst = _.extend(utils.parseURLQuery(), dst);
            } else if( negate ) {
                dst = {}
                match = true;
            }

            return match ? dst  : null;
        });

        return s.curry( function(path, matchingBehaviour, route) {
            if ('string' === typeof route) route = {mask:route};
            var match = matchRouteWrapper(path, route);
            if (match && Matching.stop === matchingBehaviour) {
                isLastWasMatched = true;
            }
            return match;
        });
    }();


    /**
     * When
     */
    var when = function(){
        var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
        var maskValidation = function(mask) {
            if ('string' != typeof mask) throw new Error('Route mask should be string.');
            if ('' == mask) throw new Error('Route mask should not be empty.');
            return mask;
        }
        var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName), s.map(maskValidation));

        return function(masks, matchingBehaviour) {
            if ( 0 === masks.length ) throw new Error('At least one route mask should be specified.');
            State.first();

            var name = createNameFromMasks(masks);

            var ups = Upstream();

            masks.forEach(function(mask) {
                s.push({mask: mask}, routes);
                s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
            });

            state.lastWhen = rootStream
                .map(ups.fmap(_.extend))
                .map( function(upstream) {
                    return masks
                        .filter(function() { return ! isLastWasMatched; }) // do not let stream go further if other is already matched.
                        .map( matchRouteLast( upstream.path, matchingBehaviour ) )
                        .filter( s.notEmpty )                              // empty params means fails of route identity.
                } )
                .map(s.head)
                .filter( s.notEmpty )
                .map(ups.join(void 0, void 0))

            state.lastWhen
                .onValue( function(upstream) {
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        log('----------------Redirect:',upstream);
                        utils.redirectTo(upstream.redirectTo, upstream.params);
                    }
                });


            state.lastWhen
                .onValue(function(upstream) {
                    log('Matched route!', upstream);
                    exports.info = upstream;
                    // Temporary turned off the exporing of params     
                    //$.extend( $atlantParams, upstream.params );
                });

            state.lastIf = void 0;
            state.lastDep = void 0;
            state.lastDepName = void 0;
            state.lastWhenName = name;
            state.lastOp = state.lastWhen;

            State.print('___When:'+JSON.stringify(masks), state);

            add(state.lastWhenName, state.lastWhen)

            return this;
        };
    }();

    /* depends */
    var depends = function() {

        var createDepStream = function(stream, depName, dep, injects) {

            var ups = Upstream();

            return stream
                .map( ups.fmap(_.extend) )
                .flatMap( s.compose( clientFuncs.convertPromiseD, clientFuncs.safeD, clientFuncs.injectParamsD(state.lastDepName))( dep) )
                .mapError(s.id)
                .map( ups.join('depends', depName) )
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.

                    if (!upstream.injects) upstream.injects = [];
                    upstream.injects.push(injects);

                    return upstream;
                });
        }

        /**
         * Join 2 streams into 1
         * @type {*|Function}
         */
        var zippersJoin = s.curry( function(prevDepName, currDepName, x, y) {
            x.depends = s.extend( x.depends, y.depends );
            x.injects = x.injects.concat(y.injects);
            return x;
        });

//        var cachedPromise = s.curry( function(cacheName, cacheKey, dependency, upstream) {
//            return dependency(upstream).then(function (response) {
//                return response;
//            });
//        });

        //var cachedDep = cacheKey ? cachedPromise(cacheName, cacheKey, dependency) : dependency;

        return function(dependency, dependsBehaviour ) {
            if ( ! state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (state.lastDepName ? state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = state.lastOp;
            if (dependsBehaviour === Depends.parallel) {
                lastOp = state.lastIf || state.lastWhen;
            }

            state.lastInjects = {}; // Here we will store further injects with ".inject"

            var thisDep = createDepStream(lastOp, depName, dependency, state.lastInjects )

            if( dependsBehaviour === Depends.parallel && state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = state.lastDep.zip( thisDep, zippersJoin( state.lastDepName, depName ) );
            }

            state.lastDep = thisDep;
            state.lastDepName = depName;
            state.lastOp = state.lastDep;

            add( depName, thisDep );

            State.print(depName, state);
            return this;
        };
    }();

    /* Base and helper streams*/
    log('registering base streams...');
    // Browser specific actions.
    if (window) {
        require( './inc/fakePushState.js')(window);

        // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
        // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
        document.addEventListener("DOMContentLoaded", onRouteChange);
        window.addEventListener("popstate", onRouteChange);
    }


    
    var publishStream = new Bacon.Bus();  // Here we can put init things.
    publishStream.onValue(utils.attachGuardToLinks);



    var routeChangedStream = Bacon
        .fromBinder(function(sink) {
            // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
            var routeChanged = function(event, url) { 
                event.preventDefault();
                var path = ( event.detail ) ?  utils.parseUrl( event.detail.url ).pathname :  utils.getLocation();
                sink( { path: path } ); 
                console.log('route is changed', event.detail.url);
                sink( { path: event.detail.url } ); 
            };
            window.addEventListener( 'popstate', routeChanged );
            window.addEventListener( 'pushstate', routeChanged );
        })
        .merge(publishStream)        
        .map(function(upstream){
            return upstream ? upstream : { path: utils.getLocation() };
        })
        .map(function(upstream) { // Nil values.
            isLastWasMatched = false;
            isRedirected = false;
            viewRendered = [];
            scopeAttached = [];
            dataByView = {};
            return upstream;
        })
        .filter( s.compose( s.empty, s.flip(utils.matchRoutes, 3)(Matching.continue, prefs.skipRoutes), s.dot('path') )) // If route marked as 'skip', then we should not treat it at all.

    var rootStream = Bacon.fromBinder(function(sink) {
            routeChangedStream.onValue(function(upstream) {
                assignRenders();
                sink(upstream);
            });
        }).map(function(upstream){upstream.id = _.uniqueId(); return upstream;})

    var otherWiseRootStream = rootStream
        .filter( s.compose( s.empty, s.flip(utils.matchRoutes)(Matching.stop, routes) ) )
        .map( s.logIt('Otherwise is in work.') );

 
    /* Base */

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _lastWhen = function() {
        return when.bind(this)(s.a2a( arguments ), Matching.stop);
    }

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _when = function() {
        return when.bind(this)(s.a2a( arguments ), Matching.continue);
    }

    /**
     * Inject dependency in last route stream. Only one dependency allowed at once.
     * @name name - name of dependency. Should be unique, will be injected into controller.
     * @param dependency - promise (for first version).
     * @returns {*}
     */
    var _depends = function( dependency ) {
        return depends.bind(this)( dependency, Depends.parallel);
    }

    /**
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     */
    var _and = function( dependency ) {
        return depends.bind(this)( dependency, Depends.continue);
    }

    var _inject = function( key, expression ) {
        if ( ! state.lastInjects ) throw new Error('.inject should follow .depends');
        state.lastInjects[key] = '.depends.' + state.lastDepName + (expression ? expression : '' );
        return this;
    }
    /**
     * Turn the mode when "depends" will chain flatmap to the "dependencyStream" and not to the "when"/route stream.
     * @param dependencyStream
     * @returns {attachTo}
     */
//    var switchTo = function(dependencyStream) {
//
//        state.lastDep = streams[dependencyStream];
//        state.lastIf = void 0;
//
//        return this;
//    }



    /**
    	if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function(fn, name) {

        if ( ! state.lastOp ) { throw new Error('"if" should nest something.'); }

        State.divide();

        state.lastIf = state.lastOp.filter( clientFuncs.safeD( clientFuncs.injectParamsD( state.lastDepName ) ) (fn) );
        state.lastOp = state.lastIf;

        var name = name ? name : _.uniqueId();
        add( name, state.lastIf );

        State.print('_if__After:', state);

        return this;
    }


    /**
     * render Function	
     * Customize the stream which created by "when" route.
     * Applyed to any stream and will force render of "template" with "controller" into "view"
     * @param controller
     * @param templateUrl
     * @param viewName - directive name which will be used to inject template
     * @returns {*}
     */
    var _render = function(renderProvider, viewName){

            if ( ! state.lastOp ) throw new Error('"render" should nest something');
            
            type(renderProvider, 'function');
            type(viewName, 'string');

            viewName = viewName || prefs.view;

            if ( !viewName ) throw new Error('Default render name is not provided.');
        
            var ups = Upstream();

            var thisRender = state.lastOp
                .map(ups.fmap(_.extend))
                .map(function() { return { renderProvider: renderProvider, viewName:viewName }; })
                .map(ups.join('render', void 0));

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if( ! viewReady[viewName]) viewReady[viewName] = new Bacon.Bus(); // This will signal that this view is rendered. Will be used in onValue assignment.

            if (void 0 !== state.lastIf) State.rollback();
            State.print('_____renderStateAfter:', state);
            return this;
    };


    var _clear = function(viewName) {
        return _render.bind(this)( prefs.render.clear, viewName);
    }

    /**
     * Just action. receives upstream, transparently pass it through.
     */
    var _do = function(actionProvider) {
        
        if ( ! state.lastOp ) throw new Error('"do" should nest something');

        type(actionProvider, 'function');

        var thisDo = state.lastOp
        
        thisDo.onValue( actionProvider );

        return this;
    }

    var _redirect = function(url){

        if ( ! state.lastOp ) throw new Error('"redirect" should nest something');

        var ups = Upstream();

        var thisRedirect = (state.lastIf || state.lastDep || state.lastWhen)
            .map(ups.fmap(_.extend))
            .map(function() { return url; })
            .map(ups.join('render', 'redirectUrl'));

        lastRedirect = lastRedirect ? lastRedirect.merge(thisRedirect) : thisRedirect;

        if (void 0 !== state.lastIf) State.rollback();

        return this;
    }

    var type = function(item, type) {
        if ( type !== typeof item && item ) throw new Error('Type Error: ' + item + ' should be ' + type);
    }

    /* Not ordered commands */
    /**
     * Default route.
     * @param name
     * @param route
     * @returns {otherwise}
     */
    var _otherwise = function(renderProvider, viewName) {
        
        type(renderProvider, 'function');
        type(viewName, 'string');

        viewName = viewName || prefs.view;

        if ( !viewName ) throw new Error('Default render name is not provided.');

        var ups = Upstream();

        defaultRoutes[viewName] = otherWiseRootStream
            .map(ups.fmap(_.extend))
            .map(function() { return { renderProvider: renderProvider, viewName:viewName }; })
            .map(ups.join('render', void 0))

        add('defaultOf'+viewName, defaultRoutes[viewName])
        return this;
    }

    /**
     * Set default view
     * @param view - is a directive for injecting template
     * @returns atlant 
     */
    var _defaultView = function( defaultViewName ) {
        console.log('atlant.defaultView is deprecated. use atlant.set( { view: view }) instead.');
        prefs.view = defaultViewName;
        return this;
    }

    /* @TODO: deprecate */
    var _views = function(hirearchyObject) {
        prefs.parentOf = s.merge( prefs.parentOf, hirearchyObject );
        return this;
    }

    /**
     * Function: skip
     * Skip: Sets the list of route masks which should be skipped by routeStreams.
     * @param path
     * @returns atlant
     * @private
     */
    var _skip = function(){
        var pushSkipVariants = function(path) {
                prefs.skipRoutes.push( {mask: path} );
                prefs.skipRoutes.push( {mask: utils.getPossiblePath(path)} );
        };

        return function (path){
            if (1 < arguments.length) {
                s.map( pushSkipVariants, s.a2a(arguments) );
            } else {
                pushSkipVariants(path);
            }
            return this;
        }
    }();

    var _setRender = function(render) {
        console.log('atlant.setRender is deprecated. use atlant.set( { render: render }) instead.');
        s.merge( prefs.render, render );
        return this;
    }

    /**
     *  Use this method to publish routes when 
     */
    var _publish = function(){
        publishStream.push( { path: utils.getLocation() } );
    }

    var _set = function( properties ) {
        var allowedProps = [ 'view', 'render', 'cache' ];
        var wrongProps = s.compose( s.notEq( -1 ), allowedProps.indexOf.bind(allowedProps) ); 
        var propsGuard = s.filterKeys( wrongProps );
        var fillProps = s.compose( s.inject(this), s.merge( prefs ), propsGuard );
            
        fillProps(properties);
        
        return this;
    }

return {
        // Set atlant preferencies
        set:_set
        ,views: _views
        // Deprecated, use .set( { 'view': defaultViewName } )
        ,defaultView: _defaultView
        ,setRender: _setRender
        ,when: _when
        ,lastWhen: _lastWhen
        // Depends execution glued to when
        ,depends: _depends
        ,and: _and
        ,inject: _inject
        ,if: _if
        ,do: _do
        // Render methods:
        // Render should return either the Promise either the something. Promise will be threated async.
        ,render: _render
        // Clears view. Simply alias to render with empty view
        ,clear: _clear
        ,redirect: _redirect
        ,otherwise: _otherwise
        ,skip: _skip
        ,exports:exports
        ,publish: _publish
        ,renders: { react: reactRender, simple: simpleRender }
    };

});

module.exports = atlant();

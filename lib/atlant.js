!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Atlant=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
/**

 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 */

function Atlant(){
    var s = _dereq_('./lib')
        ,simpleRender = _dereq_('./renders/simple')
        ,reactRender = _dereq_('./renders/react')
        ,utils = _dereq_('./utils')
        ,Upstream = _dereq_('./upstream.js')
        ,Counter = _dereq_('./counter.js')()
        ,Bacon = window.Bacon
        ,_ = window._

    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,streams = {} // Streams collected
        ,renderNames = []
        ,viewNames = [];

    var isRedirected = false;

    var cache = [];

    var lastMasks = [];
    var lastFinallyStream;
    var prefs = {
            parentOf: {}
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,render: { render: simpleRender.render, clear: simpleRender.clear }
            ,viewState: ['root']
            ,on: { renderEnd: void 0 }// callback which will be called on finishing when rendering

    }

    // var log = s.nop;
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
        stop: _.uniqueId()
        ,continue: _.uniqueId()
    }

    var WhenFinally = {
        when: _.uniqueId()
        ,match: _.uniqueId()
        ,finally: _.uniqueId()
    }

    // Depends enum
    var Depends = {
        parallel: _.uniqueId()
        ,continue: _.uniqueId()
    }

    var RenderOperation = {
        render: parseInt(_.uniqueId())
        ,clear: parseInt(_.uniqueId())
    }


    var clientFuncs = function() {
        var convertPromiseD = s.curry(function(promiseProvider, upstream) {
            var promise = promiseProvider( upstream );
            if ( promise && 'Promise' === promise.constructor.name){
                promise = promise
                    .catch( function(e) {  if (!e.stack) return e; else clientFuncs.catchError(e) } )
                return Bacon.fromPromise( promise );
            } else {
                return Bacon.constant(promise);
            }
        });

        var safeD = function(fn){
            return function() {
                try {
                    return fn.apply(this, arguments);
                } catch(e) {
                    console.error(e.message, e.stack);
                    return Bacon.Error('Exception');;
                }
            }
        };

        // Provides last depend data as param for .if command
        var injectParamsD = s.curry(function(lastDepName, fn) {
            return function(upstream) {
                var scope = clientFuncs.injectDependsIntoScope({}, upstream);

                return fn.call(this, scope);
            }
        });


        var simpleType = function(data, key) {
            return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
        }
        
        /**
         * Injects depend values from upstream into object which is supplyed first.
         */
        var injectDependsIntoScope = function ( scope, upstream ) {
            var injects = s.compose( s.reduce(s.extend, {}), s.dot('injects') )(upstream);
            var error = function(inject) { throw Error('Wrong inject accessor.' + inject) }
            var data = s.map( s.compose( /*s.if(s.empty, error),*/  s.flipDot(upstream) ), injects );

            var params = s.reduce(function(result, item) { result[item] = upstream.params[item]; return result;}, {} , _.keys(upstream.params))
            params['mask'] = (upstream.route) ? upstream.route.mask : void 0;    
            params['location'] = upstream.path;

            if( upstream.render ) { 
                var viewName =  upstream.render.viewId;
                var saveData4Childs = s.set(viewName, dataByView)(data);
                s.extend( data, dataByView[prefs.parentOf[viewName]])
            }

            s.extend( scope, params, data );

            Object.keys(data).filter(simpleType.bind(this, data)).map(function(key){
                Object.defineProperty(scope, key, {
                    get: function () {
                        return s.flipDot( upstream, injects[key] );
                    }
                });
            });
            return scope;
        };

        var catchError = function(e) {
            if (e && e.stack) {
                console.error(e.message, e.stack);
            } else {
                console.error(e);
            }
            return e;
        }

        return { 
            convertPromiseD: convertPromiseD
            ,safeD: safeD
            ,injectParamsD: injectParamsD
            ,injectDependsIntoScope: injectDependsIntoScope
            ,catchError: catchError
       };
    }();


    var streams = {}; 
    var add = function(name, value) {
        if (streams[name]) throw new Error('This stream is already defined!:', name);
        state.lastName = name;
        streams[name] = { name:name, stream: value }
    }

    /* Helpers */
    var assignRenders = function(){

        var whenRenderedSignal = function( upstream ) {
            // Signalling that view renders
            renderStreams.whenRenderedStream.push(upstream);

            // signal for finally construct
            if ( !upstream.isFinally ) {
                upstream.finallyStream.push(upstream);
            }

            //only for angular-like
            if (viewReady[upstream.render.viewName]) {
                // console.log('rendering view', upstream.render.viewName, 'with data', upstream);
                viewReady[upstream.render.viewName].push(upstream);
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if ( viewRendered[upstream.render.viewName] || isRedirected ) { 
                whenRenderedSignal(upstream);
                return false; 
            } else { 
                viewRendered[upstream.render.viewName] = true;
                return true;
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
                        var viewProvider = s.dot('.render.renderProvider', upstream); 
                        var viewName = s.dot('.render.viewName', upstream);

                        var render = ( RenderOperation.render === upstream.render.renderOperation ) ? prefs.render.render : prefs.render.clear;
                        var render = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)

                        render(viewProvider, viewName, scope)
                            .then(function(component){upstream.render.component = component; return upstream })
                            .then( whenRenderedSignal )
                            .catch( clientFuncs.catchError )

                    } catch (e) { 
                        console.error(e.message, e.stack);
                    }
                });                
        };

        var assignLastRedirect = function() {
            if (!lastRedirect) return;
            lastRedirect.onValue(function(upstream){
                var redirectUrl = utils.interpolate(upstream.redirectUrl, upstream.params);
                log('Redirecting!', redirectUrl);
                isRedirected = true;
                utils.goTo(upstream.redirectUrl);
            });
        };

        var yC = function(x,y) {
            return x.id === y.id ? y : false;
        };

        var getOrderedStreams = function(name, stream) {
            if (! prefs.parentOf[name] ) return stream;

            var parentStream = viewReady[prefs.parentOf[name]];

            // Useful in angular.js, not in React. @TODO
            //stream = Bacon.combineWith(yC, parentStream, stream).changes().filter(function(x){return x});
            return stream;
        };

        return function() {
            if ( isRenderApplyed ) return;

            isRenderApplyed = true
            for(var viewName in renders) {
                var orderedStreams = s.map(getOrderedStreams.bind(this, viewName), renders[viewName]);
                s.map(assignRender, orderedStreams);
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

            var parsed = utils.parseURL( path )
            path = parsed.pathname;
            path = decodeURIComponent(path);

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

                dst = _.extend(utils.parseSearch(parsed.search), dst);
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
     * Main function for parse new path
     * @param path
     * @returns {bool} false | {*}
     */
    var matchRoutes = function(path, routes, matchingBehaviour){
        matchingBehaviour = matchingBehaviour || Matching.continue;
        var routes =  routes
            .map(function(route) {
                return matchRouteLast( path, matchingBehaviour, route );
            })
            .filter(s.notEmpty)

        return s.head(routes);
    }

    /* depends */
    var depends = function() {

        var createDepStream = function(stream, depName, dep, injects) {

            var ups = new Upstream();

            return stream
                .map( ups.fmap(_.extend) )
                .flatMap( s.compose( clientFuncs.convertPromiseD, clientFuncs.safeD, clientFuncs.injectParamsD(state.lastDepName))( dep ) )
                .map( ups.join('depends', depName) )
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    if (!upstream.injects) upstream.injects = [];
                    upstream.injects.push(injects);

                    return upstream;
                });
        }

        /**
         * Join 2 streams into 1
         */
        var zippersJoin = s.curry( function(prevDepName, currDepName, x, y) {
            x.depends = s.extend( x.depends, y.depends );
            x.injects = x.injects.concat(y.injects);
            return x;
        });

       // var cachedPromise = s.curry( function(cacheName, cacheKey, dependency, upstream) {
       //     // if ( cache[cacheName] && cache[cacheName][cacheKey] ) { console.log('cached!')}
       //     //     return cache[cacheName][cacheKey];
       //
       //     console.log('nilling!', cacheName, cacheKey)
       //     return dependency(upstream).then(function (response) {
       //         // cache[cacheName][cacheKey] = response;
       //         return response;
       //     });
       // });

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

    var publishStream = new Bacon.Bus();  // Here we can put init things.

    // Browser specific actions.
    if ('undefined' !== typeof window) {
        _dereq_( './inc/wrapPushState.js')(window);

        // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
        // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
        document.addEventListener("DOMContentLoaded", onRouteChange);
        window.addEventListener("popstate", onRouteChange);

        publishStream.onValue(utils.attachGuardToLinks);
    }


    var whenCount = { value: 0 };
    var renderStreams = _dereq_('./render-streams')(Counter, whenCount);

    renderStreams.renderEndStream
        .onValue( function(){
            renderStreams.nullifyScan.push('nullify');
            if (prefs.render.on.renderEnd) prefs.render.on.renderEnd('root');
            setTimeout( prefs.on.renderEnd, 0);
        })

    var renderBeginStream = new Bacon.Bus();

    var stateR = { isRendering: false }; // Show state of rendering 

    /* Update state of rendering */
    renderStreams.renderEndStream
        .map( function() { return false; } ) 
        .merge(renderBeginStream.map( function() { return true }))
        .scan(false, function(oldVal, newVal){
            stateR.isRendering = newVal;
            return newVal; 
        })
        .onValue();

    var firstRender = renderStreams.renderEndStream 
        .take(1)
        .onValue(function(value) { // value contains all rendered upstreams. 

            if ( prefs.stringify ) {
                if (prefs.stringify) {
                    prefs.stringify( prefs.render.stringify('root', prefs.stringifyOpts) );
                }
            }

            if( 'undefined' !== typeof window && prefs.rootSelector )   {
                console.log('attaching!:', value  )
                prefs
                    .render.attach('root', prefs.rootSelector )
                    .then(function(upstrean){ console.log('attached root to ', prefs.rootSelector, 'the value is ', value)})
                    .catch(function(e) { console.error(e.message, e.stack) })
            }
        });
        
    var routeChangedStream =  publishStream
        .merge( Bacon.fromBinder(function(sink) {
            if ( 'undefined' !== typeof window) {
                // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
                var routeChanged = function(event) { 
                    event.preventDefault();
                    var parsed = ( event.detail ) ? utils.parseURL( event.detail.url ) : void 0;
                    var path = ( parsed ) ?  parsed.pathname + '?' + parsed.search :  utils.getLocation();
                    sink( { path: path } ); 
                };
                window.addEventListener( 'popstate', routeChanged );
                window.addEventListener( 'pushstate', routeChanged );
            }
        }))
        .scan(void 0, function(previous, current){
            if ((previous && previous.hasOwnProperty('published')) || current.hasOwnProperty('published')) {
                current.published = true;
            }
            return current;
        })
        .filter(function(upstream) { return upstream && upstream.hasOwnProperty('published') })
        .filter(function(upstream) { return !stateR.isRendering } ) // Do not allow routeChangedStream propagation if already rendering.
        .map(function(upstream){ 
            return upstream && upstream.path ? upstream : { path: utils.getLocation() };
        })
        .filter( s.compose( s.empty, s.flip(matchRoutes, 3)(Matching.continue, prefs.skipRoutes), s.dot('path') )) // If route marked as 'skip', then we should not treat it at all.
        .map(function(upstream) { // Nil values.
            Counter.reset(); // reset to default values the counter of render/clear. 
            isLastWasMatched = false;
            isRedirected = false;
            viewRendered = [];
            scopeAttached = [];
            dataByView = {};
            renderBeginStream.push();
            return upstream;
        })


    var rootStream = Bacon.fromBinder(function(sink) {
            routeChangedStream.onValue(function(upstream) {
                assignRenders();
                sink(upstream);
            });
        }).map(function(upstream){upstream.id = _.uniqueId(); return upstream;})

    var otherWiseRootStream = rootStream
        .filter( s.compose( s.empty, s.flip(matchRoutes)(Matching.stop, routes), s.dot('path') ) )
        .map( function(upstream) { whenCount.value++; return upstream; })
        .map( s.logIt('Otherwise is in work.') );

 
    /* Base */

    /**
     * When
     */
    var when = function(){
        var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
        var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName) );

        return function(masks, matchingBehaviour, whenType) {
            s.type(masks, 'string');
            if ( -1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.') 
            masks = masks.split('||').map(s.trim);

            if ( 0 === masks.length || 1 === masks.length && '' === masks[0] ) masks = lastMasks; 
            lastMasks = masks; 

            if ( 0 === masks.length || 1 === masks.length && '' === masks[0] ) throw new Error('At least one route mask should be specified.');
            State.first();

            var name = '';
            if (whenType === WhenFinally.finally) name = 'finally';
            if (whenType === WhenFinally.match) name = 'match';
            var name = name + createNameFromMasks(masks);

            var whenId = _.uniqueId();        
            var ups = new Upstream();
            var additionalMasks = [];
            var finallyStream = ( WhenFinally.finally !== whenType ) ? new Bacon.Bus() : lastFinallyStream;

            masks.forEach(function(mask) {
                s.push(utils.getPossiblePath(mask), additionalMasks);
            });

            if( WhenFinally.when === whenType || WhenFinally.finally === whenType ) 
                masks.forEach(function(mask) {
                    s.push({mask: mask}, routes);
                    s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
                });
            
            if ( WhenFinally.when === whenType || WhenFinally.match === whenType ) {
                lastFinallyStream = finallyStream;

                state.lastWhen = rootStream
                    .map(ups.fmap(_.extend))
                    .map( function(upstream) {
                        return masks
                            .concat(additionalMasks)
                            .filter(function() { return ! isLastWasMatched; }) // do not let stream go further if other is already matched.
                            .map( matchRouteLast( upstream.path, matchingBehaviour ) )
                            .filter( s.notEmpty )                              // empty params means fails of route identity.
                    } )
                    .map(s.head)
                    .filter( s.notEmpty )
                    .map(ups.join(void 0, void 0))
                    .map(function (upstream) { 
                        upstream.whenId = whenId;
                        upstream.route.when = masks;
                        upstream.isFinally = false; 
                        upstream.finallyStream = finallyStream;
                        return upstream; 
                    })
            } else {
                lastFinallyStream = void 0;
                
                state.lastWhen = rootStream
                    .map(ups.fmap(_.extend))
                    .map( function(upstream) {
                        var result = masks
                            .concat(additionalMasks)
                            .map( s.compose( s.negate, matchRouteLast( upstream.path, matchingBehaviour ) ) )
                            .reduce( function(x, y) { return x && y; }, true )
                        return result;
                    })
                    .merge( finallyStream )
                    .scan ( void 0, function(previous, current) {
                        if ( void 0 === previous ) return current;

                        var isRouteChanged = function(event){ return "boolean" === typeof event && event }
                        var isRouteRendered = function(event){ return event.hasOwnProperty('id') } // route with declared finally tree.

                        if ( isRouteRendered( previous ) && isRouteChanged( current ) ) return 'orly';
                        else return current;

                    })
                    .filter( function(x) { return x === 'orly'; } )
                    .map(function() {
                        return { whenId: whenId, route: { whenNot: masks }, isFinally:true }; 
                    })
            }

            state.lastWhen = state.lastWhen.map( function(stream) { stream.conditionId = whenId; return stream; })

            state.lastWhen
                .onValue( function(upstream) {
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        log('----------------Redirect:',upstream);
                        utils.goTo(upstream.redirectTo);
                    }
                });

            state.lastWhen // counter for whens and Informational message. 
                .onValue(function(upstream) {
                    whenCount.value++;
                    log('Matched route!', upstream.route.mask, upstream.path, upstream.route.when, upstream.whenId);
                });

            state.lastIf = void 0;
            state.lastDep = void 0;
            state.lastDepName = void 0;
            state.lastWhenName = name;
            state.lastOp = state.lastWhen;
            state.lastConditionId = whenId;

            State.print('___When:'+JSON.stringify(masks), state);

            add(state.lastWhenName, state.lastWhen)

            return this;
        };
    }();

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _lastWhen = function(masks) {
        return when.bind(this)( masks, Matching.stop, WhenFinally.when );
    }

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _when = function(masks) {
        return when.bind(this)( masks, Matching.continue, WhenFinally.when );
    }

    var _match = function(masks) {
        return when.bind(this)( masks, Matching.stop, WhenFinally.match );
    }

    var _finally = function() {
        return when.bind(this)( '', Matching.continue, WhenFinally.finally );
    }

    var _otherwise = function(){
        State.first();

        var otherwiseId = _.uniqueId(); 
        state.lastWhen = otherWiseRootStream
            .map( function(stream) { stream.conditionId = otherwiseId; return stream; })

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = void 0;
        state.lastWhenName = 'otherwise';
        state.lastOp = state.lastWhen;
        state.lastConditionId = otherwiseId; 

        State.print('___Otherwise:', state);

        add(state.lastWhenName, state.lastWhen)

        return this;
    };


    /**
    	if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function(fn) {

        if ( ! state.lastOp ) { throw new Error('"if" should nest something.'); }

        State.divide();
        var ifId = _.uniqueId();

        var thisIf = state
            .lastOp
            .filter( clientFuncs.safeD( clientFuncs.injectParamsD( state.lastDepName ) ) (fn) )
            .map( function(stream) { stream.conditionId = ifId; return stream; })

        state.lastIf = thisIf; 
        state.lastOp = state.lastIf;
        state.lastConditionId = ifId;

        add( 'if_' + ifId, state.lastIf );

        State.print('_if__After:', state);

        return this;
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
     * render Function	
     * Customize the stream which created by "when" route.
     * Applyed to any stream and will force render of "template" with "controller" into "view"
     * @param controller
     * @param templateUrl
     * @param viewName - directive name which will be used to inject template
     * @returns {*}
     */
    var render = function(renderProvider, viewName, renderOperation){

            if ( ! state.lastOp ) throw new Error('"render" should nest something');
            
            s.type(renderProvider, 'function');
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')

            viewName = viewName || s.tail(prefs.viewState);

            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            
            Counter.increase(state);

            var ups = new Upstream();

            var thisRender = state.lastOp
                .map(ups.fmap(_.extend))
                .map(function() { return { renderProvider: renderProvider, viewName:viewName, renderOperation:renderOperation}; })
                .map(ups.join('render', void 0))

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if( ! viewReady[viewName]) viewReady[viewName] = new Bacon.Bus(); // This will signal that this view is rendered. Will be used in onValue assignment.


            if (void 0 !== state.lastIf) State.rollback();
            State.print('_____renderStateAfter:', state);
            return this;
    };

    var _render = function(renderProvider, viewName) {
        return render.bind(this)(renderProvider, viewName, RenderOperation.render);
    }

    var _clear = function(viewName) {
        return render.bind(this)(function(){}, viewName, RenderOperation.clear);
    }

    /**
     * Just action. receives upstream, transparently pass it through.
     */
    var _do = function(actionProvider) {
        if ( ! state.lastOp ) throw new Error('"do" should nest something');
        s.type(actionProvider, 'function');
        var doId = _.uniqueId();

        var thisDo = state.lastOp
            .flatMap( function(upstream) { 
                var injects = {};
                try{
                    clientFuncs.injectDependsIntoScope(injects,  upstream) 
                    var result = actionProvider(injects);
                    if ( result && 'Promise' === result.constructor.name){
                        return result.then( function() { return upstream; } ).catch( clientFuncs.catchError );
                    } else {
                        return upstream;
                    }
                } catch(e){
                    console.error(e.message, e.stack)
                }
            }.bind(this));

        add( 'do_' + doId, thisDo );

        state.lastOp = thisDo;
        State.print('_do__After:', state);

        return this;
    }

    var _redirect = function(url){

        if ( ! state.lastOp ) throw new Error('"redirect" should nest something');

        var ups = new Upstream();

        Counter.increase(state);

        var thisRedirect = (state.lastIf || state.lastDep || state.lastWhen)
            .map(ups.fmap(_.extend))
            .map(function() { return url; })
            .map(ups.join('render', 'redirectUrl'));

        lastRedirect = lastRedirect ? lastRedirect.merge(thisRedirect) : thisRedirect;

        if (void 0 !== state.lastIf) State.rollback();

        return this;
    }


    /* Not ordered commands */

    /* @TODO: deprecate */
    var _views = function(hirearchyObject) {
        prefs.parentOf = s.merge( prefs.parentOf, hirearchyObject );
        return this;
    }

    /**
     * Function: skip
     * Skip: Sets the list of route masks which should be skipped by Atlant.
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

    /**
     *  Use this method to publish routes when 
     */
    var _publish = function(path){
        if (path) s.type(path, 'string');
        publishStream.push({published:true, path:path});
    }

    var _set = function( view ) { 
        s.type(view, 'string');
        
        prefs.viewState.push(view);
        return this;
    }

    var _unset = function() {
        if ( prefs.viewState.length > 1 ) prefs.viewState.pop();
        return this;
    }

    // unused
    var _setProps = function( properties ) {
        var allowedProps = [];
        var wrongProps = s.compose( s.notEq( -1 ), allowedProps.indexOf.bind(allowedProps) ); 
        var propsGuard = s.filterKeys( wrongProps );
        var fillProps = s.compose( s.inject(this), s.merge( prefs ), propsGuard );
            
        fillProps(properties);
        
        return this;
    }

    var _onRenderEnd = function(callback) {
        prefs.on.renderEnd = callback; 
        return this;
    }

    var _use = function(render) {
        s.type(render, 'object');
        //@TODO: check render for internal structure
        prefs.render = render;
        return this;
    }

    var _attachTo = function(selector) {
        prefs.rootSelector = selector;
        return this;
    }

    var _log = function() {
        var arr = s.a2a(arguments).slice();
        var action = s.reduce( function( fn, argument) { return fn.bind(console, argument); }, console.log.bind(console, arr.shift() ));
        _do.call(this, action(arr));
        return this;
    }   

    var _stringify = function(fn, options) {
        prefs.stringify = fn;
        prefs.stringifyOpts = options;
        return this;
    }

    var _get = function(fn) {
        prefs.get = fn;
        prefs.getOpts = options;
        return this;
    }

    // Set view active by defauilt (no need to mention in second parameter of .render
    this.set = _set;
    // Roolback previous set
    this.unset = _unset;
    // Use another render. simple render is default
    this.use = _use;
    // Set views hierarchy.
    this.views =  _views;

    this.when =  _when;
    this.lastWhen =  _lastWhen;
    // Match declare a route which will be ignored by .otherwise()
    this.match = _match;
    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise =  _otherwise;
    // creates branch which can destruct all what declared by .when() or .match()
    this.finally =  _finally;
    this.depends =  _depends;
    this.and =  _and;
    this.inject =  _inject;
    this.if =  _if;
    this.filter =  _if;
    this.do =  _do;
    this.map =  _do;
    this.render =  _render;
    this.clear =  _clear;
    this.redirect =  _redirect;
    this.skip =  _skip;
    this.publish =  _publish;
    this.renders =  { react :  reactRender, simple :  simpleRender };
    this.log =  _log;

    this.onRenderEnd =  _onRenderEnd;
    this.attachTo =  _attachTo;
    this.stringify =  _stringify;
    this.get =  _get;

    return this;

};

module.exports = Atlant;



},{"./counter.js":2,"./inc/wrapPushState.js":3,"./lib":4,"./render-streams":5,"./renders/react":6,"./renders/simple":7,"./upstream.js":8,"./utils":9}],2:[function(_dereq_,module,exports){
"use strict"

var counter = (function() {
    var rCount = {}
    ,rCountCopy

    return {
       increase:function(state) {
           // @TODO check if state
           if ( !rCount ) rCount = {};
           rCount[state.lastConditionId] = ( rCount.hasOwnProperty(state.lastConditionId) ? rCount[state.lastConditionId] : 0 ) + 1; // increase the render counter for current When/If
       }
       ,decrease:function(upstream) {
           // @TODO check if upstream
           if ( !rCountCopy ) rCountCopy = {};
           if ( !rCountCopy[upstream.conditionId] ) rCountCopy[upstream.conditionId] = rCount[upstream.conditionId];
           rCountCopy[upstream.conditionId]--;
           return rCountCopy[upstream.conditionId]
       }
       ,count: function(upstream) {
            return rCount[upstream.conditionId];
       }
       ,reset: function() {
           rCountCopy = void 0; 
       }
   }
});

module.exports = counter;

},{}],3:[function(_dereq_,module,exports){

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
           console.log('Can\'t push state:', e);
           return void 0;
        }
    };

    window.history.pushState = function(state, title, url) {
        var newState;
        var onpushstate = new CustomEvent('pushstate', { detail: { state: state, title: title, url: url } } );
        window.dispatchEvent(onpushstate);

        return tryState(arguments);
    };

};


module.exports = wrapPushState;

},{}],4:[function(_dereq_,module,exports){
/**
   Utils library.
 */
var s = (function(){

    var _ = window._
        ,Promise = window.Promise;

    var $s = this;
    var id = function(value) { return value; }
    var nop = function() { return void 0; }

    var pass = function() { return function(promise) { return promise; } }
    var inject = function(data) { return function() { return data; } }
    /**
     *
     * @param fn - promise callback
     * @param fn2 - reject callback
     * @returns {Function}
     */
    var then = function(fn, fn2) { return function(promise) { return promise.then(fn, fn2); }; }

    /**
     * Decorator that accept resolving of promise to let free the blocking of function it decorates.
     * The blocking is exported as reference to variable in context.
     * @TODO only export the blocking variable, use closure to serve real blocking reference.
     * @param obj
     * @param item
     * @returns {Function}
     */
    var sync = function(obj, item) {

        var resolvePromise = function() {
            obj[item] = false;
            return arguments[0];
        }
        var blockPromise = function(fn) {
            return function() {
                if ( ! obj[item] ) {
                    obj[item] = true;
                    return fn.apply(this, arguments);
                } else {
                    return $q.reject();
                }
            }
        }

        return function(fn) {
            return _.compose( $s.then(resolvePromise), blockPromise(fn));
        }
    }

    /**
     * Deprecated. Use sync
     * @param obj
     * @param item
     * @param fn
     * @returns {Function}
     */
    var guardWithTrue = function(obj, item, fn) {
        return function() {
            if ( ! obj[item] ) {
                obj[item] = true;
                return fn.apply(this, arguments);
            } else {
                return void 0;
            }
        }
    }

    /**
     * Deprecated. Use sync
     * @param obj
     * @param item
     * @param fn
     * @returns {*}
     */
    var resolveGuard = function(obj, item, fn) {
        if (fn) {
            return function() {
                fn.apply(this, arguments);
                obj[item] = false;
                return arguments;
            }
        } else {
            obj[item] = false;
            return arguments;
        }
    }

    /**
     * Deprecated. Use streams instead.
     * @constructor
     */
    var Herald = function() {
        this.listeners = {};

        this.listen = function( what, listener) {
            if ( ! this.listeners[what] ) this.listeners[what] = [];
            this.listeners[what].push(listener);
        }.bind(this);

        this.emit = function(what) {
            var params = [].slice.call(arguments, 1);
            this.listeners[what].map(function(listener){ listener.apply(null, params); })
        }.bind(this);
    }

    // Convert arguments into array.
    var a2a = function(args) {
        return Array.prototype.slice.apply( args );
    }

    var unary = function(fn) {
        return function(val) {
            return fn.call(this, val);
        }
    }

    /**
     * Accepts collection.
     * it pass obj value and object name to fn (temporary 2 args)
     * @type {Function}
     */
    var map = _.curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.map(unary(fn));

        var mapped = {};

        for( var name in obj ) {
            mapped[name] = fn(obj[name]);
        }

        return mapped;

    });

    // @TODO create mapKeys


    var fmap = _.curry( function(fn, obj) {
        return obj.fmap(fn);
    });
    
    // @TODO check immutability/mutability
    var filter = _.curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.filter(unary(fn));

        var filtered = {};

        for( var name in obj ) {
            if ( fn(obj[name]) ) { 
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    var filterKeys = _.curry( function(fn, obj) {
        if ( ! obj ) return obj;

        var filtered = {};

        for( var name in obj ) {
            if ( fn(name) ) { 
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    var reduce = _.curry( function(fn, startValue, obj) {
        if(obj) {
            return Array.prototype.reduce.call(obj, fn, startValue);
        } else {
            return startValue;
        }
    });
    var concat = _.curry( function(a, b) {
        return b.concat(a);
    });
    var tail = function(arr) {
        if (arr) {
            return arr[arr.length-1];
        } else {
            return void 0;
        }
    };
    var head = function(arr) {
        if (arr) {
            return arr[0];
        } else {
            return void 0;
        }
    };
    var negate = function(obj) {
        return !obj;
    }

    var eq = _.curry( function(obj, obj2) {
        return obj === obj2
    });

    var notEq = _.curry( function(obj, obj2) {
        return obj !== obj2
    });

    var empty = function(obj) {
        return obj === null || obj === void 0 || obj === '' || ( (obj instanceof Array) && 0 === obj.length ) || ('object' === typeof obj && 0 === Object.keys(obj).length);
    }
    var notEmpty = _.compose( negate, empty );

    var simpleDot = function(expression, obj) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    var flipSimpleDot = function(obj, expression) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    // expression is ".something" or ".something.something"
    var dot = _.curry( function(expression, obj) {
        return expression.split('.').filter($s.notEmpty).reduce(flipSimpleDot, obj);
    });

    // expression is ".something" or ".something.something"
    var flipDot = _.curry( function(obj, expression) {
        return dot(expression, obj);
    });

    var set = _.curry( function(item, obj, value) {
        if(item) {
            obj[item] = value;
            return obj;
        } else {
            return value;
        }
    });

    var plus = _.curry( function(item1, item2) {
        return item1 + item2;
    });

    var trim = function(string) {
        return string.trim();
    }

    var flip = function(fn) {
        return _.curry(function() {
            return fn.apply(this, a2a(arguments).reverse());
        }, fn.length);
    };

    var replace = _.curry( function(where, replacer, obj) {
        return obj.replace(where, replacer);
    });

    var push = function( item, obj ) {
        if ( ! obj ) {
            return function(obj) { return obj.push(item); };
        } else {
            return obj.push(item);
        }
    };

    var split = _.curry( function( char, obj ) {
        return obj.split(char);
    });

    var log = function(what) {
        console.log(what);
        return what;
    }

    var logIt = function() {
        var args = a2a(arguments);
        return function(what) {
            console.log.apply(console, args.concat(what) );
            return what;
        }
    };

    var side = function(fn) {
        var args = a2a(arguments);
        return function(param) {
            if (args.length > 1) {
                fn = _.compose.apply(this,args);
            }
            fn.call(this, param);
            return param;
        }
    }

    var instanceOf = function( type, object ) {
        return object instanceof type;
    }
    

    var mapD = function(fn) {
        return function() {
            return map(fn, a2a(arguments))
        }
    }

    var promise = function(value) {
        return new Promise( function(fullfill, reject ) { 
             fullfill(value);
        });
    }

    var promiseD = function(promiseProvider) {
        return function() {
            var result = promiseProvider.apply(this, arguments );
            if ( 'Promise' === result.constructor.name){
                return result;
            } else {
                return promise(result);
            }
        }
    }

    //memoize.js - by @addyosmani, @philogb, @mathias
    // with a few useful tweaks from @DmitryBaranovsk
    function memoize( fn ) {
        return function () {
            var args = Array.prototype.slice.call(arguments),
                hash = "",
                i  = args.length;
            currentArg = null;
            while(i--){
                currentArg = args[i];
                hash += (currentArg === Object(currentArg)) ?
                    JSON.stringify(currentArg) : currentArg;
                fn.memoize || (fn.memoize = {});
            }
            return (hash in fn.memoize) ? fn.memoize[hash] :
                fn.memoize[hash] = fn.apply( this , args );
        };
    }

    var Perf = function() {
        var time;
        this.count = 0;
        this.begin = function() {
            time = Date.now();
        }
        this.end = function() {
            this.count += Date.now() - time;
        }
    }

    var _if = _.curry( function(condition, then, value){
        if( condition( value ) ) return then(value);
        else return value;
    });

    var type = function(item, type) {
        
        if ( type !== typeof item && item ) {
            var error = new Error('Type Error: ' + item + ' should be ' + type);
            console.error(error.message, error.stack)
            throw error;
        }
    }

    this.compose      = _.compose;
    this.curry        = _.curry;
    this.pass   = pass;
    this.then   = then;
    this.sync   = sync;
    this.id     = id;
    this.inject = inject;
    this.nop = nop;

    this.log    = log;
    this.logIt    = logIt;
    this.map    = map;
    this.filterKeys = filterKeys;
    this.filter = filter;
    this.reduce = reduce;
    this.dot 	= dot;
    this.flipDot 	= flipDot;
    this.push 	= push;
    this.split 	= split;
    this.instanceOf = instanceOf;
    this.eq     = eq;
    this.notEq = notEq;
    this.empty = empty;
    this.notEmpty = notEmpty;
    this.negate = negate;
    this.plus   = plus;
    this.trim   = trim;
    this.a2a    = a2a;
    this.replace = replace;
    this.head   = head;
    this.tail   = tail;
    this.concat = concat;
    this.mapD   = mapD;
    this.fmap   = fmap;
    this.set    = set;
    this.flip = flip;
    this.memoize = memoize;
    this.Perf = Perf;
    this.extend = _.curry(_.extend, 2);
    this.merge = _.curry(_.merge, 2);
    this.unary = unary;
    this.side = side;
    // Promises
    this.promise = promise;
    this.promiseD = promiseD;
    this.if = _if;
    /**
     * Depreated
     *
     * */
    this.guardWithTrue = guardWithTrue;
    this.resolveGuard = resolveGuard;
    this.Herald = Herald;
    this.type = type;
    return this;

})();

module.exports = s;

},{}],5:[function(_dereq_,module,exports){
"use strict";

var Bacon = window.Bacon;

module.exports = function(Counter, whenCount)  {

    var Upstream = _dereq_('./upstream.js')
        ,s = _dereq_('./lib')

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var ups2 = new Upstream();
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .scan([], function(oldVal, newVal) {
            oldVal.push(newVal); 
            return oldVal;
        })
        .map( s.compose( ups2.push, ups2.clear ) )
        .map( ups.pop )
        .map( Counter.decrease )
        .filter( function(value) { return 0 === value; })
        .map( ups2.pop )
        .changes()
        .merge(nullifyScan)
        .scan({}, function(oldVal, newVal) {
            if (newVal == 'nullify') {
                oldVal = {};
                return oldVal
            }

            if ( !(newVal instanceof Array) ) 
                newVal = [newVal];
            
            newVal.map(function(val){
                oldVal[val.render.viewName] = val;
            })

            return oldVal;
        })
        .filter(s.notEmpty)
        .changes()
        .filter( function(upstream) { return 0 === --whenCount.value; } )

    return { 
        renderEndStream: renderEndStream 
        ,whenRenderedStream: whenRenderedStream  
        ,nullifyScan: nullifyScan 
    }
}

},{"./lib":4,"./upstream.js":8}],6:[function(_dereq_,module,exports){
"use strict";
var React = window.React;

var views = [];

var Wrapper = (function(){
    var wrappers = {}
        ,thises = {}
        ,instances = {};

    return { 
        check: function(name) {
            if ( !wrappers[name] ) {
                wrappers[name] = React.createClass({
                    render: function(){
                        // if ( views[name] ) 
                        thises[name] = this;

                        if ( !views[name] ) views[name] = React.DOM.div(null); 

                        return views[name];
                        // else
                        // console.log('imhere')
                        // return React.DOM.div(); 
                    }
            })}    
            instances[name] = wrappers[name]();
        }
        ,getWrapper: function(name) {
            return wrappers[name];
        }
        ,getInstance: function(name) {
            return instances[name];
        }
        ,getThis: function(name) {
            return thises[name];
        }
    }
})();

var reactRender = { 
    render: function(viewProvider, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            console.log('rendering the name:', name)

            // get new component somehow.
            views[name] = viewProvider(scope);  

            Wrapper.check(name);

            return resolve(Wrapper.getInstance(name)); 
        });

        return rendered;
    }
    ,clear: function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){

            views[name] = React.DOM.div(null);
            Wrapper.check(name);

            return resolve(Wrapper.getInstance(name));
        });
    }
    ,attach: function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( !window ) throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            React.renderComponent(Wrapper.getInstance(name), element, resolve );

        });

        return attached;
    }
    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    ,stringify: function(name, options) {
        if ( options && options.static)
            return React.renderComponentToStaticMarkup(Wrapper.getInstance(name));
        else 
            return React.renderComponentToString(Wrapper.getInstance(name));
    }
    /* Can return inner view representation. For React.js it means React component */
    ,get: function(name, options) {
        Wrapper.check(name);
        var instance = Wrapper.getWrapper(name);
        return instance;
    }
    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    ,innerView: React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })
    ,forceUpdate: function(name) {
        return new Promise( function( resolve, reject) {
            var instance = Wrapper.getThis(name);
            instance.forceUpdate( resolve )
        })
    } 
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
    ,attach: reactRender.attach
    ,stringify: reactRender.stringify
    ,get: reactRender.get
    ,on: { renderEnd: reactRender.forceUpdate }
    ,innerView: reactRender.innerView
}

},{}],7:[function(_dereq_,module,exports){
/*
 * Very simple render. uses viewName as attribute name of attribute and installs string inside 
 */
var simpleRender = {
    render: function(viewProvider, name, scope) {
        var fragment = document.createDocumentFragment();
        var viewPromise = viewProvider(scope);
        return viewPromise.then(fragment.appendChild).then(function() {
            var element = document.querySelector('#' + name );
            element.appendChild(fragment);
        });
    }
    ,clear: function() {
        var element = document.querySelector('#' + name ).innerHTML = '';
        return s.promise('');
    }
}

module.exports = { 
    name: 'simple'
    ,render: simpleRender.render
    ,clear: simpleRender.clear 
}


},{}],8:[function(_dereq_,module,exports){
"use strict";
var s = _dereq_('./lib')

// Save/restore state of the stream.
var Upstream = function() {
    var data = {};
    var _fmap = s.curry(function(fn, obj) {
        data = fn.call(this, data, obj);
        return data;
    });

    var _join = s.curry( function(containerName, propertyName, upstream) {
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
            console.error(e.message, e.stack)
            throw e;
        }

        upstream = data;
        data = {};
        return upstream
    }) 

    return {
        // join :: containerName -> propertyName -> upstream
        join: _join
        // fmap :: fn -> obj
        ,fmap: _fmap
        ,push: function( obj ) { 
            data = obj;
            return data;
        }
        ,pop: function() {
            var upstream = data;
            data = [];
            return upstream;
        }
        ,getLast: function() {
            return data;
        }
        ,clear: function(upstream){
            data = [];
            return upstream
        }
    }
};

module.exports = Upstream;

},{"./lib":4}],9:[function(_dereq_,module,exports){
"use strict";

var s = _dereq_('./lib');

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
        ,parseURL: s.memoize( function(url) {
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

            var element;
            var begin = loc.indexOf('#');  
            var id = loc.slice( -1 === begin ? 1 : begin + 1, loc.length );
            if( '' !== id) element = document.getElementById(id)
            if(element) element.scrollIntoView();

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

},{"./lib":4}]},{},[1])
(1)
});
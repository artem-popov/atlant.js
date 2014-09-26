"use strict";
/**

 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 * @TODO: check(true) to check only this view params (by specifically set fields or somehow)
 * @TODO: depCache to check only this dep params (by specifically set fields or somehow)
 */

function Atlant(){
    var s = require('./lib')
        ,simpleRender = require('./renders/simple')
        ,reactRender = require('./renders/react')
        ,DepCache = require('./inc/dep-cache')
        ,utils = require('./utils')
        ,Upstream = require('./upstream.js')
        ,Counter = require('./counter.js')()
        ,Bacon = require('baconjs')
        ,_ = require('lodash');

    var depCache = new DepCache();
    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,streams = {} // Streams collected
        ,renderNames = []
        ,viewNames = [];

    var cache = [];

    var lastMasks = [];
    var lastFinallyStream;
    var prefs = {
            parentOf: {}
            ,checkInjectsEquality: true
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,viewState: ['root']
            ,on: { renderEnd: void 0 }// callback which will be called on finishing when rendering

    }

    var lastPath; // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.

    // var log = s.nop;
    var log = console.log.bind(console, '--');

    var state
        ,states
        ,oldStates = [];

    //Action should be performed at route change.
    var onRouteChange = function() {
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
        var dependViews = {}  // Set the views hirearchy. Both for streams and for render.
        ,renders = {}  // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
 		,lastRedirect
        ,viewReady = {}

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
        ,redirect: parseInt(_.uniqueId())
    }

    var clientFuncs = function() {
        var convertPromiseD = s.curry(function(promiseProvider, upstream) {
            var promise = promiseProvider( upstream );
            if ( s.isPromise( promise ) ){
                promise = promise
                    .catch( function(e) {  if (!e.stack) return e; else clientFuncs.catchError(e) } )
                return Bacon.fromPromise( promise );
            } else {
                return Bacon.constant(promise);
            }
        });

        var applyScopeD = function(fn) {
            return function(scope) {
                return fn.call(this, scope)
            }
        };

        
        /**
         * Injects depend values from upstream into object which is supplyed first.
         */
        var createScope = function ( upstream ) {
            var warning = function(inject) { console.log('Atlant warning: inject accessor return nothing:' + inject) }
            var injects = s.compose( s.reduce(s.extend, {}), s.dot('injects') )(upstream);
            var joins = s.filter( function(inject){ return inject.hasOwnProperty('injects') }, injects);
            injects = s.filter( function(inject){ return !inject.hasOwnProperty('injects') }, injects);
            var injectsData = { object: void 0};

            var formatInjects = function(inject) {
                var container = ( inject.hasOwnProperty('injects') ) ? '' : '.depends.' + inject.name;

                if ('string' === typeof inject.expression)
                    return container + (inject.expression ? inject.expression : '' );

                if ('undefined' === typeof inject.expression)
                    return container;

                if ( !inject.hasOwnProperty('injects') ) {
                    return s.baconTryD(function() {
                        return inject.expression(upstream.depends[inject.name]) 
                    })
                } else {  
                    return s.baconTryD(function() {
                        return inject.expression(injectsData.object) 
                    })
                }
            }

            var takeAccessor = s.compose( s.if(s.eq(void 0), warning), s.flipDot(upstream) );
            var takeFunction = function(fn){return fn.apply();}
            var fullfil = s.map( s.compose( s.ifelse(s.typeOf('string'), takeAccessor, takeFunction)
                                            , formatInjects)); 

            injectsData.object = fullfil( injects );
            var data = injectsData.object;
            var joinsData = fullfil( joins );

            // Injecting of mask and location.
            var params = s.reduce(function(result, item) { result[item] = upstream.params[item]; return result;}, {} , _.keys(upstream.params))
            params['mask'] = (upstream.route) ? upstream.route.mask : void 0;    
            params['location'] = upstream.path;

            data = s.extend( params, data, joinsData );

            return data;
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
            ,applyScopeD: applyScopeD
            ,createScope: createScope
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

            if ( upstream.action ) {
                prefs.render.on
                        .renderEnd('root')
            }


            // signal for finally construct
            if ( !upstream.isFinally && upstream.finallyStream) {
                upstream.finallyStream.push(upstream);
            }

            //only for angular-like
            if (viewReady[upstream.render.viewName]) {
                viewReady[upstream.render.viewName].push(upstream);
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if ( atlantState.viewRendered[upstream.render.viewName] || atlantState.isRedirected ) { 
                whenRenderedSignal(upstream);
                return false; 
            } else { 
                atlantState.viewRendered[upstream.render.viewName] = true;
                return true;
            }
        };

        var renderState = {};

        // Registering render for view.
        var assignRender = function(stream) {
            stream
                .filter( renderStopper )
                .onValue( function(upstream){
                    try{ 
                        var scope = clientFuncs.createScope(upstream);
                        var viewName = s.dot('.render.viewName', upstream);

                        // If the data is not changed then there is no any point to redraw.
                        if( ! renderState[viewName] ) { 
                            renderState[viewName] = scope;
                        } else if ( prefs.checkInjectsEquality && _.isEqual ( scope, renderState[viewName] )) {
                            // console.log('the same injects, skip render')
                            whenRenderedSignal(upstream);
                            return;
                        } else {
                            // console.log('injects are new, rendering', viewName)
                            renderState[viewName] = scope;
                        }

                        var viewProvider = s.dot('.render.renderProvider', upstream); 

                        // Choose appropriate render.
                        var render;
                        if (RenderOperation.redirect === upstream.render.renderOperation ){

                            if ('function' === typeof viewProvider) 
                                utils.goTo(viewProvider(scope))
                            else 
                                utils.goTo(viewProvider)

                            return;
                        
                        } else {
                            if ( RenderOperation.render === upstream.render.renderOperation ) {
                                render = prefs.render.render 
                            } else if ( RenderOperation.clear === upstream.render.renderOperation ){
                                render = prefs.render.clear
                            } 

                            var render = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)

                            render(viewProvider, viewName, scope)
                                .then(function(component){upstream.render.component = component; return upstream })
                                .then( whenRenderedSignal )
                                .catch( clientFuncs.catchError )
                        }

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
                atlantState.isRedirected = true;
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

            var parsed = utils.parseURL( path );
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
                var searches = _.clone( utils.parseSearch(parsed.search), true);
                dst = _.extend(searches, dst);
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
                atlantState.isLastWasMatched = true;
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

            var stream = stream
                .map( ups.fmap(_.extend) )

            if ('function' !== typeof dep) {
                stream = stream
                    .map( s.inject(dep) )
            } else {  
                var treatDep = s.compose(  clientFuncs.convertPromiseD
                                            ,s.baconTryD
                                            ,clientFuncs.applyScopeD
                                        )( dep ) ;
                
                stream = stream 
                    .map(clientFuncs.createScope)
                    .flatMap(function(scope) { 
                        if (depCache.has(depName, scope)) {
                            return Bacon.constant(depCache.get(depName, scope));
                        }
                        else { 
                            var stream = treatDep(scope)
                                                        .map(function(upstream){
                                                            depCache.put(depName, scope, upstream);
                                                            return upstream;
                                                        })
                            return stream;
                        }
                    })
            }

            stream = stream
                .map( ups.join('depends', depName) )
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    if (!upstream.injects) upstream.injects = [];
                    upstream.injects.push(injects);

                    return upstream;
                });

            return stream;
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
    var errorStream = new Bacon.Bus();
    var onRenderEndStream = new Bacon.Bus();

    // Browser specific actions.
    if ('undefined' !== typeof window) {
        require( './inc/wrapPushState.js')(window);

        // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
        // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
        document.addEventListener("DOMContentLoaded", onRouteChange);
        window.addEventListener("popstate", onRouteChange);

        publishStream.onValue(utils.attachGuardToLinks);
    }


    var whenCount = { value: 0 };
    var renderStreams = require('./render-streams')(Counter, whenCount);


    renderStreams.renderEndStream
        .onValue( function(upstreams){
            renderStreams.nullifyScan.push('nullify');

            lastPath = utils.getLocation();

            prefs.render.on
                .renderEnd('root')
                .then(function(){
                    var scopeMap = s.map(clientFuncs.createScope, upstreams)
                    onRenderEndStream.push(scopeMap);
                })
                .catch(function(e){
                    errorStream.push(e);
                })
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


            if( 'undefined' !== typeof window && prefs.rootSelector )   {
                prefs
                    .render.attach('root', prefs.rootSelector )
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
                    if (path !== lastPath) {
                        lastPath = path;
                        sink( { path: path } ); 
                    } 
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
            resetRouteState();
            renderBeginStream.push();
            return upstream;
        })
        .map(function(upstream){
            console.log('---The location is:', upstream.path);
            return upstream
        });

    var atlantState = {
        viewRendered: {} // Flag that this view is rendered. Stops other streams to perform render then. 
        ,isLastWasMatched: false // Allow lastWhen to stop other when's execution 
        ,isRedirected: false
    }

    var resetRouteState = function(){
        atlantState.viewRendered = {};
        atlantState.isRedirected = false;
        atlantState.isLastWasMatched = false; 
        Counter.reset(); // reset to default values the counter of render/clear. 
    }

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
                            .filter(function() { return ! atlantState.isLastWasMatched; }) // do not let stream go further if other is already matched.
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

    // Help in creating injects tail
    // Include this before declaring streams: "var injects = prepare4injectsInit();"
    var prepare4injectsInit = function(depName) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!')
        var injects = {};
        state.lastInjects = injects // Here we will store further injects with ".inject"
        return injects;
    }
    // Add invocation when mapping stream.
    var prepare4injects = function(depName, depValue, injects, upstream) {
        if( !upstream.depends ) upstream.depends = {};
        upstream.depends[depName] = depValue;

        if( !upstream.injects ) upstream.injects = [];
        upstream.injects.push(injects);
        return upstream
    }

    var _action = function(action){
        State.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var actionId = _.uniqueId(); 
        var depName = 'action_' + _.uniqueId();
        var injects = prepare4injectsInit(depName);

        state.lastWhen = action
            .map( function(depValue) { 
                var stream = prepare4injects(depName, depValue, injects, {})

                stream.action = true;
                stream.conditionId = actionId;

                atlantState.viewRendered = {}; // the only thing we can nullify.

                return stream;
            })

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = depName;
        state.lastWhenName = depName;
        state.lastOp = state.lastWhen;
        state.lastConditionId = actionId; 

        State.print('___action:', state);

        add(state.lastWhenName, state.lastWhen)
        return this;

    };

    var _error = function(){
        State.first();

        var errorId = _.uniqueId(); 
        state.lastWhen = errorStream
            .map( function(stream) { 
                resetRouteState();
                console.log('errorId is:', errorId);
                stream.conditionId = errorId;
                return stream;
            })
            .map(s.logIt('error stream'))

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = void 0;
        state.lastWhenName = 'error';
        state.lastOp = state.lastWhen;
        state.lastConditionId = errorId; 

        State.print('__error:', state);

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

        var depName = 'if_' + _.uniqueId();
        var injects = prepare4injectsInit(depName);

        var thisIf = state
            .lastOp
            .filter( s.compose( 
                               s.baconTryD( clientFuncs.applyScopeD ) (fn)
                               , clientFuncs.createScope
                              ))
            .map( function(upstream) { 
                var stream = prepare4injects(depName, {}, injects, upstream);
                stream.conditionId = ifId;
                return stream;
            })

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
        s.type(key, 'string');
        if ( ! state.lastDepName ) throw new Error('.inject should follow .depends');

        state.lastInjects[key] = { name: state.lastDepName, expression: expression };

        return this;
    }

    var _join = function( key, expression ) {
        s.type(key, 'string');
        state.lastInjects[key] = { name: state.lastDepName, expression: expression, injects: Array.prototype.slice.apply(state.lastInjects) };

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
            
            if ( 'function' !== typeof renderProvider && 'string' !== typeof renderProvider ) {
                throw new Error('Atlant.js: render first param should be function or URI')
            } 
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')

            viewName = viewName || s.tail(prefs.viewState);

            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            
            Counter.increase(state);
            var renderId = _.uniqueId();

            var ups = new Upstream();

            var thisRender = state.lastOp
                .map(ups.fmap(_.extend))
                .map(function() { return { renderId: renderId, renderProvider: renderProvider, viewName:viewName, renderOperation:renderOperation}; })
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

    var _redirect = function(redirectProvider) {
        return render.bind(this)(redirectProvider, void 0, RenderOperation.redirect);
    }
     
    var _check = function(isCheck) {
        if ( 'undefined' === typeof isCheck)
            throw new Error('Atlant.js: check require boolean parameter.')


        prefs.checkInjectsEquality = isCheck;
        return this;
    }

    /**
     * Just action. receives upstream, do not return it.
     */
    var _do = function(actionProvider) {
        if ( ! state.lastOp ) throw new Error('"do" should nest something');
        s.type(actionProvider, 'function');
        var doId = _.uniqueId();

        var thisDo = state.lastOp
            .flatMap( function(upstream) { 
                try{
                    var scope = clientFuncs.createScope(upstream) 
                    var result = actionProvider(scope);
                    if ( s.isPromise( result ) ){
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



    /* Not ordered commands */

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
        onRenderEndStream.onValue(s.baconTryD(callback));
        return this;
    }

    var _use = function(render) {
        s.type(render, 'function');
        //@TODO: check render for internal structure
        if (prefs.render) throw new Error('You should specify render only once.'); 

        prefs.render = new render();
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
        return prefs.render.stringify('root', options );
    }

    var _get = function(fn) {
        prefs.get = fn;
        prefs.getOpts = options;
        return this;
    }

    var _view = function(name) {
        return prefs.render.get(name);
    }

    // Set view active by defauilt (no need to mention in second parameter of .render
    this.set = _set;
    // Roolback previous set
    this.unset = _unset;
    // Use another render. simple render is default
    this.use = _use;
    this.view = _view;

    this.when =  _when;
    this.lastWhen =  _lastWhen;
    // Match declare a route which will be ignored by .otherwise()
    this.match = _match;
    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise =  _otherwise;
    // creates branch which can destruct all what declared by .when() or .match()
    this.finally =  _finally;
    this.depends =  _depends;
    /*
     * The same as ".depends()", but executes only after last ".depends()" or ".and()" ends.
     * */
    this.and =  _and;
    /*
     * Injects variables into ".render()".
     * accepts 2 params: key, accessor.
     * Key is the name of parameter which will be passed into ".render()".
     * Accessor can be string like this ".story.moment.id" i.e. dot delimited 
     * and
     * can be function which will get ".depends()" result as a parameter.
     * Everything returned will be named as "Key" and injected into ".render()"
     * Please provide here only accessor functions and use ".do()" for action things, because function accessor can be executed several times during atlant work.
     * */
    this.inject =  _inject;
    this.join = _join;
    this.if =  _if;
    /**
     * Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
     */
    this.log =  _log;
    /* Renders the view. first - render provider, second - view name */
    this.render =  _render;
    /* If true then view will be re-rendered only when injects are changed. Accepts boolean. Default true */
    this.check = _check;
    this.clear =  _clear;
    this.redirect =  _redirect;
    this.skip =  _skip;
    this.publish =  _publish;
    this.renders =  { react :  reactRender, simple :  simpleRender };

    this.onRenderEnd =  _onRenderEnd;
    this.attachTo =  _attachTo;
    this.stringify =  _stringify;
    this.get =  _get;
    this.error = _error;
    this.action = _action;

    return this;

};

module.exports = Atlant;



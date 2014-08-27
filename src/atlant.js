// "use strict"
/**

 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 */

var atlant = (function(){
    var s = require('./lib')
        ,simpleRender = require('./renders/simple')
        ,reactRender = require('./renders/react')
        ,animate = require('./animations/simple')
        ,utils = require('./utils')
        ,Upstream = require('./upstream.js')
        ,Counter = require('./counter.js')()
    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,streams = {} // Streams collected
        ,renderNames = []
        ,viewNames = []

    var onRenderEnd; // callback which will be called on finishing when rendering
    var cache = [];

    var lastMasks = [];
    var lastFinallyStream;
    var prefs = {
            parentOf: {}
            ,view: ''
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,render: { render: simpleRender.render, clear: simpleRender.clear }
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
            if ( promise instanceof Promise ){
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
            whenRenderedStream.push(upstream);

            // signal for finally construct
            if ( !upstream.isFinally ) {
                upstream.finallyStream.push(upstream);
            }

            if (viewReady[upstream.render.viewName]) {
                viewReady[upstream.render.viewName].push(upstream);
            }
        };

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
                        var endSignal = whenRenderedSignal.bind( this, upstream );

                        var targetElement = document.querySelector( '#' + viewName );
                        if ( !targetElement ) throw Error('The view "' + viewName + '" is not found. Please place html element before use.')

                        var render = ( RenderOperation.render === upstream.render.renderOperation ) ? prefs.render.render : prefs.render.clear;

                        var cloned = targetElement.cloneNode(true);
                        animate.before(cloned, targetElement);
                        var rendered = render(viewProvider, targetElement, scope);

                        if ( ! ( rendered instanceof Promise ) ) { 
                            rendered = new Promise( function(resolve, reject) { throw new Error('Atlant: render should return Promise.'); } );
                        }

                        rendered = rendered.catch( clientFuncs.catchError );

                        var animated;
                        rendered.then( function() {
                            animated = animate.after( cloned, targetElement );
                        })

                        if ( animated instanceof Promise ) {
                            animated.catch( clientFuncs.catchError ).then( endSignal )
                        } else {
                            rendered.then( endSignal )
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
                isRedirected = true;
                utils.goTo(upstream.redirectUrl);
            });
        };

        var yC = function(x,y) {
            return x.id === y.id ? y : false;
        };

        var getOrderedStreams = function(name, stream) {
            if (! prefs.parentOf[name] ) return stream;

            log('View dependentions:', name, 'are depends on', prefs.parentOf[name]) 
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
    // Browser specific actions.
    if (window) {
        require( './inc/wrapPushState.js')(window);

        // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
        // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
        document.addEventListener("DOMContentLoaded", onRouteChange);
        window.addEventListener("popstate", onRouteChange);
    }

    var publishStream = new Bacon.Bus();  // Here we can put init things.
    publishStream.onValue(utils.attachGuardToLinks);

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();

    var ups = new Upstream();
    var whenCount = 0;
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .map( Counter.decrease )
        .filter(function(value) {
            return 0 === value;
        })
        .map( ups.pop ) 
        .merge(nullifyScan)
        .scan({}, function(oldVal, newVal) {
            if (newVal == 'nullify') {
                oldVal = {};
            } else {
                oldVal[newVal.render.viewName] = newVal;
                console.log('oldVal', oldVal);
            }
            return oldVal;
        })
        .changes()
        .filter( function(upstream) { return 0 === --whenCount; } )

    renderEndStream
        .onValue( function(){
            whenCount = 0; 
            console.log('nullify!')
            nullifyScan.push('nullify');
            setTimeout( onRenderEnd, 0);
        })

    var renderBeginStream = new Bacon.Bus();

    var stateR = { isRendering: false }; // Show state of rendering 

    /* marking StateR.isRendering to show is in the process of rendering or not*/
    renderEndStream
        .map( function() { return false; } ) 
        .merge(renderBeginStream.map( function() { return true }))
        .scan(false, function(oldVal, newVal){
            stateR.isRendering = newVal;
            return newVal; 
        })
        .onValue();

    var firstRender = renderEndStream 
        .onValue(function(value) { 
            if ( prefs.root && prefs.parentOf[prefs.root] ) throw new Error('Cannot attach inner view');
            console.log('firstRender:value', value)
            prefs.render.attach(prefs.rootElement, renderedComponent)
        });
        
    var routeChangedStream =  publishStream
        .merge( Bacon.fromBinder(function(sink) {
            // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
            var routeChanged = function(event) { 
                event.preventDefault();
                var path = ( event.detail ) ?  utils.parseUrl( event.detail.url ).pathname :  utils.getLocation();
                sink( { path: path } ); 
            };
            window.addEventListener( 'popstate', routeChanged );
            window.addEventListener( 'pushstate', routeChanged );
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
        .map( function(upstream) { whenCount++; return upstream; })
        .map( s.logIt('Otherwise is in work.') );

 
    /* Base */

    /**
     * When
     */
    var when = function(){
        var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
        var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName) );

        return function(masks, matchingBehaviour, whenOrFinally) {
            s.type(masks, 'string');
            if ( -1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.') 
            masks = masks.split('||').map(s.trim);

            if ( 0 === masks.length || 1 === masks.length && '' === masks[0] ) masks = lastMasks; 
            lastMasks = masks; 

            if ( 0 === masks.length || 1 === masks.length && '' === masks[0] ) throw new Error('At least one route mask should be specified.');
            State.first();
            var name = ( whenOrFinally === WhenFinally.finally ? 'finally' : '' )  + createNameFromMasks(masks);

            var whenId = _.uniqueId();        
            var ups = new Upstream();
            var additionalMasks = [];
            var finallyStream = ( WhenFinally.when === whenOrFinally ) ? new Bacon.Bus() : lastFinallyStream;
            
            if ( WhenFinally.when === whenOrFinally ) {
                lastFinallyStream = finallyStream;

                masks.forEach(function(mask) {
                    s.push({mask: mask}, routes);
                    s.push(utils.getPossiblePath(mask), additionalMasks);
                    s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
                });

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
                    whenCount++;
                    log('Matched route!', upstream);
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

            viewName = viewName || prefs.view;

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
                    if ( result instanceof Promise ) {
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

    /**
     *  Use this method to publish routes when 
     */
    var _publish = function(path){
        if (path) s.type(path, 'string');
        publishStream.push({published:true, path:path});
    }

    var _set = function( properties ) {
        var allowedProps = [ 'view', 'render' ];
        var wrongProps = s.compose( s.notEq( -1 ), allowedProps.indexOf.bind(allowedProps) ); 
        var propsGuard = s.filterKeys( wrongProps );
        var fillProps = s.compose( s.inject(this), s.merge( prefs ), propsGuard );
            
        fillProps(properties);
        
        return this;
    }

    var _onRenderEnd = function(callback) {
        onRenderEnd = callback; 
        return this;
    }

    var _attachTo = function(element) {
        prefs.rootElement = element;
        return this;
    }

    var _root = function(root) {
        prefs.root = root;
        return this;
    }

    var _log = function() {
        var arr = s.a2a(arguments).slice();
        var action = s.reduce( function( fn, argument) { return fn.bind(console, argument); }, console.log.bind(console, arr.shift() ));
        _do.call(this, action(arr));
        return this;
    }   

    return {
        // Set atlant preferencies
        set:_set
        ,views: _views
        ,when: _when
        ,lastWhen: _lastWhen
        ,otherwise: _otherwise
        ,finally: _finally
        // Depends execution glued to when
        ,depends: _depends
        ,and: _and
        ,inject: _inject
        ,if: _if
        ,filter: _if
        ,do: _do
        ,map: _do
        // Render methods:
        // Render should return either the Promise either the something. Promise will be threated async.
        ,render: _render
        // Clears view. Simply alias to render with empty view
        ,clear: _clear
        ,redirect: _redirect
        ,skip: _skip
        ,publish: _publish
        ,renders: { react: reactRender, simple: simpleRender }
        ,onRenderEnd: _onRenderEnd

        ,log: _log
        /* attach calls .attach method of Render.render once the first time everything is rendered. */
        ,attachTo: _attachTo
        /* parameter which will be send to Render.render.attach on attach() execution */
        ,root: _root
    };

});

module.exports = atlant();


!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Atlant=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
/**

 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 * @TODO: check(true) to check only this view params (by specifically set fields or somehow)
 * @TODO: depCache to check only this dep params (by specifically set fields or somehow)
 */

function Atlant(){
    var s = _dereq_('./lib')
        ,simpleRender = _dereq_('./renders/simple')
        ,reactRender = _dereq_('./renders/react')
        ,DepCache = _dereq_('./inc/dep-cache')
        ,utils = _dereq_('./utils')
        ,Upstream = _dereq_('./upstream.js')
        ,Counter = _dereq_('./counter.js')()
        ,Bacon = window.Bacon
        ,_ = window._
        ,interfaces = _dereq_('./inc/interfaces');

    var depCache = new DepCache();
    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
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

    var injectsGrabber = new interfaces.injectsGrabber();
    var whenCounter = new interfaces.whenCounter();

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
        _.extend( this, {lastWhen: void 0, lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0} );
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
        ,move: parseInt(_.uniqueId())
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

    /* Helpers */
    var assignRenders = function(){

        var whenRenderedSignal = function( upstream ) {
            // Signalling that view renders
            renderStreams.whenRenderedStream.push(upstream);
            
            // signal for finally construct
            if ( !upstream.isFinally && upstream.finallyStream) {
                upstream.finallyStream.push(upstream);
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if ( atlantState.viewRendered[upstream.render.viewName] ) { 
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
                        if( ! renderState[upstream.render.renderId] ) { 
                            renderState[upstream.render.renderId] = scope;
                        } else if ( false  && prefs.checkInjectsEquality && _.isEqual ( scope, renderState[upstream.render.renderId] )) {
                            console.log('Atlant.js: Render cache enabled: no parameters changed. Skiping rendering of ', viewName)
                            whenRenderedSignal(upstream);
                            return;
                        } else {
                            renderState[upstream.render.renderId] = scope;
                        }

                        var viewProvider = s.dot('.render.renderProvider', upstream); 

                        // Choose appropriate render.
                        var render;
                        if (RenderOperation.redirect === upstream.render.renderOperation ){
                            if ('function' === typeof viewProvider) {
                                upstream.doLater = function(){utils.goTo(viewProvider(scope))}
                            } else {
                                upstream.doLater = function(){utils.goTo(viewProvider)}
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.move === upstream.render.renderOperation){

                            if ('function' === typeof viewProvider) 
                                window.location.assign(viewProvider(scope))
                            else 
                                window.location.assign(viewProvider)

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

        return function() {
            if ( isRenderApplyed ) return;

            isRenderApplyed = true
            for(var viewName in renders) {
                s.map(assignRender, renders[viewName]);
            }

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
                                        )( dep );
                
                stream = stream 
                    .map(clientFuncs.createScope)
                    .flatMap(function(scope) { 
                        if (depCache.has(depName, scope)) {
                            console.log('Atlant.js: Depends cache enabled: no parameters changed. Skipping accessing of dependation')
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
                    var stream = injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);

                    return stream;
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

        return function(dependency, dependsBehaviour ) {
            if ( ! state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (state.lastDepName ? state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = state.lastOp;
            if (dependsBehaviour === Depends.parallel) {
                lastOp = state.lastIf || state.lastWhen;
            }

            injectsGrabber.init(depName, state);

            var thisDep = createDepStream(lastOp, depName, dependency, state.lastInjects )

            if( dependsBehaviour === Depends.parallel && state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = state.lastDep.zip( thisDep, zippersJoin( state.lastDepName, depName ) );
            }

            state.lastDep = thisDep;
            state.lastDepName = depName;
            state.lastOp = state.lastDep;

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
        .onValue( function(upstreams){
            renderStreams.nullifyScan.push('nullify');

            if (window) lastPath = utils.getLocation();

            var redirect = [];
            s.map(function(upstream){ 
                if(upstream.doLater) {
                    redirect.push(upstream.doLater);   
                } 
            }, upstreams);

           redirect
               .filter(function(x){return x}) 

            if(!redirect.length) {
                prefs.render.on
                    .renderEnd('root')
                    .then(function(){
                        var scopeMap = s.map(clientFuncs.createScope, upstreams)
                        return onRenderEndStream.push(scopeMap);
                    })
                    .catch(function(e){
                        errorStream.push(e);
                    })
            } else {
                var scopeMap = s.map(clientFuncs.createScope, upstreams)
                onRenderEndStream.push(scopeMap);
                setTimeout(redirect[0]);
            }
            return upstreams;
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
                    .catch(function(e) {
                        console.error(e.message, e.stack); 
                        errorStream.push(e);
                    })
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
            var name = name + createNameFromMasks(masks) + _.uniqueId();

            var whenId = _.uniqueId();        
            var ups = new Upstream();
            var additionalMasks = [];
            var finallyStream = ( WhenFinally.finally !== whenType ) ? new Bacon.Bus() : lastFinallyStream;

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, state);

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
                            .filter(function() { if(WhenFinally.match === whenType) return true; else return ! atlantState.isLastWasMatched; }) // do not let stream go further if other is already matched.
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
                        upstream.isMatch = WhenFinally.match === whenType;
                        upstream.finallyStream = finallyStream;
                        whenCount.value++;
                        var depData = {location: upstream.path, mask: upstream.route.mask};
                        var stream = injectsGrabber.add(name, depData, injects, upstream);
                        return stream; 
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
                    .map(ups.join(void 0, void 0))
                    .map(function(upstream) {
                        var depData = {location: upstream.path, mask: void 0};
                        var stream = injectsGrabber.add(name, depData, injects, {});
                        stream.isFinally = true;
                        stream.whenId = whenId;
                        whenCount.value++;
                        stream.route = { whenNot: masks };
                        return stream;
                    })
            }

            state.lastWhen = state.lastWhen.map( function(stream) { stream.conditionId = whenId; return stream; })

            state.lastWhen
                .onValue( function(upstream) {
                    console.log('----Matched route!', upstream);
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        log('----------------Redirect:',upstream);
                        utils.goTo(upstream.redirectTo);
                    }
                });

                
            // whenCounter.add(state.lastWhen, whenCount);

            state.lastIf = void 0;
            state.lastDep = void 0;
            state.lastDepName = void 0;
            state.lastOp = state.lastWhen;
            state.lastConditionId = whenId;

            State.print('___When:'+JSON.stringify(masks), state);


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

    var _otherwise = function(){ //@TODO create mixins for this
        State.first();

        var whenId = _.uniqueId(); 
        var depName = 'otherwise_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, state);

        state.lastWhen = otherWiseRootStream
            .map( function(depValue) { 
                var stream = injectsGrabber.add(depName, depValue, injects, {})
                stream.otherwise = true;
                stream.conditionId = whenId;
                whenCount.value++;
                console.log('---Matched otherwise!!!')
                return stream; 
            })

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = void 0;
        state.lastOp = state.lastWhen;
        state.lastConditionId = whenId; 

        // whenCounter.add(state.lastOp, whenCount);

        State.print('___Otherwise:', state);

        return this;

    };

    var _action = function(action){
        State.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var whenId = _.uniqueId(); 
        var depName = 'action_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, state);

        state.lastWhen = action
            .map( function(depValue) { 
                var stream = injectsGrabber.add(depName, depValue, injects, {})
                resetRouteState();

                stream.action = true;
                stream.conditionId = whenId;

                whenCount.value++;
                atlantState.viewRendered = {}; // the only thing we can nullify.
                console.log('---Matched action!!!')

                return stream;
            })

        // whenCounter.add(state.lastWhen, whenCount);

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = depName;
        state.lastOp = state.lastWhen;
        state.lastConditionId = whenId; 

        State.print('___action:', state);

        return this;

    };

    var _error = function(){
        State.first();

        var whenId = _.uniqueId(); 
        var depName = 'error_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, state);

        state.lastWhen = errorStream
            .map( function(depValue) { 
                resetRouteState();
                var stream = injectsGrabber.add(depName, depValue, injects, {})

                stream.error = true;
                stream.conditionId = whenId;

                atlantState.viewRendered = {}; // the only thing we can nullify.

                whenCount.value++;
                console.log('---Matched error!!!')
                return stream;

            })
            .map(s.logIt('error stream'))

        // whenCounter.add(state.lastWhen, whenCount);

        state.lastIf = void 0;
        state.lastDep = void 0;
        state.lastDepName = depName;
        state.lastOp = state.lastWhen;
        state.lastConditionId = whenId; 

        State.print('__error:', state);

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
        var ups = new Upstream();

        var depName = 'if_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, state);

        var thisIf = state.lastOp
            .map( ups.push )
            .map(clientFuncs.createScope)
            .filter(s.compose(
                                clientFuncs.applyScopeD 
                                ,s.tryD
                              )(fn))
            .map( ups.pop )
            .map( function(upstream) { 
                var stream = injectsGrabber.add(depName, {}, injects, upstream);
                whenCount.value++;
                console.log('---Matched if!!!')
                stream.conditionId = ifId;
                return stream;
            })


        state.lastIf = thisIf; 
        state.lastOp = state.lastIf;
        state.lastConditionId = ifId;

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
     
    var _move = function(redirectProvider) {
        return render.bind(this)(redirectProvider, void 0, RenderOperation.move);
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
    // Creates stream which will be called when render error is happend
    this.error = _error;
    // Creates custom stream which accepts Bacon stream
    this.action = _action;
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
    // Soft atlant-inside redirect.
    this.redirect =  _redirect;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
    this.move = _move;
    this.skip =  _skip;
    this.publish =  _publish;
    this.renders =  { react :  reactRender, simple :  simpleRender };

    this.onRenderEnd =  _onRenderEnd;
    this.attachTo =  _attachTo;
    this.stringify =  _stringify;

    // Returns child view component
    this.get =  _get;
    this.version = '0.3.0';
    this.build = "1412607412370";
    this.revision = "34d86b926965e64ec5b8ff86cb701266f426844c";

    return this;

};

module.exports = Atlant;



},{"./counter.js":2,"./inc/dep-cache":3,"./inc/interfaces":4,"./inc/wrapPushState.js":5,"./lib":6,"./render-streams":7,"./renders/react":8,"./renders/simple":9,"./upstream.js":10,"./utils":11}],2:[function(_dereq_,module,exports){
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
var s = _dereq_('../lib')

//
// Cache. Infinity one.
var depCache = function() {
    var cache = {};

    this.has = function(name, scope) {
        var key = name + JSON.stringify(scope);
        return cache.hasOwnProperty(key);
    }
    this.get = function(name, scope) {
        var key = name + JSON.stringify(scope);
        return cache[key];
    }
    this.put = function(name, scope, dep) {
        var key = name + JSON.stringify(scope);
        cache[key] = dep
        return dep;
    }
}
module.exports = depCache;


},{"../lib":6}],4:[function(_dereq_,module,exports){
    // Help in creating injects tail
    // Include this before declaring streams: "var injects = prepare4injectsInit();"
    
var injectsGrabber = function() {
    this.init = function(depName, state) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!')
        var injects = {};
        state.lastInjects = injects // Here we will store further injects with ".inject"
        return injects;
    }
    // Add invocation when mapping stream.
    this.add = function(depName, depValue, injects, upstream) {
        if( !upstream.depends ) { upstream.depends = {}; } 
        upstream.depends[depName] = depValue;

        if( !upstream.injects ) upstream.injects = [];
        upstream.injects.push(injects);
        return upstream
    }
    return this;
}

var whenCounter = function() {
    this.add = function(stream, whenCount) {
        return stream // counter for whens 
            .onValue(function(upstream) {
                whenCount.value++;
            });
    }
    return this;
}

module.exports = { 
                injectsGrabber:injectsGrabber
                ,whenCounter: whenCounter
}

},{}],5:[function(_dereq_,module,exports){

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

},{}],6:[function(_dereq_,module,exports){
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

    var typeOf = _.curry(function( type, object ) {
        return type === typeof object;
    });
    

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

    var _ifelse = _.curry( function(condition, then, _else, value){
        if( condition( value ) ) return then(value);
        else return _else(value)
    });

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

    var simpleType = function(data, key) {
        return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
    }

    var isPromise = function(promise) {
        if ( promise && 'function' === typeof promise.then ) return true;
        else return false;
    }

    var tryD = function(fn, errorCallback){
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch(e) {
                console.error(e.message, e.stack);
                if( errorCallback) return errorCallback(e);
            }
        }
    };

    var baconTryD = function(fn) {
        return tryD(fn, function(e) { return Bacon.Error('Exception') })
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
    this.typeOf = typeOf;
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
    this.ifelse = _ifelse;
    this.type = type;
    this.isPromise = isPromise;
    this.simpleType = simpleType;
    this.tryD = tryD;
    this.baconTryD = baconTryD;
    /**
     * Depreated
     *
     * */
    this.guardWithTrue = guardWithTrue;
    this.resolveGuard = resolveGuard;
    this.Herald = Herald;

    return this;

})();

module.exports = s;

},{}],7:[function(_dereq_,module,exports){
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
        .merge(nullifyScan)
        .scan([], function(oldVal, newVal) {  // Gathering the upstreams which come here.
            if (newVal == 'nullify') {
                oldVal = []
                return oldVal
            }

            oldVal.push(newVal); 
            return oldVal;
        })
        .map( s.compose( ups2.push, ups2.clear ) )
        .map( ups.pop ) // Restoring stream which initially come
        .map( Counter.decrease )
        .filter( function(value) { return 0 === value; })
        .map( ups2.pop )  // Yes the counter now zero, so we can apply gathered streams together
        .changes()
        .merge(nullifyScan)
        .scan({}, function(oldVal, newVal) {  // creating hash of streams with viewName as key
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
        .filter(s.notEmpty) // Still this hash can be nullified, so stay aware.
        .changes()
        .filter( function(upstream) { return 0 === --whenCount.value; } ) // Here checking is there all whens are ended.

    return { 
        renderEndStream: renderEndStream 
        ,whenRenderedStream: whenRenderedStream  
        ,nullifyScan: nullifyScan 
    }
}

},{"./lib":6,"./upstream.js":10}],8:[function(_dereq_,module,exports){
"use strict";
var React = window.React
     ,s = _dereq_('./../lib')
     ,_ = window._

var State = function(){
    var wrappers = {}
        ,views = {}
        ,thises = {}
        ,instances = {};

        this.check = function(name) {
            if ( !wrappers[name] ) {
                wrappers[name] = React.createClass({
                    render: function(){
                        thises[name] = this;
                        if ( !views[name] ) views[name] = React.DOM.div(null); 

                        return views[name];
                    }
            })}    
            instances[name] = wrappers[name]();
        }

        this.getState = function(name) {
            return wrappers[name];
        }

        this.getInstance = function(name) {
            return instances[name];
        }

        this.getThis = function(name) {
            return thises[name];
        }

        this.set = function(name, view){
            views[name] = view;
            return void 0;
        }

        return this;
};

var Render = function() {
    var state = new State;

    this.name = 'React';

    this.render = function(viewProvider, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            console.time('rendering view ' + name);

            // get new component somehow.
            state.set(name, viewProvider(scope));  
            var instance = state.getThis('name');
            state.check(name);

            console.timeEnd('rendering view ' + name);
            return resolve(state.getInstance(name));  
        });

        return rendered;
    }

    this.clear = function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){

            state.set(name, React.DOM.div(null));
            state.check(name);

            return resolve(state.getInstance(name));
        });
    }

    this.attach = function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( !window ) throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            var root = state.getInstance(name);

            if ( !root ) { throw new Error('AtlantJs: Please use .render(component, "' + name + '") to render something') }

            try{
                React.renderComponent(root, element, resolve );
            } catch(e) {
                console.error(e.message, e.stack)

                var element = document.querySelector('#rootView');
                React.unmountComponentAtNode(element);

                reject(e);
            }

        });

        return attached;
    }

    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    this.stringify = function(name, options) {
        if ( options && options.static)
            return React.renderComponentToStaticMarkup(state.getInstance(name));
        else 
            return React.renderComponentToString(state.getInstance(name));
    }

    /* Can return inner view representation. For React.js it means React component */
    this.get = function(name, options) {
        state.check(name);
        var instance = state.getState(name);
        return instance;
    }

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })

    this.on = { 
        renderEnd: function(name) {
            return new Promise( function( resolve, reject) {
                var instance = state.getThis(name);
                try {
                    if (instance) { 
                        console.time('forcing update of root')
                        instance.forceUpdate(s.compose( console.timeEnd.bind(console, 'forcing update of root'), resolve));
                    } else {
                        resolve();
                    }
                } catch(e) { 
                    console.error(e.message, e.stack)
                    reject({error:e});

                    var element = document.querySelector('#rootView');
                    React.unmountComponentAtNode(element);
                }
            })
        }
        ,error:function(){
            // trying to restore...
            try{
                console.log('React:', React)
                // React.renderComponent(React.DOM.div('Hey! Error in the city!'), element, function(){console.log('view restored!')} );
                //instance.forceUpdate(resolve);
            } catch(e){
                console.error(e.message, e.stack)
            }
        }
    }

    window.render = this.on.renderEnd;

}

module.exports = Render;

},{"./../lib":6}],9:[function(_dereq_,module,exports){
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


},{}],10:[function(_dereq_,module,exports){
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

},{"./lib":6}],11:[function(_dereq_,module,exports){
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

        if ( event instanceof KeyboardEvent && 13 !== event.keyCode) return;

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

},{"./lib":6}]},{},[1])
(1)
});
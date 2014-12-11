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
        ,l = require('./inc/log')()
        ,simpleRender = require('./renders/simple')
        ,reactRender = require('./renders/react')
        ,DepCache = require('./inc/dep-cache')
        ,utils = require('./utils')
        ,Upstream = require('./upstream.js')
        ,Counter = require('./counter.js')()
        ,Bacon = require('baconjs')
        ,_ = require('lodash')
        ,interfaces = require('./inc/interfaces')
        ,StateClass = require('./inc/state');

    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);

    var depCache = new DepCache();
    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,renderNames = []
        ,viewNames = [];

    var cache = [];

    var lastCondition;
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
    var dependsName = new interfaces.dependsName();
    var transfersGrabber = new interfaces.transfersGrabber();
    var whenCounter = new interfaces.whenCounter();

    // State from current route. Updated on route Load.
    var lastPath // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        ,lastData // Data saved from last route.
        ,lastMask = []
        ,lastReferrer;

    //Action should be performed at route change.
    var onRouteChange = function() {
    }

    var State = new StateClass(); // State which up to any last conditional: when, if
    var TopState = new StateClass(); // State which up to when

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
        ,replace: parseInt(_.uniqueId())
        ,clear: parseInt(_.uniqueId())
        ,redirect: parseInt(_.uniqueId())
        ,move: parseInt(_.uniqueId())
        ,nope: parseInt(_.uniqueId())
    }

    var clientFuncs = function() {
        var convertPromiseD = s.curry(function(promiseProvider, upstream) {
            var promise = promiseProvider( upstream );
            if ( s.isPromise( promise ) ){
                promise = promise
                    .catch( function(e) {  
                        if (e.stack) { 
                            clientFuncs.catchError(e);
                        }
                        return Promise.reject(e)
                    })
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
            var warning = function(inject) { l.log('Atlant warning: inject accessor return nothing:' + inject) }
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
            //deleting the semaphore;
            if( upstream.isAction ) delete atlantState.actions[upstream.whenId]
            // Signalling that view renders
            if (upstream.isTask)
                renderStreams.taskRendered.push(upstream); 
            else 
                renderStreams.whenRenderedStream.push(upstream);

            // signal for finally construct
            if ( !upstream.isFinally && upstream.finallyStream) {
                upstream.finallyStream.push(upstream);
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if ( atlantState.viewRendered[upstream.render.viewName] && !upstream.isTask  ) { 
                whenRenderedSignal(upstream);
                return false; 
            } else { 
                // .nope() operation does nothing so no counting it
                // the task is non-blocked, so it should not block others
                if (upstream.render.renderOperation !== RenderOperation.nope && !upstream.isTask ) 
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
                            l.log('Atlant.js: Render cache enabled: no parameters changed. Skiping rendering of ', viewName)
                            whenRenderedSignal(upstream);
                            return;
                        } else {
                            renderState[upstream.render.renderId] = scope;
                        }

                        var viewProvider = s.dot('.render.renderProvider', upstream); 

                        // Choose appropriate render.
                        var render;
                        if (RenderOperation.nope === upstream.render.renderOperation ){
                            whenRenderedSignal(upstream);

                            return;
                        }

                        if (RenderOperation.redirect === upstream.render.renderOperation ){
                            if ('function' === typeof viewProvider) {
                                upstream.doLater = function(){utils.goTo(viewProvider(scope))}
                            } else {
                                upstream.doLater = function(){utils.goTo(viewProvider)}
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.replace === upstream.render.renderOperation ){
                            upstream.doLater = function(){utils.replace(s.apply(viewProvider, scope))}

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

                            l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
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
            var match = utils.matchRoute(path, route.mask);

            return match ? { params:match, route:route } : null;
        }


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

        var treatDep = s.compose(  clientFuncs.convertPromiseD
                                    ,s.promiseTryD
                                );

        var createDepStream = function(stream, depName, dep, injects) {
            var ups = new Upstream();

            var nameContainer = dependsName.init(depName, State.state);

            stream = stream
                .map( dependsName.add.bind(dependsName, depName, nameContainer) )
                .map( ups.fmap(_.extend) )

            if ('function' !== typeof dep) {
                stream = stream
                    .map( s.inject(dep) )
            } else {  
                var treat = treatDep( dep );        

                stream = stream 
                    .map(clientFuncs.createScope)
                    .flatMap(function(scope) { 

                        // Using data transfered from previous route instead of accessing the dependency
                        var upstream = ups.getLast();
                        if (lastData && upstream.ref) {
                            var mask = utils.getPattern(lastMask);

                            // look in lastData only for current mask
                            var data = s.filterKeys(function(dataMask){ return mask === dataMask }, lastData);
                            lastData = void 0;

                            // merge all depend names into one list
                            data = s.reduce(function(xs, x){ return _.merge(xs, x) }, {}, data);

                            if (data.hasOwnProperty(upstream.ref)) {
                                return Bacon.constant(data[upstream.ref]);
                            }
                            


                        }

                        // Using cache instead of accessing dependency
                        if (false && depCache.has(depName, scope)) {
                            l.log('Atlant.js: Depends cache enabled: no parameters changed. Skipping accessing of dependation')
                            return Bacon.constant(depCache.get(depName, scope));
                        }
                        else { 
                            var stream = treat(scope)
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
            if ( ! State.state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === Depends.parallel) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

             
            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, depName, dependency, State.state.lastInjects )

            if( dependsBehaviour === Depends.parallel && State.state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = State.state.lastDep.zip( thisDep, zippersJoin( State.state.lastDepName, depName ) );
            }

            State.state.lastDep = thisDep;
            State.state.lastDepName = depName;
            State.state.lastOp = State.state.lastDep;

            State.print(depName, State.state);
            return this;
        };
    }();

    var _name = function(name) {
        dependsName.tailFill(name, State.state);            
        return this
    }
    
    var _transfer = function(depends) {
        transfersGrabber.tailTransfer(depends, TopState.state);
        return this
    }

    var _to = function(name) {
        transfersGrabber.tailTo(name, TopState.state);
        return this
    }

    /* Base and helper streams*/
    l.log('registering base streams...');

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

            if (window) lastPath = utils.getLocation();

            // collect data for  .transfer() 
            //@TODO do it only when need
            lastData = s.reduce(function(xs, x){
                var foldDeps = s.reduce(function(ax, a){
                                    var obj = {};
                                    obj[a] = x.depends[x.refs[a]];
                                    return _.merge(ax, obj) }
                                   , {});

                var dx = s.map( foldDeps, x.transfers);

                return _.merge(xs, dx);
            }, {}, upstreams)

            //@TODO move into module the redirects section
            var redirect = [];
            s.map(function(upstream){ 
                if(upstream.doLater) {
                    redirect.push(upstream.doLater);   
                } 
            }, upstreams);

           redirect
               .filter(function(x){return x}) 

            if (redirect.length){
                var scopeMap = s.map(clientFuncs.createScope, upstreams)
                onRenderEndStream.push(scopeMap);
                setTimeout(redirect[0]);
            }
            // end redirect/

            if(Object.keys(upstreams).length) {

                var allRendered = Promise.all( 
                    Object.keys(upstreams)
                        .filter(function(x){ return x.doLater === void 0})
                        .map(function(x){ return prefs.render.on.renderEnd(x) })
                )

                allRendered
                    .then(function(){
                        var scopeMap = s.map(clientFuncs.createScope, upstreams)
                        return onRenderEndStream.push(scopeMap);
                    })
                    .catch(function(e){
                        errorStream.push(e);
                    })
            }

            return upstreams;
        })

    var renderBeginStream = new Bacon.Bus();

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
                var routeChanged = function(event) { 
                    event.preventDefault();
                    var parsed = ( event.detail ) ? utils.parseURL( event.detail.url ) : void 0;
                    var path = ( parsed ) ?  parsed.pathname + '?' + parsed.search :  utils.getLocation();
                    l.log('the route is changed!')
                    if (path !== lastPath) {
                        sink({ 
                            path: path 
                            ,referrer: lastPath
                            // ,referrerPattern: lastPattern
                        }); 
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
        .map(function(upstream){ 
            var stream;
            if ( upstream.path ) { // get from sink
                stream = upstream;
            } else { // get from published
                stream = { 
                    path: utils.getLocation()
                    ,referrer: utils.getReferrer()
                }
            }

            return stream;
        })
        .filter( s.compose( s.empty, s.flip(matchRoutes, 3)(Matching.continue, prefs.skipRoutes), s.dot('path') )) // If route marked as 'skip', then we should not treat it at all.
        .map(function(upstream) { 
            // Storing here the data for actions.
            lastPath = upstream.path; 
            lastReferrer = upstream.referrer;
            lastMask = [];

            // Nil values.
            whenCount.value = 0; 
            renderStreams.nullifyScan.push('nullify');
            resetRouteState();
            renderBeginStream.push();
            return upstream;
        });

    var atlantState = {
        viewRendered: {} // Flag that this view is rendered. Stops other streams to perform render then. 
        ,isLastWasMatched: false // Allow lastWhen to stop other when's execution 
        ,isRedirected: false
        ,actions: {}
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
            TopState.first();

            var name = '';
            if (whenType === WhenFinally.finally) name = 'finally';
            if (whenType === WhenFinally.match) name = 'match';
            var name = name + createNameFromMasks(masks) + _.uniqueId();

            var whenId = _.uniqueId();        
            var ups = new Upstream();
            var additionalMasks = [];
            var finallyStream = ( WhenFinally.finally !== whenType ) ? new Bacon.Bus() : lastFinallyStream;

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, State.state);
            var transfers = transfersGrabber.init(TopState.state);

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

                State.state.lastWhen = rootStream
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

                        // Storing here the data for actions.
                        lastMask.push(upstream.route.mask);

                        var params = s.reduce(function(result, item) { result[item] = upstream.params[item]; return result;}, {} , _.keys(upstream.params))
                        var depData = s.merge( params, {
                                               location: upstream.path 
                                              ,mask: upstream.route.mask
                                              ,masks: lastMask
                                              ,pattern: utils.getPattern(lastMask)
                                              ,referrer: upstream.referrer
                        });

                        var stream = injectsGrabber.add(name, depData, injects, upstream);
                        stream = transfersGrabber.add(transfers, upstream)
                        return stream; 
                    })
            } else {
                lastFinallyStream = void 0;
                
                State.state.lastWhen = rootStream
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
                        var depData = {location: upstream.path, mask: void 0, referrer: upstream.referrer};
                        var stream = injectsGrabber.add(name, depData, injects, {});
                        stream = transfersGrabber.add(transfers, upstream)
                        stream.isFinally = true;
                        stream.whenId = whenId;
                        whenCount.value++;
                        stream.route = { whenNot: masks };
                        return stream;
                    })
            }

            State.state.lastWhen = State.state.lastWhen.map( function(stream) { stream.conditionId = whenId; return stream; })

            State.state.lastWhen
                .onValue( function(upstream) {
                    l.log('----Matched route!', upstream);
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        l.log('----------------Redirect:',upstream);
                        utils.goTo(upstream.redirectTo);
                    }
                });

                
            // whenCounter.add(State.state.lastWhen, whenCount);

            State.state.lastIf = void 0;
            State.state.lastDep = void 0;
            State.state.lastDepName = name;
            State.state.lastOp = State.state.lastWhen;
            State.state.lastConditionId = whenId;

            State.print('___When:'+JSON.stringify(masks), State.state);


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
        return when.bind(this)( masks, Matching.continue, WhenFinally.match );
    }

    var _finally = function() {
        return when.bind(this)( '', Matching.continue, WhenFinally.finally );
    }

    var _otherwise = function(){ //@TODO create mixins for this
        State.first();
        TopState.first();

        var whenId = _.uniqueId(); 
        var depName = 'otherwise_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        State.state.lastWhen = otherWiseRootStream
            .map( function(depValue) { 
                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;

                var stream = injectsGrabber.add(depName, depValue, injects, {})
                stream.otherwise = true;
                stream.conditionId = whenId;
                whenCount.value++;
                l.log('---Matched otherwise!!!')
                return stream; 
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = void 0;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId; 

        // whenCounter.add(State.state.lastOp, whenCount);

        State.print('___Otherwise:', State.state);

        return this;

    };

    var _action = function(action, isTask){
        State.first();
        TopState.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var whenId = _.uniqueId(); 
        var depName = 'action_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var transfers = transfersGrabber.init(TopState.state);

        State.state.lastWhen = action
            .map( function(depValue) { 
                if ( 'undefined' === typeof depValue ) {
                    depValue = {}
                }
                if ('object' === typeof depValue) {
                    depValue.masks = lastMask;
                    depValue.pattern = utils.getPattern(lastMask);
                    depValue.mask = void 0;
                    depValue.location = lastPath;
                    depValue.referrer = lastReferrer;
                }

                // Check if this action now active - prevents double-click
                var stream = injectsGrabber.add(depName, depValue, injects, {});
                stream = transfersGrabber.add(transfers, stream);
                resetRouteState();

                stream.action = true;
                stream.conditionId = whenId;
                stream.isTask = isTask;

                if ( !isTask ) whenCount.value++;
                atlantState.viewRendered = {}; // the only thing we can nullify.
                l.log('---Matched action!!!', depValue)
                
                atlantState.actions[whenId] = depValue;
                return stream;
            })

        // whenCounter.add(State.state.lastWhen, whenCount);

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId; 

        State.print('___action:', State.state);

        return this;

    };

    var _error = function(){
        State.first();
        TopState.first();

        var whenId = _.uniqueId(); 
        var depName = 'error_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        State.state.lastWhen = errorStream
            .map( function(depValue) { 
                resetRouteState();

                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;

                var stream = injectsGrabber.add(depName, depValue, injects, {})

                stream.error = true;
                stream.conditionId = whenId;

                atlantState.viewRendered = {}; // the only thing we can nullify.

                whenCount.value++;
                l.log('---Matched error!!!')
                return stream;

            })

        // whenCounter.add(State.state.lastWhen, whenCount);

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId; 

        State.print('__error:', State.state);

        return this;
    };

    /**
    	if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function(boolTransform, fn) {
        s.type(boolTransform, 'function');

        var oldFn = fn;
        fn = s.compose(boolTransform, fn);

        if ( ! State.state.lastOp ) { throw new Error('"if" should nest something.'); }

        State.divide();
        var ifId = _.uniqueId();
        var ups = new Upstream();

        var isElse = (lastCondition === fn && lastCondition !== void 0);
        var depName = isElse ? 'else_' : 'if_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        var thisIf = State.state.lastOp
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
                if( isElse) 
                    l.log('---Matched else!!!')
                else
                    l.log('---Matched if!!!')

                l.log('---condition: (', oldFn, ')(scope) === ', true)

                stream.conditionId = ifId;
                return stream;
            })

        if(!isElse) lastCondition = fn;
        State.state.lastIf = thisIf; 
        State.state.lastOp = State.state.lastIf;
        State.state.lastConditionId = ifId;

        State.print('_if__After:', State.state);

        return this;
    }

    var _else = function() {
        if ( !lastCondition ) { throw new Error('"else" should follow if')}
        var fn = lastCondition;
        lastCondition = void 0;
        _if( s.negate.bind(this,fn) );
        return this
    }

    var _end = function() {
        if (void 0 !== State.state.lastIf) State.rollback();
        return this
    }

    /**
    	Received - every depends include this stream after execution
     * @param fn
     */
    var _received = function() {

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
        if ( ! State.state.lastDepName ) throw new Error('.inject should follow .depends');

        State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression };

        return this;
    }

    var _join = function( key, expression ) {
        s.type(key, 'string');
        State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression, injects: Array.prototype.slice.apply(State.state.lastInjects) };

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
    var _render = function(renderProvider, viewName, renderOperation){
            if ( ! State.state.lastOp ) throw new Error('"render" should nest something');
            
            if ( 'function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != RenderOperation.nope ) {
                throw new Error('Atlant.js: render first param should be function or URI')
            } 
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')

            viewName = viewName || s.tail(prefs.viewState);

            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            if ( renderOperation === RenderOperation.nope ) viewName = void 0; 

            Counter.increase(State.state);
            var renderId = _.uniqueId();

            var ups = new Upstream();

            var thisRender = State.state.lastOp
                .map(ups.fmap(_.extend))
                .map(function() { return { renderId: renderId, renderProvider: renderProvider, viewName:viewName, renderOperation:renderOperation}; })
                .map(ups.join('render', void 0))

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if( ! viewReady[viewName]) viewReady[viewName] = new Bacon.Bus(); // This will signal that this view is rendered. Will be used in onValue assignment.

            if (void 0 !== State.state.lastIf) State.rollback();

            State.print('_____renderStateAfter:', State.state);
            return this;
    };

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
        if ( ! State.state.lastOp ) throw new Error('"do" should nest something');
        s.type(actionProvider, 'function');
        var doId = _.uniqueId();

        var thisDo = State.state.lastOp
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

        State.state.lastOp = thisDo;
        State.print('_do__After:', State.state);

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
        if (prefs.render) throw new Error('You can specify render only once.'); 

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

    var _await = function(shouldAWait) {
        utils.goTo = safeGoToCopy.bind(utils, shouldAWait);
        return this
    }

    var _verbose = function(on) {
        l.verbose(on);
        return this
    }

    var _view = function(name) {
        return prefs.render.get(name);
    }

    var _redirectTo = function(url) {
        return utils.goTo(url)
    }

    var _moveTo = function(url) {
        if( 'undefined' !== typeof window) 
            return window.location.assign(url)
        else
            console.error('Atlant.js: no window object...')
    }

    var _parse = function(path, mask){
        return utils.matchRoute(path, mask)
    }

    var _parseAll = function(path, masks){
        return masks
            .map(function(i){ 
                return [i, ('/' !== i[i.length-1]) ? i + '/' : i.slice(0, i.length-2)];
            })
            .reduce(function(v,i) { return v.concat(i); })
            .map(utils.matchRoute.bind(utils, path), masks)
            .reduce( function(v, i) { return _.merge(v, i) }, {})
    }
    // Will destruct all data structures.
    var _destruct = function() {
        return this;
    }

    // Set view active by default (no need to mention in second parameter of .render
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
    // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
    // this.catch = _catch;
    // Creates custom stream which accepts Bacon stream
    this.action = function(action) { return _action.call(this, action, true); }
    // Creates custom stream which accepts Bacon stream. The difference with action is that this task will be performed immediatelly without waiting of other tasks to execute. ( if action happed and not end till other action happend, then this 2 actions will end zipped, simultaneusly, i.e. first action will wait second to finish).
    this.task = function(action) { return _action.call(this, action, true); }
    // creates branch which can destruct all what declared by .when() or .match()
    this.finally =  _finally;
    this.depends =  _depends;
    /*
     * The same as ".depends()", but executes only after last ".depends()" or ".and()" ends.
     * */
    this.and =  _and;
    /*
     * Allows give name for .depends()
     */
    this.name = _name;
    /**
     * Allow to define array of depend names which will be transfered if user goes from current when/action to route/action defined in .to()
     * */
    this.transfer = _transfer;
    /**
     * Allow to define array of routes, which will receive array of transfered depends 
     * */
    this.to = _to;

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
    // Will accept the same scope as .and(), .render(), .if()
    this.join = _join;
    // Creates new branch if computated callback is true. Warning: the parent branch will be executed still. Render it with .nope() if no render should happend.
    this.if = _if.bind(this, s.id); 
    this.unless =  _if.bind(this, s.negate);

    /**
     * Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
     */
    this.log =  _log;
    /* If true then view will be re-rendered only when injects are changed. Accepts boolean. Default true */
    this.check = _check;
    /* wait or not for resources loading when going to next route when link tapped */
    this.await = _await;

    // Display all internal messages.
    this.verbose = _verbose;

    /* Renders the view. first - render provider, second - view name */
    this.render = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, RenderOperation.render);}
    /* Renders the view. first - render provider, second - view name. Not waiting for anything - draws immediatelly\ */
    // this.draw = _draw; 
    /* clears provided viewName */
    this.clear = function(viewName) {return _render.bind(this)(function(){}, viewName, RenderOperation.clear);}
    // Soft atlant-inside redirect.
    this.redirect = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, RenderOperation.redirect);}
    // Alias for redirect
    this.go =  this.redirect;
    //  Fake redirect. Atlant will just change URL but routes will not be restarted.
    this.replace = function(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, RenderOperation.replace);}
    // Force redirect event to current route
    // this.force = _.force;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
    this.move = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, RenderOperation.move);}
    // render which render nothing into nowhere
    this.nope = function(){ return _render.bind(this)(void 0, void 0, RenderOperation.nope)}

    // This routes will be ignored by atlant even if they are declared by .when() or .match()
    this.skip =  _skip;

    // Use this when you finished declaring routes and want to start routing. Can be used for drawing another route at current route without redirect (accepts url).
    this.publish =  _publish;
    // Contains available renders
    this.renders =  { react :  reactRender, simple :  simpleRender };

    // Called everytime when route/action is rendered.
    this.onRenderEnd =  _onRenderEnd;
    // Accepts element. After publish and first render the contents will be attached to this element.
    this.attachTo =  _attachTo;
    // After publish and first render the contents will be transferet to callback (first parameter).
    this.stringify =  _stringify;


    //These commands doesn't return "this".

    // Returns child view component
    this.get =  _get;
    // Returns atlant.js version
    this.version = require('AtlantVersion');
    // Returns timestamp of the creation time
    this.build = require('AtlantBuild');
    // Returns commit id just before current atlant.js commit
    this.revision = require('AtlantRevision');

    this.utils = { 
        // parse :: path -> mask -> {params}
        parse: _parse,
        // parseAll :: path -> [mask] -> {params}
        parseAll: _parseAll
    };
    // This command will immediatelly redirect to param url
    this.goTo = _redirectTo;
    // The alias of goTo
    this.redirectTo = _redirectTo;

    // Will hard redirect to param url (page will be reloaded by browser)
    this.moveTo = _moveTo;
    this.destruct = _destruct;

    return this;

};

module.exports = Atlant;



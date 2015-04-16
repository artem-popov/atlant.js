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
        ,utils = require('./utils')
        ,Upstream = require('./upstream.js')
        ,Counter = require('./counter.js')()
        ,Bacon = require('baconjs')
        ,_ = require('lodash')
        ,interfaces = require('./inc/interfaces')
        ,StateClass = require('./inc/state')
        ,clientFuncs = require('./inc/clientFuncs')
        ,baseStreams = require('./inc/base-streams')

    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);

    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,renderNames = []
        ,viewNames = [];

    var stores = {}
    var emitStreams = {};

    var viewSubscriptions = {};
    var viewSubscriptionsUnsubscribe = {};
    var savedViewScope = {};
    var cache = [];

    var activeStreamId = { value: void 0 }; // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
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
    var withGrabber = new interfaces.withGrabber();

    // State from current route. Updated on route Load.
    var lastPath // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
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
        async: _.uniqueId()
        ,continue: _.uniqueId()
    }

    var RenderOperation = {
        render: parseInt(_.uniqueId())
        ,draw: parseInt(_.uniqueId())
        ,replace: parseInt(_.uniqueId())
        ,change: parseInt(_.uniqueId())
        ,clear: parseInt(_.uniqueId())
        ,redirect: parseInt(_.uniqueId())
        ,refresh: parseInt(_.uniqueId())
        ,move: parseInt(_.uniqueId())
        ,nope: parseInt(_.uniqueId())
    }

    /* Helpers */
    var assignRenders = function(){

        // Signalling that view renders
        var whenRenderedSignal = function( upstream ) {
            if (!upstream.isAction && upstream.id !== activeStreamId.value) return // this streams should not be counted.

            if (upstream.render.renderOperation !== RenderOperation.draw && !upstream.isAction && !upstream.isAtom )
                renderStreams.whenRenderedStream.push(upstream); // This will count the renders

            if (upstream.render.renderOperation === RenderOperation.draw && !upstream.isAction || 'isAtom' in upstream && upstream.isAtom ) // Special draw stream also applyes to atoms: don't count these renders - they are brilliant.
                renderStreams.drawEnd.push(upstream);

            if ( upstream.render.renderOperation !== RenderOperation.draw && upstream.isAction && !upstream.isAtom )
                renderStreams.taskRendered.push(upstream);

            // signal for finally construct
            if ( !upstream.isFinally && upstream.finallyStream) {
                upstream.finallyStream.push(upstream);
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if (upstream.render.renderOperation === RenderOperation.nope || upstream.render.renderOperation === RenderOperation.draw || upstream.isAction || upstream.render.renderOperation === RenderOperation.move || upstream.render.renderOperation === RenderOperation.redirect || upstream.render.renderOperation === RenderOperation.replace || upstream.render.renderOperation === RenderOperation.change || upstream.isAtom )
                return true;

            if ( atlantState.viewRendered[upstream.render.viewName] >= activeStreamId.value ) {  // If this view is already rendered...
                whenRenderedSignal(upstream);
                return false;
            } else { // If this view not yet rendered...
                atlantState.viewRendered[upstream.render.viewName] = upstream.id;

                return true;
            }
        };

        var renderState = {};

        // Registering render for view.
        var assignRender = function(stream) {
            var theStream = stream
                .filter( renderStopper );

            baseStreams.onValue( theStream, function(upstream){
                    try{ 
                        var viewName = s.dot('.render.viewName', upstream);
                        savedViewScope[viewName] = clientFuncs.getScopeDataFromStream(upstream);

                        var scope = function() { return clientFuncs.createScope(savedViewScope[viewName]) };
                        var viewProvider = s.dot('.render.renderProvider', upstream);

                        // Choose appropriate render.
                        var render;
                        if (RenderOperation.nope === upstream.render.renderOperation ){
                            whenRenderedSignal(upstream);

                            return;
                        }

                        if (RenderOperation.redirect === upstream.render.renderOperation ){
                            if ('function' === typeof viewProvider) {
                                upstream.doLater = function(){utils.goTo(viewProvider(scope()))}
                            } else {
                                upstream.doLater = function(){utils.goTo(viewProvider)}
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } if (RenderOperation.refresh === upstream.render.renderOperation ){
                            upstream.doLater = function(){utils.goTo( window.location.pathname, void(0), true)}

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.replace === upstream.render.renderOperation ){
                            upstream.doLater = function(){
                                var path = s.apply(viewProvider, scope());
                                lastPath = path; 
                                utils.replace(path);
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.change === upstream.render.renderOperation ){
                            upstream.doLater = function(){
                                var path = s.apply(viewProvider, scope());
                                lastReferrer = lastPath;
                                lastPath = path;
                                utils.change(path);
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.move === upstream.render.renderOperation){

                            if ('function' === typeof viewProvider) 
                                window.location.assign(viewProvider(scope()))
                            else 
                                window.location.assign(viewProvider)

                            return;
                        } else {
                            if ( RenderOperation.render === upstream.render.renderOperation || RenderOperation.draw === upstream.render.renderOperation ) {
                                render = prefs.render.render
                            } else if ( RenderOperation.clear === upstream.render.renderOperation ){
                                render = prefs.render.clear
                            }


                            // turn off all subscriptions of atoms for this view
                            if( viewSubscriptions[viewName] ) viewSubscriptionsUnsubscribe[viewName](); // finish Bus if it exists;

                            // subscribe for every atom upstream to rerender view if need
                            viewSubscriptions[viewName] = baseStreams.bus();
                            viewSubscriptions[viewName] = _(upstream.atoms) // Add all atoms into this view stream
                                .reduce( function(bus, atom) {
                                    var putInfo = function(pushedValue){  // When data arrived, get info from static scope of atom details
                                            var stream = Object.create(null);
                                            stream.value = pushedValue;
                                            stream.name = atom.atom;
                                            stream.store = atom.store;
                                            return stream;
                                    };
                                    return bus.
                                            merge( atom.bus.map(putInfo) ); // these buses are not merged: we don't need to wait for all of them to continue
                                }, viewSubscriptions[viewName])

                            var renderIntoView = function(scope, isAtom) {
                                var renderD = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)
                                // l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
                                renderD(viewProvider, upstream, activeStreamId, viewName, scope)
                                    .then(function(_){
                                        // @TODO make it better
                                        // using copy of upstream otherwise the glitches occur. The finallyStream is circular structure, so it should be avoided on copy
                                        var atoms = upstream.atoms;
                                        upstream.finallyStream = void 0;
                                        upstream.atoms = void 0;

                                        var stream = s.clone(upstream); 
                                        
                                        stream.atoms = atoms;
                                        upstream.atoms = atoms;

                                        if(_.code && 'notActiveStream' === _.code){
                                        } else {
                                            stream.render.component = _;  // pass rendered component. it stale hold before streams get zipped.
                                            stream.isAtom = isAtom;
                                        }
                                        return stream 
                                    })
                                    .then( whenRenderedSignal )
                                    .catch( clientFuncs.catchError )
                            }

                            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue(function(atom){ // Actually we don't use streamed values, we just re-run scope creation on previous saved data. All values of atoms will be updated because they are the functions which retrieve data straightforvard from store.
                                var data = scope();
                                return renderIntoView(data, true) // Here we using scope updated from store!
                            });

                            renderIntoView(scope(), false);
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
        var tempRoutes =  routes
            .map(function(route) {
                return matchRouteLast( path, matchingBehaviour, route );
            })
            .filter(s.notEmpty)

        return s.head(tempRoutes);
    }

    /* depends */
    var _depends = function() {

        var createDepStream = function(stream, depName, dep, injects, store) {
            var nameContainer = dependsName.init(depName, State.state);
            var withs = withGrabber.init(State.state);

            stream = stream
                .map( dependsName.add.bind(dependsName, depName, nameContainer) )
                .map( withGrabber.add.bind(withGrabber, withs) )
                // .filter( function(_) { if(activeStreamId.value !== _.id && !_.isAction) console.log('---STOPPED1!', _.render.viewName, _.id, activeStreamId.value); return _.id === activeStreamId.value || _.isAction } ) // Checking, should we continue or this stream already obsolete.

            if ('function' !== typeof dep) {
                stream = stream
                    .map( function(upstream) { 
                        if (!upstream.depends) upstream.depends = {};
                        upstream.depends[depName] = dep;
                        return upstream;
                    })
            } else {

                stream = stream
                    .flatMap(function(upstream) {
                        var treatDep = s.compose(  clientFuncs.convertPromiseD
                                    ,s.promiseTryD
                                );

                        var treat = treatDep( dep );
                        var scope = clientFuncs.createScope(upstream);
                        var scopeData = (upstream.with && 'value' in upstream.with) ? upstream.with.value(scope) : scope;
                        
                        return treat(scopeData)
                            .map(function(results){
                                if ( !upstream.isInterceptor ) interceptorBus.push({upstream: upstream, scope: results}); // pushing into global data .interceptor() 
                                if (!upstream.depends) upstream.depends = {};
                                upstream.depends[depName] = results;

                                if ( 'undefined' !== typeof store ) upstream.atomId = scopeData; 

                                return upstream;
                            })
                    })
            }

            stream = stream
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    var stream = injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);

                    if ( !stream.atoms ) stream.atoms = {};

                    if ('undefined' !== typeof store) {
                        var atomBus = store.bus.map(function(storeValue){
                            try {
                                return s.copy(store.partProvider(storeValue, upstream.atomId));
                            } catch (e) {
                                return void 0;
                            }
                        }).skipDuplicates(_.isEqual).startWith(void 0); // @TODO contructore should be here. Use force my podovan.

                        stream.atoms[store.storeName + '.' + store.partName] = { id: upstream.atomId, store: store.storeName, atom: store.partName, bus: atomBus };
                    } 

                    return stream;
                })

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

        return function(dependency, dependsBehaviour, store ) {
            if ( ! State.state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === Depends.async) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, depName, dependency, State.state.lastInjects, store)

            if( dependsBehaviour === Depends.async && State.state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = State.state.lastDep.zip( thisDep, zippersJoin( State.state.lastDepName, depName ) );
            }

            State.state.lastDep = thisDep;
            State.state.lastDepName = depName;
            State.state.lastOp = State.state.lastDep;

            return this;
        };
    }();

    /* Base and helper streams*/
    l.log('registering base streams...');

    var publishStream = baseStreams.bus();  // Here we can put init things.
    var errorStream = baseStreams.bus();
    var onRenderEndStream = baseStreams.bus();
    var onDrawEndStream = baseStreams.bus();
    var interceptorBus = baseStreams.bus();

    // Browser specific actions.
    if ('undefined' !== typeof window) {
        require( './inc/wrapPushState.js')(window);

        // if angular, then use $rootScope.$on('$routeChangeSuccess' ...
        // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
        document.addEventListener("DOMContentLoaded", onRouteChange);
        window.addEventListener("popstate", onRouteChange);

        baseStreams.onValue(publishStream, utils.attachGuardToLinks);
    }


    var whenCount = { value: 0 };
    var renderStreams = require('./render-streams')(Counter, whenCount);

    var getRedirects = function(upstreams) {
        var redirect = [];
        s.map(function(upstream){
            if(upstream.doLater) {
                redirect.push(upstream.doLater);
            }
        }, upstreams);

       return redirect
           .filter(function(x){return x})

    }

    var performRender = function(upstreams) {
        if(Object.keys(upstreams).length) {
            return Promise.all(
                Object.keys(upstreams)
                    .filter(function(x){ return x.doLater === void 0})
                    .map(function(x){ return prefs.render.on.renderEnd(x) })
            )
        }
        return void 0
    }

    var performCallback = function(upstreams, allRendered, callbackStream, redirects) {
        if(Object.keys(upstreams).length) {
            allRendered
                .then(function(){
                    var scopeMap = s.map(clientFuncs.createScope, upstreams)
                    callbackStream.push(scopeMap);

                    if (redirects && redirects.length){
                        setTimeout(redirects[0]);
                    }

                })
                .catch(function(e){
                    log.error('Atlant Error:', e)
                    errorStream.push(e);
                })
        }
    }

    baseStreams.onValue( renderStreams.drawEnd, function(upstream){
            var upstreams = {};
            upstreams[upstream.render.viewName] = upstream;

            var allRendered = performRender(upstreams);
            if (allRendered) performCallback(upstreams, allRendered, onDrawEndStream);
    });

    /* Except .draw() every render get this*/
    
    baseStreams.onValue( renderStreams.renderEndStream, function(upstreams){
            var isAction = false;
            var firstUpstream = _(Object.keys(upstreams)).first();
            if (firstUpstream) firstUpstream = upstreams[firstUpstream];
            if ('isAction' in firstUpstream && firstUpstream.isAction) isAction = true;

            if (!isAction) renderStreams.nullifyScan.push('nullify'); // Do not nullify anything of action

            if (typeof window !== 'undefined') lastPath = utils.getLocation();

            var redirects = getRedirects(upstreams);
            var allRendered = performRender(upstreams);
            if (allRendered) performCallback(upstreams, allRendered, onRenderEndStream, redirects);

            return upstreams;
        })

    var renderBeginStream = baseStreams.bus();

    var firstRender = renderStreams.renderEndStream.take(1);
    baseStreams.onValue(firstRender, function(value) { // value contains all rendered upstreams.
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
                    if (path !== lastPath || event.detail.state.forceRouteChange) {
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
            activeStreamId.value = 0;
            Counter.reset();
            renderStreams.nullifyScan.push('nullify');

            atlantState.viewRendered = {};
            atlantState.isLastWasMatched = false;
            renderBeginStream.push();
            return upstream;
        });

    var atlantState = {
        viewRendered: {} // Flag that this view is rendered. Stops other streams to perform render then.
        ,isLastWasMatched: false // Allow lastWhen to stop other when's execution
        ,actions: {}
    }

    var rootStream = Bacon.fromBinder(function(sink) {
            baseStreams.onValue(routeChangedStream, function(_) {
                assignRenders();
                sink(_);
            });
        })
        .takeUntil(baseStreams.destructorStream)
        .map(function(upstream){
            var stream = Object.create(null); // Here we change id of the stream. Hence this is should be new object, because otherwise we will change all existed streams
            stream = _.extend(upstream)
            stream.id = _.uniqueId();
            activeStreamId.value = stream.id;
            return stream;
        })

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

            if (masks.filter(function(mask){ return '*' === mask}).length && whenType === WhenFinally.when) { throw new Error( 'Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")' ); }

            var name = '';
            if (whenType === WhenFinally.finally) name = 'finally';
            if (whenType === WhenFinally.match) name = 'match';
            name = name + createNameFromMasks(masks) + _.uniqueId();

            var whenId = _.uniqueId();
            var finallyStream = ( WhenFinally.finally !== whenType ) ? baseStreams.bus() : lastFinallyStream;

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, State.state);
            var transfers = transfersGrabber.init(TopState.state);

            if( WhenFinally.when === whenType || WhenFinally.finally === whenType )
                masks.forEach(function(mask) {
                    s.push({mask: mask}, routes);
                    s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
                });

            masks = _(masks).map(function(mask){return [mask, utils.getPossiblePath(mask)]}).flatten().value();


            if ( WhenFinally.when === whenType || WhenFinally.match === whenType ) {
                lastFinallyStream = finallyStream;

                State.state.lastWhen = rootStream
                    .map( function(upstream) {
                        var mask = _(masks)
                                        .filter(function() { if(WhenFinally.match === whenType) return true; else return ! atlantState.isLastWasMatched; }) // do not let stream go further if other is already matched. .match() streams are immune.
                                        .map( matchRouteLast( upstream.path, matchingBehaviour ) )
                                        // .map(s.logIt('---matched routes!!!', upstream))
                                        .filter( s.notEmpty )                              // empty params means fails of route identity.
                                        .head()

                            if (!mask) { 
                                return void 0;
                            } else { 
                                var stream = {};
                                stream = _.extend(stream, upstream);
                                stream.params = mask.params;
                                stream.route = mask.route;
                                return stream;
                            }
                    })
                    .filter(s.id)
                    .map(function (upstream) {
                        upstream.whenId = whenId;
                        upstream.route.when = masks;
                        upstream.isFinally = false;
                        upstream.isMatch = WhenFinally.match === whenType;
                        upstream.finallyStream = finallyStream;
                        if(activeStreamId.value === upstream.id) whenCount.value++;

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
            } else { // Finally processing. Currently is not working bacause of (1)
                lastFinallyStream = void 0;

                State.state.lastWhen = rootStream
                    .map(ups.fmap(_.extend)) // (1) is deprecated and not working
                    .map( function(upstream) {
                        var result = masks
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

            baseStreams.onValue( State.state.lastWhen, function(upstream) {
                    l.log('----Matched route!', upstream);
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        l.log('----------------Redirect:',upstream);
                        utils.goTo(upstream.redirectTo);
                    }
            });


            State.state.lastIf = void 0;
            State.state.lastDep = void 0;
            State.state.lastDepName = name;
            State.state.lastOp = State.state.lastWhen;
            State.state.lastConditionId = whenId;
            State.state.lastWhenType = 'when';

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
            .map( function(upstream) {
                var depValue = {};
                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;

                var stream = {};
                stream  = _.extend(stream, injectsGrabber.add(depName, depValue, injects, upstream));
                stream.otherwise = true;
                stream.conditionId = whenId;
                if(activeStreamId.value === stream.id) whenCount.value++;
                l.log('---Matched otherwise!!!')
                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = void 0;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId;
        State.state.lastWhenType = 'otherwise';

        return this;

    };

    var _action = function(action, isAction){
        State.first();
        TopState.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var whenId = _.uniqueId();
        var depName = 'action_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var transfers = transfersGrabber.init(TopState.state);
        var nameContainer = dependsName.init(depName, State.state);

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
                stream = dependsName.add( depName, nameContainer, stream); 

                stream.action = true;
                stream.conditionId = whenId;
                stream.isAction = isAction;

                l.log('---Matched action!!!', depValue)

                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = 'action';
        State.state.lastConditionId = whenId;

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

                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;

                var stream = injectsGrabber.add(depName, depValue, injects, {})

                stream.error = true;
                stream.conditionId = whenId;

                stream.isAction = true;

                l.log('---Matched error!!!')
                return stream;

            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId;
        State.state.lastWhenType = 'error';

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

        var isElse = (lastCondition === fn && lastCondition !== void 0);
        var depName = isElse ? 'else_' : 'if_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        var thisIf = State.state.lastOp
            .map(function(upstream){
                var scope = clientFuncs.createScope(upstream);
                var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
                if ( checkCondition(scope) ) return upstream;
                else return void 0;
            })
            .filter( s.id )
            .map( function(upstream) {
                var stream = injectsGrabber.add(depName, {}, injects, upstream);

                if ( !upstream.isAction && activeStreamId.value === upstream.id ) whenCount.value++; // increasing counter only if this stream is not yet obsolete
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
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     */
    var __depends = function( dependency ) {
        return _depends.bind(this)( dependency, Depends.continue);
    }

    /**
     *  Asyncroniously run the dependency. 
     */
    var _async = function( dependency ) {
        return _depends.bind(this)( dependency, Depends.async);
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

            if ( 'function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != RenderOperation.nope && renderOperation != RenderOperation.refresh ) {
                throw new Error('Atlant.js: render first param should be function or URI')
            }
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')

            viewName = viewName || s.last(prefs.viewState);

            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            if ( renderOperation === RenderOperation.nope ) viewName = void 0;

            if ( renderOperation !== RenderOperation.draw && 'action' !== State.state.lastWhenType) Counter.increase(State.state);
            var renderId = _.uniqueId();


            var thisRender = State.state.lastOp
                .map(function(u) { 
                    var ups = new Upstream();
                    ups.fmap(_.extend)(u);
                    var a = { renderId: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, RenderOperation: RenderOperation};
                    return ups.join('render', void 0)(a)
                })

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if (void 0 !== State.state.lastIf && renderOperation !== RenderOperation.draw) State.rollback();

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

        return this;
    }

    var _interceptor = function(){
        State.first();
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'interceptor' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var transfers = transfersGrabber.init(TopState.state);

        State.state.lastWhen = interceptorBus
            .map( function(obj) {

                var depValue = {};  // @TODO RETHINK
                depValue.name = obj.upstream.ref;
                depValue.value = obj.scope;
                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;

                var stream = injectsGrabber.add(depName, depValue, injects, {});
                stream = transfersGrabber.add(transfers, stream);

                stream.action = true;
                stream.isInterceptor = true;
                stream.isAction = true;
                stream.conditionId = whenId;

                l.log('---Matched interceptor!!!', depValue)

                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = 'action';
        State.state.lastConditionId = whenId;

        return this;

    };

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

    var _onDrawEnd = function(callback) {
        baseStreams.onValue(onDrawEndStream, s.baconTryD(callback));
        return this;
    }

    var _onRenderEnd = function(callback) {
        baseStreams.onValue(onRenderEndStream, s.baconTryD(callback));
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


    var _redirectTo = function(url) {
        return utils.goTo(url)
    }

    var _moveTo = function(url) {
        if( 'undefined' !== typeof window)
            return window.location.assign(url)
        else
            console.error('Atlant.js: no window object...')
    }

    var _test = function(path, mask){
        if ( !path || !mask ) return false;

        return null !== utils.matchRoute(path, mask)
    }

    var _testAll = function(path, masks){
        if ( !path || !masks || 0 === masks.length) return false;

        return utils.addSlashes(masks)
            .map(_test.bind(void 0, path))
            .reduce( function(v, i) { return v || i }, false)
    }

    var _parse = function(path, mask){
        if ( !path || !mask ) return {};

        var params = utils.matchRoute(path, mask);
        var parsed = utils.parseURL( path );
        var searches = _.clone( utils.parseSearch(parsed.search), true); // add search params
        return _.extend(searches, params);
    }

    var _parseAll = function(path, masks){
        if ( !path || !masks || 0 === masks.length) return {};

        return utils.addSlashes(masks)
            .map(_parse.bind(void 0, path))
            .reduce( function(v, i) { return _.merge(v, i) }, {})
    }


    var _push = function(actionName) {
        throw new Error('atlant.push() not implemented');
        return this;
    }

    var _store = function(storeName) {
        TopState.first();
        TopState.state.lastStoreName = storeName;

        if ( !(storeName in stores) ) stores[storeName] = { 
            _constructor: void 0, 
            updater: void 0,
            value: void 0,
            staticValue: void 0,
            updaters: {},
            parts: {}
        };
        return this;
    };

    var _constructor = function(constructorProvider){
        var storeName = TopState.state.lastStoreName; 
        if (!storeName) { throw new Error('.constructor() should be after .store()') }
        if ( 'function' === typeof stores[storeName]._constructor ) { throw new Error("Constructor already implemented in store ", storeName)}
        if( 'function' !== typeof constructorProvider ) { throw new Error("Constructor should be a function for ", storeName)}

        stores[storeName]._constructor = constructorProvider;
        stores[storeName].updater = baseStreams.bus();
        stores[storeName].bus = stores[storeName].updater.scan(constructorProvider(), function(state, updater){ return updater(state) } ).changes()  

        baseStreams.onValue(stores[storeName].bus, function(value) { 
            if (!window.stores) window.stores = {};
            window.stores[storeName] = value
            stores[storeName].staticValue = value
        })

        return this;
    }

    var _updater = function(updaterName, updater){
        var storeName = TopState.state.lastStoreName;

        if (!storeName) { throw new Error('.updater() should be after .store()') }
        if ( 'function' !== typeof stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( updaterName in stores[storeName].updaters ) { throw new Error("Cannot reimplement updater ", updaterName, " in store ", storeName)}

        stores[storeName].updaters[updaterName] = updater;

        if( !(updaterName in emitStreams ) ) emitStreams[updaterName] = baseStreams.bus();
        
        baseStreams.onValue(emitStreams[updaterName], function(scope){
            stores[storeName].updater.push( function(state){ 
                try{ 
                    return s.copy(updater( state, scope)) }
                catch(e) { 
                    console.log('atlant.js: Warning: updater failed', e)
                    return s.copy(state)
                }} 
            )
        });

        return this;
    }

    var _part = function(partName, partProvider){
        var storeName = TopState.state.lastStoreName;

        if ( !storeName ) { throw new Error('.part() should be after .store()') }
        if ( 'function' !== typeof stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( partName in stores[storeName].parts ) { throw new Error("Cannot reimplement part ", partName, " in store ", storeName)}

        stores[storeName].parts[partName] = partProvider;

        return this;
    }

    var _update = function( key ) {
        if ( ! State.state.lastOp ) throw new Error('"update" should nest something');
        s.type(key, 'string');

        var withs = withGrabber.init(State.state);

        var thisOp = State.state.lastOp
            .map( function(upstream){
                return withGrabber.add(withs, upstream)
            })

        baseStreams.onValue( thisOp, function(upstream) { 
                var refsData = clientFuncs.getRefsData( upstream ); 
                
                var data = ( upstream.with && 'value' in upstream.with ) ? upstream.with.value( refsData ) : refsData;
                if ( key in emitStreams ) emitStreams[key].push(data);
                else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");
        });


        return this;
    }

    var _select = function(dependsBehaviour, partName, storeName) {
        if (!(storeName in stores)) throw new Error('atlant.js: store ', storeName, ' is not defined. Use atlant.store(', storeName, ')');
        if (!(partName in stores[storeName].parts)) throw new Error('atlant.js: store ', storeName, ' is not defined. Use atlant.store(', storeName, ')');

        return _depends.bind(this)( function(id){
            return function(){
                try{
                    return stores[storeName].parts[partName](stores[storeName].staticValue, id);
                } catch(e) {
                    return void 0;
                }
            }
        }, dependsBehaviour, { storeName: storeName, partName: partName, bus: stores[storeName].bus, partProvider: stores[storeName].parts[partName]} );
    }

    // Create scope for prefixed method (currently .select(), .update(), .depends())
    var _with = function(scopeProvider){
        s.type(scopeProvider, 'function');

        if (State.state.lastWith && 'value' in State.state.lastWith) throw new Error('too many .with() after scope receiver')

        withGrabber.tail(scopeProvider, State.state);

        return this;
    }

    var _as = function(name) {
        dependsName.tailFill(name, State.state);            
        return this
    }

    /**
     * Atlant API
     *
     */


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
    // this.finally =  _finally; // not supported because used ups = new Upstream() which is deprecated.
    // side-effect
    this.depends =  _async;
    this.dep =  _async;
    /*
     * Blocking .depends(): the same as ".depends()", but executes only after last ".depends()" or ".and()" ends.
     * */
    this.and =  __depends;
    /*
     * .data() allow catch every peace of data which where piped with .depends(), .and()
     **/
    this.interceptor = _interceptor;

    this.push = _push;

    /**
     * Stores! 
     */
    // Store registration
    this.store = _store;
    // Register key-based dispatcher
    // Store registration
    this.constructor = _constructor;
    // Register updater for store/dispatch event
    this.updater = _updater;
    // Register receiver for atom
    this.part = _part;
    // Store dispatch
    this.update = _update;
    // Query store
    this.select = _select.bind(this, Depends.continue);


    /*
     * Allows give name for .depends()
     */
    this.name = _as;
    // value can be deferred if used with .select()
    this.as = _as;

    // create scope for data provider .select(), .depends() are supported
    this.with = _with;

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
     * Renders declaratins
     */
    //Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
    this.log =  _log;
    /* Renders the view. first - render provider, second - view name */
    this.render = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, RenderOperation.render);}
    /* Renders the view. first - render provider, second - view name. Not waiting for anything - draws immediatelly */
    this.draw = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, RenderOperation.draw);}
    /* clears default or provided viewName */
    this.clear = function(viewName) {return _render.bind(this)(function(){}, viewName, RenderOperation.clear);}
    // Soft atlant-inside redirect.
    this.redirect = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, RenderOperation.redirect);}
    // Soft atlant-inside refresh.
    this.refresh = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, RenderOperation.refresh);}
    //  Fake redirect. Atlant will just change URL but routes will not be restarted. Referrer stays the same.
    this.replace = function(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, RenderOperation.replace);}
    // Same as replace, but store the replaced url in html5 location history. Referrer also changed.
    this.change = function(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, RenderOperation.change);}
    // Force redirect event to current route
    // this.force = _.force;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
    this.move = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, RenderOperation.move);}
    // render which render nothing into nowhere
    this.nope = function(){ return _render.bind(this)(void 0, void 0, RenderOperation.nope)}

    /**
     * Setups
     */
    /* If true then view will be re-rendered only when injects are changed. Accepts boolean. Default true */
    this.check = _check;
    /* wait or not for resources loading when going to next route when link tapped */
    this.await = _await;
    // Display all internal messages.
    this.verbose = _verbose;
    // This routes will be ignored by atlant even if they are declared by .when() or .match()
    this.skip =  _skip;
    // Set view active by default (no need to mention in second parameter of .render
    this.set = _set;
    // Roolback previous set
    this.unset = _unset;
    // Use another render. simple render is default
    this.use = _use;


    /**
     * Commands!
     */
    // Use this when you finished declaring routes and want to start routing. Can be used for drawing another route at current route without redirect (accepts url).
    this.publish =  _publish;

    /**
     * Commands allows perform manipulations of atlant immediatelly.
     */

    // Here you can manipulate views.
    this.views = Object.create(null);
    // set component value into view
    // this.put :: viewName :: component
    this.views.put = function(viewName, component){
        return prefs.render.put(viewName, component);
    }

    // Return view with viewName
    // this.view :: viewName
    this.views.get = function(name) { 
        return prefs.render.get(name);
    }

    this.views.list = function(){
        return prefs.render.list();
    }

    /**
     * Plugins!
     */
    // Contains available renders
    this.renders =  { react :  reactRender, simple :  simpleRender };


    /**
     * Events!
     */
    // Called everytime when route/action is rendered.
    this.onRenderEnd =  _onRenderEnd;
    // Called everytime when draw renders.
    this.onDrawEnd =  _onDrawEnd;
    // Accepts element. After publish and first render the contents will be attached to this element.
    this.attachTo =  _attachTo;
    // After publish and first render the contents will be transferet to callback (first parameter).
    this.stringify =  _stringify;



    /**
     * Utils
     * These commands doesn't return "this".
     */
    // Returns atlant.js version
    this.version = require('./atlant-version');
    // Returns timestamp of the creation time
    this.build = require('./atlant-build');
    this.utils = {
        // test :: path -> mask -> Bool
        test: _test
        // testAll :: path -> [mask] -> Bool
        ,testAll: _testAll
        // parse :: path -> mask -> {params}
        ,parse: _parse
        // parseAll :: path -> [mask] -> {params}
        ,parseAll: _parseAll
        ,destroy: function() {
            baseStreams.destroy(); 
            baseStreams = null;

            s = l = simpleRender = reactRender = utils = Counter = Bacon = _ = interfaces = StateClass = clientFuncs =  baseStreams = safeGoToCopy = null;// @TODO more
            return 
        }
    };
    this.data = {
        get routes() { return _(routes) 
            .map( function(route){ return route.mask } )
            .map(function(route){ 
                if ('/' === route[route.length-1]) 
                    return route.substring(0, route.length -1) 
                else 
                    return route;
            })
            .uniq() // @TODO better not to double it for info :)  
            .value() 
        }    
    }
    // This command will immediatelly redirect to param url
    this.goTo = _redirectTo;
    // The alias of goTo
    this.redirectTo = _redirectTo;
    // Will hard redirect to param url (page will be reloaded by browser)
    this.moveTo = _moveTo;


    return this;

}

module.exports = Atlant;

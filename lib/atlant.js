!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Atlant=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
module.exports = (new Date().getTime()) 


},{}],2:[function(_dereq_,module,exports){
module.exports = '0.4.14'

},{}],3:[function(_dereq_,module,exports){
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
        ,l = _dereq_('./inc/log')()
        ,simpleRender = _dereq_('./renders/simple')
        ,reactRender = _dereq_('./renders/react')
        ,utils = _dereq_('./utils')
        ,Upstream = _dereq_('./upstream.js')
        ,Counter = _dereq_('./counter.js')()
        ,Bacon = window.Bacon
        ,_ = window._
        ,interfaces = _dereq_('./inc/interfaces')
        ,StateClass = _dereq_('./inc/state')
        ,clientFuncs = _dereq_('./inc/clientFuncs')
        ,baseStreams = _dereq_('./inc/base-streams');

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
            ,scrollElement: function(){ return 'undefined' !== typeof document ? document.querySelector('body') : void 0 }

    }

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var transfersGrabber = new interfaces.transfersGrabber();
    var withGrabber = new interfaces.withGrabber();

    // State from current route. Updated on route Load.
    var lastPath // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        ,lastMask = []
        ,lastReferrer;

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

    var IMPOSSIBLE_VALUE = 'impossibleValue' + _.uniqueId();

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
                renderStreams.actionRendered.push(upstream);

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
                                            stream.ref = atom.ref;
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

                            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue(function(atom){ 
                                if( atom.value !== IMPOSSIBLE_VALUE ){
                                    var data = scope();
                                    return renderIntoView(data, true) // Here we using scope updated from store!
                                }
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
                        var scope = clientFuncs.createScope(upstream);
                        var where = (upstream.with && 'value' in upstream.with) ? upstream.with.value : s.id; 
                        var atomId = function(atomIds, scope, where, store, ref, isConsole/*variable for debug*/, parentRef) { 
                            // if (isConsole) console.time('atom', store, ref);
                            var aParentRef = isConsole ? ref : parentRef;
                            var dependAtoms = scope;
                            if ( 'undefined' !== typeof store) {

                                dependAtoms = (atomIds || [])
                                    .map( function( atom ){
                                        var atom_id = atom.fn(false, aParentRef)

                                        var atomValue = s.tryF( void 0, function() { return atom.partProvider(atom.storeData.staticValue, atom_id) })();
                                        var res = { ref: atom.ref, value: atomValue, id: atom_id, atom: atom } // @TODO: Optimize it! Now atom calls all it's parents again and again. This can't be called best :)
                                        return res
                                    })

                                dependAtoms = dependAtoms.reduce(function(res, atomValue){
                                    var result = {};
                                    result[atomValue.ref] = atomValue.value;

                                    res = _.extend({}, res, result);
                                    return res;
                                }, _.extend({}, scope));

                            }

                            var result = where(dependAtoms);
                            // if( isConsole && 'likers' === ref ) console.log('atom', ref, result)
                            // if( !isConsole && 'likers' === parentRef ) console.log('atom', ref, result)
                            // if (isConsole) console.timeEnd('atom', store, ref);
                            return result;
                        }.bind(void 0, (upstream.atomIds || []).slice(), scope, where, store, upstream.ref);
                        
                        var treatDep = s.compose( clientFuncs.convertPromiseD, s.promiseTryD );
                        return treatDep( dep )( atomId(true) )
                            .map(function(upstream, atomId, store, results){
                                if ( 'function' === typeof results ) results = results.bind(void 0, atomId);
                                if ( !upstream.isInterceptor ) interceptorBus.push({upstream: upstream, scope: results}); // pushing into global depends .interceptor() 
                                if (!upstream.depends) upstream.depends = {};
                                upstream.depends[depName] = results;

                                if ( !upstream.atomIds ) upstream.atomIds = [];

                                if ( 'undefined' !== typeof store ) {
                                    upstream.atomId = atomId; 
                                    upstream.atomIds.push({ ref: upstream.ref, fn: atomId, partProvider: store.partProvider, storeData: store.storeData });
                                } 

                                return upstream;
                            }.bind(void 0, upstream, atomId, store))
                    })
            }

            stream = stream
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    var stream = injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);

                    if ( !stream.atoms ) stream.atoms = {};
                    if ( !stream.atomBuses ) stream.atomBuses = [];

                    if ( 'undefined' !== typeof store ) {
                        var atomBus = store.bus
                                .map(function(value){ return {value:value, type:'source'} })
                                .merge(Bacon.mergeAll(stream.atomBuses.slice()).map(function(value){ return {value:value, type:'dependency'} })) // Depending on all upper buses
                                .map(function(ref, atomId, atomBuses, store, upstream, u ){

                                    var source = store.storeData.staticValue;
                                    var atomIdValue = atomId(true);
                                    var value = s.tryF(void 0, function() { return s.copy(store.partProvider(source, atomIdValue )) })()
                                    return value;

                                }.bind(void 0, stream.ref, stream.atomId, stream.atomBuses, store, _.extend({}, stream)))
                                .skipDuplicates(_.isEqual)
                                .startWith(IMPOSSIBLE_VALUE);

                        stream.atoms[store.storeName + '.' + store.partName] = { id: upstream.atomId, ref: stream.ref, store: store.storeName, atom: store.partName, bus: atomBus };
                        stream.atomBuses.push(atomBus);
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
        var states = _dereq_( './inc/wrap-push-pop-states.js');
        states.wrapPushState(window);
        // states.wrapPopState(window);

        // Subscribe to clicks and keyboard immediatelly. Document already exists.
        utils.attachGuardToLinks();
    }


    var whenCount = { value: 0 };
    var renderStreams = _dereq_('./render-streams')(Counter, whenCount);


    var performCallback = function(upstreams, callbackStream, postponedActions) {
        if (Object.keys(upstreams).length) {
            try {
                var scopeMap = s.map(clientFuncs.createScope, upstreams)
                callbackStream.push(scopeMap);

                postponedActions.forEach(function(action){
                    action();
                });

            } catch (e) {
                console.error('Atlant Error:', e)
                errorStream.push(e);
            }
        }
    }

    baseStreams.onValue( renderStreams.drawEnd, function(upstream){
            var upstreams = {};
            upstreams[upstream.render.viewName] = upstream;

            performCallback(upstreams, onDrawEndStream, upstream.postponed ? [upstream.postponed] : []);
    });

    /* Except .draw() every render get this*/
    
    baseStreams.onValue( renderStreams.renderEndStream, function(upstreams){
            var isAction = false;
            var firstUpstream = _(Object.keys(upstreams)).first();
            if (firstUpstream) firstUpstream = upstreams[firstUpstream];
            if ('isAction' in firstUpstream && firstUpstream.isAction) isAction = true;

            if (!isAction) renderStreams.nullifyScan.push('nullify'); // Do not nullify anything of action

            if (typeof window !== 'undefined') lastPath = utils.getLocation();

            var doLater = _.first(  _(upstreams).reduce( function(acc, v, k){ if(v.doLater) acc.push(v.doLater); return acc }, [])  ); 
            var redirectAction = function(){ setTimeout( doLater, 0 ) }.bind(void 0, doLater);
            var postponedActions = _(upstreams).reduce( function(acc, v, k){ if(v.postponed) acc.push(v.postponed); return acc}, []);

            if (redirectAction) postponedActions.push(redirectAction);

            performCallback(upstreams, onRenderEndStream, postponedActions);

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
                    try{
                        event.preventDefault();
                        var path;
                        var postponedScroll;

                        var state = function(event){ return 'pushstate' === event.type ? event.detail.state : ( 'popstate' === event.type ? event.state : void 0 )  };
                        if ( 'pushstate' === event.type ) { // On pushstate event the utils.getLocation() will give url of previous route.
                            path = utils.parseURL( event.detail.url ); 
                            path = path.pathname + ( path.search ? '?' + path.search : ''); 
                        } else if ( 'popstate' === event.type ) {
                            path = utils.getLocation(); // On popstate utils.getLocation() always return current URI.

                            var stateData = state(event);
                            if (!stateData.scrolled) {
                                window.history.replaceState(_.extend({initial: true}, stateData));
                            }
                        }

                        var initial = true;
                        postponedScroll = function(){
                            var stateData = state(event);
                            if(initial) prefs.scrollElement().scrollTop = stateData.scrollTop
                            initial = false;
                        }; // restore scroll position for this new uri ONCE


                        l.log('the route is changed!')
                        if (path !== lastPath || (event && event.detail && event.detail.state && event.detail.state.forceRouteChange)) {
                            sink({
                                path: path
                                ,referrer: lastPath
                                ,postponed: postponedScroll
                            });
                        }
                    }catch(e){console.error(e.stack)}
                };
                window.addEventListener( 'popstate', routeChanged );
                window.addEventListener( 'pushstate', routeChanged );
                window.addEventListener( 'scroll', utils.saveScroll );

                utils.saveScroll();
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

    var _scrollElement = function(elementFn){
        s.type(elementFn, 'function');
        prefs.scrollElement = elementFn;
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
        stores[storeName].staticValue = constructorProvider();
        stores[storeName].bus = stores[storeName].updater.scan(constructorProvider(), function(state, updater){ 
            var newState = updater(state);
            stores[storeName].staticValue = newState;

            if ('undefined' !== typeof window) {
                if (!window.stores) window.stores = {};
                window.stores[storeName] = newState;
            }

            return newState 
        }).changes();  

        baseStreams.onValue(stores[storeName].bus, function() {});

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
                    var newVal = updater( state, scope);
                    return void 0 === newVal ? void 0 : s.copy(newVal) }
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

        return _depends.bind(this)( function(){
            return function(id){
                try{
                    return stores[storeName].parts[partName](stores[storeName].staticValue, id());
                } catch(e) {
                    return void 0;
                }
            }
        }, dependsBehaviour, { storeName: storeName, partName: partName, bus: stores[storeName].bus, partProvider: stores[storeName].parts[partName], storeData: stores[storeName]} );
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
    this.scrollElement = _scrollElement;


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
    this.version = _dereq_('./atlant-version');
    // Returns timestamp of the creation time
    this.build = _dereq_('./atlant-build');
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
        ,setScrollTop: utils.setScrollTop
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

},{"./atlant-build":1,"./atlant-version":2,"./counter.js":4,"./inc/base-streams":5,"./inc/clientFuncs":6,"./inc/interfaces":7,"./inc/log":8,"./inc/state":9,"./inc/wrap-push-pop-states.js":10,"./lib":11,"./render-streams":12,"./renders/react":13,"./renders/simple":14,"./upstream.js":15,"./utils":16}],4:[function(_dereq_,module,exports){
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

},{}],5:[function(_dereq_,module,exports){
"use strict";

var Bacon = window.Bacon;

var baseStreams = Object.create(null);

var unnamed = [];
var unsubs = [];

baseStreams.destructorStream = new Bacon.Bus();

baseStreams.bus = function(){
    var bus = new Bacon.Bus();
    unnamed.push(bus);
    return bus;
}

baseStreams.onValue = function(stream, f){
    var unsub = stream.onValue(f);
    unsubs.push(unsub);
    return unsub;
}

baseStreams.destroy = function() {
    baseStreams.destructorStream.push();
    unnamed.map(function(bus){
        bus.end();
    })
    unsubs.map(function(handler){
        handler();
    })
    unnamed.length = 0;
    unsubs.length = 0;
}

module.exports = baseStreams;



},{}],6:[function(_dereq_,module,exports){
"use strict";

var s = _dereq_('../lib')
        ,_ = window._
        ,l = _dereq_('./log')()
        ,Bacon = window.Bacon

var catchError;

var convertPromiseD = s.curry(function(promiseProvider, upstream) {
    var promise = promiseProvider( upstream );
    if ( s.isPromise( promise ) ){
        promise = promise
            .catch( function(e) {  
                if (e.stack) { 
                    catchError(e);
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

var getRefsData = function( upstream ) {
    if ( !upstream.refs ) return {}

    var fn = function(res, depName, refName) {
        if ( 'undefined' !== refName && depName in upstream.depends ) {
            res[refName] = upstream.depends[depName];
            if ('function' === typeof res[refName]) { 
                res[refName] = res[refName]()
            }
        }

        return res;
    }

    return s.reduce( fn, Object.create(null), upstream.refs)
}

var getScopeDataFromStream = function( upstream ){
    var scope = Object.create(null);
    scope.refs = upstream.refs;
    scope.depends = upstream.depends;
    scope.injects = upstream.injects;
    scope.params = upstream.params;
    scope.path = upstream.path;
    scope.route = upstream.route;
    return s.clone(scope);
}

/**
    * Injects depend values from upstream into object which is supplyed first.
    */
var createScope = function ( upstream ) {
    var refsData = getRefsData( upstream ); 

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
                return inject.expression( s.extend( s.copy(refsData), injectsData.object) ) 
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

    data = s.extend( s.copy(refsData), params, data, joinsData ); 

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

module.exports = { 
    convertPromiseD: convertPromiseD
    ,applyScopeD: applyScopeD
    ,createScope: createScope
    ,getRefsData: getRefsData
    ,catchError: catchError
    ,getScopeDataFromStream: getScopeDataFromStream
};


},{"../lib":11,"./log":8}],7:[function(_dereq_,module,exports){
"use strict";
    
var dependsName = function() {
    this.init = function(depName, state) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!')
        var nameContainer = {};
        state.lastNameContainer = nameContainer // Here we will store further names with ".name"
        return nameContainer;
    }

    // Add invocation when mapping stream, i.e. all data already exist
   this.add = function(depName, nameContainer, upstream) {
        if( !upstream.refs ) upstream.refs = {};
        upstream.refs[nameContainer.ref] = depName;
        upstream.ref = nameContainer.ref;
        return upstream
    }
    
    this.tailFill = function(value, state){
        state.lastNameContainer.ref = value;
    }

    return this;
}

var withGrabber = function() {
    this.init = function(state) {
        var data = {};
        state.lastWith = data // Here we will store further injects with ".transfers"
        return data;
    }
    // Add invocation when mapping stream.
    this.add = function(data, upstream) {
        upstream.with = data;
        return upstream
    }
    this.tail = function(data, state) {
        if (void 0 === state.lastWith) throw new Error('Atlant.js: incompatible "with" provider! ')
        state.lastWith.value = data;
    }
    return this;
}

var transfersGrabber = function() {
    this.init = function(state) {
        var data = {};
        state.lastTransfers = data // Here we will store further injects with ".transfers"
        return data;
    }
    // Add invocation when mapping stream.
    this.add = function(transfers, upstream) {
        upstream.transfers = transfers;
        return upstream
    }
    this.tailTransfer = function(depends, state) {
        depends = [].concat(depends);
        if (void 0 !== state.lastTransfer) throw new Error('Atlant.js: You forgot the .to()!')

        state.lastTransfer = depends
    }
    this.tailTo = function(name, state) {
        if (void 0 === state.lastTransfers) throw new Error('Atlant.js: You forgot the .transfer() before .to()!')
        
        state.lastTransfers[name] = state.lastTransfer;
        state.lastTransfer = void 0;
    }
    return this;
}

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


module.exports = { 
                injectsGrabber:injectsGrabber
                ,dependsName: dependsName
                ,transfersGrabber: transfersGrabber
                ,withGrabber: withGrabber
}

},{}],8:[function(_dereq_,module,exports){
"use strict";

var s = _dereq_('../lib');

var Log = function Log(){
    var on = false;
    this.verbose = function(turnOn){
        on = turnOn;
    }

    this.log = function() {
        if (!on) return;
        console.log.apply(console, arguments)
    }

    this.logTime = function() {
        if (!on) return;
        if (console.time) {
            return console.time.apply(console, s.a2a(arguments))
        }
    } 

    this.logTimeEnd = function() {
        if (!on) return;
        if (console.timeEnd) {
            return console.timeEnd.apply(console, s.a2a(arguments))
        }
    }
    return this;
}

var instance;
module.exports = function() {
    if(instance) return instance;
    instance = new Log();
    return instance;
}

},{"../lib":11}],9:[function(_dereq_,module,exports){
"use strict";

var _ = window._;

var StateType = function(state) {
    _.extend( this, {lastWhen: void 0, lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0} );
    _.merge( this, state );
};

var StateClass = function(){
    var states;

    this.state = void 0;

    this.first = function(){
        states = [];
        this.state = new StateType();
        states.push(this.state);
    }

    this.divide = function() {
        this.state = new StateType(this.state);
        this.state.lastDep = void 0;

        states.push(this.state);
    }

    this.rollback = function() {
        states.pop();
        this.state = states[states.length-1];
    }

    this.print = function(message, state) {
        //log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
    }

    return this;
};

module.exports = StateClass;

},{}],10:[function(_dereq_,module,exports){
"use strict";
//https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   };

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();

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
           console.error('Can\'t push state:', e);
           return void 0;
        }
    };

    window.history.pushState = function(state, title, url) {
        var eventless = state && state.eventless;
        if ( !eventless ) {
            var onpushstate = new CustomEvent('pushstate', { detail: { state: {url: url, referrer: window.location.pathname, scrollTop: state.scrollTop, forceRouteChange: state.forceRouteChange}, title: title, url: url } } );
            window.dispatchEvent(onpushstate);
        }

        return tryState(arguments);
    };

};

module.exports = { wrapPushState: wrapPushState };

},{}],11:[function(_dereq_,module,exports){
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
        if ( !obj ) return startValue;
        if (obj && obj.reduce) Array.prototype.reduce.call(obj, fn, startValue);

        var reduced = {};

        for( var name in obj ) {
            reduced = fn(reduced, obj[name], name);
        }

        return reduced;
    });

    var concat = _.curry( function(a, b) {
        return b.concat(a);
    });

    var flatMap = function(arr) {
        return Array.prototype.concat.apply([], arr);
    }

    var last = function(arr) {
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

    var tryF = function(fallbackValue, fn){
        return function() {
            try {
                return fn.apply(this, arguments)
            } catch(e) {
                return fallbackValue
            }
        }
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
        return tryD(fn, function(e) { return Bacon.Error(e) })
    }

    var promiseTryD = function(fn) {
        return tryD(fn, function(e) { return Promise.reject(e) })
    }

    var _apply = function(doProvider, value) {
        if ('function' === typeof doProvider) {
            return doProvider(value);
        } else {
            return doProvider;
        }
    }

   this.maybe = function(nothing, fn){
       return function(){
           try {
               return fn.apply(this, this.a2a(arguments))
           } catch (e) {
               return nothing
           }
       }
   }

   var copy = _.compose( JSON.parse, JSON.stringify );

   this.clone = function(obj) {
       return _.cloneDeep(obj, function(value) {
           if (_.isFunction(value)) {
               return value;
           }
       })
    }

   this.maybeS = this.maybe.bind(this, '')
   this.maybeV = this.maybe.bind(this, void 0)

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
    this.last   = last;
    this.concat = concat;
    this.mapD   = mapD;
    this.fmap   = fmap;
    this.flatMap   = flatMap;
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
    this.tryF = tryF;
    this.apply = _apply;

    this.baconTryD = baconTryD;
    this.promiseTryD = promiseTryD;
    /**
     * Depreated
     *
     * */
    this.guardWithTrue = guardWithTrue;
    this.resolveGuard = resolveGuard;
    this.Herald = Herald;
    this.copy = copy;

    return this;

})();

module.exports = s;

},{}],12:[function(_dereq_,module,exports){
"use strict";

var Bacon = window.Bacon;
var l = window._;

module.exports = function(Counter, whenCount)  {

    var Upstream = _dereq_('./upstream.js')
        ,s = _dereq_('./lib')

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();
    var actionRendered = new Bacon.Bus();
    var drawEnd = new Bacon.Bus();
    var actionRenderedAndMapped = actionRendered
        .map(function(u){
            var obj = {};
            obj[u.render.viewName] = u;
            return obj;
        })

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var ups2 = new Upstream();
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .merge(nullifyScan)
        .scan([], function(oldVal, newVal) {  // Gathering the upstreams which come here.
            if (newVal === 'nullify') {
                oldVal = []
                ups.clear();
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
        .scan({}, function(sum, newVal) {  // creating hash of streams with viewName as key
            if (newVal === 'nullify') {
                sum = {};
                ups2.clear();
                return sum
            }

            if ( !(newVal instanceof Array) ) 
                newVal = [newVal];
            
            newVal
                .map(function(val){
                    sum[val.render.viewName] = val;
                })

            return sum;
        })
        .filter(s.notEmpty) // Still this hash can be nullified, so stay aware.
        .changes()
        .filter( function(_) { return 0 === --whenCount.value; } ) // Here checking is there all whens are ended.
        .merge(actionRenderedAndMapped)
        .map(function(u){
            return s.reduce(function(sum, value, key){if ('undefined' !== key) sum[key] = value; return sum}, {}, u)
        })
        .filter(s.notEmpty) // nopes.

    return { 
        renderEndStream: renderEndStream 
        ,whenRenderedStream: whenRenderedStream  
        ,nullifyScan: nullifyScan 
        ,actionRendered: actionRendered
        ,drawEnd: drawEnd
    }
}

},{"./lib":11,"./upstream.js":15}],13:[function(_dereq_,module,exports){
"use strict";
var React = window.React
     ,s = _dereq_('./../lib')
     ,_ = window._
     ,u = _dereq_('../utils')
     ,l = _dereq_('../inc/log')();

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
            if ( !instances[name] ) 
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

        this.list = function(){
            if (! views ) return [];
            return Object.keys(views);
        }

        return this;
};

var Render = function() {
    var state = new State();

    this.name = 'React';
    var rootName = void 0;

    this.render = function(viewProvider, upstream, activeStreamId, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            l.log('%cbegin rendering view ' + name, 'color: #0000ff');
            l.logTime('rendered view ' + name);

            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.  
                // get new component somehow.
                state.set(name, viewProvider(scope));  
            }
            var instance = state.getThis(name);
            // console.time('renering ' + name);
            state.check(name);
            if( rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate(/* console.timeEnd.bind(console, 'renering ' + name) */);

            l.logTimeEnd('rendered view ' + name);
            return resolve(state.getInstance(name));  
        });

        return rendered;
    }

    this.clear = function(viewProvider, upstream, activeStreamId, name, scope) {
        return new Promise( function( resolve, reject ){

            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.  
                state.set(name, React.DOM.div(null));
            }
            var instance = state.getThis(name);
            state.check(name);
            if( rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate();

            return resolve(state.getInstance(name));
        });
    }

    this.attach = function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            var root = state.getInstance(name);

            if ( !root ) { throw new Error('AtlantJs: Please use .render(component, "' + name + '") to render something') }

            try{
                React.renderComponent(root, element, function(){ rootName = name; resolve() } );
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

    this.list = function(){
        return state.list(); 
    }

    this.put = function(name, component){
        state.set(name, component);  
        state.check(name);
        return component;
    }

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })
}

module.exports = Render;

},{"../inc/log":8,"../utils":16,"./../lib":11}],14:[function(_dereq_,module,exports){
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


},{}],15:[function(_dereq_,module,exports){
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

        if ( ! data[containerName] ) data[containerName] = {};
        s.merge(data[containerName], upstream);

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

},{"./lib":11}],16:[function(_dereq_,module,exports){
"use strict";

var s = _dereq_('./lib');
var _ = window._

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

    utils.saveScroll();

    setTimeout( history.pushState.bind(history, { url: url, scrollTop: 0, referrer: window.location.href, forceRouteChange: redirectForce }, null, url), 0);
}

utils.saveScroll = _.debounce(function(event){
    // console.time('savingScroll')
    var scrollTop = document.querySelector('body').scrollTop;
    var stateData = {
        scrollTop: scrollTop
    };

    window.history.replaceState(stateData);
    // console.timeEnd('savingScroll')

}, 100)

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

var scrolledDefault = document.querySelector('body');
utils.getScrollTop = function(element){
    return element ? element().scrollTop : scrolledDefault.scrollTop
}

utils.setScrollTop = function(element, scrollTop){
    if (element) element().scrollTop = scrollTop;
    else scrolledDefault.scrollTop = scrollTop;
}

module.exports = utils;

},{"./lib":11}]},{},[3])
(3)
});
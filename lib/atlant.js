!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Atlant=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
module.exports = (new Date().getTime()) 


},{}],2:[function(_dereq_,module,exports){
module.exports = '0.4.17'

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
        ,baseStreams = _dereq_('./inc/base-streams')
        ,Stat = _dereq_('./inc/statistics');


    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);

    // var lastScrollTop; 


    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,renderNames = []
        ,viewNames = [];

    var viewData = {}; // To check if the rendered data is the as data to be rendered.

    var stores = {}
    var emitStreams = {};

    var statistics = new Stat();

    var activeRenderEnd;

    var viewSubscriptions = {};
    var viewSubscriptionsUnsubscribe = {};
    var savedViewScope = {};

    var activeStreamId = { value: void 0 }; // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
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
    var withGrabber = new interfaces.withGrabber();

    // State from current route. Updated on route Load.
    var lastPath // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        ,lastMask = []
        ,lastReferrer

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

    var WhenOrMatch = {
        when: _.uniqueId()
        ,match: _.uniqueId()
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
                renderStreams.actionRendered.push(upstream);

        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if (upstream.render.renderOperation === RenderOperation.nope || upstream.render.renderOperation === RenderOperation.draw || upstream.isAction || upstream.render.renderOperation === RenderOperation.move || upstream.render.renderOperation === RenderOperation.redirect || upstream.render.renderOperation === RenderOperation.replace || upstream.render.renderOperation === RenderOperation.change || upstream.isAtom )
                return true;

            if ( upstream.render.viewName in atlantState.viewRendered ) {  // If this view is already rendered...
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
                    if( void 0 === upstream || activeStreamId.value !== upstream.id ) { return void 0; }

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

                            // if(upstream.atoms) console.log('atoms:', viewName, upstream.atoms.length, 'updates for this when:', upstream.stats);

                            // console.log('atom:', viewName, ' count:', upstream.atoms)
                            var putInfo = function(atom, pushedValue){  // When data arrived, get info from static scope of atom details
                                    var stream = Object.create(null);
                                    stream.value = pushedValue;
                                    stream.name = atom.atom;
                                    stream.store = atom.store;
                                    stream.ref = atom.ref;
                                    stream.that = atom.that;
                                    return stream;
                            };

                            // Bacon.mergeAll(_(upstream.atoms).map(function(_){return _.bus}).value()).onValue(function(value){console.log('bugaga:', viewName, value)}) 

                            var lastAtom = _(upstream.atoms) // Subscribing this view for last atom (because last is subscribed to change of his "parent" (upper) atom, parent atom subscribed to his parent and so on.)
                                .filter( function(atom) {
                                    return void 0 === atom.next
                                })
                                .head();

                            viewSubscriptions[viewName] = lastAtom ? lastAtom.bus.map(putInfo.bind(this, lastAtom)) : Bacon.never(); 

                            if (upstream.masks) {
                                statistics.whenStat({ actionId: upstream.whenId, masks: upstream.masks.slice(), view: viewName });
                            } else {
                                console.log('WARNING! ACTION ON THE BOARD!')
                            }

                            var renderIntoView = function(scope, isAtom) {
                                var renderD = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)
                                // l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
                                return renderD(viewProvider, upstream, activeStreamId, viewName, scope)
                                    .then(function(_){
                                        // @TODO make it better
                                        // using copy of upstream otherwise the glitches occur. The finallyStream is circular structure, so it should be avoided on copy
                                        // console.log('csope: view...', viewName, scope)
                                        var atoms = upstream.atoms;
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



                            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue(function(upstream, viewName, scopeFn, atom){ 
                                console.log('atom:', viewName, atom.value ) 
                                var data = scopeFn();
                                if ( !_.isEqual(data, viewData[viewName] ) ) {
                                    viewData[viewName] = scopeFn();
                                    // console.log('updating view...', viewName, atom)
                                    var rendered = renderIntoView(data, true) // Here we using scope updated from store!
                                    return rendered.then(function(o){
                                        atomEndSignal.push({whenId: upstream.whenId});
                                        return o;
                                    });
                                } else {
                                    console.log('canceled render due the same data', viewName)
                                    atomEndSignal.push({whenId: upstream.whenId});
                                }
                            }.bind(void 0, upstream, viewName, scope));

                            var data = scope();
                            return renderIntoView(data, false) // Here we using scope updated from store!

                        }

                    } catch (e) {
                        console.error(e.message, e.stack);
                    }
            });
        };

        return function() { 
            if ( isRenderApplyed ) return;

            isRenderApplyed = true
            console.time('assign renders')
            var count = 0;
            for(var viewName in renders) { //@TODO assign only those streams and for those views which are existent on this route
                count+=renders[viewName].length;
                s.map(assignRender, renders[viewName]);
            }
            console.timeEnd('assign renders')
            // console.log('assign renders to:', count, 'streams')

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
                // .map( function(u){ console.log('extending:', 'to be:' , u); return u; #<{(|_.extend( {}, u)|)}># } )
                // .map( function(_){ if ( activeStreamId.value !== _.id ) { console.log('STOPPED_DEP:', _, _.id, activeStreamId.value); return void 0 } else { return _ } } )
                // .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
                // .map( function(_){ if ( activeStreamId.value !== _.id ) { console.log('NOTSTOPPED_DEP:', _, _.id, activeStreamId.value);}  return _  } )
                .map( dependsName.add.bind(dependsName, depName, nameContainer) )
                .map( withGrabber.add.bind(withGrabber, withs) )

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
                        var atomParams = function(atomIds, scope, where, store, ref, isConsole/*variable for debug*/, parentRef) { 
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
                        return treatDep( dep )( atomParams(true) )
                            .map(function(upstream, atomParams, store, results){
                                if ( 'function' === typeof results ) results = results.bind(void 0, atomParams);
                                if ( !upstream.isInterceptor ) interceptorBus.push({upstream: upstream, scope: results}); // pushing into global depends .interceptor() 
                                if (!upstream.depends) upstream.depends = {};
                                upstream.depends[depName] = results;

                                if ( !upstream.atomIds ) upstream.atomIds = [];

                                if ( 'undefined' !== typeof store ) {
                                    upstream.atomParams = atomParams; 
                                    upstream.atomIds.push({ ref: upstream.ref, fn: atomParams, partProvider: store.partProvider, storeData: store.storeData });
                                } 

                                return upstream;
                            }.bind(void 0, upstream, atomParams, store))
                    })
            }

            stream = stream
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    var stream = injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);

                    if ( !stream.atoms ) stream.atoms = [];

                    if ( 'undefined' !== typeof store ) {
                        var getValue = function( ref, atomParams, store, upstream, firstTime, u ){ 
                            var source = store.storeData.staticValue;
                            var atomIdValue = atomParams(true);
                            var value = s.tryF(void 0, function() { return s.copy(store.partProvider(source, atomIdValue )) })()
                            var noDehydrotizedData = true;
                            return value;
                        }

                        var atomId = _.uniqueId();

                        var push = function(name, _){
                            var o = {};
                            o[name] = _;
                            return o;
                        }

                        var bus = store.bus
                            .map(
                                push.bind(void 0, stream.ref + stream.whenId)
                                ,getValue.bind(void 0, stream.ref, stream.atomParams, store, _.extend({}, stream), false)
                            )

                        if (upstream.lastAtom)
                            bus = bus
                                // .merge(upstream.lastAtom.bus) // Depending on one upper bus (and on all upper if you know)
                                .merge(upstream.lastAtom.bus.map(push.bind(void 0, upstream.lastAtom.ref + upstream.whenId))) // Depending on one upper bus (and on all upper if you know)
                                



                        // atomBus.onValue(function(store, atomId, stats, value, whenId){console.log('imthebus!:', atomId, store.storeName, stats, whenId )}.bind(void 0, store, atomId, upstream.stats, upstream.whenId))

                        var weight = statistics.getWeight(upstream.whenId, upstream.path, store.storeName);
                        var overWeight = weight + (upstream.lastAtom ? upstream.lastAtom.overWeight : 0);

                        // console.log('subscribing to lastAtom:', atomId, stream.ref, (upstream.lastAtom || {ref: 'no previous'}).ref)
                        
                        var atom = { id: atomId
                                        ,atomParams: upstream.atomParams
                                        ,ref: stream.ref
                                        ,store: store.storeName
                                        ,atom: store.partName
                                        ,bus: bus
                                        ,weight: weight 
                                        ,overWeight: overWeight // sum previous
                                        ,prev: upstream.lastAtom
                        };

                        stream.atoms.push(atom);
                        if(stream.lastAtom) stream.lastAtom.next = atom;
                        atom.that = atom;
                        stream.lastAtom = atom;
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


    var atomEndSignal = baseStreams.bus();
    var atomRecalculateSignal = baseStreams.bus();
    var atomCounter = { list: {} };
    var defValue = function(){ return { value: 0 } };
    var sumCounter = function(actomCounter){
        return Object.keys(atomCounter.list)
                            .map( function(id){ return atomCounter.list[id].value })
                            .reduce(function(acc, i){ return acc + i }, 0) 
    }
    atomEndSignal.onValue(function(atomCounter, object){

        atomCounter.list[object.whenId].value--;
        var calculated = statistics.getSum(object.whenId, lastPath);
        var signalled = sumCounter(atomCounter);

        console.log('atom signal received', signalled, calculated)

    }.bind(void 0, atomCounter))

    atomRecalculateSignal.onValue(function(atomCounter, object){
        var signalled = sumCounter(atomCounter);
        var calculated = statistics.getSum(object.whenId, lastPath);
    }.bind(void 0, atomCounter))


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
            var redirectAction = function(doLater){ if(doLater) setTimeout( doLater, 0 ) }.bind(void 0, doLater);
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
                        // var postponedScroll;

                        var state = function(event){ return 'pushstate' === event.type ? event.detail.state : ( 'popstate' === event.type ? event.state : void 0 )  };
                        if ( 'pushstate' === event.type ) { // On pushstate event the utils.getLocation() will give url of previous route.
                            path = utils.parseURL( event.detail.url ); 
                            path = path.pathname + ( path.search ? '?' + path.search : ''); 
                        } else if ( 'popstate' === event.type ) {
                            path = utils.getLocation(); // On popstate utils.getLocation() always return current URI.

                        }

                        // lastScrollTop[path] = document.querySelector('body').scrollTop;

                        // if ( 0 === history.state.scrollTop ) {
                        //     prefs.scrollElement().scrollTop = 0;
                        //     utils.saveScroll();
                        // } else { 
                        //     var initial = true;
                        //     postponedScroll = function(){
                        //         if(initial #<{(|&& lastScrollTop[lastPath] !== history.state.scrollTop|)}>#) {  // restore scroll position for this new uri ONCE 
                        //             prefs.scrollElement().scrollTop = history.state.scrollTop;
                        //         } 
                        // }} 

                        l.log('the route is changed!')
                        if (path !== lastPath || (event && event.detail && event.detail.state && event.detail.state.forceRouteChange)) {
                            sink({
                                path: path
                                ,referrer: lastPath
                                // ,postponed: postponedScroll
                            });
                        }
                    }catch(e){console.error(e.stack)}
                };
                window.addEventListener( 'popstate', routeChanged );
                window.addEventListener( 'pushstate', routeChanged );
                // window.addEventListener( 'scroll', utils.saveScroll );

                // utils.saveScroll();
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
            atomCounter.list = {};

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
    var _when = function(){
        var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
        var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName) );

        return function(masks, matchingBehaviour, whenType) {

            if ( -1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.')
            masks = masks
                        .split('||')
                        .map(s.trim)
                        .filter(function(_){ return _.length });

            if ( !masks.length ) throw new Error('At least one route mask should be specified.');

            State.first();
            TopState.first();

            var whenId = _.uniqueId();

            TopState.state.lastMasks = masks;

            if (masks.filter(function(mask){ return '*' === mask}).length && whenType === WhenOrMatch.when) { throw new Error( 'Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")' ); }

            var name = (whenType === WhenOrMatch.match) ? 'match' : 'when';
            name = name + createNameFromMasks(masks) + _.uniqueId();

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, State.state);
            var stats = TopState.state.stats;

            var whenMasks = masks;
            if( WhenOrMatch.when === whenType )
                masks.forEach(function(mask) {
                    s.push({mask: mask}, routes);
                    s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
                });

            masks = _(masks).map(function(mask){return [mask, utils.getPossiblePath(mask)]}).flatten().value();

            State.state.lastWhen = rootStream
                .map( function(upstream) {
                    var mask = _(masks)
                                    .filter(function() { if(WhenOrMatch.match === whenType) return true; else return ! atlantState.isLastWasMatched; }) // do not let stream go further if other is already matched. .match() streams are immune.
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
                    upstream.isMatch = WhenOrMatch.match === whenType;
                    if(activeStreamId.value === upstream.id) whenCount.value++;

                    atomCounter.list[whenId] = defValue();
                    upstream.stats = stats;
                    upstream.masks = whenMasks;

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
                    return stream;
                })

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
            TopState.state.lastActionId = whenId;
            statistics.whenStat({ actionId: TopState.state.lastActionId, masks: TopState.state.lastMasks });

            return this;
        };
    }();

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var __lastWhen = function(masks) {
        return _when.bind(this)( masks, Matching.stop, WhenOrMatch.when );
    }

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var __when = function(masks) {
        return _when.bind(this)( masks, Matching.continue, WhenOrMatch.when );
    }

    var _match = function(masks) {
        return _when.bind(this)( masks, Matching.continue, WhenOrMatch.match );
    }

    var _otherwise = function(){ //@TODO create mixins for this
        State.first();
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'otherwise_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var stats = TopState.state.stats;

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
                stream.whenId = whenId;
                stream.stats = stats;

                if(activeStreamId.value === stream.id) whenCount.value++;
                l.log('---Matched otherwise!!!')
                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = void 0;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        State.state.lastWhenType = 'otherwise';
        TopState.state.lastAction = 'otherwise'        

        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: [TopState.state.lastAction] });

        return this;

    };

    var _action = function(action, isAction){
        State.first();
        TopState.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var whenId = _.uniqueId();
        var depName = 'action_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var nameContainer = dependsName.init(depName, State.state);
        var stats = TopState.state.stats;

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
                stream = dependsName.add( depName, nameContainer, stream); 
                stream.stats = stats;

                stream.action = true;
                stream.conditionId = whenId;
                stream.whenId = whenId;
                stream.isAction = isAction;
                stream.id = activeStreamId.value;

                l.log('---Matched action!!!', depValue)

                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = 'action';
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = depName
        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: [TopState.state.lastAction] });

        return this;

    };

    var _error = function(){
        State.first();
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'error_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var stats = TopState.state.stats;

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
                stream.whenId = whenId;
                stream.stats = stats;

                stream.isAction = true;
                stream.id = _.uniqueId();

                l.log('---Matched error!!!')
                return stream;

            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastConditionId = whenId;
        State.state.lastWhenType = 'error';
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = 'error';
        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: [TopState.state.lastAction] });

        return this;
    };

    /**
        if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function(boolTransform, condition) {
        s.type(boolTransform, 'function');
        s.type(condition, 'function');

        var fn = s.compose(boolTransform, condition);
        var fnNegate = s.compose(s.negate, boolTransform, condition);

        if ( ! State.state.lastOp ) { throw new Error('"if" should nest something.'); }

        State.divide();
        var ifId = _.uniqueId();

        var depName = 'if_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        var thisCommonIf = State.state.lastOp
            .map( function(u){ return _.extend( {}, u) } )
            .map( function(_){ if ( activeStreamId.value !== _.id ) { return void 0 } else { return _ } } )
            .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
            .map( function(_){ if ( activeStreamId.value !== _.id ) { console.log('NONSTOP')} return _ } ) // stayed here for debuggind purposes


        var thisIf = thisCommonIf
            .map(function(ifId, fn, condition, upstream){
                var scope = clientFuncs.createScope(upstream);
                var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
                if ( checkCondition(scope) ) return upstream;
                else return void 0;
            }.bind(void 0, ifId, fn, condition))
            .filter( s.id )
            .map( function(ifId, upstream) {
                var stream = injectsGrabber.add(depName, {}, injects, upstream);

                if ( !upstream.isAction && activeStreamId.value === upstream.id ) whenCount.value++; // increasing counter only if this stream is not yet obsolete

                stream.conditionId = ifId;
                return stream;
            }.bind(void 0, ifId))

        var thisIfNegate = thisCommonIf 
            .map(function(ifId, fnNegate, condition, upstream){
                var scope = clientFuncs.createScope(upstream);
                var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fnNegate);
                if ( checkCondition(scope) ) return upstream;
                else return void 0;
            }.bind(void 0, ifId, fnNegate, condition))
            .filter( s.id )

        thisIfNegate.onValue(function(ifId, actionId, condition, u){
            var updates = statistics.getUpdatesByUrl(actionId, lastPath, ifId);
            if(updates.length) {
                console.log("UPDATES:", updates, u)
                statistics.removeUpdates(u.whenId, u.masks, updates);

                atomRecalculateSignal.push({whenId: u.whenId}); 
            }

        }.bind(void 0, ifId, TopState.state.lastActionId, condition))

        State.state.lastIf = thisIf;
        State.state.lastOp = State.state.lastIf;
        State.state.lastConditionId = ifId;
        State.state.lastIfId = ifId;
        State.state.lastIfIds.push(ifId) // Stores upper stack of if ids


        statistics.whenStat({
            actionId: TopState.state.lastActionId
            ,ifId: ifId
            ,masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction]
        });  // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.
        return this;
    }

    var _end = function() {
        if (void 0 !== State.state.lastIf) {
            State.rollback(); 
        }

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
                .map( function(u){ return _.extend( {}, u) } )
                .map( function(_){ if ( activeStreamId.value !== _.id ) { return void 0 } else { return _ } } )
                .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
                .map(function(u) { 
                    var ups = new Upstream();
                    ups.fmap(_.extend)(u);
                    var a = { renderId: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, RenderOperation: RenderOperation};
                    return ups.join('render', void 0)(a)
                })

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if (void 0 !== State.state.lastIf && renderOperation !== RenderOperation.draw){ 
                State.rollback(); 
            }

            return this;
    };

    var _check = function(isCheck) {
        if ( 'undefined' === typeof isCheck)
            throw new Error('Atlant.js: check require boolean parameter.')


        prefs.checkInjectsEquality = isCheck;
        return this;
    }

    var _interceptor = function(){
        State.first();
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'interceptor' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var stats = TopState.state.stats;

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
                stream.stats = stats;

                stream.action = true;
                stream.isInterceptor = true;
                stream.isAction = true;
                stream.conditionId = whenId;
                stream.whenId = whenId;
                stream.id = activeStreamId.value;

                l.log('---Matched interceptor!!!', depValue)

                return stream;
            })

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = 'action';
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = 'interceptor';
        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: [TopState.state.lastAction] });

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
        s.type(render, 'object');
        //@TODO: check render for internal structure
        if (prefs.render) throw new Error('You can specify render only once.');

        prefs.render = render;
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

    var _stringify = function(fn, options) {
        return prefs.render.stringify('root', options );
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

    var _destroy = function() {
        baseStreams.destroy(); 
        baseStreams = null;

        s = l = simpleRender = reactRender = utils = Counter = Bacon = _ = interfaces = StateClass = clientFuncs =  baseStreams = safeGoToCopy = null;// @TODO more
        return 
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
        }).toEventStream();  

        baseStreams.onValue(stores[storeName].bus, function() {});

        return this;
    }

    var _updater = function(updaterName, updater){
        var storeName = TopState.state.lastStoreName;

        if (!storeName) { throw new Error('.updater() should be after .store()') }
        if ( 'function' !== typeof stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( updaterName in stores[storeName].updaters ) { throw new Error("Cannot reimplement updater ", updaterName, " in store ", storeName)}

        stores[storeName].updaters[updaterName] = updater;
        statistics.putLink(storeName, updaterName);

        if( !(updaterName in emitStreams ) ) emitStreams[updaterName] = baseStreams.bus();
        
        baseStreams.onValue(emitStreams[updaterName], function(scope){
            stores[storeName].updater.push( function(state){ 
                // console.log('updating!', updaterName, storeName)
                try{ 
                    var newVal = updater( state, scope);
                    return void 0 === newVal ? void 0 : s.copy(newVal) }
                catch(e) { 
                    console.log('atlant.js: Warning: updater failed', e)
                    return state
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
            .map( function(upstream) { 
                var refsData = clientFuncs.getRefsData( upstream ); 
                
                var data = ( upstream.with && 'value' in upstream.with ) ? upstream.with.value( refsData ) : refsData;

                if ( key in emitStreams ) emitStreams[key].push(data);
                else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");

                return upstream;
            });

        baseStreams.onValue( thisOp, function(updateCallback, upstream) { 
        });

        TopState.state.stats.keys.push(key);
        statistics.whenStat({
            eventKey: key
            ,actionId: TopState.state.lastActionId
            ,ifIds: State.state.lastIfIds
            ,masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction]
        });  // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.

        return this;
    }

    var _log = function(strings) {
        var arr = s.a2a(arguments).slice();
        return _depends.bind(this)( function(arr, scope){
            arr.push(scope);

            try{
                console.log.apply(console, arr);
                return void 0;
            } catch(e) {
                return void 0;
            }
        }.bind(void 0, arr), Depends.continue );
    }

    var _select = function(dependsBehaviour, partName, storeName) {
        if (!(storeName in stores)) throw new Error('atlant.js: store ', storeName, ' is not defined. Use atlant.store(', storeName, ')');
        if (!(partName in stores[storeName].parts)) throw new Error('atlant.js: store ', storeName, ' is not defined. Use atlant.store(', storeName, ')');

        statistics.whenStat({actionId: TopState.state.lastActionId, masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], atom: storeName });

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


    this.when =  __when;
    this.lastWhen =  __lastWhen;

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
    this.end = _end;

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

    this.destroy = _destroy;

    this.utils = _dereq_('./inc/tools'); // @TODO: rename to 'tools'


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

},{"./atlant-build":1,"./atlant-version":2,"./counter.js":4,"./inc/base-streams":5,"./inc/clientFuncs":6,"./inc/interfaces":7,"./inc/log":8,"./inc/state":9,"./inc/statistics":10,"./inc/tools":11,"./inc/wrap-push-pop-states.js":12,"./lib":13,"./render-streams":14,"./renders/react":15,"./renders/simple":16,"./upstream.js":17,"./utils":18}],4:[function(_dereq_,module,exports){
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
        ,Promise = window.Promise
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


},{"../lib":13,"./log":8}],7:[function(_dereq_,module,exports){
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

},{"../lib":13}],9:[function(_dereq_,module,exports){
"use strict";

var _ = window._;

var StateType = function(state) {
    var newState = _.extend( {}, {lastWhen: void 0, lastActionId: void 0, lastIf: void 0, lastIfIds: [], lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0, stats: { keys: [] } }, state );
    newState.lastIfIds = [].concat( newState.lastIfIds );
    return newState
};

var StateClass = function(){
    var states;

    this.state = void 0;

    this.first = function(){
        states = [];
        this.state = StateType();
        states.push(this.state);
        if('undefined' !== typeof window) window.states = states;
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

var utils = _dereq_('../utils');
var tools = _dereq_('./tools');
var s = _dereq_('../lib');
var _ = window._;
var Bacon = window.Bacon;

/**
 * This statistics module used for calculating the end of the atoms updating.
 * First part is working out at registration level.
 *
 */
var Stat = function(){
    var statObject = {};
    var storeByEvent = {}; // Hash: 'eventName" : ['store1', 'store2']

    if('undefined' !== typeof window) window.statObject = statObject; //@TODO debug information

    var getAllExceptAsterisk = function(statObject){
        return Object.keys(statObject).filter( function(_){ return '*' !== _ } )
    }

    this.whenStat = function(params){
        var masks = params.masks
            ,eventKey = params.eventKey
            ,ifId = params.ifId
            ,ifIds = params.ifIds
            ,atom = params.atom
            ,actionId = params.actionId
            ,view = params.view

        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);

            if( !(mask in statObject) )  
                statObject[mask] = {}
            
            if( !(actionId in statObject[mask]) )  
                statObject[mask][actionId] = { updatesList: [], lastOp: [], ifList: {}, atomList: [], viewList: [] }

            if (ifId) { 
                statObject[mask][actionId].ifList[ifId] = {updatesList: []}
            }

            if(eventKey && ifIds) ifIds.forEach(function(ifId) { 
                statObject[mask][actionId].ifList[ifId].updatesList.push(eventKey);
            })
            if(eventKey) statObject[mask][actionId].updatesList.push(eventKey);

            if(atom) statObject[mask][actionId].atomList.push(atom);

            if(view) statObject[mask][actionId].viewList.push(view);
        })

        return statObject;
    }

    this.removeUpdates = function(actionId, masks, updates){
        // console.log('removing updates...', updates)
        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);
            updates.forEach(function(update){
                if (actionId in statObject[mask]) {
                    var index = statObject[mask][actionId].updatesList.indexOf(update);
                    // console.log('before removal!', mask, update, statObject[mask].updatesList)
                    if( -1 !== index ) statObject[mask][actionId].updatesList.splice(index, 1);
                    // console.log('removed!', mask, update, statObject[mask][actionId].updatesList)
                }
            }) 

        })
    }

    this.getUpdatesByUrl = function(actionId, url, ifId){

        return tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ 
                return (actionId in statObject[_] 
                                      && 'ifList' in statObject[_][actionId] 
                                      && ifId in statObject[_][actionId].ifList) ? statObject[_][actionId].ifList[ifId].updatesList : [] 
            })
            .filter( function(_){ return _.length })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

    }

    var countActionViews = function(mask, actionId){
        var action = statObject[mask][actionId];
        return ( action && 'viewList' in action ? action.viewList : [] )
                .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
                .reduce(function(acc, i){ if (-1 !== acc.indexOf(i)) { return acc } else { acc.push(i); return acc}}, [])
                .reduce(function(acc, i){ return acc + 1 }, 0);
    }

    var replaceNamesWithWeights = function(weights, seq){
        return seq
            .map(function(_){ return weights[_] })
            .map( function(_){ return void 0 === _ ? 0 : _ } )
    }

    this.getSum = function(actionId, url){ // @TODO should not be actionId as parameter

        var number = tools
            .returnAll(url, Object.keys(statObject) )
            .filter(function(mask){ return '*/' !== mask })
            .map( function(mask){ // each action is atoms group/seq with it's own view names
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        var action = statObject[mask][actionId];
                                        var weights = this.getStoreWeights(actionId, url);
                                        var replacer = replaceNamesWithWeights.bind(this, weights);

                                        var viewsNum = countActionViews(mask, actionId);   

                                        var actionNum = replacer( action && 'atomList' in action ? action.atomList : [] )
                                                    .reduce( function(acc, i){ return acc + i }, 0) // sum
                                        return viewsNum * actionNum;
                                    }.bind(this))
                                    .reduce( function(acc, i){ return acc + i }, 0) // sum
            }.bind(this)) 

        console.log('pre:',number )

        return number.reduce(function(acc, i){ return acc + i}, 0);
    }

    this.getStoreWeights = function(actionId, url){
        var weights = [];

        if( '*' in statObject ) weights = Object.keys(statObject['*'])
                        .map(function(id){ return statObject['*'][id].updatesList })
                        .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

        weights = tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ return actionId in statObject[_] ? statObject[_][actionId].updatesList : [] })
            .concat(weights)
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .reduce(function(acc, i){ if(i in acc ) acc[i]++; else acc[i] = 1; return acc }, {})

        return weights;
    }

    this.getWeight = function(actionId, url, storeName){
        var weights = this.getStoreWeights(actionId, url);
        return (storeName in weights) ? weights[storeName] : 0;
    }

    this.putLink = function(storeName, eventName) {
        if (!(eventName in storeByEvent)) storeByEvent[eventName] = [];
        storeByEvent[eventName].push(storeName);
    }

    this.getStores = function(eventNames) { 
        return eventNames
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
    }

    return this;
}

module.exports = Stat;



},{"../lib":13,"../utils":18,"./tools":11}],11:[function(_dereq_,module,exports){
"use strict";

var utils = _dereq_('../utils');

var _test = function(path, mask){
    if ( !path || !mask ) return false;

    return null !== utils.matchRoute(path, mask)
}

var _return = function(path, mask){
    if ( !path || !mask ) return false;

    return null !== utils.matchRoute(path, mask) ? mask : void 0
}

var _testAll = function(path, masks){
    if ( !path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks)
    .map(_test.bind(void 0, path))
    .reduce( function(v, i) { return v || i }, false)
}

var _returnAll = function(path, masks){
    if ( !path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks)
                .map(_return.bind(void 0, path))
                .filter( function(_){ return _ })
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


module.exports = {
    // test :: path -> mask -> Bool
    test: _test
    // testAll :: path -> [mask] -> Bool
    ,testAll: _testAll
    ,return: _return
    ,returnAll: _returnAll
    // parse :: path -> mask -> {params}
    ,parse: _parse
    // parseAll :: path -> [mask] -> {params}
    ,parseAll: _parseAll
};


},{"../utils":18}],12:[function(_dereq_,module,exports){
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

},{}],13:[function(_dereq_,module,exports){
"use strict";
/**
   Utils library.
 */
var container = Object.create(null);
var s = (function(){

    var _ = window._
        ,Promise = window.Promise
        ,Bacon = window.Bacon

    var that = this;
    this.id = function(value) { return value; }
    this.nop = function() { return void 0; }

    this.pass = function() { return function(promise) { return promise; } }
    this.inject = function(data) { return function() { return data; } }
    /**
     *
     * @param fn - promise callback
     * @param fn2 - reject callback
     * @returns {Function}
     */
    this.then = function(fn, fn2) { return function(promise) { return promise.then(fn, fn2); }; }

    /**
     * Decorator that accept resolving of promise to let free the blocking of function it decorates.
     * The blocking is exported as reference to variable in context.
     * @TODO only export the blocking variable, use closure to serve real blocking reference.
     * @param obj
     * @param item
     * @returns {Function}
     */
    this.sync = function(obj, item) {

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
                    return Promise.reject();
                }
            }
        }

        return function(fn) {
            return _.compose( that.then(resolvePromise), blockPromise(fn));
        }
    }

    /**
     * Depreated
     *
     * */
    /**
     * Deprecated. Use sync
     * @param obj
     * @param item
     * @param fn
     * @returns {Function}
     */
    this.guardWithTrue = function(obj, item, fn) {
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
    this.resolveGuard = function(obj, item, fn) {
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
    this.Herald = function() {
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
    this.a2a = function(args) {
        return Array.prototype.slice.apply( args );
    }

    this.unary = function(fn) {
        return function(val) {
            return fn.call(this, val);
        }
    }

    /**
     * Accepts collection.
     * it pass obj value and object name to fn (temporary 2 args)
     * @type {Function}
     */
    this.map = _.curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.map(that.unary(fn));

        var mapped = {};

        for( var name in obj ) {
            mapped[name] = fn(obj[name]);
        }

        return mapped;

    });

    // @TODO create mapKeys


    this.fmap = _.curry( function(fn, obj) {
        return obj.fmap(fn);
    });
    
    // @TODO check immutability/mutability
    this.filter = _.curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.filter(that.unary(fn));

        var filtered = {};

        for( var name in obj ) {
            if ( fn(obj[name]) ) { 
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    this.filterKeys = _.curry( function(fn, obj) {
        if ( ! obj ) return obj;

        var filtered = {};

        for( var name in obj ) {
            if ( fn(name) ) { 
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    this.reduce = _.curry( function(fn, startValue, obj) {
        if ( !obj ) return startValue;
        if (obj && obj.reduce) Array.prototype.reduce.call(obj, fn, startValue);

        var reduced = {};

        for( var name in obj ) {
            reduced = fn(reduced, obj[name], name);
        }

        return reduced;
    });

    this.concat = _.curry( function(a, b) {
        return b.concat(a);
    });

    this.flatMap = function(arr) {
        return Array.prototype.concat.apply([], arr);
    }

    this.last = function(arr) {
        if (arr) {
            return arr[arr.length-1];
        } else {
            return void 0;
        }
    };
    this.head = function(arr) {
        if (arr) {
            return arr[0];
        } else {
            return void 0;
        }
    };
    this.negate = function(obj) {
        return !obj;
    }

    this.eq = _.curry( function(obj, obj2) {
        return obj === obj2
    });

    this.notEq = _.curry( function(obj, obj2) {
        return obj !== obj2
    });

    this.empty = function(obj) {
        return obj === null || obj === void 0 || obj === '' || ( (obj instanceof Array) && 0 === obj.length ) || ('object' === typeof obj && 0 === Object.keys(obj).length);
    }
    this.notEmpty = _.compose( this.negate, this.empty );

    this.simpleDot = function(expression, obj) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    this.flipSimpleDot = function(obj, expression) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    // expression is ".something" or ".something.something"
    this.dot = _.curry( function(expression, obj) {
        return expression.split('.').filter(that.notEmpty).reduce(that.flipSimpleDot, obj);
    });

    // expression is ".something" or ".something.something"
    this.flipDot = _.curry( function(obj, expression) {
        return that.dot(expression, obj);
    });

    this.set = _.curry( function(item, obj, value) {
        if(item) {
            obj[item] = value;
            return obj;
        } else {
            return value;
        }
    });

    this.plus = _.curry( function(item1, item2) {
        return item1 + item2;
    });

    this.trim = function(string) {
        return string.trim();
    }

    this.flip = function(fn) {
        return _.curry(function() {
            return fn.apply(this, that.a2a(arguments).reverse());
        }, fn.length);
    };

    this.replace = _.curry( function(where, replacer, obj) {
        return obj.replace(where, replacer);
    });

    this.push = function( item, obj ) {
        if ( ! obj ) {
            return function(obj) { return obj.push(item); };
        } else {
            return obj.push(item);
        }
    };

    this.split = _.curry( function( char, obj ) {
        return obj.split(char);
    });

    this.log = function(what) {
        console.log(what);
        return what;
    }

    this.logIt = function() {
        var args = that.a2a(arguments);
        return function(what) {
            console.log.apply(console, args.concat(what) );
            return what;
        }
    };

    this.side = function(fn) {
        var args = that.a2a(arguments);
        return function(param) {
            if (args.length > 1) {
                fn = _.compose.apply(this,args);
            }
            fn.call(this, param);
            return param;
        }
    }

    this.instanceOf = function( type, object ) {
        return object instanceof type;
    }

    this.typeOf = _.curry(function( type, object ) {
        return type === typeof object;
    });
    

    this.mapD = function(fn) {
        return function() {
            return that.map(fn, that.a2a(arguments))
        }
    }

    // Promises
    this.promise = function(value) {
        return new Promise( function(fullfill, reject ) { 
             fullfill(value);
        });
    }

    this.promiseD = function(promiseProvider) {
        return function() {
            var result = promiseProvider.apply(this, arguments );
            if ( 'Promise' === result.constructor.name){
                return result;
            } else {
                return that.promise(result);
            }
        }
    }

    //memoize.js - by @addyosmani, @philogb, @mathias
    // with a few useful tweaks from @DmitryBaranovsk
    this.memoize = function( fn ) {
        return function () {
            var args = Array.prototype.slice.call(arguments),
                hash = "",
                i  = args.length;
            var currentArg = null;
            while(i--){
                currentArg = args[i];
                hash += (currentArg === Object(currentArg)) ? JSON.stringify(currentArg) : currentArg;
                fn.memoize || (fn.memoize = {});
            }
            return (hash in fn.memoize) ? fn.memoize[hash] :
                fn.memoize[hash] = fn.apply( this , args );
        };
    }

    this.Perf = function() {
        var time;
        this.count = 0;
        this.begin = function() {
            time = Date.now();
        }
        this.end = function() {
            this.count += Date.now() - time;
        }
    }

    this.extend = _.curry(_.extend, 2);
    this.merge = _.curry(_.merge, 2);

    this.ifelse = _.curry( function(condition, then, _else, value){
        if( condition( value ) ) return then(value);
        else return _else(value)
    });

    this.if = _.curry( function(condition, then, value){
        if( condition( value ) ) return then(value);
        else return value;
    });

    this.type = function(item, type) {
        
        if ( type !== typeof item && item ) {
            var error = new Error('Type Error: ' + item + ' should be ' + type);
            console.error(error.message, error.stack)
            throw error;
        }
    }

    this.simpleType = function(data, key) {
        return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
    }

    this.isPromise = function(promise) {
        if ( promise && 'function' === typeof promise.then ) return true;
        else return false;
    }

    this.tryF = function(fallbackValue, fn){
        return function() {
            try {
                return fn.apply(this, arguments)
            } catch(e) {
                return fallbackValue
            }
        }
    }

    this.tryD = function(fn, errorCallback){
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch(e) {
                console.error(e.message, e.stack);
                if( errorCallback) return errorCallback(e);
            }
        }
    };

    this.baconTryD = function(fn) {
        return that.tryD(fn, function(e) { return Bacon.Error(e) })
    }

    this.promiseTryD = function(fn) {
        return that.tryD(fn, function(e) { return Promise.reject(e) })
    }

    this.apply = function(doProvider, value) {
        if ('function' === typeof doProvider) {
            return doProvider(value);
        } else {
            return doProvider;
        }
    }

   this.maybe = function(nothing, fn){
       return function(){
           try {
               return fn.apply(this, that.a2a(arguments))
           } catch (e) {
               return nothing
           }
       }
   }

   this.copy = _.compose( JSON.parse, JSON.stringify );

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

   return this;

}.bind(container))();

module.exports = s;

},{}],14:[function(_dereq_,module,exports){
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

},{"./lib":13,"./upstream.js":17}],15:[function(_dereq_,module,exports){
"use strict";
var s = _dereq_('./../lib')
     ,_ = window._
     ,u = _dereq_('../utils')
     ,Promise = window.Promise
     ,l = _dereq_('../inc/log')();

var State = function(React){
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

var Render = function(React) {
    var state = new State(React);

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

},{"../inc/log":8,"../utils":18,"./../lib":13}],16:[function(_dereq_,module,exports){
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


},{}],17:[function(_dereq_,module,exports){
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

},{"./lib":13}],18:[function(_dereq_,module,exports){
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


utils.newPage = true;

utils.saveScroll = _.debounce(function(event){
    var stateData = {
        scrollTop: document.querySelector('body').scrollTop
    };
         
    window.history.replaceState(stateData, null);
}, 50)

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


utils.sanitizeUrl = function(url){
    if ('' === url) throw new Error('Atlant.js: url cannot be empty')
        var escapedRoute = url
    .toLowerCase()
    .replace(/\/+$/, "");  // replacing last /
    if ('' === escapedRoute) escapedRoute = '/';
    return escapedRoute;
}


module.exports = utils;

},{"./lib":13}]},{},[3])
(3)
});
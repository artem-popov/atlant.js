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
        ,Stat = require('./inc/statistics');


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

    var RenderOperationKey = {};
    RenderOperationKey[RenderOperation.render] = 'render'; 
    RenderOperationKey[RenderOperation.draw] = 'draw'; 
    RenderOperationKey[RenderOperation.replace] = 'replace'; 
    RenderOperationKey[RenderOperation.change] = 'change'; 
    RenderOperationKey[RenderOperation.clear] = 'clear'; 
    RenderOperationKey[RenderOperation.redirect] = 'redirect'; 
    RenderOperationKey[RenderOperation.refresh] = 'refresh'; 
    RenderOperationKey[RenderOperation.move] = 'move'; 
    RenderOperationKey[RenderOperation.nope] = 'nope'; 

    var atlantState = {
        viewRendered: {} // Flag that this view is rendered. Stops other streams to perform render then.
        ,isLastWasMatched: false // Allow lastWhen to stop other when's execution
        ,actions: {}
    }

    /* Helpers */
    var assignRenders = function(){

        // Signalling that view renders
        var whenRenderedSignal = function( upstream ) {
            if (!upstream.isAction && upstream.id !== activeStreamId.value) return // this streams should not be counted.

            if (upstream.render.renderOperation === RenderOperation.draw && !upstream.isAction ){
                renderStreams.drawEnd.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render }); // This is mostly for first render and for user
            }

            if (upstream.render.renderOperation !== RenderOperation.draw && !upstream.isAction ){
                renderEndSignal.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render }); // This will count the renders
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if (upstream.render.renderOperation === RenderOperation.nope || upstream.render.renderOperation === RenderOperation.draw || upstream.isAction || upstream.render.renderOperation === RenderOperation.move || upstream.render.renderOperation === RenderOperation.redirect || upstream.render.renderOperation === RenderOperation.replace || upstream.render.renderOperation === RenderOperation.change )
                return true;

            if ( upstream.render.viewName in atlantState.viewRendered ) {  // If this view is already rendered...
                whenRenderedSignal(upstream);
                return false;
            } else { // If this view not yet rendered...
                atlantState.viewRendered[upstream.render.viewName] = upstream.id;

                return true;
            }
        };

        // Registering render for view.
        var assignRender = function(stream) {
            var theStream = stream
                .filter( renderStopper );

            baseStreams.onValue( theStream, function(upstream){
                    if( void 0 === upstream || activeStreamId.value !== upstream.id ) { return void 0; }
                    console.log('--a--upstream.id:', upstream.render.id, upstream.id)

                    try{ 
                        var viewName = s.dot('.render.viewName', upstream);
                        savedViewScope[viewName] = clientFuncs.getScopeDataFromStream(upstream);

                        var scopeFn = function(viewName) { return clientFuncs.createScope(savedViewScope[viewName]) }.bind(void 0, viewName);
                        var viewProvider = s.dot('.render.renderProvider', upstream);

                        // Choose appropriate render.
                        var render;
                        if (RenderOperation.nope === upstream.render.renderOperation ){
                            whenRenderedSignal(upstream);

                            return;
                        }

                        if (RenderOperation.redirect === upstream.render.renderOperation ){
                            if ('function' === typeof viewProvider) {
                                upstream.doLater = function(viewProvider, scopeFn){utils.goTo(viewProvider(scopeFn())).bind(void 0, viewProvider, scopeFn)}
                            } else {
                                upstream.doLater = function(viewProvider){utils.goTo(viewProvider).bind(void 0, viewProvider)}
                            }

                            whenRenderedSignal(upstream);

                            return;
                        } if (RenderOperation.refresh === upstream.render.renderOperation ){
                            upstream.doLater = function(){utils.goTo( window.location.pathname, void(0), true)}

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.replace === upstream.render.renderOperation ){
                            upstream.doLater = function(viewProvider, scopeFn){
                                var path = s.apply(viewProvider, scopeFn());
                                lastPath = path; 
                                utils.replace(path);
                            }.bind(void 0, viewProvider, scopeFn)

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.change === upstream.render.renderOperation ){
                            upstream.doLater = function(viewProvider, scopeFn){
                                var path = s.apply(viewProvider, scopeFn());
                                lastReferrer = lastPath;
                                lastPath = path;
                                utils.change(path);
                            }.bind(void 0, viewProvider, scopeFn)

                            whenRenderedSignal(upstream);

                            return;
                        } else if (RenderOperation.move === upstream.render.renderOperation){

                            if ('function' === typeof viewProvider) 
                                window.location.assign(viewProvider(scopeFn()))
                            else 
                                window.location.assign(viewProvider)

                            return;
                        } else {
                            if ( RenderOperation.render === upstream.render.renderOperation || RenderOperation.draw === upstream.render.renderOperation ) {
                                render = prefs.render.render.bind(prefs.render)
                            } else if ( RenderOperation.clear === upstream.render.renderOperation ){
                                render = prefs.render.clear.bind(prefs.render)
                            }

                            // turn off all subscriptions of atoms for this view
                            if( viewSubscriptionsUnsubscribe[viewName] ) {  // finish Bus if it exists;
                                viewSubscriptionsUnsubscribe[viewName]();
                                // console.log('atom: unsubscribe', viewName)
                            } 

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
                                // console.log('WARNING! ACTION ON THE BOARD!')
                            }

                            var renderIntoView = function(viewProvider, upstream, viewName, scope, whenRenderedSignal ) {
                                var renderD = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)
                                // l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
                                return renderD(viewProvider, upstream, activeStreamId, viewName, scope)
                                    .then(function(_){
                                        // @TODO make it better
                                        // using copy of upstream otherwise the glitches occur. The finallyStream is circular structure, so it should be avoided on copy
                                        // console.log('csope: view...', viewName, scopeFn)
                                        var atoms = upstream.atoms;
                                        upstream.atoms = void 0;

                                        var stream = s.clone(upstream); 
                                        
                                        stream.atoms = atoms;
                                        upstream.atoms = atoms;

                                        if(_.code && 'notActiveStream' === _.code){
                                        } else {
                                            stream.render.component = _;  // pass rendered component. it stale hold before streams get zipped.
                                        }
                                        return stream 
                                    })
                                    .then( whenRenderedSignal )
                                    .catch( clientFuncs.catchError )
                            }.bind(void 0, viewProvider, upstream, viewName)



                            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue(function(upstream, viewName, scopeFn, atom){ 
                                var data = scopeFn();
                                // console.log('atom:', viewName, atom.value) 
                                if ( !_.isEqual(data, viewData[viewName] ) ) {
                                    viewData[viewName] = scopeFn();
                                    console.log('updating view...', viewName, atom.name, atom.ref)
                                    var rendered = renderIntoView(data, function(_){return _}); // Here we using scope updated from store!
                                    return rendered.then(function(upstream, o){
                                        atomEndSignal.push({id: upstream.id, whenId: upstream.whenId});
                                        return o;
                                    }.bind(void 0, upstream));
                                } else {
                                    console.log('canceled render due the same data', viewName, atom.name, atom.ref)
                                    atomEndSignal.push({id: upstream.id, whenId: upstream.whenId});
                                }
                            }.bind(void 0, upstream, viewName, scopeFn));

                            var data = scopeFn();
                            return renderIntoView(data, whenRenderedSignal) // Here we using scope updated from store!

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
            console.log('assign renders to:', count, 'streams')

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
                    .map( function(depName, dep, upstream) { 
                        if (!upstream.depends) upstream.depends = {};
                        upstream.depends[depName] = dep;
                        return upstream;
                    }.bind(void 0, depName, dep))
            } else {

                stream = stream
                    .flatMap(function(store, depName, upstream) {
                        var scope = clientFuncs.createScope(upstream);
                        var where = (upstream.with && 'value' in upstream.with) ? upstream.with.value : s.id; 
                        var atomParams = function(atomIds, scope, where, store, ref, isConsole/*variable for debug*/, parentRef) { 
                            // if (isConsole) console.time('atom', store, ref);
                            var aParentRef = isConsole ? ref : parentRef;
                            var dependAtoms = scope;
                            if ( 'undefined' !== typeof store) {

                                dependAtoms = (atomIds || [])
                                    .map( function( aParentRef, atom ){
                                        var atom_id = atom.fn(false, aParentRef)

                                        var atomValue = s.tryF( void 0, function() { return atom.partProvider(atom.storeData.staticValue, atom_id) })();
                                        var res = { ref: atom.ref, value: atomValue, id: atom_id, atom: atom } // @TODO: Optimize it! Now atom calls all it's parents again and again. This can't be called best :)
                                        return res
                                    }.bind(void 0, aParentRef))

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
                            .map(function(upstream, atomParams, store, depName, results){
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
                            }.bind(void 0, upstream, atomParams, store, depName))
                    }.bind(void 0, store, depName))
            }

            stream = stream
                .map(function(depName, store, injects, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
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

                        // console.log('subscribing to lastAtom:', atomId, stream.ref, (upstream.lastAtom || {ref: 'no previous'}).ref)
                        
                        var atom = { id: atomId
                                        ,atomParams: upstream.atomParams
                                        ,ref: stream.ref
                                        ,store: store.storeName
                                        ,atom: store.partName
                                        ,bus: bus
                                        ,prev: upstream.lastAtom
                        };

                        stream.atoms.push(atom);
                        if(stream.lastAtom) stream.lastAtom.next = atom;
                        atom.that = atom;
                        stream.lastAtom = atom;
                    } 

                    return stream;
                }.bind(void 0, depName, store, injects))

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
    var interceptorBus = baseStreams.bus();



    // Browser specific actions.
    if ('undefined' !== typeof window) {
        var states = require( './inc/wrap-push-pop-states.js');
        states.wrapPushState(window);
        // states.wrapPopState(window);

        // Subscribe to clicks and keyboard immediatelly. Document already exists.
        utils.attachGuardToLinks();
    }


    var whenCount = { value: 0 };
    var renderStreams = require('./render-streams')(Counter, whenCount);


    var defValue = function(){ return { value: 0 } };
    var onRenderEndStream = baseStreams.bus();
    var onDrawEndStream = baseStreams.bus();
    var onServerEndStream = baseStreams.bus(); 
    var onBothEndStreams = onServerEndStream.zip(onRenderEndStream, function(x,y){return y});
    var onFinalEndStream = baseStreams.bus();  // will be returned to user. will be called after postponed actions. will be user for first render.

    var atomCounter = { list: {} };
    var isAtomed = { value: false };
    var atomEndSignal = baseStreams.bus();
    var atomRecalculateSignal = baseStreams.bus();

    var renderCounter = { list: {} };
    var isRendered = { value: false };
    var renderEndSignal = baseStreams.bus();
    var renderRecalculateSignal = baseStreams.bus();

    var sumCounter = function(counter){
        return Object.keys(counter.list)
                            .map( function(id){ return counter.list[id].value })
                            .reduce(function(acc, i){ return acc + i }, 0) 
    }

    var checker = function(name, isFinished, isNeedToDecrease, signalStream, counter, object){
        try{
            if ( isFinished.value ) { /*console.log('Canceled atom signal after render is completed');*/  return }
            if ( !(object.whenId in counter.list) ) { /*console.log('no atoms here');*/ return } // no atoms here 


            if(isNeedToDecrease) counter.list[object.whenId].value--;
            var signalled = sumCounter(counter);
            var calculated = ( -1 !== name.indexOf('atom') ) ? statistics.getSum(lastPath) : statistics.getRenderSum(lastPath);

            // if(-1!==name.indexOf('atom')) 
                console.log(name, signalled, calculated, 'whenId:', object.whenId, 'itemIds:', object.itemIds, counter, object.item ? object.item.type : "", object.item ? object.item.viewName : '')

            if (0 === signalled + calculated) {
                console.log('GOTTCHA!', name)
                isFinished.value = true
                signalStream.push()
                if(-1 === name.indexOf('atom'))  {
                    checker( 'atomAsk:', isAtomed, false, onServerEndStream, atomCounter, object ) // In case if there are no atoms and atom cancels we can check here and it will be clear, should server end or not.
                }
            }   
        } catch(e){
            console.error(e.stack)
        }

    }


    atomEndSignal.onValue(checker.bind(void 0, 'atom', isAtomed, true, onServerEndStream, atomCounter ))
    atomRecalculateSignal.onValue(checker.bind(void 0, 'atomCancel:', isAtomed, false, onServerEndStream, atomCounter ))

    renderEndSignal.onValue(checker.bind(void 0, 'render:', isRendered, true, onRenderEndStream, renderCounter));
    renderRecalculateSignal.onValue(checker.bind(void 0, 'renderCanceled:', isRendered, false, onRenderEndStream, renderCounter));

    onServerEndStream.onValue(function(value){console.log('SERVER END STREAM!')})
    onRenderEndStream.onValue(function(value){console.log('RENDER END STREAM!')})

    var performCallback = function(upstreams, callbackStream, postponedActions) {
            try {

                callbackStream.push();
                console.log('performCallback!!!')

                postponedActions.forEach(function(action){
                    action();
                });

            } catch (e) {
                console.error('Atlant Error:', e)
                errorStream.push(e);
            }
    }

    // baseStreams.onValue( renderStreams.drawEnd, function(upstream){
    //         var upstreams = {};
    //         upstreams[upstream.render.viewName] = upstream;
    //
    //         performCallback(upstreams, onDrawEndStream, upstream.postponed ? [upstream.postponed] : []);
    // });

    /* Except .draw() every render get this*/
    
    baseStreams.onValue( onBothEndStreams, function(upstreams){
        if (typeof window !== 'undefined') lastPath = utils.rebuildURL(utils.getLocation());

        var doLater = _.first(  _(upstreams).reduce( function(acc, v, k){ if(v.doLater) acc.push(v.doLater); return acc }, [])  ); 
        var redirectAction = function(doLater){ if(doLater) setTimeout( doLater, 0 ) }.bind(void 0, doLater);
        var postponedActions = _(upstreams).reduce( function(acc, v, k){ if(v.postponed) acc.push(v.postponed); return acc}, []);

        if (redirectAction) postponedActions.push(redirectAction);

        performCallback(upstreams, onFinalEndStream, postponedActions);

        return upstreams;
    })

    var routeChangedStream =  publishStream
        .merge( Bacon.fromBinder(function(sink) {
            if ( 'undefined' !== typeof window) {
                var routeChanged = function(sink, event) {
                    try{
                        event.preventDefault();
                        var path;
                        // var postponedScroll;

                        var state = function(event){ return 'pushstate' === event.type ? event.detail.state : ( 'popstate' === event.type ? event.state : void 0 )  };
                        if ( 'pushstate' === event.type ) { // On pushstate event the utils.getLocation() will give url of previous route.
                            path = event.detail.url; 
                        } else if ( 'popstate' === event.type ) {
                            path = utils.getLocation(); // On popstate utils.getLocation() always return current URI.
                        }

                        path = utils.rebuildURL(path);

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
                }.bind(void 0, sink);
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
                var path = utils.rebuildURL( utils.getLocation() ); 
                var referrer = utils.rebuildURL( utils.getReferrer() ); 

                stream = {
                    path: path
                    ,referrer: referrer
                }
            }

            return stream;
        })
        .filter( s.compose( s.empty, s.flip(matchRoutes, 3)(Matching.continue, prefs.skipRoutes), s.dot('path') )) // If route marked as 'skip', then we should not treat it at all.
        .map(function(upstream) {
            var stream = Object.create(null); 
            stream = _.extend(upstream);

            // Storing here the data for actions.
            lastPath = stream.path;
            lastReferrer = stream.referrer;
            lastMask = [];

            stream.id = _.uniqueId();
            activeStreamId.value = stream.id;


            // Nil values.
            whenCount.value = 0;
            Counter.reset();
            renderStreams.nullifyScan.push('nullify');

            // New system of nil values
            atomCounter.list = {};
            renderCounter.list = {};
            statistics.cleanUpRemoved();
            // Object.keys(viewSubscriptionsUnsubscribe) // Unsubscribing of all atoms. I think we don't need it.
            //             .map(function(viewName){
            //                 viewSubscriptionsUnsubscribe[viewName]();
            //             })
            isAtomed.value = false;
            isRendered.value = false;

            atlantState.viewRendered = {};
            atlantState.isLastWasMatched = false;
            return stream;
        });

    var rootStream = Bacon.fromBinder(function(sink) {
            baseStreams.onValue(routeChangedStream, function(sink, _) {
                assignRenders();
                sink(_);
            }.bind(void 0, sink));
        })
        .takeUntil(baseStreams.destructorStream)

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

            console.log('when!:', whenId, masks)
            TopState.state.lastMasks = masks;

            if (masks.filter(function(mask){ return '*' === mask}).length && whenType === WhenOrMatch.when) { throw new Error( 'Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")' ); }

            var name = (whenType === WhenOrMatch.match) ? 'match' : 'when';
            name = name + createNameFromMasks(masks) + _.uniqueId();

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, State.state);
            var stats = TopState.state.stats;

            var whenMasks = masks;
            if( WhenOrMatch.when === whenType )
                masks.forEach(function(mask) {  // @TODO: old thing
                    s.push({mask: utils.stripLastSlash(mask)}, routes);
                });

            masks = _(masks).map(function(mask){return [mask, utils.getPossiblePath(mask)]}).flatten().value();

            State.state.lastWhen = rootStream
                .map( function(masks, upstream) {
                    var mask = _(masks)
                                    .filter(function(whenType) { if(WhenOrMatch.match === whenType) return true; else return ! atlantState.isLastWasMatched; }.bind(void 0, whenType)) // do not let stream go further if other is already matched. .match() streams are immune.
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
                }.bind(void 0, masks))
                .filter(s.id)
                .map(function (whenId, whenType, stats, name, injects, masks, whenMasks, upstream) {
                    upstream.whenId = whenId;
                    upstream.route.when = masks;
                    upstream.isFinally = false;
                    upstream.isMatch = WhenOrMatch.match === whenType;
                    if(activeStreamId.value === upstream.id) whenCount.value++;

                    atomCounter.list[whenId] = defValue();
                    renderCounter.list[whenId] = defValue();
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
                }.bind(void 0, whenId, whenType, stats, name, injects, masks, whenMasks))

            State.state.lastWhen = State.state.lastWhen.map( function(whenId, stream) { stream.conditionId = whenId; return stream; }.bind(void 0, whenId))

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
            .map( function(depName, injects, whenId, stats, upstream) {
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
            }.bind(void 0, depName, injects, whenId, stats))

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
            .map( function(depName, injects, nameContainer, stats, whenId, isAction, depValue) {
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
            }.bind(void 0, depName, injects, nameContainer, stats, whenId, isAction ))

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
            .map( function(depName, injects, whenId, stats, depValue) {

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

            }.bind(void 0, depName, injects, whenId, stats))

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
            .map( function(ifId, depName, injects, upstream) {
                var stream = injectsGrabber.add(depName, {}, injects, upstream);

                if ( !upstream.isAction && activeStreamId.value === upstream.id ) whenCount.value++; // increasing counter only if this stream is not yet obsolete

                stream.conditionId = ifId;
                return stream;
            }.bind(void 0, ifId, depName, injects))

        var thisIfNegate = thisCommonIf 
            .map(function(ifId, fnNegate, condition, upstream){
                var scope = clientFuncs.createScope(upstream);
                var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fnNegate);
                if ( checkCondition(scope) ) return upstream;
                else return void 0;
            }.bind(void 0, ifId, fnNegate, condition))
            .filter( s.id )

        thisIfNegate.onValue(function(ifId, actionId, condition, u){
            var renders = statistics.getRendersByUrl(actionId, lastPath, ifId);
                console.log('negating renders...:', renders)
            if(renders.length) {
                statistics.removeRenders(u.whenId, u.masks, renders);
                renderRecalculateSignal.push({id: u.id, whenId: u.whenId, itemIds: renders}); 
            }
            var updates = statistics.getUpdatesByUrl(actionId, lastPath, ifId);
            if(updates.length) {
                console.log("UPDATES:", updates )
                statistics.removeUpdates(u.whenId, u.masks, updates);
                atomRecalculateSignal.push({id: u.id, whenId: u.whenId}); 
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
            ,masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction] // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.
        });  
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
                // .map( function(u){ return _.extend( {}, u) } )
                // .map( function(_){ if ( activeStreamId.value !== _.id ) { return void 0 } else { return _ } } )
                // .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
                .map(function(renderId, renderProvider, viewName, renderOperation, u) { 
                    var render = { render: { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: RenderOperationKey[renderOperation]}};
                    return _.extend( {}, u, render )
                }.bind(void 0, renderId, renderProvider, viewName, renderOperation))
                .map(function(_){
                    console.log('aaaaa:', _.render.id)
                    return _
                })

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);


            console.log('set render:', renderId)

            if (RenderOperation.draw !== renderOperation) {
                console.log('registering render:', renderId, TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], viewName, RenderOperationKey[renderOperation], renderProvider, 'ifIds:', State.state.lastIfIds);
                statistics.whenStat({ actionId: TopState.state.lastActionId,
                                ifIds: State.state.lastIfIds,
                                masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction],
                                render: renderId
                }); 
            } 

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
            .map( function(depName, injects, stats, whenId, obj) {

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
            }.bind(void 0, depName, injects, stats, whenId))

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

    var _onServerEnd = function(callback) {
        baseStreams.onValue(onBothEndStreams , s.baconTryD(callback));
        return this;
    }
    var _onRenderEnd = function(callback) {
        baseStreams.onValue(onFinalEndStream, s.baconTryD(callback));
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


    var _attach = function(rootView, selector) {
        s.type(rootView, 'string');
        s.type(selector, 'string');

        if( 'undefined' === typeof window )   {}

        var firstRender = renderStreams
                            .drawEnd
                            .merge(renderEndSignal)
                            .filter(function(_){
                                if ( _.item && (_.item.renderOperation === RenderOperation.render || _.item.renderOperation === RenderOperation.draw ) && _.item.viewName === rootView)  return true // accept only first render/draw of rootComponent
                                else return false
                            })
                            .take(1);

        baseStreams.onValue(firstRender, function(rootView, selector, value) { // value contains all rendered upstreams.
            prefs
                .render.attach(rootView, selector )
                .catch(function(e) {
                    console.error(e.message, e.stack);
                    errorStream.push(e);
                })
                .then( s.logIt("we' done.") )
        }.bind(void 0, rootView, selector));

        return this;
    }

    var _stringify = function(rootView, options) {
        return prefs.render.stringify(rootView, options );
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
        stores[storeName].bus = stores[storeName].updater.scan(constructorProvider(), function(storeName, state, updater){ 
            var newState = updater(state);
            stores[storeName].staticValue = newState;

            if ('undefined' !== typeof window) {
                if (!window.stores) window.stores = {};
                window.stores[storeName] = newState;
            }

            return newState 
        }.bind(void 0, storeName)).toEventStream();  

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
        
        baseStreams.onValue(emitStreams[updaterName], function(storeName, scope){
            stores[storeName].updater.push( function(scope, state){ 
                // console.log('updating!', updaterName, storeName)
                try{ 
                    var newVal = updater( state, scope);
                    return void 0 === newVal ? void 0 : s.copy(newVal) }
                catch(e) { 
                    console.log('atlant.js: Warning: updater failed', e)
                    return state
                }}.bind(void 0, scope) 
            )
        }.bind(void 0, storeName));

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
            .map( function(withs, upstream){
                return withGrabber.add(withs, upstream)
            }.bind(void 0, withs))
            .map( function(key, upstream) { 
                var refsData = clientFuncs.getRefsData( upstream ); 
                
                var data = ( upstream.with && 'value' in upstream.with ) ? upstream.with.value( refsData ) : refsData;

                if ( key in emitStreams ) emitStreams[key].push(data);
                else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");

                return upstream;
            }.bind(void 0, key));

        baseStreams.onValue( thisOp, function(updateCallback, upstream) { 
        });

        // TopState.state.stats.keys.push(key);
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
        if (!(storeName in stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
        if (!(partName in stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');

        statistics.whenStat({actionId: TopState.state.lastActionId, masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], atom: storeName });

        return _depends.bind(this)( function(storeName, partName){
            return function(storeName, partName, id){
                try{
                    return stores[storeName].parts[partName](stores[storeName].staticValue, id());
                } catch(e) {
                    return void 0;
                }
            }.bind(void 0, storeName, partName)
        }.bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, partName: partName, bus: stores[storeName].bus, partProvider: stores[storeName].parts[partName], storeData: stores[storeName]} );
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

    var _setInterval = s.setInterval;

    var _setTimeout = s.setTimeout;

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
    // Called everytime when route/action is rendered. DEPRECATED
    this.onRenderEnd =  _onRenderEnd;
    // Called when all atoms refreshed their views
    this.onServerEnd =  _onServerEnd;
    // Called everytime when draw renders.
    this.onDrawEnd =  _onDrawEnd;
    // Accepts element. After publish and first render the contents will be attached to this element.
    this.attach =  _attach;
    // After publish and first render the contents will be transferet to callback (first parameter).
    this.stringify =  _stringify;
    this.setTimeout =  _setTimeout;
    this.setInterval =  _setInterval;



    /**
     * Utils
     * These commands doesn't return "this".
     */
    // Returns atlant.js version
    this.version = require('./atlant-version');
    // Returns timestamp of the creation time
    this.build = require('./atlant-build');

    this.destroy = _destroy;
    this.isServer = function(){ return 'undefined' === typeof window }
    this.isBrowser = function(){ return 'undefined' !== typeof window }

    this.utils = require('./inc/tools'); // @TODO: rename to 'tools'


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

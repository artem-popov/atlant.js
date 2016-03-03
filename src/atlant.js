"use strict";
/**
 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 * @TODO: check(true) to check only this view params (by specifically set fields or somehow)
 * @TODO: depCache to check only this dep params (by specifically set fields or somehow)
 */

function Atlant(){
    var atlant = this;

    var s = require('./lib')
        ,l = require('./inc/log')()
        ,simpleRender = require('./renders/simple')
        ,reactRender = require('./renders/react')
        ,utils = require('./utils')
        ,Bacon = require('baconjs')
        ,_ = require('lodash')
        ,interfaces = require('./inc/interfaces')
        ,StateClass = require('./inc/state')
        ,clientFuncs = require('./inc/clientFuncs')
        ,Stat = require('./inc/statistics')
        ,Storage = require('./inc/storage')
    ;

    import _stream from './inc/stream'
    import baseStreams from "./inc/base-streams"

    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,renderNames = []
        ,viewNames = [];

    var whens = {}; // storing whens


    var statistics = new Stat();

    var activeRenderEnd;


    var lastFinallyStream;
    var prefs = {
            parentOf: {}
            ,checkInjectsEquality: true
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,viewState: ['root']
            ,on: { renderEnd: void 0 }// callback which will be called on finishing when rendering
            ,scrollElement: function(){ return 'undefined' !== typeof document ? utils.body : void 0 }
            ,defaultScrollToTop: true
            ,pre: void 0
            ,attachedViews: []
            ,onDrawEndCallbacks:[]
    }

    if ('undefined' !== typeof window) {  // Should be defined for debuggins reasons
        if (!window.stores) window.stores = {};
    }

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var withGrabber = new interfaces.withGrabber();

    var titleStore = { value: "" };

    // Streams specific vars
        var dependViews = {}  // Set the views hirearchy. Both for streams and for render.
        ,viewReady = {}


    var types = require('./inc/types');


    var atlantState = {
        viewRendered: {} // Flag that this view is rendered. Stops other streams to perform render then.
        ,isLastWasMatched: false // Allow lastWhen to stop other when's execution
        ,actions: {}
        // States from current route. Updated on route Load:
        ,lastPath: void 0 // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        ,lastMask: void 0
        ,lastReferrer: void 0
        ,lastHistory: void 0
        ,stores: {}
        ,renders: {} // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
        ,activeStreamId: { value: void 0 } // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
        ,interceptorBus: baseStreams.bus()
        ,emitStreams: {}
        ,viewData: {} // To check if the rendered data is the as data to be rendered.
    }


    if('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    utils.clearState();

    var TopState = new StateClass(); // State which up to when


    /* Helpers */


    /* matchRouteLast */
    var matchRouteLast = function(){
        var matchRouteWrapper = function(path, route){
            var match = utils.matchRoute(path, route.mask);

            return match ? { params:match, route:route } : null;
        }


        return s.curry( function(path, matchingBehaviour, route) {
            if ('string' === typeof route) route = {mask:route};
            var match = matchRouteWrapper(path, route);
            if (match && types.Matching.stop === matchingBehaviour) {
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
        matchingBehaviour = matchingBehaviour || types.Matching.continue;
        var tempRoutes =  routes
            .map(function(route) {
                return matchRouteLast( path, matchingBehaviour, route );
            })
            .filter(s.notEmpty)

        return s.head(tempRoutes);
    }

    /* Base and helper streams*/
    l.log('registering base streams...');

    var publishStream = baseStreams.bus();  // Here we can put init things.
    var errorStream = baseStreams.bus();

    // Browser specific actions.
    if ('undefined' !== typeof window) {
        var states = require( './inc/wrap-push-pop-states.js');
        states.wrapPushState(window);

        // Subscribe to clicks and keyboard immediatelly. Document already exists.
        utils.attachGuardToLinks();
    }


    var defValue = function(){ return { value: 0 } };
    var onDestroyStream = baseStreams.bus();
    var onRenderEndStream = baseStreams.bus();
    var onDrawEndStream = baseStreams.bus();
    var onAtomEndStream = baseStreams.bus(); 
    var onBothEndStreams = onAtomEndStream.zip(onRenderEndStream, function(x,y){return y});

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
            if ( !(object.whenId in counter.list) ) { /*console.log('no selects here');*/ return } // no selects here 


            if(isNeedToDecrease) counter.list[object.whenId].value--;
            var signalled = sumCounter(counter);
            var calculated = ( -1 !== name.indexOf('atom') ) ? statistics.getSum(atlantState.lastPath) : statistics.getRenderSum(atlantState.lastPath);

            // if(-1!==name.indexOf('atom')) 
                // console.log(name, signalled, calculated, 'whenId:', object.whenId, 'itemIds:', object.itemIds, counter, object.item ? object.item.type : "", object.item ? object.item.viewName : '')

            if (0 === signalled + calculated) {
                // console.log('GOTTCHA!', name, 'is completed')
                isFinished.value = true
                signalStream.push()
                if(-1 === name.indexOf('atom'))  {
                    checker( 'atomAsk:', isAtomed, false, onAtomEndStream, atomCounter, object ) // In case if there are no selects and select cancels we can check here and it will be clear, should server end or not.
                }
            }   
        } catch(e){
            console.error(e.stack)
        }

    }


    atomEndSignal.onValue(checker.bind(void 0, 'atom', isAtomed, true, onAtomEndStream, atomCounter ))
    atomRecalculateSignal.onValue(checker.bind(void 0, 'atomCancel:', isAtomed, false, onAtomEndStream, atomCounter ))

    renderEndSignal.onValue(checker.bind(void 0, 'render:', isRendered, true, onRenderEndStream, renderCounter));
    renderRecalculateSignal.onValue(checker.bind(void 0, 'renderCanceled:', isRendered, false, onRenderEndStream, renderCounter));

    // onAtomEndStream.onValue(function(value){console.log('ATOM END STREAM!')})
    // onRenderEndStream.onValue(function(value){console.log('RENDER END STREAM!')})

    var performCallback = function(upstreams, callbackStream, postponedActions) {
            try {

                callbackStream.push();

                postponedActions.forEach(function(action){
                    action();
                });

            } catch (e) {
                console.error('Atlant Error:', e)
                errorStream.push(e);
            }
    }

    var routeChangedStream =  publishStream
        .merge( Bacon.fromBinder(function(sink) {
            if ( 'undefined' === typeof window) return;
            var routeChanged = function(sink, event) {

                console.log( event instanceof PopStateEvent  ? "popstate" : "pushstate" );
                try{
                    var path;

                    // Using state from event. At this point the history.state is stil old.
                    var state = event instanceof PopStateEvent ? event.state : event.detail.state; // CustomEvent has details and state inside. PopStateEvent has just state inside.

                    // On pushstate event the utils.getLocation() will give url of previous route.
                    // Otherwise on popstate utils.getLocation() return current URI.
                    var path = event instanceof PopStateEvent ? utils.getLocation() : event.detail.url;

                    path = utils.rebuildURL(path);

                    let finishScroll; 
                    var loader = document.querySelector('.root-loader');
                    var trySetScroll = function(scrollTop){
                            if ('number' !== typeof scrollTop) return;
                            atlant.state.scrollRestoration = true;

                            var bodyHeight = utils.getPageHeight() + window.innerHeight;

                            if (!('scrollRestoration' in history)) loader.style.visibility = 'visible';

                            if (bodyHeight < scrollTop) {
                                utils.body.style.minHeight = (scrollTop + window.innerHeight) + 'px';
                                console.log('set min height to ', utils.body.style.minHeight)
                            }

                            console.log('scrolling to1:', scrollTop)

                            window.scrollTo(0, scrollTop)

                            finishScroll = (scrollTop => {
                                if(window.debug)debugger;
                                utils.body.style.minHeight = null;
                                // utils.unblockScroll();
                                atlant.state.scrollRestoration = false;
                                window.scrollTo(0, scrollTop);
                                console.log('scrolling to2:', scrollTop)
                                if (!('scrollRestoration' in history)) loader.style.visibility = null;
                            }).bind(void 0, scrollTop);

                    }

                    if ( event instanceof PopStateEvent ) {
                        trySetScroll(state.scrollTop)
                    } else if ( 0 === state.scrollTop ) {
                        finishScroll = (scrollTop => {
                            if (!('scrollRestoration' in history)) loader.style.visibility = null;
                        })
                    }

                    l.log('the route is changed!')
                    if (path !== atlantState.lastPath || (event && event.detail && event.detail.state && event.detail.state.forceRouteChange)) {
                        // if (!('scrollRestoration' in history)) { utils.unblockScroll();  } // removing fixed just before rendering
                        sink({
                            path: path
                            ,referrer: atlantState.lastPath
                            ,history: event 
                            // ,postponed: postponedCleanup
                        });
                        if(finishScroll) { requestAnimationFrame(finishScroll) }
                    }
                }catch(e){
                    atlant.state.scrollRestoration = false;
                    if (!('scrollRestoration' in history)) loader.style.visibility = null;
                    utils.body.style.minHeight = null;
                    // utils.unblockScroll();
                    console.error(e.stack)
                }
            }.bind(void 0, sink);
            window.addEventListener( 'popstate', routeChanged );
            window.addEventListener( 'pushstate', routeChanged );
            window.addEventListener( 'scroll', utils.saveScroll );

            if (!('scrollRestoration' in history)) {
                var loader = document.querySelector('.root-loader');
                if(loader) loader.style.visibility = null;
                utils.body.style.minHeight = null; 

                // utils.unblockScroll();
            }

            utils.saveScroll();
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
                    ,history: upstream.history
                }
            }

            return stream;
        })
        .filter( s.compose( s.empty, s.flip(matchRoutes, 3)(types.Matching.continue, prefs.skipRoutes), s.dot('path') )) // If route marked as 'skip', then we should not treat it at all.
        .map(function(upstream) {
            var stream = _.extend({}, upstream);

            // Storing here the data for actions.
            atlantState.lastPath = stream.path;
            atlantState.lastReferrer = stream.referrer;
            atlantState.lastHistory = stream.history;
            atlantState.lastMask = void 0;

            stream.id = _.uniqueId();
            atlantState.activeStreamId.value = stream.id;


            // New system of nil values
            atomCounter.list = {};
            renderCounter.list = {};
            statistics.cleanUpRemoved();
            isAtomed.value = false;
            isRendered.value = false;

            atlantState.viewRendered = {};
            atlantState.isLastWasMatched = false;
            return stream;
        });

    atlantState.rootStream = Bacon.fromBinder(function(sink) {
            baseStreams.onValue(routeChangedStream, function(sink, _) {
                if(prefs.pre) prefs.pre();
                sink(_);
            }.bind(void 0, sink));
        })
        .takeUntil(baseStreams.destructorStream)

    var otherwiseStream = baseStreams.bus(); 

    atlantState.rootStream
        .onValue( function(upstream) {
            var _whens = Object.keys(whens)
                .map( _ => whens[_] )
                .map( _ => { _.params = _.route.check(_.route.when, upstream.path); return _ })
                .filter( _ => !!_.params );

            if ( !_whens.length ) { 
                console.log('Otherwise is in work. Code: 3');
                otherwiseStream.push(upstream);
                return
            } 

            _whens.forEach( whenData => { 
                var data = {};
                data = _.extend(upstream, whenData);
                data.route.params = whenData.params.params;
                data.route.route = whenData.params.route;
                data.masks = whenData.route.whenMasks;

                // Storing here the data for actions.
                atlantState.lastMask = whenData.route.whenMasks;

                atomCounter.list[whenData.when.id] = defValue();
                renderCounter.list[whenData.when.id] = defValue();

                var params = s.reduce(function(result, item) { result[item] = data.route.params[item]; return result;}, {} , _.keys(data.route.params))

                var depData = {
                    location: upstream.path
                    ,mask: whenData.params.route.mask 
                    ,pattern: whenData.params.route.mask 
                    ,masks: whenData.route.whenMasks
                    ,params: whenData.params.params
                    ,referrer: upstream.referrer
                    ,history: upstream.history
                };
                atlantState.whenData = depData;

                if (whenData.when.type === types.WhenOrMatch.when && whenData.scrollToTop.value && 'undefined' !== typeof window) {
                    console.log('scrolling to top on when activation!')
                    window.scrollTo(0, 0);
                } else {
                    console.log('Cancel scrolling ')
                }

                var stream = whenData.route.fn( depData ) // @TODO should be a Stream.
                stream.onValue( _ => console.log("what?", _ ) );
                stream.push( depData )
            });

        })


    /* Base */


    /**
     * When
     */
    var _when = function(){

        return function(masks, fn, matchingBehaviour, whenType) {
            TopState.first();

            if ( -1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.')
            masks = masks
                        .split('||')
                        .map(s.trim)
                        .filter(function(_){ return _.length });

            if ( !masks.length ) throw new Error('At least one route mask should be specified.');

            TopState.state.lastMasks = masks;

            if (masks.filter(function(mask){ return '*' === mask}).length && whenType === types.WhenOrMatch.when) { throw new Error( 'Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")' ); }

            var whenId = _.uniqueId();
            var name = (whenType === types.WhenOrMatch.match) ? 'match' : 'when';
            var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
            var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName) );
            name = name + createNameFromMasks(masks) + _.uniqueId();

            // Allows attaching injects to .when().
            var scrollToTop = { value: whenType === types.WhenOrMatch.match ? false : true };
            TopState.state.scrollToTop = scrollToTop;

            var whenMasks = masks;
            if( types.WhenOrMatch.when === whenType )
                masks.forEach(function(mask) {  // @TODO: old thing
                    s.push({mask: utils.stripLastSlash(mask)}, routes);
                });

            masks = _(masks).map(function(mask){return [mask, utils.getPossiblePath(mask)]}).flatten().value();

            var check = (masks, path) => {
                return _(masks)
                    .filter(function(whenType) { if(types.WhenOrMatch.match === whenType) return true; else return ! atlantState.isLastWasMatched; }.bind(void 0, whenType)) // do not let stream go further if other is already matched. .match() streams are immune.
                    .map( matchRouteLast( path, matchingBehaviour ) )
                    .filter( s.notEmpty )                              // empty params means fails of route identity.
                    // .map(s.logIt('---matched routes!!!'))
                    .head()
            };

            whens[name] = { 
                when: { id: whenId, type: whenType},
                route: { when: masks, whenMasks: whenMasks, fn: fn, check: check },
                isFinally: false,
                isMatch: types.WhenOrMatch.match === whenType,
                scrollToTop: scrollToTop
            };

            return this;
        };
    }();

    var _action = function(action, fn, isAction, depCode){
        TopState.first();

        if (!action) throw new Error('Atlant.js: action stream is not provided!');
        if (!fn) throw new Error('Atlant.js: follow stream function is not provided!');

        action.onValue(function(depValue){
            if ('undefined' === typeof depValue) {
                depValue = {};
            }
            if ('object' === typeof depValue) {
                depValue = Object.assign(depValue, atlantState.whenData);
            }

            var stream = fn( depValue ); 
            stream.push( depValue )

        })


        return this;

    };

    var _pre = function(fn){
        prefs.pre = fn;
        return this;
    }

    var _defaultScrollToTop = function(value) {
        this.prefs.defaultScrollToTop = value;

        return this
    }

    var _scrollToTop = function(value) {
        if (void 0 !== TopState.state.scrollToTop) {
            TopState.state.scrollToTop.value = value;
        }

        return this
    }




    var _check = function(isCheck) {
        if ( 'undefined' === typeof isCheck)
            throw new Error('Atlant.js: check require boolean parameter.')


        prefs.checkInjectsEquality = isCheck;
        return this;
    }

    var _interceptor = function(){
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'interceptor' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        State.state.lastWhen = atlantState.interceptorBus
            .map( function(depName, injects, whenId, obj) {

                var depValue = {};  // @TODO RETHINK
                depValue.name = obj.upstream.ref;
                depValue.value = obj.scope;
                depValue.masks = atlantState.lastMask;
                depValue.pattern = utils.getPattern(atlantState.lastMask);
                depValue.mask = void 0;
                depValue.location = atlantState.lastPath;
                depValue.referrer = atlantState.lastReferrer;
                depValue.history = atlantState.lastHistory;

                var stream = injectsGrabber.add(depName, depValue, injects, {});

                stream.action = true;
                stream.isInterceptor = true;
                stream.isAction = true;
                stream.whenId = whenId;
                stream.id = atlantState.activeStreamId.value;

                l.log('---Matched interceptor!!!', depValue)

                return stream;
            }.bind(void 0, depName, injects, whenId))

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastOpId = whenId;
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
        prefs.onDrawEndCallbacks.push(s.tryD(callback));
        return this;
    }

    var _onRenderEnd = function(callback) { // Use this to get early callback for server render
        baseStreams.onValue(onBothEndStreams , s.baconTryD(callback));
        return this;
    }

    var _onDestroy = function(callback) { // Use this to get early callback for server render
        baseStreams.onValue(onDestroyStream, s.baconTryD(callback));
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

        prefs.attachedViews[rootView] = selector;

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

    var _push = function(actionName) {
        throw new Error('atlant.push() not implemented');
        return this;
    }

    var _store = function(storeName) {
        TopState.first();
        TopState.state.lastStoreName = storeName;

        if ( !(storeName in atlantState.stores) ) atlantState.stores[storeName] = { 
            _constructor: void 0, 
            updater: void 0,
            value: Storage.load(storeName) || void 0,
            staticValue: Storage.load(storeName) || void 0,
            updaters: {},
            parts: {}
        };

        return this;
    };

    var _serialize = function(serializeProvider){
        var storeName = TopState.state.lastStoreName; 
        if (!storeName) { throw new Error('.serialize() should be after .store()') }
        if ( 'function' === typeof atlantState.stores[storeName]._serialize ) { throw new Error("Serialize already implemented in store ", storeName)}
        if( 'function' !== typeof serializeProvider ) { throw new Error("Serialize should be a function for ", storeName)}

        atlantState.stores[storeName]._serialize = serializeProvider;

        return this
    }

    var _constructor = function(constructorProvider){
        var storeName = TopState.state.lastStoreName; 
        if (!storeName) { throw new Error('.constructor() should be after .store()') }
        if ( 'function' === typeof atlantState.stores[storeName]._constructor ) { throw new Error("Constructor already implemented in store ", storeName)}
        if( 'function' !== typeof constructorProvider ) { throw new Error("Constructor should be a function for ", storeName)}

        atlantState.stores[storeName]._constructor = _ => Storage.load(storeName) || constructorProvider();
        atlantState.stores[storeName].changes = baseStreams.bus();
        atlantState.stores[storeName].staticValue = atlantState.stores[storeName]._constructor();
        atlantState.stores[storeName].bus = atlantState.stores[storeName].changes.scan(atlantState.stores[storeName].staticValue, function(storeName, state, updater){ 
            var newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
            atlantState.stores[storeName].staticValue = newState;

            window.stores[storeName] = newState;

            {
                let serialize = atlantState.stores[storeName]._serialize;
                if(serialize) setTimeout( function(){Storage.persist(storeName, serialize(newState))}, 1000);
            }

            return newState 
        }.bind(void 0, storeName)).skipDuplicates().toEventStream();

        baseStreams.onValue(atlantState.stores[storeName].bus, function() {});

        return this;
    }

    var _updater = function(updaterName, updater){
        var storeName = TopState.state.lastStoreName;

        if (!storeName) { throw new Error('.updater() should be after .store()') }
        if ( 'function' !== typeof atlantState.stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( updaterName in atlantState.stores[storeName].updaters ) { throw new Error("Cannot reimplement updater ", updaterName, " in store ", storeName)}

        atlantState.stores[storeName].updaters[updaterName] = updater;
        statistics.putLink(storeName, updaterName);

        if( !(updaterName in atlantState.emitStreams ) ) atlantState.emitStreams[updaterName] = baseStreams.bus();
        
        baseStreams.onValue(atlantState.emitStreams[updaterName], function(storeName, updater, scope){ // scope is the value of .update().with(scope) what was pushed in
            atlantState.stores[storeName].changes.push( function(scope, updater, state){  // state is the value which passed through atom
                try { 
                    // console.log('UPDATE:', updaterName, scope, storeName);
                    return updater( state, scope );
                } catch(e) { 
                    console.error('atlant.js: Warning: updater failed', e)
                    return state
                }
            }.bind(void 0, scope, updater))
        }.bind(void 0, storeName, updater));

        return this;
    }

    var _part = function(partName, partProvider){
        var storeName = TopState.state.lastStoreName;

        if ( !storeName ) { throw new Error('.part() should be after .store()') }
        if ( 'function' !== typeof atlantState.stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( partName in atlantState.stores[storeName].parts ) { throw new Error("Cannot reimplement part ", partName, " in store ", storeName)}

        atlantState.stores[storeName].parts[partName] = partProvider;

        return this;
    }

    var _setInterval = s.setInterval;

    var _setTimeout = s.setTimeout;

    var _destroy = function(){
        // Object.keys(viewSubscriptionsUnsubscribe).forEach(function(viewName){ // Removing atom subscriptions
        //     viewSubscriptionsUnsubscribe[viewName]();
        //     console.log('atom: unsubscribe', viewName)
        // })
        Object.keys(atlantState.viewData).forEach(function(viewName){ // Destroying view scopes cache
            atlantState.viewData[viewName] = void 0
            console.log('clear view cache', viewName)
        })

        prefs.render.destroy(); // Destroying view cache

        baseStreams.destroy(); 

        s = l = simpleRender = reactRender = utils = Bacon = _ = interfaces = StateClass = clientFuncs =  safeGoToCopy = null;// @TODO more

        onDestroyStream.push();
    }

    /**
     * Atlant API
     *
     */

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.when = function(masks, fn) { return _when.bind(this)( masks, fn, types.Matching.continue, types.WhenOrMatch.when ); }

    this.pre = _pre.bind(this);

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.lastWhen = function(masks, fn) { return _when.bind(this)( masks, fn, types.Matching.stop, types.WhenOrMatch.when ); }

    // Match declare a route which will be ignored by .otherwise()
    this.match = function(masks, fn) { return _when.bind(this)( masks, fn, types.Matching.continue, types.WhenOrMatch.match ); }

    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise = function(fn) { return _action.call(this, otherwiseStream, fn, false, 'otherwise'); }

    // Creates stream which will be called when render error is happend
    this.error = function(fn) { return _action.call(this, errorStream, fn, false, 'error'); }


    // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
    // this.catch = _catch;

    // Creates custom stream which accepts Bacon stream
    this.action = function(action, fn) { return _action.call(this, action, fn, true, 'action'); }

    // creates branch which can destruct all what declared by .when() or .match()
    // this.finally =  _finally; // was removed, not reimplemented yet 

    // side-effect
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
    // Do not use this until you know!
    this.serialize = _serialize;

    // When's property. Means, should scroll to top on this route.
    this.scrollToTop = _scrollToTop;

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
    // the element which will be scrolled on scroll to top / history top
    this.scrollElement = _scrollElement;
    // the default value of to scroll or not to scroll to top on route change. Default is true.
    this.defaultScrollToTop = _defaultScrollToTop;


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
    // Called when destroy initiated.
    this.onDestroy =  _onDestroy;
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
    this.utils.setTitle = this.utils.setTitle.bind(void 0, titleStore);
    this.utils.getTitle = this.utils.getTitle.bind(void 0, titleStore);
    // Needed only for browsers not supporting canceling history.scrollRestoration
    this.utils.blockScroll = this.utils.blockScroll;
    this.utils.unblockScroll = this.utils.unblockScroll;

    this.state = {}

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


    // Create stream.
    this.stream = _stream(atlantState, prefs);


    return this;

}

if ('undefined' !== typeof window) window.Atlant = Atlant;
module.exports = Atlant;


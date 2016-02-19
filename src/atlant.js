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

    // Imports
    var s = require('utils/lib')
        ,utils = require('utils/utils')
        ,simpleRender = require('./renders/simple')
        ,reactRender = require('./renders/react')
        ,Bacon = require('baconjs')
        ,_ = require('lodash')
        ,interfaces = require('./inc/interfaces')
        ,StateClass = require('./inc/state')
        ,clientFuncs = require('./inc/clientFuncs')
        ,Storage = require('./inc/storage')
        ,types = require('./inc/types')
        ,performanceNow = require('./inc/performanceNow')
        ,wrapPushState = require( './inc/wrap-push-state.js').wrapPushState 

    import console from './utils/log';
    import Stream from './inc/stream';
    import baseStreams from "./inc/base-streams";

    // Preferences set by user
    var prefs = {
            parentOf: {}
            ,checkInjectsEquality: true
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,viewState: ['root']
            ,on: { renderEnd: void 0 }// callback which will be called on finishing when rendering
            ,scrollElement: function(){ return 'undefined' !== typeof document ? utils.body : void 0 }
            ,defaultScrollToTop: true
            ,pre: void 0
            ,onDrawEndCallbacks:[]
    }

    // Contains state shared across atlant
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
        ,emitStreams: {}
        ,viewData: {} // To check if the rendered data is the as data to be rendered.
        ,routes: []  // Routes collected
        ,streams: {
            renderEndStream: baseStreams.bus()
            ,interceptorBus: baseStreams.bus()
            ,otherwiseStream: baseStreams.bus() 
            ,publishStream: baseStreams.bus()  // Here we can put init things.
            ,errorStream: baseStreams.bus()
            ,onDestroyStream: baseStreams.bus()
        }
        ,whens: {} // storing whens
        ,titleStore: { value: '' }
        ,viewSubscriptionsUnsubscribe: {}
        ,viewSubscriptions: {}
    }

    import views from "./views/views";
    let unsubscribeView = views(atlantState);

    // Patching goTo for further use
    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);
    if ('undefined' !== typeof window) {  // Should be defined for debuggins reasons
        if (!window.stores) window.stores = {};
    }

    //Clearing current history state
    if('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    utils.clearState();

    // Browser specific actions.
    // registering wrapPushState, attaching atlant events to links
    if ('undefined' !== typeof window) {
        wrapPushState(window);

        // Subscribe to clicks and keyboard immediatelly. Document already exists.
        utils.attachGuardToLinks();
    }

    // can be removed, just imformational
    baseStreams.onValue(atlantState.streams.renderEndStream, s.baconTryD(_ => console.log('render end:', _)));

    var injectsGrabber = new interfaces.injectsGrabber();
    var TopState = new StateClass(); // State which up to when

    var routeChangedStream =  atlantState.streams.publishStream
        .merge( Bacon.fromBinder(function(sink) {
            if ( 'undefined' === typeof window) return;
            var routeChanged = function(sink, event) {

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
                            }

                            window.scrollTo(0, scrollTop)

                            finishScroll = (scrollTop => {
                                if(window.debug)debugger;
                                utils.body.style.minHeight = null;
                                // utils.unblockScroll();
                                atlant.state.scrollRestoration = false;
                                window.scrollTo(0, scrollTop);
                                if (!('scrollRestoration' in history)) loader.style.visibility = null;
                            }).bind(void 0, scrollTop);

                            if(window && !window.history.pushState.overloaded) wrapPushState(window);


                    }

                    if ( event instanceof PopStateEvent ) {
                        trySetScroll(state.scrollTop)
                    } else if ( 0 === state.scrollTop ) {
                        finishScroll = (scrollTop => {
                            if (!('scrollRestoration' in history)) loader.style.visibility = null;
                        })
                    }

                    if (path !== atlantState.lastPath || (event && event.detail && event.detail.state && event.detail.state.forceRouteChange)) {
                        // if (!('scrollRestoration' in history)) { utils.unblockScroll();  } // removing fixed just before rendering
                        sink({
                            path: path
                            ,referrer: atlantState.lastPath
                            ,history: event 
                            // ,postponed: postponedCleanup
                        });
                    }
                    if(finishScroll) { requestAnimationFrame(finishScroll) }
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
        .map(function(upstream) {
            var stream = _.extend({}, upstream);

            // Storing here the data for actions.
            atlantState.lastPath = stream.path;
            atlantState.lastReferrer = stream.referrer;
            atlantState.lastHistory = stream.history;
            atlantState.lastMask = void 0;

            stream.id = _.uniqueId();
            atlantState.activeStreamId.value = stream.id;

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


        atlantState.rootStream
            .onValue( function(upstream) {

            const skipRoutes = prefs.skipRoutes.map( _ => utils.matchRoute(upstream.path, _) || utils.matchRoute(utils.getPossiblePath(upstream.path), _) ).filter( _ => !!_ );
            if(skipRoutes.length) {
                atlantState.streams.renderEndStream.push({ httpStatus: 404, httpMessage: 'Resource is forbidden' });
                return
            }

            const _whens = Object.keys(atlantState.whens)
                .map( _ => atlantState.whens[_] )
                .map( when => {
                    let route = when.route.masks // masks
                        .map( _ => ({ mask: _, params: utils.matchRoute(upstream.path, _) }) )
                        .filter(_ => _.params);

                    route = s.head(route);
                    if (route) {
                        when.params = route.params;
                        when.mask = route.mask;
                    } else {
                        when.params = void 0;
                        when.mask = void 0;
                    }

                    return when 
                })
                .filter( _ => _.params )
                .reduce( (acc, i) => {  // filtering all when's after matched one
                    if (i.isMatch) {
                        acc.items.push(i) 
                    } else if(!acc.found) { 
                        if(!acc.found) { 
                            acc.found = true;
                            acc.items.push(i)
                        }
                    }

                    return acc 
                }, {found: false, items: []})

                console.log('whens:', _whens);
            _whens.items.forEach( whenData => { 
                // Storing here the data for actions.
                atlantState.lastMask = whenData.route.masks;

                var depData = {
                    location: upstream.path
                    ,mask: whenData.mask 
                    ,pattern: whenData.mask 
                    ,masks: whenData.route.masks
                    ,params: whenData.params
                    ,referrer: upstream.referrer
                    ,history: upstream.history
                };
                atlantState.whenData = depData;

                if (whenData.when.type === types.WhenOrMatch.when && whenData.scrollToTop.value && 'undefined' !== typeof window) {
                    window.scrollTo(0, 0);
                } 

                console.log('when:', whenData)
                var stream = whenData.route.fn instanceof Stream ? whenData.route.fn : whenData.route.fn( depData ); // @TODO should be a Stream.
                if(whenData.when.type === types.WhenOrMatch.when) stream.onValue( _ => atlantState.streams.renderEndStream.push(_) )

                if(stream instanceof Stream) stream.push( depData );
                else console.error('unknown return from Stream function')
            });

            if ( !_whens.items.length || !_whens.found ) {  // Only matches or nothing at all
                atlantState.streams.otherwiseStream.push(upstream);
                return
            } 

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

            if( types.WhenOrMatch.when === whenType ) // Imformational thing
                masks.forEach( _ => atlantState.routes.push( utils.stripLastSlash(_) ) ) 

            atlantState.whens[name] = { 
                when: { id: whenId, type: whenType},
                route: { masks: masks, fn: fn},
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

            var stream = fn instanceof Stream ? fn : fn( depValue ); 

            if(stream instanceof Stream) stream.push( depValue );
            else console.error('unknown return from Stream function')

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

        State.state.lastWhen = atlantState.streams.interceptorBus
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
    var _skip = function (...paths){
        s.map( _ => prefs.skipRoutes.push(_), paths);
        return this
    }

    /**
     *  Use this method to publish routes when
     */
    var _publish = function(path){
        if (path) s.type(path, 'string');
        atlantState.streams.publishStream.push({published:true, path:path});
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
        baseStreams.onValue(atlantState.streams.renderEndStream, s.baconTryD(callback));
        return this;
    }

    var _onDestroy = function(callback) { // Use this to get early callback for server render
        baseStreams.onValue(atlantState.streams.onDestroyStream, s.baconTryD(callback));
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


    var _attach = function(viewName, selector) {
        s.type(viewName, 'string');
        s.type(selector, 'string');

        prefs.render.attach(viewName, selector); 

        return this;
    }

    var _stringify = function(viewName, options) {
        return prefs.render.stringify(viewName, options );
    }

    var _await = function(shouldAWait) {
        utils.goTo = safeGoToCopy.bind(utils, shouldAWait);
        return this
    }

    var _verbose = function(on) {
        console.verbose = on;
        return this
    }


    var _redirectTo = function(url) {
        return utils.goTo(url)
    }

    var _moveTo = function(url) {
        if( 'undefined' !== typeof window)
            return window.location.assign(url)
        else
            console.error('no window object...')
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

        if( !(updaterName in atlantState.emitStreams ) ) atlantState.emitStreams[updaterName] = baseStreams.bus();
        
        baseStreams.onValue(atlantState.emitStreams[updaterName], function(storeName, updater, updaterName, scope){ // scope is the value of .update().with(scope) what was pushed in
            stores[storeName].changes.push( function(scope, updater, storeName, updaterName, state){  // state is the value which passed through atom
                try {
                    return updater( state, scope );
                } catch(e) {
                    console.error('Warning: updater "' + updaterName + '" failed on store "' + storeName + '"', e)
                    return state
                }
            }.bind(void 0, scope, updater, storeName, updaterName))
        }.bind(void 0, storeName, updater, updaterName));

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

        atlantState.streams.onDestroyStream.push();
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
    this.otherwise = function(fn) { return _action.call(this, atlantState.streams.otherwiseStream, fn, false, 'otherwise'); }

    // Creates stream which will be called when render error is happend
    this.error = function(fn) { return _action.call(this, atlantState.streams.errorStream, fn, false, 'error'); }


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

    this.views.break = function( viewName ){
        unsubscribeView(viewName);
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
    this.attach =  s.tryD(_attach);
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
    this.utils.setTitle = this.utils.setTitle.bind(void 0, atlantState.titleStore);
    this.utils.getTitle = this.utils.getTitle.bind(void 0, atlantState.titleStore);
    // Needed only for browsers not supporting canceling history.scrollRestoration
    this.utils.blockScroll = this.utils.blockScroll;
    this.utils.unblockScroll = this.utils.unblockScroll;

    this.state = {}

    this.data = {
        get routes() { return _(atlantState.routes) 
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
    this.stream =  _ => new Stream(atlantState, prefs);


    return this;

}

if ('undefined' !== typeof window) window.Atlant = Atlant;
module.exports = Atlant;

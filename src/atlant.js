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
        ,Stat = require('./inc/statistics')
        ,Storage = require('./inc/storage')
    ;


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

    var activeStreamId = { value: void 0 }; // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
    var lastFinallyStream;
    var prefs = {
            parentOf: {}
            ,checkInjectsEquality: true
            ,skipRoutes: []  // This routes will be skipped in StreamRoutes
            ,viewState: ['root']
            ,on: { renderEnd: void 0 }// callback which will be called on finishing when rendering
            ,scrollElement: function(){ return 'undefined' !== typeof document ? document.querySelector('body') : void 0 }
            ,defaultScrollToTop: true
    }

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var withGrabber = new interfaces.withGrabber();

    // State from current route. Updated on route Load.
    var lastPath // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        ,lastMask = []
        ,lastReferrer


    var titleStore = { value: "" };

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

    var types = require('./inc/types');


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

            if (upstream.render.renderOperation === types.RenderOperation.draw ){ // This is first render and for user to subscribe
                renderStreams.drawEnd.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render }); 
            }

            if (upstream.render.renderOperation !== types.RenderOperation.draw && !upstream.isAction ){
                renderEndSignal.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render }); // This will count the renders
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function(upstream) {
            if (upstream.render.renderOperation === types.RenderOperation.nope || upstream.render.renderOperation === types.RenderOperation.draw || upstream.isAction || upstream.render.renderOperation === types.RenderOperation.move || upstream.render.renderOperation === types.RenderOperation.redirect || upstream.render.renderOperation === types.RenderOperation.replace || upstream.render.renderOperation === types.RenderOperation.change )
                return true; // alwayes continue for this operations

            if ( upstream.render.viewName in atlantState.viewRendered ) {  // If this view is already rendered...
                whenRenderedSignal(upstream); // we should not continue
                return false;
            } else { // If this view not yet rendered...
                atlantState.viewRendered[upstream.render.viewName] = upstream.id;

                return true;
            }
        };

        let renderIntoView = function(viewProvider, upstream, viewName, render, scope, whenRenderedSignal ) {
            var renderD = s.promiseD( render ); // decorating with promise (hint: returned value can be not a promise)
            // l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
            // console.log('rendering into view', viewName)
            return renderD(viewProvider, upstream, activeStreamId, viewName, scope)
                .then(function(_){
                    // @TODO make it better
                    // using copy of upstream otherwise the glitches occur. The finallyStream is circular structure, so it should be avoided on copy
                    var selects = upstream.selects;
                    upstream.selects = void 0;

                    var stream = s.clone(upstream); 

                    stream.selects = selects;
                    upstream.selects = selects;

                    if(_.code && 'notActiveStream' === _.code){
                    } else {
                        stream.render.component = _;  // pass rendered component. it stale hold before streams get zipped.
                    }
                    return stream 
                })
                .then( whenRenderedSignal )
                .catch( clientFuncs.catchError )
        }

        let unsubscribeView = function(viewName){
            try{
                // turn off all subscriptions of selects for this view
                if( viewSubscriptionsUnsubscribe[viewName] ) {  // finish Bus if it exists;
                    viewSubscriptionsUnsubscribe[viewName]();
                    // console.log('atom: unsubscribe', viewName)
                } 
            } catch(e){
                console.error('unsubscribe error', e.stack)
            }
        }

        let subscribeView = function(viewName, doRenderIntoView, scope, upstream){

            if ( !('chains' in upstream ) || !Object.keys(upstream.chains).length) return;  // If no store is selected for this view, then we should not subscribe on anything.

            let keys = Object.keys(upstream.chains);
            // console.log('chains:', keys, viewName, upstream.chains);

            viewSubscriptions[viewName] = Bacon
                .mergeAll( keys.map(store => stores[store].bus) );

            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue(function(upstream, viewName, scope, doRenderIntoView, value){ 
                // console.time('score')
                let start = performance.now();
                // window.chains = upstream.chains

                value =  Object.keys(upstream.chains)
                    .map( _ => upstream.chains[_] )
                    .reduce( (acc, i) => acc.concat(i), [])
                    .map( o => Object.keys(o).map( _ => o[_] ) )
                    .reduce( (acc, i) => acc.concat(i), [])
                    .reduce( (acc, i) => acc.concat(i), [])
                    .reduce( (acc, i) => _.extend(acc, i()), {});

                // value = _(upstream.chains).map(o=> _(o).map(_=>_).flatten().value() ).flatten().reduce( (acc, i) => _.extend(acc, i()), {});

                // console.timeEnd('score')
                if('undefined' === typeof window.selectCount) window.selectCount = 0;
                if('undefined' === typeof window.selectTime) window.selectTime = 0;
                window.selectTime = window.selectTime + performance.now() - start;
                window.selectCount++;
                window.getSelectTime = _ => window.selectTime/window.selectCount;

                let data = _.extend({}, scope, value );   

                if ( !_.isEqual(data, viewData[viewName] ) ) {

                    scope = data;
                    viewData[viewName] = data;
                    // console.log('updating view...', viewName, performance.now())
                    // console.time('render'+ viewName)
                    var rendered = doRenderIntoView(data, function(_){return _}); // Here we using scope updated from store!
                    return rendered.then(function(upstream, o){
                        // console.timeEnd('render'+ viewName)
                        atomEndSignal.push({id: upstream.id, whenId: upstream.whenId});
                        return o;
                    }.bind(void 0, upstream));
                } else {
                    // console.log('canceled render due the same data', viewName)
                    atomEndSignal.push({id: upstream.id, whenId: upstream.whenId});
                }
            }.bind(void 0, upstream, viewName, scope, doRenderIntoView ));


        } 



        // Registering render for view.
        var assignRender = function(stream) {
            var theStream = stream
                .filter( renderStopper );

            baseStreams.onValue( theStream, function(upstream){
                    if( void 0 === upstream || activeStreamId.value !== upstream.id ) { return void 0; }

                    try{ 
                        var viewName = s.dot('.render.viewName', upstream);
                        if (!viewName) return;
                        // Choose appropriate render.
                        var render;

                        // These 2 operation doesn't need a scope
                        if (types.RenderOperation.nope === upstream.render.renderOperation ){
                            whenRenderedSignal(upstream);

                            return;
                        }
                        
                        if(types.RenderOperation.refresh === upstream.render.renderOperation ){
                            utils.goTo( window.location.pathname, void 0, true)
                            whenRenderedSignal(upstream);

                            return;
                        }

                        var scope = clientFuncs.createScope(clientFuncs.getScopeDataFromStream(upstream));
                        var viewProvider = s.dot('.render.renderProvider', upstream);

                        // These needs a scope
                        if (types.RenderOperation.redirect === upstream.render.renderOperation ){
                            if ('function' === typeof viewProvider) {
                                utils.goTo(viewProvider(scope), void 0, true)
                            } else {
                                utils.goTo(viewProvider, void 0, true)
                            }

                            return;
                        } else if (types.RenderOperation.move === upstream.render.renderOperation){
                            if ('function' === typeof viewProvider) {
                                window.location.assign(viewProvider(scope))
                            } else {
                                window.location.assign(viewProvider)
                            }

                            return;
                        }  else if (types.RenderOperation.replace === upstream.render.renderOperation ){

                            var path = s.apply(viewProvider, scope);
                            lastPath = path; 
                            utils.replace(path); // just rename url

                            whenRenderedSignal(upstream);

                            return;
                        } else if (types.RenderOperation.change === upstream.render.renderOperation ){
                            var path = s.apply(viewProvider, scope);
                            lastReferrer = lastPath;
                            lastPath = path;
                            utils.change(path); // Push url to history without atlant to react on new value.

                            whenRenderedSignal(upstream);

                            return;
                        } else {

                           if ( types.RenderOperation.render === upstream.render.renderOperation || types.RenderOperation.draw === upstream.render.renderOperation ) {
                                render = prefs.render.render.bind(prefs.render)
                           } else if ( types.RenderOperation.clear === upstream.render.renderOperation ){
                                render = prefs.render.clear.bind(prefs.render)
                           }

                           var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render)

                           viewData[viewName] = scope;
                           let renderResult = doRenderIntoView(scope, whenRenderedSignal) // Here we using scope updated from store!

                           unsubscribeView(viewName);

                           if (upstream.render.subscribe)  // Subscriber only after real render - Bacon evaluates subscriber immediately
                               subscribeView(viewName, doRenderIntoView, scope, upstream)

                           if (upstream.masks) {
                               statistics.whenStat({ actionId: upstream.whenId, masks: upstream.masks.slice(), view: viewName });
                           } 

                            return renderResult;
                        }

                    } catch (e) {
                        console.error(e.message, e.stack);
                    }
            });
        };

        return function() { 
            if ( isRenderApplyed ) return;

            isRenderApplyed = true
            // console.time('assign renders')
            var count = 0;
            for(var viewName in renders) { //@TODO assign only those streams and for those views which are existent on this route
                count+=renders[viewName].length;
                s.map(assignRender, renders[viewName]);
            }
            // console.timeEnd('assign renders')
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

        var createDepStream = function(stream, depName, dep, injects, store, isAtom) {
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
                    .flatMap(function(store, depName, dep, isAtom, upstream) {  // Execute the dependency
                        var scope = clientFuncs.createScope(upstream);
                        var where = (upstream.with && 'value' in upstream.with) ? upstream.with.value : s.id; 
                        var atomParams = ( (scope, where, updates) => where(_.extend({}, scope, updates)) ).bind(this, scope, where);
                        
                        var treatDep = s.compose( clientFuncs.convertPromiseD, s.promiseTryD );
                        var atomValue = atomParams();
                        return treatDep( dep )( atomValue )
                            .mapError(function(_){ console.error('Network error: status === ', _.status); return _})
                            .map(function(upstream, atomParams, store, depName, isAtom, atomValue, results){
                                if ( 'function' === typeof results ) results = results.bind(void 0, atomParams);
                                if ( !upstream.isInterceptor ) interceptorBus.push({upstream: upstream, scope: results}); // pushing into global depends .interceptor() 
                                if (!upstream.depends) upstream.depends = {};
                                upstream.depends[depName] = results;

                                if ( !upstream.atomIds ) upstream.atomIds = [];

                                if ( 'undefined' !== typeof store && isAtom) {
                                    upstream.atomParams = atomParams; 
                                    upstream.atomIds.push({ ref: upstream.ref, fn: atomParams, partProvider: store.partProvider, storeData: store.storeData });
                                } 

                                return upstream;
                            }.bind(void 0, upstream, atomParams, store, depName, isAtom, atomValue))
                    }.bind(void 0, store, depName, dep, isAtom))
            }

            stream = stream // Treat dependency results
                .map(function(depName, injects, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                    return injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);
                }.bind(void 0, depName, injects))
                .mapError(function(_){ console.error('Unhandled error', _)})

            stream = stream // Add select subscriptions
                .map(function(depName, store, dep, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.

                    // if( !('ref' in upstream) || 'undefined' === typeof upstream.ref || '' === upstream.ref  ) { 
                    //     console.log('log:', upstream, store, dep);
                    //     throw new Error('Every select should have name.')
                    // }

                    if ( 'undefined' !== typeof upstream.ref && 'undefined' !== typeof store ) {
                        if ( !( 'chains' in upstream ) ) upstream.chains = {};
                        if(!(store.storeName in upstream.chains)) upstream.chains[store.storeName] = {};
                        if ( !( 'dependences' in upstream ) ) upstream.dependences = {};
                        if ( !( 'select' in upstream ) ) upstream.select = {};

                        if('undefined' !== typeof store.dependsOn && '' !== store.dependsOn && !(store.dependsOn in upstream.select )) throw new Error(`Select "${upstream.ref}"" cannot depend on unknown select: "${store.dependsOn}"`)

                        if(store.dependsOn && '' !== store.dependsOn )
                            console.log('select depending ', upstream.ref, 'on', store.dependsOn)
                        if( store.dependsOn && '' === store.dependsOn )
                            console.log('select', upstream.ref, 'is independent')
                        if( '' === store.dependsOn ) 
                            console.log('select', 'no dependency')


                        var getValue = function( ref, atomParams, u ){
                            let params = atomParams.bind(this, u);
                            let res = dep()(params);
                            let result = _.extend({}, u, { [ref]: res });  
                            return result
                        }.bind( void 0, upstream.ref, upstream.atomParams );

                        let dependence = 'undefined' !== typeof store.dependsOn && '' !== store.dependsOn && store.dependsOn in upstream.select ? upstream.select[store.dependsOn] : void 0; // dependence is just a function which return value

                        if ( !dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn ) dependence = upstream.select[upstream.lastSelect];

                        let f = dependence ?  f = _ => getValue( dependence (_) ) : getValue;

                        let chainKey = dependence ? upstream.dependences[store.dependsOn] : upstream.ref;

                        upstream.dependences[upstream.ref] = chainKey;

                        upstream.lastSelect = upstream.ref;
                        if( !(chainKey in upstream.chains[store.storeName]) ) upstream.chains[store.storeName][chainKey] = [];
                        upstream.chains[store.storeName][chainKey].push(f);
                        upstream.select[upstream.ref] = f;

                    }

                    return upstream;
                }.bind(void 0, depName, store, dep))


            return stream;
        }

        /**
         * Join 2 streams into 1
         */
        var zippersJoin = s.curry( function(prevDepName, currDepName, x, y) {
            x.depends = s.extend( {}, x.depends, y.depends );
            x.injects = x.injects.concat(y.injects);
            return x;
        });

        return function(dependency, dependsBehaviour, store, isAtom ) {
            if ( ! State.state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === Depends.async) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, depName, dependency, State.state.lastInjects, store, isAtom);

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
            var calculated = ( -1 !== name.indexOf('atom') ) ? statistics.getSum(lastPath) : statistics.getRenderSum(lastPath);

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
            var stream = _.extend({}, upstream);

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

    var otherwiseStream = rootStream
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
            var scrollToTop = { value: whenType === WhenOrMatch.match ? false : true };
            TopState.state.scrollToTop = scrollToTop;

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
                .map(function (whenId, whenType, stats, name, injects, masks, whenMasks, scrollToTop, upstream) {
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

                    if (scrollToTop.value && 'undefined' !== typeof window) {
                        setTimeout( function() { prefs.scrollElement().scrollTop = 0}, 0);
                    } 

                    var stream = injectsGrabber.add(name, depData, injects, upstream);
                    return stream;
                }.bind(void 0, whenId, whenType, stats, name, injects, masks, whenMasks, scrollToTop))

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

    var _action = function(action, isAction, depCode){
        State.first();
        TopState.first();

        if(!action) throw new Error('Atlant.js: action stream is not provided!')
        var whenId = _.uniqueId();
        var depName = depCode + '_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var nameContainer = dependsName.init(depName, State.state);
        var stats = TopState.state.stats;

        var scrollToTop = { value: false };
        State.state.scrollToTop = scrollToTop;


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

                var stream = injectsGrabber.add(depName, depValue, injects, {});
                stream = dependsName.add( depName, nameContainer, stream); 

                stream.stats = stats;
                stream[depCode] = true;
                stream.conditionId = whenId;
                stream.whenId = whenId;
                stream.isAction = isAction;
                stream.id = activeStreamId.value;
                // stream.id = _.uniqueId(); // Should it be so at error?

                if (scrollToTop.value && 'undefined' !== typeof window) {
                    setTimeout( function() { prefs.scrollElement().scrollTop = 0}, 0);
                } 

                return stream;
            }.bind(void 0, depName, injects, nameContainer, stats, whenId, isAction ))

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = depCode;
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = depName
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
            if(renders.length) {
                // console.log('negating renders...:', renders)
                statistics.removeRenders(u.whenId, u.masks, renders);
                renderRecalculateSignal.push({id: u.id, whenId: u.whenId, itemIds: renders}); 
            }
            var updates = statistics.getUpdatesByUrl(actionId, lastPath, ifId);
            if(updates.length) {
                // console.log("negating UPDATES:", updates )
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

    /**
        Received - every depends include this stream after execution
     * @param fn
     */
    var _received = function() {

        return this;
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
    var _render = function(renderProvider, viewName, once, renderOperation){
            if ( ! State.state.lastOp ) throw new Error('"render" should nest something');
            let subscribe  = 'once' !== once ? true : false;

            if ( 'function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.nope && renderOperation != types.RenderOperation.refresh ) {
                throw new Error('Atlant.js: render first param should be function or URI')
            }
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')

            viewName = viewName || s.last(prefs.viewState);

            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            if ( renderOperation === types.RenderOperation.nope ) viewName = void 0;

            if ( renderOperation !== types.RenderOperation.draw && 'action' !== State.state.lastWhenType) Counter.increase(State.state);
            var renderId = _.uniqueId();


            var thisRender = State.state.lastOp
                // .map( function(u){ return _.extend( {}, u) } )
                // .map( function(_){ if ( activeStreamId.value !== _.id ) { return void 0 } else { return _ } } )
                // .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
                .map(function(renderId, renderProvider, viewName, renderOperation, u) { 
                    var render = { render: { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: types.RenderOperationKey[renderOperation], subscribe: subscribe}};
                    return _.extend( {}, u, render )
                }.bind(void 0, renderId, renderProvider, viewName, renderOperation))

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
            if ( ! renders[viewName] ) renders[viewName] = [];
            renders[viewName].push(thisRender);

            if (types.RenderOperation.draw !== renderOperation) {
                // console.log('registering render:', renderId, TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], viewName, types.RenderOperationKey[renderOperation], renderProvider, 'ifIds:', State.state.lastIfIds);
                statistics.whenStat({ actionId: TopState.state.lastActionId,
                                ifIds: State.state.lastIfIds,
                                masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction],
                                render: renderId
                }); 
            } 

            if (void 0 !== State.state.lastIf && renderOperation !== types.RenderOperation.draw){ 
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
        baseStreams.onValue(renderStreams.drawEnd, function() { return s.tryD(callback)(/*should send nothing here!*/) } );
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

        if( 'undefined' === typeof window )   {}

        var firstRender = renderStreams
                            .drawEnd
                            .merge(renderEndSignal)
                            .filter(function(_){
                                if ( _.item && (_.item.renderOperation === types.RenderOperation.render || _.item.renderOperation === types.RenderOperation.draw ) && _.item.viewName === rootView)  return true // accept only first render/draw of rootComponent
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
        if ( 'function' === typeof stores[storeName]._serialize ) { throw new Error("Serialize already implemented in store ", storeName)}
        if( 'function' !== typeof serializeProvider ) { throw new Error("Serialize should be a function for ", storeName)}

        stores[storeName]._serialize = serializeProvider;

        return this
    }

    var _constructor = function(constructorProvider){
        var storeName = TopState.state.lastStoreName; 
        if (!storeName) { throw new Error('.constructor() should be after .store()') }
        if ( 'function' === typeof stores[storeName]._constructor ) { throw new Error("Constructor already implemented in store ", storeName)}
        if( 'function' !== typeof constructorProvider ) { throw new Error("Constructor should be a function for ", storeName)}

        stores[storeName]._constructor = _ => Storage.load(storeName) || constructorProvider();
        stores[storeName].changes = baseStreams.bus();
        stores[storeName].staticValue = stores[storeName]._constructor();
        stores[storeName].bus = stores[storeName].changes.scan(stores[storeName].staticValue, function(storeName, state, updater){ 
            var newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
            stores[storeName].staticValue = newState;

            if ('undefined' !== typeof window) {
                if (!window.stores) window.stores = {};
                window.stores[storeName] = newState;
            }

            {
                let serialize = stores[storeName]._serialize;
                if(serialize) setTimeout( function(){Storage.persist(storeName, serialize(newState))}, 1000);
            }

            return newState 
        }.bind(void 0, storeName)).skipDuplicates().toEventStream();

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
        
        baseStreams.onValue(emitStreams[updaterName], function(storeName, updater, scope){ // scope is the value of .update().with(scope) what was pushed in
            stores[storeName].changes.push( function(scope, updater, state){  // state is the value which passed through atom
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
        if ( 'function' !== typeof stores[storeName]._constructor ) { throw new Error("Constructor not implemented in store ", storeName)}
        if ( partName in stores[storeName].parts ) { throw new Error("Cannot reimplement part ", partName, " in store ", storeName)}

        stores[storeName].parts[partName] = partProvider;

        return this;
    }

    var _update = function( dependsBehaviour, key ) {
        if ( ! State.state.lastOp ) throw new Error('"update" should nest something');
        s.type(key, 'string');

        // doing at static stage
        statistics.whenStat({
            eventKey: key
            ,actionId: TopState.state.lastActionId
            ,ifIds: State.state.lastIfIds
            ,masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction]
        });  // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.

        return _depends.bind(this)( function(key, id){
            if ( key in emitStreams ) emitStreams[key].push(id);
            else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");
        }.bind(void 0, key), dependsBehaviour);


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

    var _select = function(isAtom, dependsBehaviour, partName, storeName, dependsOn) {
        if (!(storeName in stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
        if (!(partName in stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
        if ( dependsOn && 'string' !== typeof dependsOn ) throw new Error('atlant.js: dependsOn param should be a string' );

        statistics.whenStat({actionId: TopState.state.lastActionId, masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], atom: storeName });

        return _depends.bind(this)( function(storeName, partName){
            return function(storeName, partName, id){
                try {
                    // console.log('executing select', partName , 'from', '<' + storeName + '>', stores[storeName].staticValue, 'with', stores[storeName].parts[partName], '(',id(),')', ' = ', stores[storeName].parts[partName](stores[storeName].staticValue, id()))
                    return stores[storeName].parts[partName](stores[storeName].staticValue, id());
                } catch(e) {
                    console.error('select', partName, 'from', storeName,'failed:', e.stack)
                    return void 0;
                }
            }.bind(void 0, storeName, partName)
        }.bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: stores[storeName].bus, partProvider: stores[storeName].parts[partName], storeData: stores[storeName]}, isAtom );
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

    var _destroy = function(){
        Object.keys(viewSubscriptionsUnsubscribe).forEach(function(viewName){ // Removing atom subscriptions
            viewSubscriptionsUnsubscribe[viewName]();
            console.log('atom: unsubscribe', viewName)
        })
        Object.keys(viewData).forEach(function(viewName){ // Destroying view scopes cache
            viewData[viewName] = void 0
            console.log('clear view cache', viewName)
        })

        prefs.render.destroy(); // Destroying view cache

        baseStreams.destroy(); 
        baseStreams = null;

        s = l = simpleRender = reactRender = utils = Counter = Bacon = _ = interfaces = StateClass = clientFuncs =  baseStreams = safeGoToCopy = null;// @TODO more

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
    this.when = function(masks) { return _when.bind(this)( masks, Matching.continue, WhenOrMatch.when ); }

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.lastWhen = function(masks) { return _when.bind(this)( masks, Matching.stop, WhenOrMatch.when ); }

    // Match declare a route which will be ignored by .otherwise()
    this.match = function(masks) { return _when.bind(this)( masks, Matching.continue, WhenOrMatch.match ); }

    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise = function() { return _action.call(this, otherwiseStream, false, 'otherwise'); }

    // Creates stream which will be called when render error is happend
    this.error = function() { return _action.call(this, errorStream, false, 'error'); }


    // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
    // this.catch = _catch;

    // Creates custom stream which accepts Bacon stream
    this.action = function(action) { return _action.call(this, action, true, 'action'); }

    // creates branch which can destruct all what declared by .when() or .match()
    // this.finally =  _finally; // not supported because used ups = new Upstream() which is deprecated.
    // side-effect

    /**
     *  Asyncroniously run the dependency. 
     */
    this.async =  function( dependency ) { return _depends.bind(this)( dependency, Depends.async) };
    /*
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     * */
    this.dep =  function( dependency ) { return _depends.bind(this)( dependency, Depends.continue) };
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
    this.update = _update.bind(this, Depends.continue);
    // Query store with atom creation
    this.select = _select.bind(this, Depends.continue, true);
    // Just query store, no updates will be received
    this.query = _select.bind(this, Depends.continue, false);
    // Do not use this until you know!
    this.serialize = _serialize;



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
    this.scrollToTop = _scrollToTop;


    /**
     * Renders declaratins
     */
    //Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
    this.log =  _log;
    /* Renders the view. first - render provider, second - view name */
    this.render = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'always', types.RenderOperation.render);}
    /* Do not subscribe selects on view */
    this.renderOnce = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'once', types.RenderOperation.render);}
    /* Renders the view. first - render provider, second - view name. Not waiting for anything - draws immediatelly */
    this.draw = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'always', types.RenderOperation.draw);}
    /* Do not subscribe selects on view */
    this.drawOnce = function(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'once', types.RenderOperation.draw);}
    /* clears default or provided viewName */
    this.clear = function(viewName) {return _render.bind(this)(function(){}, viewName, 'once', types.RenderOperation.clear);}
    // Soft atlant-inside redirect.
    this.redirect = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.redirect);}
    // Soft atlant-inside refresh.
    this.refresh = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.refresh);}
    //  Fake redirect. Atlant will just change URL but routes will not be restarted. Referrer stays the same.
    this.replace = function(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.replace);}
    // Same as replace, but store the replaced url in html5 location history. Referrer also changed.
    this.change = function(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.change);}
    // Force redirect event to current route
    // this.force = _.force;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
    this.move = function(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.move);}
    // render which render nothing into nowhere
    this.nope = function(){ return _render.bind(this)(void 0, void 0, 'once', types.RenderOperation.nope)}

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

if ('undefined' !== typeof window) window.Atlant = Atlant;
module.exports = Atlant;


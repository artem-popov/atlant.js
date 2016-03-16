"use strict";

var baseStreams = require('./base-streams')
        ,s = require('../utils/lib')
        ,StateClass = require('./state')
        ,types = require('./types')
        ,interfaces = require('./interfaces')
        ,clientFuncs = require('./clientFuncs')
        ,utils = require('../utils/utils')
        ,performance = require('./performance')
    ;

var Stream = function(atlantState, prefs){

    var TopState = new StateClass(); // State which up to when
    var State = new StateClass(); // State which up to any last conditional: when, if

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var withGrabber = new interfaces.withGrabber();
    var id = _.uniqueId();
    var root = baseStreams.bus();

    import views from "../views/views";
    let unsubscribeView = views(atlantState);

    var lastWhen;

    var streamState = {
    }

    var streamCallbacks = [];

    var renderView = function(){

        let renderIntoView = function(viewProvider, upstream, viewName, render, scope) {
            var renderD = s.promiseD( render ); // decorating with promise 
            return renderD(viewProvider, upstream, atlantState.activeStreamId, viewName, scope)
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
                .catch( clientFuncs.catchError )
        }

        let subscribeView = function(viewName, doRenderIntoView, scope, upstream){

            if ( !('chains' in upstream ) || !Object.keys(upstream.chains).length) return;  // If no store is selected for this view, then we should not subscribe on anything.

            let keys = Object.keys(upstream.chains);

            atlantState.viewSubscriptions[viewName] = Bacon
                .mergeAll( keys.map(store => atlantState.stores[store].bus) );

            // if (upstream.render.subscribe) streamState.subscribersCount++;

            atlantState.viewSubscriptionsUnsubscribe[viewName] = atlantState.viewSubscriptions[viewName].onValue(function(upstream, viewName, scope, doRenderIntoView, value){ 
                let start = performance.now();

                value =  Object.keys(upstream.chains)
                    .map( _ => upstream.chains[_] )
                    .reduce( (acc, i) => acc.concat(i), [])
                    .reduce( (acc, i) => acc.concat(i), [])
                    .reduce( (acc, i) => _.extend(acc, i()), {});

                // value = _(upstream.chains).map(o=> _(o).map(_=>_).flatten().value() ).flatten().reduce( (acc, i) => _.extend(acc, i()), {}); // Actually it is slower :(

                if('undefined' === typeof window.selectCount) window.selectCount = 0;
                if('undefined' === typeof window.selectTime) window.selectTime = 0;
                window.selectTime = window.selectTime + performance.now() - start;
                window.selectCount++;
                window.getSelectTime = _ => window.selectTime/window.selectCount;

                let data = _.extend({}, scope, value );   

                if ( !_.isEqual(data, atlantState.viewData[viewName] ) ) {
                    scope = data;
                    atlantState.viewData[viewName] = data;
                    doRenderIntoView(data); // Here we using scope updated from store!

                    if(streamState.resolveWhen && streamState.resolveWhen(data) && streamCallbacks.length){
                        streamCallbacks.forEach( _ => _(data) )
                    }
                } 

                // streamState.updates.swap(_ => _ - 1 / streamState.subscribersCount); // if there is an subscription, then always do this
                // console.log('swapping:', streamState.updates.unwrap())
                return upstream;

            }.bind(void 0, upstream, viewName, scope, doRenderIntoView ));

        } 

        return function(upstream){
                    if( void 0 === upstream || atlantState.activeStreamId.value !== upstream.id ) return false; 

                    try{ 
                        var viewName = s.dot('.render.viewName', upstream);
                        if (!viewName) return;
                        // Choose appropriate render.
                        var render;

                        if(types.RenderOperation.refresh === upstream.render.renderOperation ){
                            utils.goTo( window.location.pathname, void 0, true)

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
                            atlantState.lastPath = path; 
                            utils.replace(path); // just rename url


                            return;
                        } else if (types.RenderOperation.change === upstream.render.renderOperation ){
                            var path = s.apply(viewProvider, scope);
                            atlantState.lastReferrer = atlantState.lastPath;
                            atlantState.lastPath = path;
                            utils.change(path); // Push url to history without atlant to react on new value.


                            return;
                        } else {

                            if ( types.RenderOperation.render === upstream.render.renderOperation || types.RenderOperation.draw === upstream.render.renderOperation ) {
                                render = prefs.render.render.bind(prefs.render)
                            } else if ( types.RenderOperation.clear === upstream.render.renderOperation ){
                                render = prefs.render.clear.bind(prefs.render)
                            }

                            var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render);
                            atlantState.viewData[viewName] = scope;

                            unsubscribeView(viewName);

                            var renderResult = doRenderIntoView(scope); // sync operation 


                            if (upstream.render.subscribe && types.RenderOperation.clear !== upstream.render.renderOperation )  // Subscriber only after real render - Bacon evaluates subscriber immediately
                                subscribeView(viewName, doRenderIntoView, scope, upstream)

                            upstream.render.component = renderResult;
                            return upstream;
 
                        }

                    } catch (e) {
                        console.error(e.message, e.stack);
                    }

            }
    }();


    (function(){
        var sanitizeName = s.compose( s.replace(/:/g, 'By_'), s.replace(/\//g,'_') );
        var createNameFromMasks = s.compose( s.reduce(s.plus, ''), s.map(sanitizeName) );

        TopState.first();
        State.first();

        var whenId = _.uniqueId();
        var depName = _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var nameContainer = dependsName.init(depName, State.state);
        var stats = TopState.state.stats;

        // streamState.subscribersCount = 0;


        lastWhen = root
            .map( function(depName, injects, nameContainer, stats, whenId, depValue) {
                if ( 'undefined' === typeof depValue ) {
                    depValue = {}
                }
                if ('object' === typeof depValue) {
                    if(!('mask' in depValue)) depValue.mask = atlantState.lastMask;
                    if(!('masks' in depValue)) depValue.masks = atlantState.lastMask;
                    if(!('pattern' in depValue)) depValue.pattern = atlantState.lastMask;
                    depValue.location = atlantState.lastPath;
                    depValue.referrer = atlantState.lastReferrer;
                    depValue.history = atlantState.lastHistory;
                }

                var stream = injectsGrabber.add(depName, depValue, injects, {});
                stream = dependsName.add( depName, nameContainer, stream); 

                stream.stats = stats;
                stream.whenId = whenId;
                stream.id = atlantState.activeStreamId.value;
                // stream.id = _.uniqueId(); // Should it be so at error?

                return stream;
            }.bind(void 0, depName, injects, nameContainer, stats, whenId))


        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastWhen = lastWhen;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastOpId = whenId;
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = depName
    
    }())

    /* depends */
    var _depends = function() {

        var createDepStream = function(stream, opId, depName, dep, injects, store, isAtom) {
            var nameContainer = dependsName.init(depName, State.state);
            var withs = withGrabber.init(State.state);

            stream = stream
                .map( dependsName.add.bind(dependsName, depName, nameContainer) )
                .map( withGrabber.add.bind(withGrabber, withs) )

            if ('function' !== typeof dep) {
                stream = stream
                    .map( function(opId, depName, dep, upstream) { 
                        if (!upstream.depends) upstream.depends = {};
                        upstream.depends[depName] = dep;
                        upstream.opId= opId;
                        return upstream;
                    }.bind(void 0, opId, depName, dep))
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
                                if ( !upstream.isInterceptor ) atlantState.streams.interceptorBus.push({upstream: upstream, scope: results}); // pushing into global depends .interceptor() 
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
                .map(function(depName, store, dep, isAtom, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.

                    // if( !('ref' in upstream) || 'undefined' === typeof upstream.ref || '' === upstream.ref  ) { 
                    //     throw new Error('Every select should have name.')
                    // }
 
                    if ( 'undefined' !== typeof upstream.ref && 'undefined' !== typeof store && isAtom ) {
                        if ( !( 'chains' in upstream ) ) upstream.chains = {};
                        if (!(store.storeName in upstream.chains)) upstream.chains[store.storeName] = [];
                        if ( !( 'select' in upstream ) ) upstream.select = {};

                        if('undefined' !== typeof store.dependsOn && '' !== store.dependsOn && !(store.dependsOn in upstream.select )) throw new Error(`Select "${upstream.ref}"" cannot depend on unknown select: "${store.dependsOn}"`)

                        // if(store.dependsOn && '' !== store.dependsOn )
                        //     console.log('select depending ', upstream.ref, 'on', store.dependsOn)
                        // if( store.dependsOn && '' === store.dependsOn )
                        //     console.log('select', upstream.ref, 'is independent')
                        // if( '' === store.dependsOn ) 
                        //     console.log('select', 'no dependency')
                        // if (!dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn)
                        //     console.log('select lastSelect', upstream.ref, 'on', upstream.lastSelect )


                        var getValue = function( ref, atomParams, u ){
                            let params = atomParams.bind(this, u);
                            let res = dep()(params);
                            let result = _.extend({}, u, { [ref]: res });  
                            return result
                        }.bind( void 0, upstream.ref, upstream.atomParams );

                        let dependence = 'undefined' !== typeof store.dependsOn && '' !== store.dependsOn && store.dependsOn in upstream.select ? upstream.select[store.dependsOn] : void 0; // dependence is just a function which return value

                        if ( !dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn ) dependence = upstream.select[upstream.lastSelect];

                        let f = dependence ?  _ => getValue( dependence (_) ) : getValue;

                        upstream.lastSelect = upstream.ref;
                        upstream.chains[store.storeName].push(f);
                        upstream.select[upstream.ref] = f;

                    }

                    return upstream;
                }.bind(void 0, depName, store, dep, isAtom))


            return stream;
        }

        /**
         * Join 2 streams into 1
         */
        var zippersJoin = function(prevDepName, currDepName, x, y) {
            x.depends = s.extend( {}, x.depends, y.depends );
            x.injects = x.injects.concat(y.injects);
            return x;
        };

        return function(dependency, dependsBehaviour, store, isAtom ) {
            if ( ! State.state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === types.Depends.continue) ? '_and_' : '_';
            var opId = _.uniqueId();
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === types.Depends.async) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, opId, depName, dependency, State.state.lastInjects, store, isAtom);

            if( dependsBehaviour === types.Depends.async && State.state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = State.state.lastDep.zip( thisDep, zippersJoin.bind( void 0, State.state.lastDepName, depName ) );
            }

            State.state.lastDep = thisDep;
            State.state.lastDepName = depName;
            State.state.lastOp = State.state.lastDep;
            State.state.lastOpId = opId;

            return this;
        };
    }();


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
            .map( function(u){ return _.extend( {}, u) } ) // Copy


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

        // thisIfNegate.onValue(function(ifId, actionId, condition, u){
        // }.bind(void 0, ifId, TopState.state.lastActionId, condition))

        State.state.lastIf = thisIf;
        State.state.lastOp = State.state.lastIf;
        State.state.lastOpId = ifId;
        State.state.lastConditionId = ifId;
        State.state.lastIfId = ifId;
        State.state.lastIfIds.push(ifId) // Stores upper stack of if ids

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

    var _render = (function(){
        var closeBlock = (renderOperation, viewName) => {
            if (void 0 !== State.state.lastIf && renderOperation !== types.RenderOperation.draw){ 
                State.rollback(); 
            }
        }
        return function(renderProvider, viewName, once, renderOperation){
            // /check
            if ( ! State.state.lastOp ) throw new Error('"render" should nest something');
            if ( 'function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.nope && renderOperation != types.RenderOperation.refresh ) {
                console.log('Atlant.js: render first param should be function or URI', renderProvider, renderOperation)
                throw new Error('Atlant.js: render first param should be function or URI')
            }
            s.type(viewName, 'string');
            s.type(renderOperation, 'number')
            var closeThisBlock = closeBlock.bind(this, renderOperation, viewName );
            if(renderOperation === types.RenderOperation.nope) { State.state.lastOp.onValue(_=>_); closeThisBlock(); return this; } // Do nothing if "nope"
            viewName = viewName || s.last(prefs.viewState);
            if ( !viewName ) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
            // ------end of check/

            let subscribe  = 'once' !== once ? true : false;
            var renderId = _.uniqueId();

            
            var renderStream = State.state.lastOp.map( function(upstream){
                if (!upstream.isAction && upstream.id !== atlantState.activeStreamId.value) return Bacon.never(); // Obsolete streams invoked on previous route.


                upstream.render = { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: types.RenderOperationKey[renderOperation], subscribe: subscribe, parent: State.state.lastOpId };
            
                return renderView(upstream)
            })

            if (renderOperation === types.RenderOperation.draw){ 
                State.state.lastOp = renderStream;
                State.state.lastOpId = renderId;
            }

            State.state.lastOp.onValue( _ => {
             // if ( renderOperation === types.RenderOperation.draw )  { 
                //     prefs.onDrawEndCallbacks.forEach( _ => _() ) // process user onDrawEnd signal
                // }
                return _
            })

            closeThisBlock();

            return this;
        }
    })();


    var _end = function() {

        State.state.lastOp.onValue(_=>_); // Subscribing to last item, else this .if() will be not executed - because of Bacon lazyness

        if (void 0 !== State.state.lastIf) {
            State.rollback(); 
        }

        return this
    }

    var _update = function( dependsBehaviour, key ) {
        if ( ! State.state.lastOp ) throw new Error('"update" should nest something');
        s.type(key, 'string');

        // streamState.updates.swap(_ => _ + 1);

        return _depends.bind(this)( function(key, id){
            if ( key in atlantState.emitStreams ) atlantState.emitStreams[key].push(id);
            else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");
        }.bind(void 0, key), dependsBehaviour);


        return this;
    }

    var _log = function(...args) {
        return _depends.bind(this)( function(args, scope){
            try{
                console.log.apply(console, args.concat(scope));
                return void 0;
            } catch(e) {
                return void 0;
            }
        }.bind(void 0, args), types.Depends.continue );
    }

    var _select = function(dependsBehaviour, isAtom, partName, storeName, dependsOn) {
        if (!(storeName in atlantState.stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
        if (!(partName in atlantState.stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
        if ( dependsOn && 'string' !== typeof dependsOn ) throw new Error('atlant.js: dependsOn param should be a string' );

        return _depends.bind(this)( function(storeName, partName){
            return function(storeName, partName, id){
                var value;
                try {
                    // console.log('executing select', partName , 'from', '<' + storeName + '>', atlantState.stores[storeName].staticValue, 'with', atlantState.stores[storeName].parts[partName], '(',id(),')', ' = ', atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id()))
                    value = atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id());
                } catch(e) {
                    console.error('select', partName, 'from', storeName,'failed:', e.stack)
                    value = void 0;
                }
                return value;
            }.bind(void 0, storeName, partName)
        }.bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: atlantState.stores[storeName].bus, partProvider: atlantState.stores[storeName].parts[partName], storeData: atlantState.stores[storeName]}, isAtom );
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

    var _resolveWhen = function( truthfulFn ){
        streamState.resolveWhen = truthfulFn;
        return this
    }

    /**
     *  Asyncroniously run the dependency. 
     */
    this.async =  function( dependency ) { return _depends.bind(this)( dependency, false, types.Depends.async) };
    /*
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     * */
    this.dep =  function( dependency ) { return _depends.bind(this)( dependency, false, types.Depends.continue) };
    /*
     * .data() allow catch every peace of data which where piped with .depends(), .and()
     **/

    // Store dispatch
    this.update = _update.bind(this, types.Depends.continue);
    // Query store with atom creation
    this.select = _select.bind(this, types.Depends.continue, true);
    // Just query store, no updates will be received
    this.query = _select.bind(this, types.Depends.continue, false);

    /*
     * Allows give name for .depends()
     */
    this.name = _as;
    // value can be deferred if used with .select()
    this.as = _as;

    // create scope for data provider .select(), .depends() are supported
    this.with = _with;
    this.where = _with;

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
    this.resolveWhen = _resolveWhen; 
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

    this.push = _ => {
        root.push(_)
    }

    this.onValue = _ => {
       streamCallbacks.push(_); 
    }

}

export default Stream;


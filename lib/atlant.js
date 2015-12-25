(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

module.exports = new Date().getTime();

},{}],2:[function(require,module,exports){
'use strict';

module.exports = '0.4.52';

},{}],3:[function(require,module,exports){
"use strict";
/**
 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 * @TODO: check(true) to check only this view params (by specifically set fields or somehow)
 * @TODO: depCache to check only this dep params (by specifically set fields or somehow)
 */

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function Atlant() {
    var s = require('./lib'),
        l = require('./inc/log')(),
        simpleRender = require('./renders/simple'),
        reactRender = require('./renders/react'),
        utils = require('./utils'),
        Upstream = require('./upstream.js'),
        Counter = require('./counter.js')(),
        Bacon = window.Bacon,
        _ = window._,
        interfaces = require('./inc/interfaces'),
        StateClass = require('./inc/state'),
        clientFuncs = require('./inc/clientFuncs'),
        baseStreams = require('./inc/base-streams'),
        Stat = require('./inc/statistics'),
        Storage = require('./inc/storage');

    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);

    //    ,State = require('./state.js')

    // Initialization specific vars
    var isRenderApplyed,
        // Is Render already set OnValue for renders
    params = [],
        // Route mask params parsed
    routes = [],
        // Routes collected
    renderNames = [],
        viewNames = [];

    var viewData = {}; // To check if the rendered data is the as data to be rendered.

    var stores = {};
    var emitStreams = {};

    var statistics = new Stat();

    var activeRenderEnd;

    var viewSubscriptions = {};
    var viewSubscriptionsUnsubscribe = {};

    var activeStreamId = { value: void 0 }; // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
    var lastFinallyStream;
    var prefs = {
        parentOf: {},
        checkInjectsEquality: true,
        skipRoutes: [], // This routes will be skipped in StreamRoutes
        viewState: ['root'],
        on: { renderEnd: void 0 }, // callback which will be called on finishing when rendering
        scrollElement: function scrollElement() {
            return 'undefined' !== typeof document ? document.querySelector('body') : void 0;
        },
        defaultScrollToTop: true,
        pre: void 0
    };

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var withGrabber = new interfaces.withGrabber();

    // State from current route. Updated on route Load.
    var lastPath,
        // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
    lastMask = [],
        lastReferrer;

    var titleStore = { value: "" };

    var State = new StateClass(); // State which up to any last conditional: when, if
    var TopState = new StateClass(); // State which up to when

    // Streams specific vars
    var dependViews = {},
        // Set the views hirearchy. Both for streams and for render.
    renders = {},
        // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
    viewReady = {};

    // Matching enum for when.
    var Matching = {
        stop: _.uniqueId(),
        'continue': _.uniqueId()
    };

    var WhenOrMatch = {
        when: _.uniqueId(),
        match: _.uniqueId()
    };

    // Depends enum
    var Depends = {
        async: _.uniqueId(),
        'continue': _.uniqueId()
    };

    var types = require('./inc/types');

    var atlantState = {
        viewRendered: {}, // Flag that this view is rendered. Stops other streams to perform render then.
        isLastWasMatched: false, // Allow lastWhen to stop other when's execution
        actions: {}
    };

    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    /* Helpers */
    var assignRenders = (function () {

        // Signalling that view renders
        var whenRenderedSignal = function whenRenderedSignal(upstream) {
            if (!upstream.isAction && upstream.id !== activeStreamId.value) return; // this streams should not be counted.

            if (upstream.render.renderOperation === types.RenderOperation.draw) {
                // This is first render and for user to subscribe
                renderStreams.drawEnd.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render });
            }

            if (upstream.render.renderOperation !== types.RenderOperation.draw && !upstream.isAction) {
                renderEndSignal.push({ id: upstream.id, whenId: upstream.whenId, itemIds: [upstream.render.id], item: upstream.render }); // This will count the renders
            }
        };

        // when render applyed, no more renders will be accepted for this .when and viewName
        var renderStopper = function renderStopper(upstream) {
            if (upstream.render.renderOperation === types.RenderOperation.nope || upstream.render.renderOperation === types.RenderOperation.draw || upstream.isAction || upstream.render.renderOperation === types.RenderOperation.move || upstream.render.renderOperation === types.RenderOperation.redirect || upstream.render.renderOperation === types.RenderOperation.replace || upstream.render.renderOperation === types.RenderOperation.change) return true; // alwayes continue for this operations

            if (upstream.render.viewName in atlantState.viewRendered) {
                // If this view is already rendered...
                whenRenderedSignal(upstream); // we should not continue
                return false;
            } else {
                // If this view not yet rendered...
                atlantState.viewRendered[upstream.render.viewName] = upstream.id;

                return true;
            }
        };

        var renderIntoView = function renderIntoView(viewProvider, upstream, viewName, render, scope, whenRenderedSignal) {
            var renderD = s.promiseD(render); // decorating with promise (hint: returned value can be not a promise)
            // l.log('---rendering with ', viewProvider, ' to ', viewName, ' with data ', scope)
            // console.log('rendering into view', viewName)
            return renderD(viewProvider, upstream, activeStreamId, viewName, scope).then(function (_) {
                // @TODO make it better
                // using copy of upstream otherwise the glitches occur. The finallyStream is circular structure, so it should be avoided on copy
                var selects = upstream.selects;
                upstream.selects = void 0;

                var stream = s.clone(upstream);

                stream.selects = selects;
                upstream.selects = selects;

                if (_.code && 'notActiveStream' === _.code) {} else {
                    stream.render.component = _; // pass rendered component. it stale hold before streams get zipped.
                }
                return stream;
            }).then(whenRenderedSignal)['catch'](clientFuncs.catchError);
        };

        var unsubscribeView = function unsubscribeView(viewName) {
            try {
                // turn off all subscriptions of selects for this view
                if (viewSubscriptionsUnsubscribe[viewName]) {
                    // finish Bus if it exists;
                    viewSubscriptionsUnsubscribe[viewName]();
                    // console.log('atom: unsubscribe', viewName)
                }
            } catch (e) {
                console.error('unsubscribe error', e.stack);
            }
        };

        var subscribeView = function subscribeView(viewName, doRenderIntoView, scope, upstream) {

            if (!('chains' in upstream) || !Object.keys(upstream.chains).length) return; // If no store is selected for this view, then we should not subscribe on anything.

            var keys = Object.keys(upstream.chains);
            // console.log('chains:', keys, viewName, upstream.chains);

            viewSubscriptions[viewName] = Bacon.mergeAll(keys.map(function (store) {
                return stores[store].bus;
            }));

            viewSubscriptionsUnsubscribe[viewName] = viewSubscriptions[viewName].onValue((function (upstream, viewName, scope, doRenderIntoView, value) {
                // console.time('score')
                var start = undefined;
                if ('undefined' !== typeof performance) {
                    start = performance.now();
                }

                value = Object.keys(upstream.chains).map(function (_) {
                    return upstream.chains[_];
                }).reduce(function (acc, i) {
                    return acc.concat(i);
                }, []).reduce(function (acc, i) {
                    return acc.concat(i);
                }, []).reduce(function (acc, i) {
                    return _.extend(acc, i());
                }, {});

                // value = _(upstream.chains).map(o=> _(o).map(_=>_).flatten().value() ).flatten().reduce( (acc, i) => _.extend(acc, i()), {}); // Actually it is slower :(

                // console.timeEnd('score')
                if ('undefined' !== typeof performance) {
                    if ('undefined' === typeof window.selectCount) window.selectCount = 0;
                    if ('undefined' === typeof window.selectTime) window.selectTime = 0;
                    window.selectTime = window.selectTime + performance.now() - start;
                    window.selectCount++;
                    window.getSelectTime = function (_) {
                        return window.selectTime / window.selectCount;
                    };
                }

                var data = _.extend({}, scope, value);

                if (!_.isEqual(data, viewData[viewName])) {

                    scope = data;
                    viewData[viewName] = data;
                    // console.log('updating view...', viewName, performance.now())
                    // console.time('render'+ viewName)
                    var rendered = doRenderIntoView(data, function (_) {
                        return _;
                    }); // Here we using scope updated from store!
                    return rendered.then((function (upstream, o) {
                        // console.timeEnd('render'+ viewName)
                        atomEndSignal.push({ id: upstream.id, whenId: upstream.whenId });
                        return o;
                    }).bind(void 0, upstream));
                } else {
                    // console.log('canceled render due the same data', viewName)
                    atomEndSignal.push({ id: upstream.id, whenId: upstream.whenId });
                }
            }).bind(void 0, upstream, viewName, scope, doRenderIntoView));
        };

        // Registering render for view.
        var assignRender = function assignRender(stream) {
            var theStream = stream.filter(renderStopper);

            baseStreams.onValue(theStream, function (upstream) {
                if (void 0 === upstream || activeStreamId.value !== upstream.id) {
                    return void 0;
                }

                try {
                    var viewName = s.dot('.render.viewName', upstream);
                    if (!viewName) return;
                    // Choose appropriate render.
                    var render;

                    // These 2 operation doesn't need a scope
                    if (types.RenderOperation.nope === upstream.render.renderOperation) {
                        whenRenderedSignal(upstream);

                        return;
                    }

                    if (types.RenderOperation.refresh === upstream.render.renderOperation) {
                        utils.goTo(window.location.pathname, void 0, true);
                        whenRenderedSignal(upstream);

                        return;
                    }

                    var scope = clientFuncs.createScope(clientFuncs.getScopeDataFromStream(upstream));
                    var viewProvider = s.dot('.render.renderProvider', upstream);

                    // These needs a scope
                    if (types.RenderOperation.redirect === upstream.render.renderOperation) {
                        if ('function' === typeof viewProvider) {
                            utils.goTo(viewProvider(scope), void 0, true);
                        } else {
                            utils.goTo(viewProvider, void 0, true);
                        }

                        return;
                    } else if (types.RenderOperation.move === upstream.render.renderOperation) {
                        if ('function' === typeof viewProvider) {
                            window.location.assign(viewProvider(scope));
                        } else {
                            window.location.assign(viewProvider);
                        }

                        return;
                    } else if (types.RenderOperation.replace === upstream.render.renderOperation) {

                        var path = s.apply(viewProvider, scope);
                        lastPath = path;
                        utils.replace(path); // just rename url

                        whenRenderedSignal(upstream);

                        return;
                    } else if (types.RenderOperation.change === upstream.render.renderOperation) {
                        var path = s.apply(viewProvider, scope);
                        lastReferrer = lastPath;
                        lastPath = path;
                        utils.change(path); // Push url to history without atlant to react on new value.

                        whenRenderedSignal(upstream);

                        return;
                    } else {

                        if (types.RenderOperation.render === upstream.render.renderOperation || types.RenderOperation.draw === upstream.render.renderOperation) {
                            render = prefs.render.render.bind(prefs.render);
                        } else if (types.RenderOperation.clear === upstream.render.renderOperation) {
                            render = prefs.render.clear.bind(prefs.render);
                        }

                        var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render);

                        viewData[viewName] = scope;
                        var renderResult = doRenderIntoView(scope, whenRenderedSignal); // Here we using scope updated from store!

                        unsubscribeView(viewName);

                        if (upstream.render.subscribe) // Subscriber only after real render - Bacon evaluates subscriber immediately
                            subscribeView(viewName, doRenderIntoView, scope, upstream);

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

        return function () {
            if (isRenderApplyed) return;

            isRenderApplyed = true;
            // console.time('assign renders')
            var count = 0;
            for (var viewName in renders) {
                //@TODO assign only those streams and for those views which are existent on this route
                count += renders[viewName].length;
                s.map(assignRender, renders[viewName]);
            }
            // console.timeEnd('assign renders')
            // console.log('assign renders to:', count, 'streams')
        };
    })();

    /* matchRouteLast */
    var matchRouteLast = (function () {
        var matchRouteWrapper = function matchRouteWrapper(path, route) {
            var match = utils.matchRoute(path, route.mask);

            return match ? { params: match, route: route } : null;
        };

        return s.curry(function (path, matchingBehaviour, route) {
            if ('string' === typeof route) route = { mask: route };
            var match = matchRouteWrapper(path, route);
            if (match && Matching.stop === matchingBehaviour) {
                atlantState.isLastWasMatched = true;
            }
            return match;
        });
    })();

    /**
     * Main function for parse new path
     * @param path
     * @returns {bool} false | {*}
     */
    var matchRoutes = function matchRoutes(path, routes, matchingBehaviour) {
        matchingBehaviour = matchingBehaviour || Matching['continue'];
        var tempRoutes = routes.map(function (route) {
            return matchRouteLast(path, matchingBehaviour, route);
        }).filter(s.notEmpty);

        return s.head(tempRoutes);
    };

    /* depends */
    var _depends = (function () {

        var createDepStream = function createDepStream(stream, depName, dep, injects, store, isAtom) {
            var nameContainer = dependsName.init(depName, State.state);
            var withs = withGrabber.init(State.state);

            stream = stream
            // .map( function(u){ console.log('extending:', 'to be:' , u); return u; #<{(|_.extend( {}, u)|)}># } )
            // .map( function(_){ if ( activeStreamId.value !== _.id ) { console.log('STOPPED_DEP:', _, _.id, activeStreamId.value); return void 0 } else { return _ } } )
            // .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
            // .map( function(_){ if ( activeStreamId.value !== _.id ) { console.log('NOTSTOPPED_DEP:', _, _.id, activeStreamId.value);}  return _  } )
            .map(dependsName.add.bind(dependsName, depName, nameContainer)).map(withGrabber.add.bind(withGrabber, withs));

            if ('function' !== typeof dep) {
                stream = stream.map((function (depName, dep, upstream) {
                    if (!upstream.depends) upstream.depends = {};
                    upstream.depends[depName] = dep;
                    return upstream;
                }).bind(void 0, depName, dep));
            } else {

                stream = stream.flatMap((function (store, depName, dep, isAtom, upstream) {
                    // Execute the dependency
                    var scope = clientFuncs.createScope(upstream);
                    var where = upstream['with'] && 'value' in upstream['with'] ? upstream['with'].value : s.id;
                    var atomParams = (function (scope, where, updates) {
                        return where(_.extend({}, scope, updates));
                    }).bind(this, scope, where);

                    var treatDep = s.compose(clientFuncs.convertPromiseD, s.promiseTryD);
                    var atomValue = atomParams();
                    return treatDep(dep)(atomValue).mapError(function (_) {
                        console.error('Network error: status === ', _.status);return _;
                    }).map((function (upstream, atomParams, store, depName, isAtom, atomValue, results) {
                        if ('function' === typeof results) results = results.bind(void 0, atomParams);
                        if (!upstream.isInterceptor) interceptorBus.push({ upstream: upstream, scope: results }); // pushing into global depends .interceptor()
                        if (!upstream.depends) upstream.depends = {};
                        upstream.depends[depName] = results;

                        if (!upstream.atomIds) upstream.atomIds = [];

                        if ('undefined' !== typeof store && isAtom) {
                            upstream.atomParams = atomParams;
                            upstream.atomIds.push({ ref: upstream.ref, fn: atomParams, partProvider: store.partProvider, storeData: store.storeData });
                        }

                        return upstream;
                    }).bind(void 0, upstream, atomParams, store, depName, isAtom, atomValue));
                }).bind(void 0, store, depName, dep, isAtom));
            }

            stream = stream // Treat dependency results
            .map((function (depName, injects, upstream) {
                // upstream.dependNames store name of all dependencies stored in upstream.
                return injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);
            }).bind(void 0, depName, injects)).mapError(function (_) {
                console.error('Unhandled error', _);
            });

            stream = stream // Add select subscriptions
            .map((function (depName, store, dep, isAtom, upstream) {
                // upstream.dependNames store name of all dependencies stored in upstream.

                // if( !('ref' in upstream) || 'undefined' === typeof upstream.ref || '' === upstream.ref  ) {
                //     console.log('log:', upstream, store, dep);
                //     throw new Error('Every select should have name.')
                // }

                if ('undefined' !== typeof upstream.ref && 'undefined' !== typeof store && isAtom) {
                    var getValue;

                    (function () {
                        if (!('chains' in upstream)) upstream.chains = {};
                        if (!(store.storeName in upstream.chains)) upstream.chains[store.storeName] = [];
                        if (!('select' in upstream)) upstream.select = {};

                        if ('undefined' !== typeof store.dependsOn && '' !== store.dependsOn && !(store.dependsOn in upstream.select)) throw new Error('Select "' + upstream.ref + '"" cannot depend on unknown select: "' + store.dependsOn + '"');

                        // if(store.dependsOn && '' !== store.dependsOn )
                        //     console.log('select depending ', upstream.ref, 'on', store.dependsOn)
                        // if( store.dependsOn && '' === store.dependsOn )
                        //     console.log('select', upstream.ref, 'is independent')
                        // if( '' === store.dependsOn )
                        //     console.log('select', 'no dependency')
                        // if (!dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn)
                        //     console.log('select lastSelect', upstream.ref, 'on', upstream.lastSelect )

                        getValue = (function (ref, atomParams, u) {
                            var params = atomParams.bind(this, u);
                            var res = dep()(params);
                            var result = _.extend({}, u, _defineProperty({}, ref, res));
                            return result;
                        }).bind(void 0, upstream.ref, upstream.atomParams);

                        var dependence = 'undefined' !== typeof store.dependsOn && '' !== store.dependsOn && store.dependsOn in upstream.select ? upstream.select[store.dependsOn] : void 0; // dependence is just a function which return value

                        if (!dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn) dependence = upstream.select[upstream.lastSelect];

                        var f = dependence ? function (_) {
                            return getValue(dependence(_));
                        } : getValue;

                        upstream.lastSelect = upstream.ref;
                        upstream.chains[store.storeName].push(f);
                        upstream.select[upstream.ref] = f;
                    })();
                }

                return upstream;
            }).bind(void 0, depName, store, dep, isAtom));

            return stream;
        };

        /**
         * Join 2 streams into 1
         */
        var zippersJoin = s.curry(function (prevDepName, currDepName, x, y) {
            x.depends = s.extend({}, x.depends, y.depends);
            x.injects = x.injects.concat(y.injects);
            return x;
        });

        return function (dependency, dependsBehaviour, store, isAtom) {
            if (!State.state.lastWhen) throw new Error('"depends" should nest "when"');

            var prefix = dependsBehaviour === Depends['continue'] ? '_and_' : '_';
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === Depends.async) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, depName, dependency, State.state.lastInjects, store, isAtom);

            if (dependsBehaviour === Depends.async && State.state.lastDep) {
                // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = State.state.lastDep.zip(thisDep, zippersJoin(State.state.lastDepName, depName));
            }

            State.state.lastDep = thisDep;
            State.state.lastDepName = depName;
            State.state.lastOp = State.state.lastDep;

            return this;
        };
    })();

    /* Base and helper streams*/
    l.log('registering base streams...');

    var publishStream = baseStreams.bus(); // Here we can put init things.
    var errorStream = baseStreams.bus();
    var interceptorBus = baseStreams.bus();

    // Browser specific actions.
    if ('undefined' !== typeof window) {
        var states = require('./inc/wrap-push-pop-states.js');
        states.wrapPushState(window);
        // states.wrapPopState(window);

        // Subscribe to clicks and keyboard immediatelly. Document already exists.
        utils.attachGuardToLinks();
    }

    var whenCount = { value: 0 };
    var renderStreams = require('./render-streams')(Counter, whenCount);

    var defValue = function defValue() {
        return { value: 0 };
    };
    var onDestroyStream = baseStreams.bus();
    var onRenderEndStream = baseStreams.bus();
    var onDrawEndStream = baseStreams.bus();
    var onAtomEndStream = baseStreams.bus();
    var onBothEndStreams = onAtomEndStream.zip(onRenderEndStream, function (x, y) {
        return y;
    });

    var atomCounter = { list: {} };
    var isAtomed = { value: false };
    var atomEndSignal = baseStreams.bus();
    var atomRecalculateSignal = baseStreams.bus();

    var renderCounter = { list: {} };
    var isRendered = { value: false };
    var renderEndSignal = baseStreams.bus();
    var renderRecalculateSignal = baseStreams.bus();

    var sumCounter = function sumCounter(counter) {
        return Object.keys(counter.list).map(function (id) {
            return counter.list[id].value;
        }).reduce(function (acc, i) {
            return acc + i;
        }, 0);
    };

    var checker = function checker(name, isFinished, isNeedToDecrease, signalStream, counter, object) {
        try {
            if (isFinished.value) {
                /*console.log('Canceled atom signal after render is completed');*/return;
            }
            if (!(object.whenId in counter.list)) {
                /*console.log('no selects here');*/return;
            } // no selects here

            if (isNeedToDecrease) counter.list[object.whenId].value--;
            var signalled = sumCounter(counter);
            var calculated = -1 !== name.indexOf('atom') ? statistics.getSum(lastPath) : statistics.getRenderSum(lastPath);

            // if(-1!==name.indexOf('atom'))
            // console.log(name, signalled, calculated, 'whenId:', object.whenId, 'itemIds:', object.itemIds, counter, object.item ? object.item.type : "", object.item ? object.item.viewName : '')

            if (0 === signalled + calculated) {
                // console.log('GOTTCHA!', name, 'is completed')
                isFinished.value = true;
                signalStream.push();
                if (-1 === name.indexOf('atom')) {
                    checker('atomAsk:', isAtomed, false, onAtomEndStream, atomCounter, object); // In case if there are no selects and select cancels we can check here and it will be clear, should server end or not.
                }
            }
        } catch (e) {
            console.error(e.stack);
        }
    };

    atomEndSignal.onValue(checker.bind(void 0, 'atom', isAtomed, true, onAtomEndStream, atomCounter));
    atomRecalculateSignal.onValue(checker.bind(void 0, 'atomCancel:', isAtomed, false, onAtomEndStream, atomCounter));

    renderEndSignal.onValue(checker.bind(void 0, 'render:', isRendered, true, onRenderEndStream, renderCounter));
    renderRecalculateSignal.onValue(checker.bind(void 0, 'renderCanceled:', isRendered, false, onRenderEndStream, renderCounter));

    // onAtomEndStream.onValue(function(value){console.log('ATOM END STREAM!')})
    // onRenderEndStream.onValue(function(value){console.log('RENDER END STREAM!')})

    var performCallback = function performCallback(upstreams, callbackStream, postponedActions) {
        try {

            callbackStream.push();

            postponedActions.forEach(function (action) {
                action();
            });
        } catch (e) {
            console.error('Atlant Error:', e);
            errorStream.push(e);
        }
    };

    var routeChangedStream = publishStream.merge(Bacon.fromBinder(function (sink) {
        if ('undefined' !== typeof window) {
            var routeChanged = (function (sink, event) {
                try {
                    event.preventDefault();
                    var path;

                    var body = document.body,
                        html = document.documentElement;

                    // Using state from event. At this point the history.state is stil old.
                    var state = event instanceof PopStateEvent ? event.state : event.detail.state; // CustomEvent has details and state inside. PopStateEvent has just state inside.

                    // On pushstate event the utils.getLocation() will give url of previous route.
                    // Otherwise on popstate utils.getLocation() return current URI.
                    var path = event instanceof PopStateEvent ? utils.getLocation() : event.detail.url;

                    path = utils.rebuildURL(path);

                    var body = document.querySelector('body');
                    var height = function height(_) {
                        return Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
                    };

                    if (event instanceof PopStateEvent) {
                        if ('scrollRestoration' in history) {
                            var bodyHeight = height();
                            if (bodyHeight < state.scrollTop) {
                                body.style.minHeight = state.scrollTop + window.innerHeight + 'px';
                            }

                            window.scrollTo(0, state.scrollTop);

                            setTimeout(function (_) {
                                return body.querySelector('body').style.height = 'auto';
                            }, 300); // @TODO once render complete we can remove height from body.
                            // let postponedCleanup = function(){
                            //     body.querySelector('body').style.height = 'auto'
                            // }
                        } else {
                                var handler = function handler() {
                                    // document.removeEventListener('scroll', handler);
                                    body.style.overflow = 'initial';
                                    body.classList.remove('progress');
                                    window.scrollTo(0, state.scrollTop);
                                };

                                body.classList.add('progress');
                                body.style.overflow = 'hidden';
                                // document.addEventListener('scroll', handler);
                                setTimeout(handler, 0);
                                // setTimeout( _ => document.querySelector('body').style.removeProperty('overflow'), 0); // It is possible that scroll event will not occur.
                            }
                    } else if (0 === state.scrollTop) {
                            window.scrollTo(0, 0);
                            utils.saveScroll();
                        }

                    l.log('the route is changed!');
                    if (path !== lastPath || event && event.detail && event.detail.state && event.detail.state.forceRouteChange) {
                        sink({
                            path: path,
                            referrer: lastPath
                            // ,postponed: postponedCleanup
                        });
                    }
                } catch (e) {
                    console.error(e.stack);
                }
            }).bind(void 0, sink);
            window.addEventListener('popstate', routeChanged);
            window.addEventListener('pushstate', routeChanged);
            window.addEventListener('scroll', utils.saveScroll);

            utils.saveScroll();
        }
    })).scan(void 0, function (previous, current) {
        if (previous && previous.hasOwnProperty('published') || current.hasOwnProperty('published')) {
            current.published = true;
        }
        return current;
    }).filter(function (upstream) {
        return upstream && upstream.hasOwnProperty('published');
    }).map(function (upstream) {
        var stream;
        if (upstream.path) {
            // get from sink
            stream = upstream;
        } else {
            // get from published
            var path = utils.rebuildURL(utils.getLocation());
            var referrer = utils.rebuildURL(utils.getReferrer());

            stream = {
                path: path,
                referrer: referrer
            };
        }

        return stream;
    }).filter(s.compose(s.empty, s.flip(matchRoutes, 3)(Matching['continue'], prefs.skipRoutes), s.dot('path'))) // If route marked as 'skip', then we should not treat it at all.
    .map(function (upstream) {
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

    var rootStream = Bacon.fromBinder(function (sink) {
        baseStreams.onValue(routeChangedStream, (function (sink, _) {
            if (prefs.pre) prefs.pre();
            assignRenders();
            sink(_);
        }).bind(void 0, sink));
    }).takeUntil(baseStreams.destructorStream);

    var otherwiseStream = rootStream.filter(s.compose(s.empty, s.flip(matchRoutes)(Matching.stop, routes), s.dot('path'))).map(s.logIt('Otherwise is in work.'));

    /* Base */

    /**
     * When
     */
    var _when = (function () {
        var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
        var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));

        return function (masks, matchingBehaviour, whenType) {

            if (-1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.');
            masks = masks.split('||').map(s.trim).filter(function (_) {
                return _.length;
            });

            if (!masks.length) throw new Error('At least one route mask should be specified.');

            State.first();
            TopState.first();

            var whenId = _.uniqueId();

            TopState.state.lastMasks = masks;

            if (masks.filter(function (mask) {
                return '*' === mask;
            }).length && whenType === WhenOrMatch.when) {
                throw new Error('Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")');
            }

            var name = whenType === WhenOrMatch.match ? 'match' : 'when';
            name = name + createNameFromMasks(masks) + _.uniqueId();

            // Allows attaching injects to .when().
            var injects = injectsGrabber.init(name, State.state);
            var stats = TopState.state.stats;
            var scrollToTop = { value: whenType === WhenOrMatch.match ? false : true };
            TopState.state.scrollToTop = scrollToTop;

            var whenMasks = masks;
            if (WhenOrMatch.when === whenType) masks.forEach(function (mask) {
                // @TODO: old thing
                s.push({ mask: utils.stripLastSlash(mask) }, routes);
            });

            masks = _(masks).map(function (mask) {
                return [mask, utils.getPossiblePath(mask)];
            }).flatten().value();

            State.state.lastWhen = rootStream.map((function (masks, upstream) {
                var mask = _(masks).filter((function (whenType) {
                    if (WhenOrMatch.match === whenType) return true;else return !atlantState.isLastWasMatched;
                }).bind(void 0, whenType)) // do not let stream go further if other is already matched. .match() streams are immune.
                .map(matchRouteLast(upstream.path, matchingBehaviour))
                // .map(s.logIt('---matched routes!!!', upstream))
                .filter(s.notEmpty) // empty params means fails of route identity.
                .head();

                if (!mask) {
                    return void 0;
                } else {
                    var stream = {};
                    stream = _.extend(stream, upstream);
                    stream.params = mask.params;
                    stream.route = mask.route;
                    return stream;
                }
            }).bind(void 0, masks)).filter(s.id).map((function (whenId, whenType, stats, name, injects, masks, whenMasks, scrollToTop, upstream) {
                upstream.whenId = whenId;
                upstream.route.when = masks;
                upstream.isFinally = false;
                upstream.isMatch = WhenOrMatch.match === whenType;
                if (activeStreamId.value === upstream.id) whenCount.value++;

                atomCounter.list[whenId] = defValue();
                renderCounter.list[whenId] = defValue();
                upstream.stats = stats;
                upstream.masks = whenMasks;

                // Storing here the data for actions.
                lastMask.push(upstream.route.mask);

                var params = s.reduce(function (result, item) {
                    result[item] = upstream.params[item];return result;
                }, {}, _.keys(upstream.params));
                var depData = s.merge(params, {
                    location: upstream.path,
                    mask: upstream.route.mask,
                    masks: lastMask,
                    pattern: utils.getPattern(lastMask),
                    referrer: upstream.referrer
                });

                if (scrollToTop.value && 'undefined' !== typeof window) {
                    window.scrollTo(0, 0);
                }

                var stream = injectsGrabber.add(name, depData, injects, upstream);
                return stream;
            }).bind(void 0, whenId, whenType, stats, name, injects, masks, whenMasks, scrollToTop));

            State.state.lastWhen = State.state.lastWhen.map((function (whenId, stream) {
                stream.conditionId = whenId;return stream;
            }).bind(void 0, whenId));

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
    })();

    var _action = function _action(action, isAction, depCode) {
        State.first();
        TopState.first();

        if (!action) throw new Error('Atlant.js: action stream is not provided!');
        var whenId = _.uniqueId();
        var depName = depCode + '_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var nameContainer = dependsName.init(depName, State.state);
        var stats = TopState.state.stats;

        State.state.lastWhen = action.map((function (depName, injects, nameContainer, stats, whenId, isAction, depValue) {
            if ('undefined' === typeof depValue) {
                depValue = {};
            }
            if ('object' === typeof depValue) {
                depValue.masks = lastMask;
                depValue.pattern = utils.getPattern(lastMask);
                depValue.mask = void 0;
                depValue.location = lastPath;
                depValue.referrer = lastReferrer;
            }

            var stream = injectsGrabber.add(depName, depValue, injects, {});
            stream = dependsName.add(depName, nameContainer, stream);

            stream.stats = stats;
            stream[depCode] = true;
            stream.conditionId = whenId;
            stream.whenId = whenId;
            stream.isAction = isAction;
            stream.id = activeStreamId.value;
            // stream.id = _.uniqueId(); // Should it be so at error?

            return stream;
        }).bind(void 0, depName, injects, nameContainer, stats, whenId, isAction));

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastWhenType = depCode;
        State.state.lastConditionId = whenId;
        TopState.state.lastActionId = whenId;
        TopState.state.lastAction = depName;
        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: [TopState.state.lastAction] });

        return this;
    };

    var _pre = function _pre(fn) {
        prefs.pre = fn;
        return this;
    };

    /**
        if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function _if(boolTransform, condition) {
        s.type(boolTransform, 'function');
        s.type(condition, 'function');

        var fn = s.compose(boolTransform, condition);
        var fnNegate = s.compose(s.negate, boolTransform, condition);

        if (!State.state.lastOp) {
            throw new Error('"if" should nest something.');
        }

        State.divide();
        var ifId = _.uniqueId();

        var depName = 'if_' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        var thisCommonIf = State.state.lastOp.map(function (u) {
            return _.extend({}, u);
        }).map(function (_) {
            if (activeStreamId.value !== _.id) {
                return void 0;
            } else {
                return _;
            }
        }).filter(function (_) {
            return _;
        }) // Checking, should we continue or this stream already obsolete.
        .map(function (_) {
            if (activeStreamId.value !== _.id) {
                console.log('NONSTOP');
            }return _;
        }); // stayed here for debuggind purposes

        var thisIf = thisCommonIf.map((function (ifId, fn, condition, upstream) {
            var scope = clientFuncs.createScope(upstream);
            var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
            if (checkCondition(scope)) return upstream;else return void 0;
        }).bind(void 0, ifId, fn, condition)).filter(s.id).map((function (ifId, depName, injects, upstream) {
            var stream = injectsGrabber.add(depName, {}, injects, upstream);

            if (!upstream.isAction && activeStreamId.value === upstream.id) whenCount.value++; // increasing counter only if this stream is not yet obsolete

            stream.conditionId = ifId;
            return stream;
        }).bind(void 0, ifId, depName, injects));

        var thisIfNegate = thisCommonIf.map((function (ifId, fnNegate, condition, upstream) {
            var scope = clientFuncs.createScope(upstream);
            var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fnNegate);
            if (checkCondition(scope)) return upstream;else return void 0;
        }).bind(void 0, ifId, fnNegate, condition)).filter(s.id);

        thisIfNegate.onValue((function (ifId, actionId, condition, u) {
            var renders = statistics.getRendersByUrl(actionId, lastPath, ifId);
            if (renders.length) {
                // console.log('negating renders...:', renders)
                statistics.removeRenders(u.whenId, u.masks, renders);
                renderRecalculateSignal.push({ id: u.id, whenId: u.whenId, itemIds: renders });
            }
            var updates = statistics.getUpdatesByUrl(actionId, lastPath, ifId);
            if (updates.length) {
                // console.log("negating UPDATES:", updates )
                statistics.removeUpdates(u.whenId, u.masks, updates);
                atomRecalculateSignal.push({ id: u.id, whenId: u.whenId });
            }
        }).bind(void 0, ifId, TopState.state.lastActionId, condition));

        State.state.lastIf = thisIf;
        State.state.lastOp = State.state.lastIf;
        State.state.lastConditionId = ifId;
        State.state.lastIfId = ifId;
        State.state.lastIfIds.push(ifId); // Stores upper stack of if ids

        statistics.whenStat({
            actionId: TopState.state.lastActionId,
            ifId: ifId,
            masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction] // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.
        });
        return this;
    };

    var _end = function _end() {
        if (void 0 !== State.state.lastIf) {
            State.rollback();
        }

        return this;
    };

    var _defaultScrollToTop = function _defaultScrollToTop(value) {
        this.prefs.defaultScrollToTop = value;

        return this;
    };

    var _scrollToTop = function _scrollToTop(value) {
        if (void 0 !== TopState.state.scrollToTop) {
            TopState.state.scrollToTop.value = value;
        }

        return this;
    };

    /**
        Received - every depends include this stream after execution
     * @param fn
     */
    var _received = function _received() {

        return this;
    };

    var _inject = function _inject(key, expression) {
        s.type(key, 'string');
        if (!State.state.lastDepName) throw new Error('.inject should follow .depends');

        State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression };

        return this;
    };

    var _join = function _join(key, expression) {
        s.type(key, 'string');
        State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression, injects: Array.prototype.slice.apply(State.state.lastInjects) };

        return this;
    };

    /**
     * render Function
     * Customize the stream which created by "when" route.
     * Applyed to any stream and will force render of "template" with "controller" into "view"
     * @param controller
     * @param templateUrl
     * @param viewName - directive name which will be used to inject template
     * @returns {*}
     */
    var _render = function _render(renderProvider, viewName, once, renderOperation) {
        if (!State.state.lastOp) throw new Error('"render" should nest something');
        var subscribe = 'once' !== once ? true : false;

        if ('function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.nope && renderOperation != types.RenderOperation.refresh) {
            throw new Error('Atlant.js: render first param should be function or URI');
        }
        s.type(viewName, 'string');
        s.type(renderOperation, 'number');

        viewName = viewName || s.last(prefs.viewState);

        if (!viewName) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');
        if (renderOperation === types.RenderOperation.nope) viewName = void 0;

        if (renderOperation !== types.RenderOperation.draw && 'action' !== State.state.lastWhenType) Counter.increase(State.state);
        var renderId = _.uniqueId();

        var thisRender = State.state.lastOp
        // .map( function(u){ return _.extend( {}, u) } )
        // .map( function(_){ if ( activeStreamId.value !== _.id ) { return void 0 } else { return _ } } )
        // .filter( function(_) { return _ } ) // Checking, should we continue or this stream already obsolete.
        .map((function (renderId, renderProvider, viewName, renderOperation, u) {
            var render = { render: { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: types.RenderOperationKey[renderOperation], subscribe: subscribe } };
            return _.extend({}, u, render);
        }).bind(void 0, renderId, renderProvider, viewName, renderOperation));

        // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewName.
        if (!renders[viewName]) renders[viewName] = [];
        renders[viewName].push(thisRender);

        if (types.RenderOperation.draw !== renderOperation) {
            // console.log('registering render:', renderId, TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], viewName, types.RenderOperationKey[renderOperation], renderProvider, 'ifIds:', State.state.lastIfIds);
            statistics.whenStat({ actionId: TopState.state.lastActionId,
                ifIds: State.state.lastIfIds,
                masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction],
                render: renderId
            });
        }

        if (void 0 !== State.state.lastIf && renderOperation !== types.RenderOperation.draw) {
            State.rollback();
        }

        return this;
    };

    var _check = function _check(isCheck) {
        if ('undefined' === typeof isCheck) throw new Error('Atlant.js: check require boolean parameter.');

        prefs.checkInjectsEquality = isCheck;
        return this;
    };

    var _interceptor = function _interceptor() {
        State.first();
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'interceptor' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var stats = TopState.state.stats;

        State.state.lastWhen = interceptorBus.map((function (depName, injects, stats, whenId, obj) {

            var depValue = {}; // @TODO RETHINK
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

            l.log('---Matched interceptor!!!', depValue);

            return stream;
        }).bind(void 0, depName, injects, stats, whenId));

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
    var _skip = (function () {
        var pushSkipVariants = function pushSkipVariants(path) {
            prefs.skipRoutes.push({ mask: path });
            prefs.skipRoutes.push({ mask: utils.getPossiblePath(path) });
        };

        return function (path) {
            if (1 < arguments.length) {
                s.map(pushSkipVariants, s.a2a(arguments));
            } else {
                pushSkipVariants(path);
            }
            return this;
        };
    })();

    /**
     *  Use this method to publish routes when
     */
    var _publish = function _publish(path) {
        if (path) s.type(path, 'string');
        publishStream.push({ published: true, path: path });
    };

    var _set = function _set(view) {
        s.type(view, 'string');

        prefs.viewState.push(view);
        return this;
    };

    var _unset = function _unset() {
        if (prefs.viewState.length > 1) prefs.viewState.pop();
        return this;
    };

    var _onDrawEnd = function _onDrawEnd(callback) {
        baseStreams.onValue(renderStreams.drawEnd, function () {
            return s.tryD(callback)();
        });
        /*should send nothing here!*/return this;
    };

    var _onRenderEnd = function _onRenderEnd(callback) {
        // Use this to get early callback for server render
        baseStreams.onValue(onBothEndStreams, s.baconTryD(callback));
        return this;
    };

    var _onDestroy = function _onDestroy(callback) {
        // Use this to get early callback for server render
        baseStreams.onValue(onDestroyStream, s.baconTryD(callback));
        return this;
    };

    var _use = function _use(render) {
        s.type(render, 'object');
        //@TODO: check render for internal structure
        if (prefs.render) throw new Error('You can specify render only once.');

        prefs.render = render;
        return this;
    };

    var _scrollElement = function _scrollElement(elementFn) {
        s.type(elementFn, 'function');
        prefs.scrollElement = elementFn;
        return this;
    };

    var _attach = function _attach(rootView, selector) {
        s.type(rootView, 'string');
        s.type(selector, 'string');

        if ('undefined' === typeof window) {}

        var firstRender = renderStreams.drawEnd.merge(renderEndSignal).filter(function (_) {
            if (_.item && (_.item.renderOperation === types.RenderOperation.render || _.item.renderOperation === types.RenderOperation.draw) && _.item.viewName === rootView) return true; // accept only first render/draw of rootComponent
            else return false;
        }).take(1);

        baseStreams.onValue(firstRender, (function (rootView, selector, value) {
            // value contains all rendered upstreams.
            prefs.render.attach(rootView, selector)['catch'](function (e) {
                console.error(e.message, e.stack);
                errorStream.push(e);
            }).then(s.logIt("we' done."));
        }).bind(void 0, rootView, selector));

        return this;
    };

    var _stringify = function _stringify(rootView, options) {
        return prefs.render.stringify(rootView, options);
    };

    var _await = function _await(shouldAWait) {
        utils.goTo = safeGoToCopy.bind(utils, shouldAWait);
        return this;
    };

    var _verbose = function _verbose(on) {
        l.verbose(on);
        return this;
    };

    var _redirectTo = function _redirectTo(url) {
        return utils.goTo(url);
    };

    var _moveTo = function _moveTo(url) {
        if ('undefined' !== typeof window) return window.location.assign(url);else console.error('Atlant.js: no window object...');
    };

    var _push = function _push(actionName) {
        throw new Error('atlant.push() not implemented');
        return this;
    };

    var _store = function _store(storeName) {
        TopState.first();
        TopState.state.lastStoreName = storeName;

        if (!(storeName in stores)) stores[storeName] = {
            _constructor: void 0,
            updater: void 0,
            value: Storage.load(storeName) || void 0,
            staticValue: Storage.load(storeName) || void 0,
            updaters: {},
            parts: {}
        };

        return this;
    };

    var _serialize = function _serialize(serializeProvider) {
        var storeName = TopState.state.lastStoreName;
        if (!storeName) {
            throw new Error('.serialize() should be after .store()');
        }
        if ('function' === typeof stores[storeName]._serialize) {
            throw new Error("Serialize already implemented in store ", storeName);
        }
        if ('function' !== typeof serializeProvider) {
            throw new Error("Serialize should be a function for ", storeName);
        }

        stores[storeName]._serialize = serializeProvider;

        return this;
    };

    var _constructor = function _constructor(constructorProvider) {
        var storeName = TopState.state.lastStoreName;
        if (!storeName) {
            throw new Error('.constructor() should be after .store()');
        }
        if ('function' === typeof stores[storeName]._constructor) {
            throw new Error("Constructor already implemented in store ", storeName);
        }
        if ('function' !== typeof constructorProvider) {
            throw new Error("Constructor should be a function for ", storeName);
        }

        stores[storeName]._constructor = function (_) {
            return Storage.load(storeName) || constructorProvider();
        };
        stores[storeName].changes = baseStreams.bus();
        stores[storeName].staticValue = stores[storeName]._constructor();
        stores[storeName].bus = stores[storeName].changes.scan(stores[storeName].staticValue, (function (storeName, state, updater) {
            var newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
            stores[storeName].staticValue = newState;

            if ('undefined' !== typeof window) {
                if (!window.stores) window.stores = {};
                window.stores[storeName] = newState;
            }

            {
                (function () {
                    var serialize = stores[storeName]._serialize;
                    if (serialize) setTimeout(function () {
                        Storage.persist(storeName, serialize(newState));
                    }, 1000);
                })();
            }

            return newState;
        }).bind(void 0, storeName)).skipDuplicates().toEventStream();

        baseStreams.onValue(stores[storeName].bus, function () {});

        return this;
    };

    var _updater = function _updater(updaterName, updater) {
        var storeName = TopState.state.lastStoreName;

        if (!storeName) {
            throw new Error('.updater() should be after .store()');
        }
        if ('function' !== typeof stores[storeName]._constructor) {
            throw new Error("Constructor not implemented in store ", storeName);
        }
        if (updaterName in stores[storeName].updaters) {
            throw new Error("Cannot reimplement updater ", updaterName, " in store ", storeName);
        }

        stores[storeName].updaters[updaterName] = updater;
        statistics.putLink(storeName, updaterName);

        if (!(updaterName in emitStreams)) emitStreams[updaterName] = baseStreams.bus();

        baseStreams.onValue(emitStreams[updaterName], (function (storeName, updater, scope) {
            // scope is the value of .update().with(scope) what was pushed in
            stores[storeName].changes.push((function (scope, updater, state) {
                // state is the value which passed through atom
                try {
                    // console.log('UPDATE:', updaterName, scope, storeName);
                    return updater(state, scope);
                } catch (e) {
                    console.error('atlant.js: Warning: updater failed', e);
                    return state;
                }
            }).bind(void 0, scope, updater));
        }).bind(void 0, storeName, updater));

        return this;
    };

    var _part = function _part(partName, partProvider) {
        var storeName = TopState.state.lastStoreName;

        if (!storeName) {
            throw new Error('.part() should be after .store()');
        }
        if ('function' !== typeof stores[storeName]._constructor) {
            throw new Error("Constructor not implemented in store ", storeName);
        }
        if (partName in stores[storeName].parts) {
            throw new Error("Cannot reimplement part ", partName, " in store ", storeName);
        }

        stores[storeName].parts[partName] = partProvider;

        return this;
    };

    var _update = function _update(dependsBehaviour, key) {
        if (!State.state.lastOp) throw new Error('"update" should nest something');
        s.type(key, 'string');

        // doing at static stage
        statistics.whenStat({
            eventKey: key,
            actionId: TopState.state.lastActionId,
            ifIds: State.state.lastIfIds,
            masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction]
        }); // @TODO Can't do this in case of action. We shouldn't look here for actions, except if they fired from when statement.

        return _depends.bind(this)((function (key, id) {
            if (key in emitStreams) emitStreams[key].push(id);else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");
        }).bind(void 0, key), dependsBehaviour);

        return this;
    };

    var _log = function _log(strings) {
        var arr = s.a2a(arguments).slice();
        return _depends.bind(this)((function (arr, scope) {
            arr.push(scope);

            try {
                console.log.apply(console, arr);
                return void 0;
            } catch (e) {
                return void 0;
            }
        }).bind(void 0, arr), Depends['continue']);
    };

    var _select = function _select(isAtom, dependsBehaviour, partName, storeName, dependsOn) {
        if (!(storeName in stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
        if (!(partName in stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
        if (dependsOn && 'string' !== typeof dependsOn) throw new Error('atlant.js: dependsOn param should be a string');

        statistics.whenStat({ actionId: TopState.state.lastActionId, masks: TopState.state.lastMasks ? TopState.state.lastMasks : [TopState.state.lastAction], atom: storeName });

        return _depends.bind(this)((function (storeName, partName) {
            return (function (storeName, partName, id) {
                try {
                    // console.log('executing select', partName , 'from', '<' + storeName + '>', stores[storeName].staticValue, 'with', stores[storeName].parts[partName], '(',id(),')', ' = ', stores[storeName].parts[partName](stores[storeName].staticValue, id()))
                    return stores[storeName].parts[partName](stores[storeName].staticValue, id());
                } catch (e) {
                    console.error('select', partName, 'from', storeName, 'failed:', e.stack);
                    return void 0;
                }
            }).bind(void 0, storeName, partName);
        }).bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: stores[storeName].bus, partProvider: stores[storeName].parts[partName], storeData: stores[storeName] }, isAtom);
    };

    // Create scope for prefixed method (currently .select(), .update(), .depends())
    var _with = function _with(scopeProvider) {
        s.type(scopeProvider, 'function');

        if (State.state.lastWith && 'value' in State.state.lastWith) throw new Error('too many .with() after scope receiver');

        withGrabber.tail(scopeProvider, State.state);

        return this;
    };

    var _as = function _as(name) {
        dependsName.tailFill(name, State.state);
        return this;
    };

    var _setInterval = s.setInterval;

    var _setTimeout = s.setTimeout;

    var _destroy = function _destroy() {
        Object.keys(viewSubscriptionsUnsubscribe).forEach(function (viewName) {
            // Removing atom subscriptions
            viewSubscriptionsUnsubscribe[viewName]();
            console.log('atom: unsubscribe', viewName);
        });
        Object.keys(viewData).forEach(function (viewName) {
            // Destroying view scopes cache
            viewData[viewName] = void 0;
            console.log('clear view cache', viewName);
        });

        prefs.render.destroy(); // Destroying view cache

        baseStreams.destroy();
        baseStreams = null;

        s = l = simpleRender = reactRender = utils = Counter = Bacon = _ = interfaces = StateClass = clientFuncs = baseStreams = safeGoToCopy = null; // @TODO more

        onDestroyStream.push();
    };

    /**
     * Atlant API
     *
     */

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.when = function (masks) {
        return _when.bind(this)(masks, Matching['continue'], WhenOrMatch.when);
    };

    this.pre = _pre.bind(this);

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.lastWhen = function (masks) {
        return _when.bind(this)(masks, Matching.stop, WhenOrMatch.when);
    };

    // Match declare a route which will be ignored by .otherwise()
    this.match = function (masks) {
        return _when.bind(this)(masks, Matching['continue'], WhenOrMatch.match);
    };

    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise = function () {
        return _action.call(this, otherwiseStream, false, 'otherwise');
    };

    // Creates stream which will be called when render error is happend
    this.error = function () {
        return _action.call(this, errorStream, false, 'error');
    };

    // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
    // this.catch = _catch;

    // Creates custom stream which accepts Bacon stream
    this.action = function (action) {
        return _action.call(this, action, true, 'action');
    };

    // creates branch which can destruct all what declared by .when() or .match()
    // this.finally =  _finally; // not supported because used ups = new Upstream() which is deprecated.
    // side-effect

    /**
     *  Asyncroniously run the dependency. 
     */
    this.async = function (dependency) {
        return _depends.bind(this)(dependency, false, Depends.async);
    };
    /*
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     * */
    this.dep = function (dependency) {
        return _depends.bind(this)(dependency, false, Depends['continue']);
    };
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
    this.update = _update.bind(this, Depends['continue']);
    // Query store with atom creation
    this.select = _select.bind(this, Depends['continue'], true);
    // Just query store, no updates will be received
    this.query = _select.bind(this, Depends['continue'], false);
    // Do not use this until you know!
    this.serialize = _serialize;

    /*
     * Allows give name for .depends()
     */
    this.name = _as;
    // value can be deferred if used with .select()
    this.as = _as;

    // create scope for data provider .select(), .depends() are supported
    this['with'] = _with;

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
    this.inject = _inject;
    // Will accept the same scope as .and(), .render(), .if()
    this.join = _join;
    // Creates new branch if computated callback is true. Warning: the parent branch will be executed still. Render it with .nope() if no render should happend.
    this['if'] = _if.bind(this, s.id);
    this.unless = _if.bind(this, s.negate);
    this.end = _end;
    this.scrollToTop = _scrollToTop;

    /**
     * Renders declaratins
     */
    //Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
    this.log = _log;
    /* Renders the view. first - render provider, second - view name */
    this.render = function (renderProvider, viewName) {
        return _render.bind(this)(renderProvider, viewName, 'always', types.RenderOperation.render);
    };
    /* Do not subscribe selects on view */
    this.renderOnce = function (renderProvider, viewName) {
        return _render.bind(this)(renderProvider, viewName, 'once', types.RenderOperation.render);
    };
    /* Renders the view. first - render provider, second - view name. Not waiting for anything - draws immediatelly */
    this.draw = function (renderProvider, viewName) {
        return _render.bind(this)(renderProvider, viewName, 'always', types.RenderOperation.draw);
    };
    /* Do not subscribe selects on view */
    this.drawOnce = function (renderProvider, viewName) {
        return _render.bind(this)(renderProvider, viewName, 'once', types.RenderOperation.draw);
    };
    /* clears default or provided viewName */
    this.clear = function (viewName) {
        return _render.bind(this)(function () {}, viewName, 'once', types.RenderOperation.clear);
    };
    // Soft atlant-inside redirect.
    this.redirect = function (redirectProvider) {
        return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.redirect);
    };
    // Soft atlant-inside refresh.
    this.refresh = function (redirectProvider) {
        return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.refresh);
    };
    //  Fake redirect. Atlant will just change URL but routes will not be restarted. Referrer stays the same.
    this.replace = function (replaceProvider) {
        return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.replace);
    };
    // Same as replace, but store the replaced url in html5 location history. Referrer also changed.
    this.change = function (replaceProvider) {
        return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.change);
    };
    // Force redirect event to current route
    // this.force = _.force;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
    this.move = function (redirectProvider) {
        return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.move);
    };
    // render which render nothing into nowhere
    this.nope = function () {
        return _render.bind(this)(void 0, void 0, 'once', types.RenderOperation.nope);
    };

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
    this.skip = _skip;
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
    this.publish = _publish;

    /**
     * Commands allows perform manipulations of atlant immediatelly.
     */

    // Here you can manipulate views.
    this.views = Object.create(null);
    // set component value into view
    // this.put :: viewName :: component
    this.views.put = function (viewName, component) {
        return prefs.render.put(viewName, component);
    };

    // Return view with viewName
    // this.view :: viewName
    this.views.get = function (name) {
        return prefs.render.get(name);
    };

    this.views.list = function () {
        return prefs.render.list();
    };

    /**
     * Plugins!
     */
    // Contains available renders
    this.renders = { react: reactRender, simple: simpleRender };

    /**
     * Events!
     */
    // Called everytime when route/action is rendered.
    this.onRenderEnd = _onRenderEnd;
    // Called when destroy initiated.
    this.onDestroy = _onDestroy;
    // Called everytime when draw renders.
    this.onDrawEnd = _onDrawEnd;
    // Accepts element. After publish and first render the contents will be attached to this element.
    this.attach = _attach;
    // After publish and first render the contents will be transferet to callback (first parameter).
    this.stringify = _stringify;
    this.setTimeout = _setTimeout;
    this.setInterval = _setInterval;

    /**
     * Utils
     * These commands doesn't return "this".
     */
    // Returns atlant.js version
    this.version = require('./atlant-version');
    // Returns timestamp of the creation time
    this.build = require('./atlant-build');

    this.destroy = _destroy;
    this.isServer = function () {
        return 'undefined' === typeof window;
    };
    this.isBrowser = function () {
        return 'undefined' !== typeof window;
    };

    this.utils = require('./inc/tools'); // @TODO: rename to 'tools'
    this.utils.setTitle = this.utils.setTitle.bind(void 0, titleStore);
    this.utils.getTitle = this.utils.getTitle.bind(void 0, titleStore);

    this.data = Object.defineProperties({}, {
        routes: {
            get: function get() {
                return _(routes).map(function (route) {
                    return route.mask;
                }).map(function (route) {
                    if ('/' === route[route.length - 1]) return route.substring(0, route.length - 1);else return route;
                }).uniq() // @TODO better not to double it for info :) 
                .value();
            },
            configurable: true,
            enumerable: true
        }
    });
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

},{"./atlant-build":1,"./atlant-version":2,"./counter.js":4,"./inc/base-streams":5,"./inc/clientFuncs":6,"./inc/interfaces":7,"./inc/log":8,"./inc/state":9,"./inc/statistics":10,"./inc/storage":11,"./inc/tools":12,"./inc/types":13,"./inc/wrap-push-pop-states.js":14,"./lib":15,"./render-streams":16,"./renders/react":17,"./renders/simple":18,"./upstream.js":19,"./utils":20}],4:[function(require,module,exports){
"use strict";

var counter = function counter() {
    var rCount = {},
        rCountCopy;

    return {
        increase: function increase(state) {
            // @TODO check if state
            if (!rCount) rCount = {};
            rCount[state.lastConditionId] = (rCount.hasOwnProperty(state.lastConditionId) ? rCount[state.lastConditionId] : 0) + 1; // increase the render counter for current When/If
        },
        decrease: function decrease(upstream) {
            // @TODO check if upstream
            if (!rCountCopy) rCountCopy = {};
            if (!rCountCopy[upstream.conditionId]) rCountCopy[upstream.conditionId] = rCount[upstream.conditionId];
            rCountCopy[upstream.conditionId]--;
            return rCountCopy[upstream.conditionId];
        },
        count: function count(upstream) {
            return rCount[upstream.conditionId];
        },
        reset: function reset() {
            rCountCopy = void 0;
        }
    };
};

module.exports = counter;

},{}],5:[function(require,module,exports){
"use strict";

var Bacon = window.Bacon;

var baseStreams = Object.create(null);

var unnamed = [];
var unsubs = [];

baseStreams.destructorStream = new Bacon.Bus();

baseStreams.bus = function () {
    var bus = new Bacon.Bus();
    unnamed.push(bus);
    return bus;
};

baseStreams.onValue = function (stream, f) {
    var unsub = stream.onValue(f);
    unsubs.push(unsub);
    return unsub;
};

baseStreams.destroy = function () {
    baseStreams.destructorStream.push();
    unnamed.map(function (bus) {
        bus.end();
    });
    unsubs.map(function (handler) {
        handler();
    });
    unnamed.length = 0;
    unsubs.length = 0;
};

module.exports = baseStreams;

},{}],6:[function(require,module,exports){
"use strict";

var s = require('../lib'),
    _ = window._,
    l = require('./log')(),
    Promise = window.Promise,
    Bacon = window.Bacon;

var catchError;

var convertPromiseD = s.curry(function (promiseProvider, upstream) {
    var promise = promiseProvider(upstream);
    if (s.isPromise(promise)) {
        promise = promise['catch'](function (e) {
            if (e.stack) {
                catchError(e);
            }
            return Promise.reject(e);
        });
        return Bacon.fromPromise(promise);
    } else {
        return Bacon.constant(promise);
    }
});

var applyScopeD = function applyScopeD(fn) {
    return function (scope) {
        return fn.call(this, scope);
    };
};

var getRefsData = function getRefsData(upstream) {
    if (!upstream.refs) return {};

    var fn = function fn(res, depName, refName) {
        if ('undefined' !== refName && depName in upstream.depends) {
            res[refName] = upstream.depends[depName];
            if ('function' === typeof res[refName]) {
                res[refName] = res[refName]();
            }
        }

        return res;
    };

    return s.reduce(fn, Object.create(null), upstream.refs);
};

var getScopeDataFromStream = function getScopeDataFromStream(upstream) {
    var scope = Object.create(null);
    scope.refs = upstream.refs;
    scope.depends = upstream.depends;
    scope.injects = upstream.injects;
    scope.params = upstream.params;
    scope.path = upstream.path;
    scope.route = upstream.route;
    return s.clone(scope);
};

/**
    * Injects depend values from upstream into object which is supplyed first.
    */
var createScope = function createScope(upstream) {
    var refsData = getRefsData(upstream);

    var warning = function warning(inject) {
        l.log('Atlant warning: inject accessor return nothing:' + inject);
    };
    var injects = s.compose(s.reduce(s.extend, {}), s.dot('injects'))(upstream);
    var joins = s.filter(function (inject) {
        return inject.hasOwnProperty('injects');
    }, injects);
    injects = s.filter(function (inject) {
        return !inject.hasOwnProperty('injects');
    }, injects);
    var injectsData = { object: void 0 };

    var formatInjects = function formatInjects(inject) {
        var container = inject.hasOwnProperty('injects') ? '' : '.depends.' + inject.name;

        if ('string' === typeof inject.expression) return container + (inject.expression ? inject.expression : '');

        if ('undefined' === typeof inject.expression) return container;

        if (!inject.hasOwnProperty('injects')) {
            return s.baconTryD(function () {
                return inject.expression(upstream.depends[inject.name]);
            });
        } else {
            return s.baconTryD(function () {
                return inject.expression(s.extend(refsData, injectsData.object));
            });
        }
    };

    var takeAccessor = s.compose(s['if'](s.eq(void 0), warning), s.flipDot(upstream));
    var takeFunction = function takeFunction(fn) {
        return fn.apply();
    };
    var fullfil = s.map(s.compose(s.ifelse(s.typeOf('string'), takeAccessor, takeFunction), formatInjects));

    injectsData.object = fullfil(injects);
    var data = injectsData.object;
    var joinsData = fullfil(joins);

    // Injecting of mask and location.
    var params = s.reduce(function (result, item) {
        result[item] = upstream.params[item];return result;
    }, {}, _.keys(upstream.params));
    params['mask'] = upstream.route ? upstream.route.mask : void 0;
    params['location'] = upstream.path;

    data = s.extend(refsData, params, data, joinsData);

    return data;
};

var catchError = function catchError(e) {
    if (e && e.stack) {
        console.error(e.message, e.stack);
    } else {
        console.error(e);
    }
    return e;
};

module.exports = {
    convertPromiseD: convertPromiseD,
    applyScopeD: applyScopeD,
    createScope: createScope,
    getRefsData: getRefsData,
    catchError: catchError,
    getScopeDataFromStream: getScopeDataFromStream
};

},{"../lib":15,"./log":8}],7:[function(require,module,exports){
"use strict";

var dependsName = function dependsName() {
    this.init = function (depName, state) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!');
        var nameContainer = {};
        state.lastNameContainer = nameContainer; // Here we will store further names with ".name"
        return nameContainer;
    };

    // Add invocation when mapping stream, i.e. all data already exist
    this.add = function (depName, nameContainer, upstream) {
        if (!upstream.refs) upstream.refs = {};
        upstream.refs[nameContainer.ref] = depName;
        upstream.ref = nameContainer.ref;
        return upstream;
    };

    this.tailFill = function (value, state) {
        state.lastNameContainer.ref = value;
    };

    return this;
};

var withGrabber = function withGrabber() {
    this.init = function (state) {
        var data = {};
        state.lastWith = data; // Here we will store further injects with ".transfers"
        return data;
    };
    // Add invocation when mapping stream.
    this.add = function (data, upstream) {
        upstream['with'] = data;
        return upstream;
    };
    this.tail = function (data, state) {
        if (void 0 === state.lastWith) throw new Error('Atlant.js: incompatible "with" provider! ');
        state.lastWith.value = data;
    };
    return this;
};

var injectsGrabber = function injectsGrabber() {
    this.init = function (depName, state) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!');
        var injects = {};
        state.lastInjects = injects; // Here we will store further injects with ".inject"
        return injects;
    };
    // Add invocation when mapping stream.
    this.add = function (depName, depValue, injects, upstream) {
        if (!upstream.depends) {
            upstream.depends = {};
        }
        upstream.depends[depName] = depValue;

        if (!upstream.injects) upstream.injects = [];
        upstream.injects.push(injects);
        return upstream;
    };
    return this;
};

module.exports = {
    injectsGrabber: injectsGrabber,
    dependsName: dependsName,
    withGrabber: withGrabber
};

},{}],8:[function(require,module,exports){
"use strict";

var s = require('../lib');

var Log = function Log() {
    var on = false;
    this.verbose = function (turnOn) {
        on = turnOn;
    };

    this.log = function () {
        if (!on) return;
        console.log.apply(console, arguments);
    };

    this.logTime = function () {
        if (!on) return;
        if (console.time) {
            return console.time.apply(console, s.a2a(arguments));
        }
    };

    this.logTimeEnd = function () {
        if (!on) return;
        if (console.timeEnd) {
            return console.timeEnd.apply(console, s.a2a(arguments));
        }
    };
    return this;
};

var instance;
module.exports = function () {
    if (instance) return instance;
    instance = new Log();
    return instance;
};

},{"../lib":15}],9:[function(require,module,exports){
"use strict";

var _ = window._;

var StateType = function StateType(state) {
    var newState = _.extend({}, { lastWhen: void 0, lastActionId: void 0, lastIf: void 0, lastIfIds: [], lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0, stats: { keys: [] }, scrollToTop: void 0 }, state);
    newState.lastIfIds = [].concat(newState.lastIfIds);
    return newState;
};

var StateClass = function StateClass() {
    var states;

    this.state = void 0;

    this.first = function () {
        states = [];
        this.state = StateType();
        states.push(this.state);
        if ('undefined' !== typeof window) window.states = states;
    };

    this.divide = function () {
        this.state = new StateType(this.state);
        this.state.lastDep = void 0;

        states.push(this.state);
    };

    this.rollback = function () {
        states.pop();
        this.state = states[states.length - 1];
    };

    this.print = function (message, state) {
        //log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
    };

    return this;
};

module.exports = StateClass;

},{}],10:[function(require,module,exports){
"use strict";

var utils = require('../utils');
var tools = require('./tools');
var s = require('../lib');
var _ = window._;
var Bacon = window.Bacon;

/**
 * This statistics module used for calculating the end of the atoms updating.
 * First part is working out at registration level.
 *
 */
var Stat = function Stat() {
    var statObject = {};
    var storeByEvent = {}; // Hash: 'eventName" : ['store1', 'store2']

    if ('undefined' !== typeof window) window.statObject = statObject; //@TODO debug information

    this.whens = function () {
        return Object.keys(statObject).filter(function (_) {
            return '*' === _ || -1 !== _.indexOf('/');
        });
    };

    this.whenStat = function (params) {
        var masks = params.masks,
            eventKey = params.eventKey,
            render = params.render,
            ifId = params.ifId,
            ifIds = params.ifIds,
            atom = params.atom,
            actionId = params.actionId,
            view = params.view;

        // console.log('whenStat:', params)
        masks.forEach(function (mask) {
            mask = utils.sanitizeUrl(mask);

            if (!(mask in statObject)) statObject[mask] = {};

            if (!(actionId in statObject[mask])) statObject[mask][actionId] = { updatesList: [], rendersList: [], removedRendersList: [], removedUpdatesList: [], lastOp: [], ifList: {}, atomList: [], viewList: [] };

            if (ifId) {
                statObject[mask][actionId].ifList[ifId] = { updatesList: [], rendersList: [] };
            }

            if (eventKey && ifIds) ifIds.forEach(function (ifId) {
                // console.log('registering update for', eventKey, ifId)
                statObject[mask][actionId].ifList[ifId].updatesList.push(eventKey);
            });

            if (render && ifIds) ifIds.forEach(function (ifId) {
                statObject[mask][actionId].ifList[ifId].rendersList.push(render);
            });

            if (render) statObject[mask][actionId].rendersList.push(render);
            if (eventKey) statObject[mask][actionId].updatesList.push(eventKey);

            if (atom) statObject[mask][actionId].atomList.push(atom);

            if (view) statObject[mask][actionId].viewList.push(view);
        });

        return statObject;
    };

    this.cleanUpRemoved = function () {
        Object.keys(statObject).forEach(function (mask) {
            Object.keys(statObject[mask]).forEach(function (actionId) {
                statObject[mask][actionId].removedUpdatesList = [];
                statObject[mask][actionId].removedRendersList = [];
                statObject[mask][actionId].viewList = [];
            });
        });
    };

    var removeTokenized = function removeTokenized(listOfRemoved, actionId, masks, items) {
        masks.forEach(function (mask) {
            mask = utils.sanitizeUrl(mask);
            items.forEach(function (item) {
                if (actionId in statObject[mask]) {
                    statObject[mask][actionId][listOfRemoved].push(item);
                }
            });
        });
    };

    this.removeUpdates = removeTokenized.bind(this, 'removedUpdatesList');
    this.removeRenders = removeTokenized.bind(this, 'removedRendersList');

    // asked by canceled ifs to pipe into removeUpdates and removeRenders
    var getTokenByUrl = function getTokenByUrl(token, actionId, url, ifId) {

        return tools.returnAll(url, this.whens()).filter(function (_) {
            return actionId in statObject[_];
        }).map(function (_) {

            return 'ifList' in statObject[_][actionId] && ifId in statObject[_][actionId].ifList ? statObject[_][actionId].ifList[ifId][token] : [];
        }).filter(function (_) {
            return _.length;
        }).reduce(function (acc, i) {
            return acc.concat(i);
        }, []); // flatmap
    };

    this.getRendersByUrl = getTokenByUrl.bind(this, 'rendersList');
    this.getUpdatesByUrl = getTokenByUrl.bind(this, 'updatesList');

    var countActionViews = function countActionViews(mask, actionId) {
        var action = statObject[mask][actionId];
        return (action && 'viewList' in action ? action.viewList : []).reduce(function (acc, i) {
            return acc + 1;
        }, 0);
    };

    var replaceNamesWithWeights = function replaceNamesWithWeights(weights, seq) {
        return seq.map(function (_) {
            return weights[_];
        }).map(function (_) {
            return void 0 === _ ? 0 : _;
        });
    };

    this.getRenderSum = function (url) {
        // Returns predicted count of renders
        var number = tools.returnAll(url, this.whens());

        number = number.map(function (mask) {
            // each action is atoms group/seq with it's own view names
            return Object.keys(statObject[mask]).map(function (actionId) {
                var removedRenders = statObject[mask][actionId].removedRendersList.length;
                var renders = statObject[mask][actionId].rendersList.length;

                // console.log('for actionId', actionId, renders-removedRenders, ':::', statObject[mask][actionId].removedRendersList, statObject[mask][actionId].rendersList)

                return renders - removedRenders;
            }).reduce(function (acc, i) {
                return acc + i;
            }, 0); // sum
        });

        number = number.reduce(function (acc, i) {
            return acc + i;
        }, 0);

        return number;
    };

    this.getSum = function (url) {
        // Returns predicted sum of atom calls

        var number = tools.returnAll(url, this.whens()).map((function (mask) {
            // each action is atoms group/seq with it's own view names
            return Object.keys(statObject[mask]).map((function (actionId) {
                var action = statObject[mask][actionId];
                var weights = this.getStoreWeights(url);
                var replacer = replaceNamesWithWeights.bind(this, weights);

                var viewsNum = countActionViews(mask, actionId);

                var actionNum = replacer(action && 'atomList' in action ? action.atomList : []).reduce(function (acc, i) {
                    return acc + i;
                }, 0); // sum

                return viewsNum * actionNum;
            }).bind(this)).reduce(function (acc, i) {
                return acc + i;
            }, 0); // sum
        }).bind(this));

        return number.reduce(function (acc, i) {
            return acc + i;
        }, 0);
    };

    this.getStoreWeights = function (url) {

        return tools.returnAll(url, this.whens()).map(function (mask) {
            return Object.keys(statObject[mask]).map(function (actionId) {
                return s.diff(statObject[mask][actionId].updatesList, statObject[mask][actionId].removedUpdatesList);
            }).reduce(function (acc, i) {
                return acc.concat(i);
            }, []); // flatmap
        }).reduce(function (acc, i) {
            return acc.concat(i);
        }, []) // flatmap
        .map(function (eventName) {
            return eventName in storeByEvent ? storeByEvent[eventName] : [];
        }).reduce(function (acc, i) {
            return acc.concat(i);
        }, []) // flatmap
        .reduce(function (acc, i) {
            if (i in acc) acc[i]++;else acc[i] = 1;return acc;
        }, {});
    };

    this.putLink = function (storeName, eventName) {
        if (!(eventName in storeByEvent)) storeByEvent[eventName] = [];
        storeByEvent[eventName].push(storeName);
    };

    this.getStores = function (eventNames) {
        return eventNames.map(function (eventName) {
            return eventName in storeByEvent ? storeByEvent[eventName] : [];
        }).reduce(function (acc, i) {
            return acc.concat(i);
        }, []); // flatmap
    };

    return this;
};

module.exports = Stat;

},{"../lib":15,"../utils":20,"./tools":12}],11:[function(require,module,exports){
'use strict';

var Storage = {
    storage: localStorage,
    listen: function listen() {
        window.addEventListener('storage', this.onChange);
    },
    stopListen: function stopListen() {
        window.removeEventListener('storage', this.onChange);
    },
    onChange: function onChange(key, newValue, oldValue, storageArea, url) {
        console.log('storage changed', key, newValue, oldValue, storageArea, url);
    },
    setStorage: function setStorage(storage) {
        this.storage = storage;
    },
    persist: function persist(storeName, newState) {
        if (!this.storage) return void 0;

        // console.time('persist'+ storeName)
        this.storage.setItem(storeName, JSON.stringify(newState));
        // console.timeEnd('persist'+ storeName)
        return;
    },
    load: function load(storeName) {
        if (!this.storage) return void 0;

        // console.time('load'+ storeName)
        var value = JSON.parse(this.storage.getItem(storeName));
        // console.timeEnd('load'+ storeName)
        // console.log(storeName, 'value:', value)
        return value;
    }
};
module.exports = Storage;

},{}],12:[function(require,module,exports){
"use strict";

var utils = require('../utils');
var _ = window._;
var s = require('./../lib');

var _test = function _test(path, mask) {
    if (!path || !mask) return false;

    return null !== utils.matchRoute(path, mask);
};

var _return = function _return(path, mask) {
    if (!path || !mask) return false;

    return null !== utils.matchRoute(path, mask) ? mask : void 0;
};

var _testAll = function _testAll(path, masks) {
    if (!path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks).map(_test.bind(void 0, path)).reduce(function (v, i) {
        return v || i;
    }, false);
};

var _returnAll = function _returnAll(path, masks) {
    if (!path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks).map(_return.bind(void 0, path)).filter(function (_) {
        return _;
    }).map(utils.stripLastSlash).reduce(function (acc, i) {
        if (-1 === acc.indexOf(i)) acc.push(i);return acc;
    }, []); // only unique elements because of stripped slash on end */ became *
};

var _parse = function _parse(path, mask) {
    if (!path || !mask) return {};

    var params = utils.matchRoute(path, mask);
    var parsed = utils.parseURL(path);
    var searches = _.clone(utils.parseSearch(parsed.search), true); // add search params
    return _.extend(searches, params);
};

var _parseAll = function _parseAll(path, masks) {
    if (!path || !masks || 0 === masks.length) return {};

    return utils.addSlashes(masks).map(_parse.bind(void 0, path)).reduce(function (v, i) {
        return _.merge(v, i);
    }, {});
};

var _setTitle = function _setTitle(titleStore, title) {
    if (!title) return;

    if (typeof document !== 'undefined') {
        document.title = title;
    } else {
        titleStore.value = title;
    }
};

var _getTitle = function _getTitle(titleStore, title) {
    return titleStore.value;
};

module.exports = {
    // test :: path -> mask -> Bool
    test: _test,
    // testAll :: path -> [mask] -> Bool
    testAll: _testAll,
    'return': _return,
    returnAll: _returnAll,
    // parse :: path -> mask -> {params}
    parse: _parse,
    // parseAll :: path -> [mask] -> {params}
    parseAll: _parseAll,
    setTitle: _setTitle,
    getTitle: _getTitle
};

},{"../utils":20,"./../lib":15}],13:[function(require,module,exports){
"use strict";

var RenderOperation = {
    render: parseInt(_.uniqueId()),
    draw: parseInt(_.uniqueId()),
    replace: parseInt(_.uniqueId()),
    change: parseInt(_.uniqueId()),
    clear: parseInt(_.uniqueId()),
    redirect: parseInt(_.uniqueId()),
    refresh: parseInt(_.uniqueId()),
    move: parseInt(_.uniqueId()),
    nope: parseInt(_.uniqueId())
};

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

module.exports = {
    RenderOperation: RenderOperation,
    RenderOperationKey: RenderOperationKey
};

},{}],14:[function(require,module,exports){
"use strict";
//https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {
    function CustomEvent(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
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
var wrapPushState = function wrapPushState(window) {
    var pushState = window.history.pushState;

    var tryState = function tryState(params) {
        try {
            return pushState.apply(window.history, params);
        } catch (e) {
            console.error("Can't push state:", e);
            return void 0;
        }
    };

    window.history.pushState = function (state, title, url) {
        var eventless = state && state.eventless;
        if (!eventless) {
            var onpushstate = new CustomEvent('pushstate', { detail: { state: { url: url, referrer: window.location.pathname, scrollTop: state.scrollTop, forceRouteChange: state.forceRouteChange }, title: title, url: url } });
            window.dispatchEvent(onpushstate);
        }

        return tryState(arguments);
    };
};

module.exports = { wrapPushState: wrapPushState };

},{}],15:[function(require,module,exports){
"use strict";
/**
   Utils library.
 */
var container = Object.create(null);
var s = (function () {

    var _ = window._,
        Promise = window.Promise,
        Bacon = window.Bacon;

    var that = this;
    this.id = function (value) {
        return value;
    };
    this.nop = function () {
        return void 0;
    };

    this.pass = function () {
        return function (promise) {
            return promise;
        };
    };
    this.inject = function (data) {
        return function () {
            return data;
        };
    };
    /**
     *
     * @param fn - promise callback
     * @param fn2 - reject callback
     * @returns {Function}
     */
    this.then = function (fn, fn2) {
        return function (promise) {
            return promise.then(fn, fn2);
        };
    };

    /**
     * Decorator that accept resolving of promise to let free the blocking of function it decorates.
     * The blocking is exported as reference to variable in context.
     * @TODO only export the blocking variable, use closure to serve real blocking reference.
     * @param obj
     * @param item
     * @returns {Function}
     */
    this.sync = function (obj, item) {

        var resolvePromise = function resolvePromise() {
            obj[item] = false;
            return arguments[0];
        };
        var blockPromise = function blockPromise(fn) {
            return function () {
                if (!obj[item]) {
                    obj[item] = true;
                    return fn.apply(this, arguments);
                } else {
                    return Promise.reject();
                }
            };
        };

        return function (fn) {
            return _.compose(that.then(resolvePromise), blockPromise(fn));
        };
    };

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
    this.guardWithTrue = function (obj, item, fn) {
        return function () {
            if (!obj[item]) {
                obj[item] = true;
                return fn.apply(this, arguments);
            } else {
                return void 0;
            }
        };
    };

    /**
     * Deprecated. Use sync
     * @param obj
     * @param item
     * @param fn
     * @returns {*}
     */
    this.resolveGuard = function (obj, item, fn) {
        if (fn) {
            return function () {
                fn.apply(this, arguments);
                obj[item] = false;
                return arguments;
            };
        } else {
            obj[item] = false;
            return arguments;
        }
    };

    /**
     * Deprecated. Use streams instead.
     * @constructor
     */
    this.Herald = function () {
        this.listeners = {};

        this.listen = (function (what, listener) {
            if (!this.listeners[what]) this.listeners[what] = [];
            this.listeners[what].push(listener);
        }).bind(this);

        this.emit = (function (what) {
            var params = [].slice.call(arguments, 1);
            this.listeners[what].map(function (listener) {
                listener.apply(null, params);
            });
        }).bind(this);
    };

    // Convert arguments into array.
    this.a2a = function (args) {
        return Array.prototype.slice.apply(args);
    };

    this.unary = function (fn) {
        return function (val) {
            return fn.call(this, val);
        };
    };

    /**
     * Accepts collection.
     * it pass obj value and object name to fn (temporary 2 args)
     * @type {Function}
     */
    this.map = _.curry(function (fn, obj) {
        if (!obj) return [];
        if (obj && obj.map) return obj.map(that.unary(fn));

        var mapped = {};

        for (var name in obj) {
            mapped[name] = fn(obj[name]);
        }

        return mapped;
    });

    // @TODO create mapKeys

    this.fmap = _.curry(function (fn, obj) {
        return obj.fmap(fn);
    });

    // @TODO check immutability/mutability
    this.filter = _.curry(function (fn, obj) {
        if (!obj) return [];
        if (obj && obj.map) return obj.filter(that.unary(fn));

        var filtered = {};

        for (var name in obj) {
            if (fn(obj[name])) {
                filtered[name] = obj[name];
            }
        }

        return filtered;
    });

    this.filterKeys = _.curry(function (fn, obj) {
        if (!obj) return obj;

        var filtered = {};

        for (var name in obj) {
            if (fn(name)) {
                filtered[name] = obj[name];
            }
        }

        return filtered;
    });

    this.reduce = _.curry(function (fn, startValue, obj) {
        if (!obj) return startValue;
        if (obj && obj.reduce) Array.prototype.reduce.call(obj, fn, startValue);

        var reduced = {};

        for (var name in obj) {
            reduced = fn(reduced, obj[name], name);
        }

        return reduced;
    });

    this.concat = _.curry(function (a, b) {
        return b.concat(a);
    });

    this.flatMap = function (arr) {
        return Array.prototype.concat.apply([], arr);
    };

    this.last = function (arr) {
        if (arr) {
            return arr[arr.length - 1];
        } else {
            return void 0;
        }
    };
    this.head = function (arr) {
        if (arr) {
            return arr[0];
        } else {
            return void 0;
        }
    };

    this.diff = function (a, b) {
        a = a.slice();
        b.forEach(function (_) {
            var index = a.indexOf(_);
            if (-1 !== index) a.splice(index, 1);
        });
        return a;
    };

    this.negate = function (obj) {
        return !obj;
    };

    this.eq = _.curry(function (obj, obj2) {
        return obj === obj2;
    });

    this.notEq = _.curry(function (obj, obj2) {
        return obj !== obj2;
    });

    this.empty = function (obj) {
        return obj === null || obj === void 0 || obj === '' || obj instanceof Array && 0 === obj.length || 'object' === typeof obj && 0 === Object.keys(obj).length;
    };
    this.notEmpty = _.compose(this.negate, this.empty);

    this.simpleDot = function (expression, obj) {
        if (obj) {
            return obj[expression];
        } else {
            return void 0;
        }
    };

    this.flipSimpleDot = function (obj, expression) {
        if (obj) {
            return obj[expression];
        } else {
            return void 0;
        }
    };

    // expression is ".something" or ".something.something"
    this.dot = _.curry(function (expression, obj) {
        return expression.split('.').filter(that.notEmpty).reduce(that.flipSimpleDot, obj);
    });

    // expression is ".something" or ".something.something"
    this.flipDot = _.curry(function (obj, expression) {
        return that.dot(expression, obj);
    });

    this.set = _.curry(function (item, obj, value) {
        if (item) {
            obj[item] = value;
            return obj;
        } else {
            return value;
        }
    });

    this.plus = _.curry(function (item1, item2) {
        return item1 + item2;
    });

    this.trim = function (string) {
        return string.trim();
    };

    this.flip = function (fn) {
        return _.curry(function () {
            return fn.apply(this, that.a2a(arguments).reverse());
        }, fn.length);
    };

    this.replace = _.curry(function (where, replacer, obj) {
        return obj.replace(where, replacer);
    });

    this.push = function (item, obj) {
        if (!obj) {
            return function (obj) {
                return obj.push(item);
            };
        } else {
            return obj.push(item);
        }
    };

    this.split = _.curry(function (char, obj) {
        return obj.split(char);
    });

    this.log = function (what) {
        console.log(what);
        return what;
    };

    this.logIt = function () {
        var args = that.a2a(arguments);
        return function (what) {
            console.log.apply(console, args.concat(what));
            return what;
        };
    };

    this.side = function (fn) {
        var args = that.a2a(arguments);
        return function (param) {
            if (args.length > 1) {
                fn = _.compose.apply(this, args);
            }
            fn.call(this, param);
            return param;
        };
    };

    this.instanceOf = function (type, object) {
        return object instanceof type;
    };

    this.typeOf = _.curry(function (type, object) {
        return type === typeof object;
    });

    this.mapD = function (fn) {
        return function () {
            return that.map(fn, that.a2a(arguments));
        };
    };

    // Promises
    this.promise = function (value) {
        return new Promise(function (fullfill, reject) {
            fullfill(value);
        });
    };

    this.promiseD = function (promiseProvider) {
        return function () {
            var result = promiseProvider.apply(this, arguments);
            if ('Promise' === result.constructor.name) {
                return result;
            } else {
                return that.promise(result);
            }
        };
    };

    //memoize.js - by @addyosmani, @philogb, @mathias
    // with a few useful tweaks from @DmitryBaranovsk
    this.memoize = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments),
                hash = "",
                i = args.length;
            var currentArg = null;
            while (i--) {
                currentArg = args[i];
                hash += currentArg === Object(currentArg) ? JSON.stringify(currentArg) : currentArg;
                fn.memoize || (fn.memoize = {});
            }
            return hash in fn.memoize ? fn.memoize[hash] : fn.memoize[hash] = fn.apply(this, args);
        };
    };

    this.Perf = function () {
        var time;
        this.count = 0;
        this.begin = function () {
            time = Date.now();
        };
        this.end = function () {
            this.count += Date.now() - time;
        };
    };

    this.extend = _.curry(_.extend, 2);
    this.merge = _.curry(_.merge, 2);

    this.ifelse = _.curry(function (condition, then, _else, value) {
        if (condition(value)) return then(value);else return _else(value);
    });

    this['if'] = _.curry(function (condition, then, value) {
        if (condition(value)) return then(value);else return value;
    });

    this.type = function (item, type) {

        if (type !== typeof item && item) {
            var error = new Error('Type Error: ' + item + ' should be ' + type);
            console.error(error.message, error.stack);
            throw error;
        }
    };

    this.simpleType = function (data, key) {
        return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key];
    };

    this.isPromise = function (promise) {
        if (promise && 'function' === typeof promise.then) return true;else return false;
    };

    this.tryF = function (fallbackValue, fn) {
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                return fallbackValue;
            }
        };
    };

    this.tryD = function (fn, errorCallback) {
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                console.error(e.message, e.stack);
                if (errorCallback) return errorCallback(e);
            }
        };
    };

    this.baconTryD = function (fn) {
        return that.tryD(fn, function (e) {
            return Bacon.Error(e);
        });
    };

    this.promiseTryD = function (fn) {
        return that.tryD(fn, function (e) {
            return Promise.reject(e);
        });
    };

    this.apply = function (doProvider, value) {
        if ('function' === typeof doProvider) {
            return doProvider(value);
        } else {
            return doProvider;
        }
    };

    this.maybe = function (nothing, fn) {
        return function () {
            try {
                return fn.apply(this, that.a2a(arguments));
            } catch (e) {
                return nothing;
            }
        };
    };

    // This function creates copy of the object.
    this.copy = function (o) {
        return JSON.parse(JSON.stringify(o));
    };

    this.clone = function (obj) {
        return _.cloneDeep(obj, function (value) {
            if (_.isFunction(value) || !_.isPlainObject(value)) {
                return value;
            }
        });
    };

    this.maybeS = this.maybe.bind(this, '');
    this.maybeV = this.maybe.bind(this, void 0);

    this.compose = _.compose;
    this.curry = _.curry;

    return this;
}).bind(container)();

module.exports = s;

},{}],16:[function(require,module,exports){
"use strict";

var Bacon = window.Bacon;
var l = window._;

module.exports = function (Counter, whenCount) {

    var Upstream = require('./upstream.js'),
        s = require('./lib');

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();
    var actionRendered = new Bacon.Bus();
    var drawEnd = new Bacon.Bus();
    var actionRenderedAndMapped = actionRendered.map(function (u) {
        var obj = {};
        obj[u.render.viewName] = u;
        return obj;
    });

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var ups2 = new Upstream();
    var renderEndStream = whenRenderedStream.map(s.compose(ups.push, ups.clear)).merge(nullifyScan).scan([], function (oldVal, newVal) {
        // Gathering the upstreams which come here.
        if (newVal === 'nullify') {
            oldVal = [];
            ups.clear();
            return oldVal;
        }
        oldVal.push(newVal);
        return oldVal;
    }).map(s.compose(ups2.push, ups2.clear)).map(ups.pop) // Restoring stream which initially come
    .map(Counter.decrease).filter(function (value) {
        return 0 === value;
    }).map(ups2.pop) // Yes the counter now zero, so we can apply gathered streams together
    .changes().merge(nullifyScan).scan({}, function (sum, newVal) {
        // creating hash of streams with viewName as key
        if (newVal === 'nullify') {
            sum = {};
            ups2.clear();
            return sum;
        }

        if (!(newVal instanceof Array)) newVal = [newVal];

        newVal.map(function (val) {
            sum[val.render.viewName] = val;
        });

        return sum;
    }).filter(s.notEmpty) // Still this hash can be nullified, so stay aware.
    .changes().filter(function (_) {
        return 0 === --whenCount.value;
    }) // Here checking is there all whens are ended.
    .map(s.logIt('RRRREEENNNDDDDEEEERRRREEEDDDD!!!!')).merge(actionRenderedAndMapped).map(function (u) {
        return s.reduce(function (sum, value, key) {
            if ('undefined' !== key) sum[key] = value;return sum;
        }, {}, u);
    }).filter(s.notEmpty); // nopes.

    return {
        renderEndStream: renderEndStream,
        whenRenderedStream: whenRenderedStream,
        nullifyScan: nullifyScan,
        actionRendered: actionRendered,
        drawEnd: drawEnd
    };
};

},{"./lib":15,"./upstream.js":19}],17:[function(require,module,exports){
"use strict";
var s = require('./../lib'),
    _ = window._,
    u = require('../utils'),
    Promise = window.Promise,
    l = require('../inc/log')();

var State = function State(React) {
    var wrappers = {},
        views = {},
        thises = {},
        instances = {};

    this.getOrCreate = function (name) {
        if (!wrappers[name]) {
            wrappers[name] = React.createClass({
                displayName: 'name',

                render: function render() {
                    // name in this function is passed by value
                    thises[name] = this;
                    if (!views[name]) views[name] = React.createElement('div');

                    if (_.isArray(views[name])) return views[name][0](_.extend({}, this.props, views[name][1]));else return views[name];
                }
            });
        }
        if (!instances[name]) instances[name] = React.createFactory(wrappers[name])();
    };

    this.getState = function (name) {
        return wrappers[name];
    };

    this.getInstance = function (name) {
        return instances[name];
    };

    this.getThis = function (name) {
        return thises[name];
    };

    this.set = function (name, view) {
        views[name] = view;
        return void 0;
    };

    this.list = function () {
        if (!views) return [];
        return Object.keys(views);
    };

    this.destroy = function () {
        wrappers = {};
        views = {};
        thises = {};
        instances = {};
    };

    return this;
};

var Render = function Render(React) {
    var state = new State(React);

    this.name = 'React';
    var rootName = void 0; // @TODO should be another way to recognize rootName, because there are can be more then 1 of attaches

    this.render = function (viewProvider, upstream, activeStreamId, name, scope) {
        var rendered = new Promise((function (name, upstream, activeStreamId, viewProvider, scope, resolve, reject) {
            l.log('%cbegin rendering view ' + name, 'color: #0000ff');
            l.logTime('rendered view ' + name);

            if (upstream.isAction || upstream.id === activeStreamId.value) {
                // Checking, should we continue or this stream already obsolete. 
                // get new component somehow.
                state.set(name, [viewProvider, scope]);
            }
            // console.time('renering ' + name);
            state.getOrCreate(name);
            var instance = state.getThis(name);

            if (rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate();

            // console.log('Atlant.js: rendered the view.', name)
            /* console.timeEnd.bind(console, 'renering ' + name) */return resolve(state.getInstance(name));
        }).bind(void 0, name, upstream, activeStreamId, viewProvider, scope));

        return rendered;
    };

    this.clear = function (viewProvider, upstream, activeStreamId, name, scope) {
        return this.render(function () {
            return React.createElement('div');
        }, upstream, activeStreamId, name, scope);
    };

    this.attach = function (name, selector) {
        var attached = new Promise((function (name, selector, resolve, reject) {
            if (typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.');

            var element = document.querySelector(selector);
            if (!element) throw Error("AtlantJs, React render: can\'t find the selector" + selector);

            var root = state.getInstance(name);

            if (!root) {
                throw new Error('AtlantJs: Please use .render(component, "' + name + '") to render something');
            }

            try {
                React.render(root, element, function () {
                    rootName = name; /* console.log("React said it's attached!"); */resolve();
                });
            } catch (e) {
                console.error(e.message, e.stack);

                var element = document.querySelector('#rootView');
                React.unmountComponentAtNode(element);

                reject(e);
            }
        }).bind(void 0, name, selector));

        return attached;
    };

    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    this.stringify = function (name, options) {
        if (options && options['static']) return React.renderToStaticMarkup(state.getInstance(name));else return React.renderToString(state.getInstance(name));
    };

    /* Can return inner view representation. For React.js it means React component */
    this.get = function (name, options) {
        state.getOrCreate(name);
        return state.getState(name);
    };

    this.list = function () {
        return state.list();
    };

    this.put = function (name, component) {
        // console.log('Atlant.js: put the view.')
        state.set(name, component);
        state.getOrCreate(name);
        return component;
    };

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        displayName: 'innerView',

        render: function render() {
            return React.createElement('div');
        }
    });

    this.destroy = function () {
        rootName = void 0;
        state.destroy();
    };
};

module.exports = Render;

},{"../inc/log":8,"../utils":20,"./../lib":15}],18:[function(require,module,exports){
/*
 * Very simple render. uses viewName as attribute name of attribute and installs string inside 
 */
'use strict';

var simpleRender = {
    render: function render(viewProvider, name, scope) {
        var fragment = document.createDocumentFragment();
        var viewPromise = viewProvider(scope);
        return viewPromise.then(fragment.appendChild).then(function () {
            var element = document.querySelector('#' + name);
            element.appendChild(fragment);
        });
    },
    clear: function clear() {
        var element = document.querySelector('#' + name).innerHTML = '';
        return s.promise('');
    }
};

module.exports = {
    name: 'simple',
    render: simpleRender.render,
    clear: simpleRender.clear
};

},{}],19:[function(require,module,exports){
"use strict";
var s = require('./lib');

// Save/restore state of the stream.
var Upstream = function Upstream() {
    var data = {};
    var _fmap = s.curry(function (fn, obj) {
        data = fn.call(this, data, obj);
        return data;
    });

    var _join = s.curry(function (containerName, propertyName, upstream) {

        if (!data[containerName]) data[containerName] = {};
        s.merge(data[containerName], upstream);

        upstream = data;
        data = {};
        return upstream;
    });

    return {
        // join :: containerName -> propertyName -> upstream
        join: _join,
        // fmap :: fn -> obj
        fmap: _fmap,
        push: function push(obj) {
            data = obj;
            return data;
        },
        pop: function pop() {
            var upstream = data;
            data = [];
            return upstream;
        },
        getLast: function getLast() {
            return data;
        },
        clear: function clear(upstream) {
            data = [];
            return upstream;
        }
    };
};

module.exports = Upstream;

},{"./lib":15}],20:[function(require,module,exports){
"use strict";

var s = require('./lib');
var _ = window._;

var utils = (function () {
    return {
        /**
         * @returns interpolation of the redirect path with the parametrs
         */
        interpolate: function interpolate(template, params) {
            var result = [];
            template.split(':').map(function (segment, i) {
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
        },
        getPossiblePath: function getPossiblePath(route) {
            return route[route.length - 1] == '/' ? route.substr(0, route.length - 1) : route + '/';
        },
        parseURL: s.memoize(function (url) {
            if (!url) return void 0;

            var q = url.indexOf('?');
            var and = url.indexOf('&');

            if (-1 === q) q = Infinity;
            if (-1 === and) and = Infinity;
            q = q > and ? and : q;

            return {
                pathname: url.substring(0, q).trim(),
                search: url.substring(q + 1).trim()
            };
        }),
        /**
         *  URL query parser for old links to post and story
         * */
        parseSearch: s.memoize(function (search) {
            return search.replace('?', '&').split('&').reduce(function (obj, pair) {
                pair = pair.split('=');
                if (pair[0]) obj[pair[0]] = pair[1];
                return obj;
            }, {});
        }),
        getLocation: function getLocation() {
            return window.location.pathname + window.location.search;
        },
        rebuildURL: function rebuildURL(path) {
            path = this.parseURL(path);
            if (path) {
                path = path.pathname + (path.search ? '?' + path.search : '');
                if ('/' === path[path.length - 1] && 1 !== path.length) path = path.slice(0, path.length - 1);
            }

            return path;
        },
        parseURLDeprecated: function parseURLDeprecated(url) {
            var urlParseRE = /^(((([^:\/#\?]+:)?(?:(\/\/)((?:(([^:@\/#\?]+)(?:\:([^:@\/#\?]+))?)@)?(([^:\/#\?\]\[]+|\[[^\/\]@#?]+\])(?:\:([0-9]+))?))?)?)?((\/?(?:[^\/\?#]+\/+)*)([^\?#]*)))?(\?[^#]+)?)(#.*)?/;
            var matches = urlParseRE.exec(url);
            return {
                protocol: matches[4] ? matches[4].slice(0, matches[4].length - 1) : '',
                host: matches[10] || '',
                hostname: matches[11] || '',
                port: matches[12] || '',
                pathname: matches[13] || '',
                search: matches[16] || '',
                hashes: matches[17] || ''
            };
        },
        getReferrer: function getReferrer() {
            if ('undefined' !== typeof window) {
                if (!window.document.referrer) return void 0;else return "/" + window.document.referrer.split('/').slice(3).join('/');
            }
            return void 0;
        }

    };
})();

utils.isIE = function () {
    var isIE11 = navigator.userAgent.indexOf(".NET") > -1;
    var isIELess11 = navigator.appVersion.indexOf("MSIE") > -1;
    var isMobileIE = navigator.userAgent.indexOf('IEMobile') > -1;
    return isIE11 || isIELess11 || isMobileIE;
};

/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.goTo = function (awaitLoad, url, awaitLoadForce, redirectForce) {
    // @TODO scrollTop should be not 0, but from preferences

    if ('undefined' === typeof window) return;
    if (!redirectForce && window.location.origin + url === window.location.href) return;

    if ('undefined' !== typeof awaitLoadForce) awaitLoad = awaitLoadForce;

    if (!awaitLoad) {
        if (utils.isIE()) {
            window.document.execCommand('Stop');
        } else {
            window.stop();
        }
    }

    var state = { url: url, scrollTop: 0, referrer: window.location.href, forceRouteChange: redirectForce };
    utils.saveScroll();

    setTimeout(history.pushState.bind(history, state, null, url), 0);
};

utils.newPage = true;

utils.saveScroll = _.debounce(function (event) {
    var stateData = {
        scrollTop: window.pageYOffset
    };

    window.history.replaceState(stateData, null);
}, 50);

/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.replace = function (url) {

    if ('undefined' === typeof window) return;
    if (window.location.origin + url === window.location.href) return;

    setTimeout(history.replaceState.bind(history, null, null, url), 0);
};

/**
 * Redirect to the other path using $location
 * @param upstream
 * @returns {*}
 */
utils.change = function (url) {

    if ('undefined' === typeof window) return;
    if (window.location.origin + url === window.location.href) return;

    setTimeout(history.pushState.bind(history, { eventless: true }, null, url), 0);
};

utils.getPattern = function (masks) {
    return s.head(masks.filter(function (mask) {
        return '*' !== mask;
    }));
};

utils.attachGuardToLinks = function () {

    var linkDefender = function linkDefender(event) {
        if (event.ctrlKey || event.metaKey || 2 == event.which || 3 == event.which) return;
        var element = event.target;
        var awaitLoad = void 0;

        while ('a' !== element.nodeName.toLowerCase()) {
            if (element === document || !(element = element.parentNode)) return;
        }

        var loc = element.getAttribute('href');
        if (!loc) return;

        if (event instanceof KeyboardEvent && 13 !== event.keyCode) return;

        if (element.getAttribute('target')) return;

        var linkProps = element.getAttribute('data-atlant');
        if (linkProps && 'ignore' === linkProps) return;
        if (linkProps && 'await' === linkProps) awaitLoad = true;

        if (window.location.origin + loc === window.location.href) {
            event.preventDefault();
            return;
        }

        // In case of it is the same link with hash - do not involve the atlant, just scroll to id.
        // @TODO? don't prevent default and understand that route not changed at routeChanged state?
        if ('#' === loc[0] || -1 !== loc.indexOf('#') && element.baseURI === location.origin + location.pathname) {

            var elem;
            var begin = loc.indexOf('#');
            var id = loc.slice(-1 === begin ? 1 : begin + 1, loc.length);
            if ('' !== id) elem = document.getElementById(id);
            if (elem) elem.scrollIntoView();

            event.preventDefault();
            return false;
        }

        if (loc && element.host === location.host) {
            event.preventDefault();
            utils.goTo(loc, awaitLoad);
        }
    };
    document.addEventListener('click', linkDefender);
    document.addEventListener('keydown', linkDefender);
};

/**
 * Pure Matching function
 * @param on - current locatin url
 * @param when - compare mask
 * @returns (*)
 */
utils.matchRoute = s.memoize(function (path, mask) {
    //@TODO add real match, now works only for routes without params
    // TODO(i): this code is convoluted and inefficient, we should construct the route matching
    //   regex only once and then reuse it
    var negate = '!' === mask[0];
    if (negate) {
        mask = mask.slice(1, mask.length - 1);
    }

    var parsed = utils.parseURL(path);
    path = parsed.pathname;
    path = decodeURIComponent(path);
    path = utils.stripLastSlash(path).replace(/\/\/+/g, '/'); // remove slash on end on string and replace multiple slashes with one

    // Successefully find *
    if ('*' === mask[0]) return {};

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
        params.map(function (name, index) {
            dst[name] = match[index + 1];
        });
        var searches = _.clone(utils.parseSearch(parsed.search), true); // add search params
        dst = _.extend(searches, dst);
    } else if (negate) {
        dst = {};
        isMatched = true;
    }

    return isMatched ? dst : null;
});

// Utility function
// Adding slashes at the end, i.e. ['/story'] became [['/story/', '/story']]
// addSlashes :: [mask] -> [mask]
utils.addSlashes = function (masks) {
    return masks.map(function (i) {
        return [i, '/' !== i[i.length - 1] ? i + '/' : i.slice(0, i.length - 1)];
    }).reduce(function (v, i) {
        return v.concat(i);
    }, []);
};

utils.stripLastSlash = function (_) {
    if (1 !== _.length && '/' === _[_.length - 1]) return _.substring(0, _.length - 1);else return _;
};

utils.sanitizeUrl = function (url) {
    if (!url || '' === url) throw new Error('Atlant.js: url cannot be empty');
    var escapedRoute = url.toLowerCase().replace(/\/+$/, ""); // replacing last /
    if ('' === escapedRoute) escapedRoute = '/';
    return escapedRoute;
};

module.exports = utils;

},{"./lib":15}]},{},[3])
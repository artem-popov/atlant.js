(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
/**
 *
 * @TODO: fast switching generate console.error.
 * @TODO: #hashes are ignored
 * @TODO: check(true) to check only this view params (by specifically set fields or somehow)
 * @TODO: depCache to check only this dep params (by specifically set fields or somehow)
 */

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function Atlant() {
    var atlant = this;

    // Imports
    var s = require('utils/lib'),
        utils = require('utils/utils'),
        simpleRender = require('renders/simple'),
        reactRender = require('renders/react'),
        Bacon = window.Bacon,
        _ = window._,
        interfaces = require('inc/interfaces'),
        StateClass = require('inc/state'),
        clientFuncs = require('inc/clientFuncs'),
        Storage = require('inc/storage'),
        types = require('inc/types'),
        wrapPushState = require('inc/wrap-push-state.js').wrapPushState;

    var _utilsLog = require('utils/log');

    var _utilsLog2 = _interopRequireDefault(_utilsLog);

    var _incStream = require('inc/stream');

    var _incStream2 = _interopRequireDefault(_incStream);

    var _incBaseStreams = require("inc/base-streams");

    var _incBaseStreams2 = _interopRequireDefault(_incBaseStreams);

    // Preferences set by user
    var prefs = {
        parentOf: {},
        checkInjectsEquality: true,
        skipRoutes: [], // This routes will be skipped in StreamRoutes
        viewState: ['root'],
        on: { renderEnd: void 0 }, // callback which will be called on finishing when rendering
        scrollElement: function scrollElement() {
            return 'undefined' !== typeof document ? utils.body : void 0;
        },
        defaultScrollToTop: true,
        pre: void 0,
        onDrawEndCallbacks: []
    };

    // Contains state shared across atlant
    var atlantState = {
        actions: {},
        // States from current route. Updated on route Load:
        lastPath: void 0, // Stores last visited path. Workaround for safari bug of calling onpopstate after assets loaded.
        lastMask: void 0,
        lastReferrer: void 0,
        lastHistory: void 0,
        stores: {},
        renders: {}, // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
        activeStreamId: { value: void 0 }, // Used to store active stream id. If route changed again then we need something to compare with current id and cancel our current stream if it is obsolete.
        emitStreams: {},
        viewData: {}, // To check if the rendered data is the as data to be rendered.
        routes: [], // Routes collected
        streams: {
            renderEndStream: _incBaseStreams2['default'].bus(),
            interceptorBus: _incBaseStreams2['default'].bus(),
            otherwiseStream: _incBaseStreams2['default'].bus(),
            publishStream: _incBaseStreams2['default'].bus(), // Here we can put init things.
            errorStream: _incBaseStreams2['default'].bus(),
            onDestroyStream: _incBaseStreams2['default'].bus()
        },
        whens: {}, // storing whens
        titleStore: { value: '' },
        viewSubscriptionsUnsubscribe: {},
        viewSubscriptions: {}
    };

    var _viewsViews = require("views/views");

    var _viewsViews2 = _interopRequireDefault(_viewsViews);

    var unsubscribeView = _viewsViews2['default'](atlantState);

    // Patching goTo for further use
    var safeGoToCopy = utils.goTo;
    utils.goTo = safeGoToCopy.bind(utils, false);
    if ('undefined' !== typeof window) {
        // Should be defined for debuggins reasons
        if (!window.stores) window.stores = {};
    }

    //Clearing current history state
    if ('scrollRestoration' in history) {
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
    _incBaseStreams2['default'].onValue(atlantState.streams.renderEndStream, s.baconTryD(function (_) {
        return _utilsLog2['default'].log('render end:', _);
    }));

    var injectsGrabber = new interfaces.injectsGrabber();
    var TopState = new StateClass(); // State which up to when

    var routeChangedStream = atlantState.streams.publishStream.merge(Bacon.fromBinder(function (sink) {
        if ('undefined' === typeof window) return;
        var routeChanged = (function (sink, event) {

            try {
                var path;

                // Using state from event. At this point the history.state is stil old.
                var state = event instanceof PopStateEvent ? event.state : event.detail.state; // CustomEvent has details and state inside. PopStateEvent has just state inside.

                // On pushstate event the utils.getLocation() will give url of previous route.
                // Otherwise on popstate utils.getLocation() return current URI.
                var path = event instanceof PopStateEvent ? utils.getLocation() : event.detail.url;

                path = utils.rebuildURL(path);

                var finishScroll = undefined;
                var loader = document.querySelector('.root-loader');
                var trySetScroll = function trySetScroll(scrollTop) {
                    if ('number' !== typeof scrollTop) return;
                    atlant.state.scrollRestoration = true;

                    var bodyHeight = utils.getPageHeight() + window.innerHeight;

                    if (!('scrollRestoration' in history)) loader.style.visibility = 'visible';

                    if (bodyHeight < scrollTop) {
                        utils.body.style.minHeight = scrollTop + window.innerHeight + 'px';
                    }

                    window.scrollTo(0, scrollTop);

                    finishScroll = (function (scrollTop) {
                        if (window.debug) debugger;
                        utils.body.style.minHeight = null;
                        // utils.unblockScroll();
                        atlant.state.scrollRestoration = false;
                        window.scrollTo(0, scrollTop);
                        if (!('scrollRestoration' in history)) loader.style.visibility = null;
                    }).bind(void 0, scrollTop);

                    if (window && !window.history.pushState.overloaded) wrapPushState(window);
                };

                if (event instanceof PopStateEvent) {
                    trySetScroll(state.scrollTop);
                } else if (0 === state.scrollTop) {
                    finishScroll = function (scrollTop) {
                        if (!('scrollRestoration' in history)) loader.style.visibility = null;
                    };
                }

                if (path !== atlantState.lastPath || event && event.detail && event.detail.state && event.detail.state.forceRouteChange) {
                    // if (!('scrollRestoration' in history)) { utils.unblockScroll();  } // removing fixed just before rendering
                    sink({
                        path: path,
                        referrer: atlantState.lastPath,
                        history: event
                        // ,postponed: postponedCleanup
                    });
                }
                if (finishScroll) {
                    requestAnimationFrame(finishScroll);
                }
            } catch (e) {
                atlant.state.scrollRestoration = false;
                if (!('scrollRestoration' in history)) loader.style.visibility = null;
                utils.body.style.minHeight = null;
                // utils.unblockScroll();
                _utilsLog2['default'].error(e.stack);
            }
        }).bind(void 0, sink);
        window.addEventListener('popstate', routeChanged);
        window.addEventListener('pushstate', routeChanged);
        window.addEventListener('scroll', utils.saveScroll);

        if (!('scrollRestoration' in history)) {
            var loader = document.querySelector('.root-loader');
            if (loader) loader.style.visibility = null;
            utils.body.style.minHeight = null;

            // utils.unblockScroll();
        }

        utils.saveScroll();
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
                referrer: referrer,
                history: upstream.history
            };
        }

        return stream;
    }).map(function (upstream) {
        var stream = _.extend({}, upstream);

        // Storing here the data for actions.
        atlantState.lastPath = stream.path;
        atlantState.lastReferrer = stream.referrer;
        atlantState.lastHistory = stream.history;
        atlantState.lastMask = void 0;

        stream.id = _.uniqueId();
        atlantState.activeStreamId.value = stream.id;

        return stream;
    });

    atlantState.rootStream = Bacon.fromBinder(function (sink) {
        _incBaseStreams2['default'].onValue(routeChangedStream, (function (sink, _) {
            if (prefs.pre) prefs.pre();
            sink(_);
        }).bind(void 0, sink));
    }).takeUntil(_incBaseStreams2['default'].destructorStream);

    atlantState.rootStream.onValue(function (upstream) {

        var skipRoutes = prefs.skipRoutes.map(function (_) {
            return utils.matchRoute(upstream.path, _) || utils.matchRoute(utils.getPossiblePath(upstream.path), _);
        }).filter(function (_) {
            return !!_;
        });
        if (skipRoutes.length) {
            atlantState.streams.renderEndStream.push({ httpStatus: 404, httpMessage: 'Resource is forbidden' });
            return;
        }

        var _whens = Object.keys(atlantState.whens).map(function (_) {
            return atlantState.whens[_];
        }).map(function (when) {
            var route = when.route.masks // masks
            .map(function (_) {
                return { mask: _, params: utils.matchRoute(upstream.path, _) };
            }).filter(function (_) {
                return _.params;
            });

            route = s.head(route);
            if (route) {
                when.params = route.params;
                when.mask = route.mask;
            } else {
                when.params = void 0;
                when.mask = void 0;
            }

            return when;
        }).filter(function (_) {
            return _.params;
        }).reduce(function (acc, i) {
            // filtering all when's after matched one
            if (i.isMatch) {
                acc.items.push(i);
            } else if (!acc.found) {
                if (!acc.found) {
                    acc.found = true;
                    acc.items.push(i);
                }
            }

            return acc;
        }, { found: false, items: [] });

        _whens.items.forEach(function (whenData) {
            // Storing here the data for actions.
            atlantState.lastMask = whenData.route.masks;

            var depData = Object.assign({
                location: upstream.path,
                mask: whenData.mask,
                pattern: whenData.mask,
                masks: whenData.route.masks,
                referrer: upstream.referrer,
                history: upstream.history
            }, whenData.params);
            atlantState.whenData = depData;

            if (whenData.when.type === types.WhenOrMatch.when && ('function' === typeof whenData.scrollToTop.value ? whenData.scrollToTop.value(depData) : whenData.scrollToTop.value) && 'undefined' !== typeof window) {
                window.scrollTo(0, 0);
            }

            var stream = whenData.route.fn instanceof _incStream2['default'] ? whenData.route.fn : whenData.route.fn(depData); // @TODO should be a Stream.
            if (whenData.when.type === types.WhenOrMatch.when) stream.onValue(function (_) {
                return atlantState.streams.renderEndStream.push(_);
            });

            if (stream instanceof _incStream2['default']) stream.push(depData);else _utilsLog2['default'].error('unknown return from Stream function');
        });

        if (!_whens.items.length || !_whens.found) {
            // Only matches or nothing at all
            atlantState.streams.otherwiseStream.push(upstream);
            return;
        }
    });

    /* Base */

    /**
     * When
     */
    var _when = (function () {

        return function (masks, fn, matchingBehaviour, whenType) {
            TopState.first();

            if (-1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.');
            masks = masks.split('||').map(s.trim).filter(function (_) {
                return _.length;
            });

            if (!masks.length) throw new Error('At least one route mask should be specified.');

            TopState.state.lastMasks = masks;

            if (masks.filter(function (mask) {
                return '*' === mask;
            }).length && whenType === types.WhenOrMatch.when) {
                throw new Error('Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")');
            }

            var whenId = _.uniqueId();
            var name = whenType === types.WhenOrMatch.match ? 'match' : 'when';
            var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
            var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));
            name = name + createNameFromMasks(masks) + _.uniqueId();

            // Allows attaching injects to .when().
            var scrollToTop = { value: whenType === types.WhenOrMatch.match ? false : true };
            TopState.state.scrollToTop = scrollToTop;

            if (types.WhenOrMatch.when === whenType) // Imformational thing
                masks.forEach(function (_) {
                    return atlantState.routes.push(utils.stripLastSlash(_));
                });

            atlantState.whens[name] = {
                when: { id: whenId, type: whenType },
                route: { masks: masks, fn: fn },
                isFinally: false,
                isMatch: types.WhenOrMatch.match === whenType,
                scrollToTop: scrollToTop
            };

            return this;
        };
    })();

    var _action = function _action(action, fn, isAction, depCode) {
        TopState.first();

        if (!action) throw new Error('Atlant.js: action stream is not provided!');
        if (!fn) throw new Error('Atlant.js: follow stream function is not provided!');

        action.onValue(function (depValue) {
            if ('undefined' === typeof depValue) {
                depValue = {};
            }
            if ('object' === typeof depValue) {
                depValue = Object.assign(depValue, atlantState.whenData);
            }

            var stream = fn instanceof _incStream2['default'] ? fn : fn(depValue);

            if (stream instanceof _incStream2['default']) stream.push(depValue);else _utilsLog2['default'].error('unknown return from Stream function');
        });

        return this;
    };

    var _pre = function _pre(fn) {
        prefs.pre = fn;
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

    var _check = function _check(isCheck) {
        if ('undefined' === typeof isCheck) throw new Error('Atlant.js: check require boolean parameter.');

        prefs.checkInjectsEquality = isCheck;
        return this;
    };

    var _interceptor = function _interceptor() {
        TopState.first();

        var whenId = _.uniqueId();
        var depName = 'interceptor' + _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);

        State.state.lastWhen = atlantState.streams.interceptorBus.map((function (depName, injects, whenId, obj) {

            var depValue = {}; // @TODO RETHINK
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
        }).bind(void 0, depName, injects, whenId));

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastOpId = whenId;
        State.state.lastWhenType = 'action';
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
    var _skip = function _skip() {
        for (var _len = arguments.length, paths = Array(_len), _key = 0; _key < _len; _key++) {
            paths[_key] = arguments[_key];
        }

        s.map(function (_) {
            return prefs.skipRoutes.push(_);
        }, paths);
        return this;
    };

    /**
     *  Use this method to publish routes when
     */
    var _publish = function _publish(path) {
        if (path) s.type(path, 'string');
        atlantState.streams.publishStream.push({ published: true, path: path });
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
        prefs.onDrawEndCallbacks.push(s.tryD(callback));
        return this;
    };

    var _onRenderEnd = function _onRenderEnd(callback) {
        // Use this to get early callback for server render
        _incBaseStreams2['default'].onValue(atlantState.streams.renderEndStream, s.baconTryD(callback));
        return this;
    };

    var _onDestroy = function _onDestroy(callback) {
        // Use this to get early callback for server render
        _incBaseStreams2['default'].onValue(atlantState.streams.onDestroyStream, s.baconTryD(callback));
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

    var _attach = function _attach(viewName, selector) {
        s.type(viewName, 'string');
        s.type(selector, 'string');

        prefs.render.attach(viewName, selector);

        return this;
    };

    var _stringify = function _stringify(viewName, options) {
        return prefs.render.stringify(viewName, options);
    };

    var _await = function _await(shouldAWait) {
        utils.goTo = safeGoToCopy.bind(utils, shouldAWait);
        return this;
    };

    var _verbose = function _verbose(on) {
        _utilsLog2['default'].verbose = on;
        return this;
    };

    var _redirectTo = function _redirectTo(url) {
        return utils.goTo(url);
    };

    var _moveTo = function _moveTo(url) {
        if ('undefined' !== typeof window) return window.location.assign(url);else _utilsLog2['default'].error('no window object...');
    };

    var _push = function _push(actionName) {
        throw new Error('atlant.push() not implemented');
        return this;
    };

    var _store = function _store(storeName) {
        TopState.first();
        TopState.state.lastStoreName = storeName;

        if (!(storeName in atlantState.stores)) atlantState.stores[storeName] = {
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
        if ('function' === typeof atlantState.stores[storeName]._serialize) {
            throw new Error("Serialize already implemented in store ", storeName);
        }
        if ('function' !== typeof serializeProvider) {
            throw new Error("Serialize should be a function for ", storeName);
        }

        atlantState.stores[storeName]._serialize = serializeProvider;

        return this;
    };

    var _constructor = function _constructor(constructorProvider) {
        var storeName = TopState.state.lastStoreName;
        if (!storeName) {
            throw new Error('.constructor() should be after .store()');
        }
        if ('function' === typeof atlantState.stores[storeName]._constructor) {
            throw new Error("Constructor already implemented in store ", storeName);
        }
        if ('function' !== typeof constructorProvider) {
            throw new Error("Constructor should be a function for ", storeName);
        }

        atlantState.stores[storeName]._constructor = function (_) {
            return Storage.load(storeName) || constructorProvider();
        };
        atlantState.stores[storeName].changes = _incBaseStreams2['default'].bus();
        atlantState.stores[storeName].staticValue = atlantState.stores[storeName]._constructor();
        atlantState.stores[storeName].bus = atlantState.stores[storeName].changes.scan(atlantState.stores[storeName].staticValue, (function (storeName, state, updater) {
            var newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
            atlantState.stores[storeName].staticValue = newState;

            window.stores[storeName] = newState;

            {
                (function () {
                    var serialize = atlantState.stores[storeName]._serialize;
                    if (serialize) setTimeout(function () {
                        Storage.persist(storeName, serialize(newState));
                    }, 1000);
                })();
            }

            return newState;
        }).bind(void 0, storeName)).skipDuplicates().toEventStream();

        _incBaseStreams2['default'].onValue(atlantState.stores[storeName].bus, function () {});

        return this;
    };

    var _updater = function _updater(updaterName, updater) {
        var storeName = TopState.state.lastStoreName;

        if (!storeName) {
            throw new Error('.updater() should be after .store()');
        }
        if ('function' !== typeof atlantState.stores[storeName]._constructor) {
            throw new Error("Constructor not implemented in store ", storeName);
        }
        if (updaterName in atlantState.stores[storeName].updaters) {
            throw new Error("Cannot reimplement updater ", updaterName, " in store ", storeName);
        }

        atlantState.stores[storeName].updaters[updaterName] = updater;

        if (!(updaterName in atlantState.emitStreams)) atlantState.emitStreams[updaterName] = _incBaseStreams2['default'].bus();

        _incBaseStreams2['default'].onValue(atlantState.emitStreams[updaterName], (function (storeName, updater, updaterName, scope) {
            // scope is the value of .update().with(scope) what was pushed in
            atlantState.stores[storeName].changes.push((function (scope, updater, storeName, updaterName, state) {
                // state is the value which passed through atom
                try {
                    return updater(state, scope);
                } catch (e) {
                    _utilsLog2['default'].error('Warning: updater "' + updaterName + '" failed on store "' + storeName + '"', e);
                    return state;
                }
            }).bind(void 0, scope, updater, storeName, updaterName));
        }).bind(void 0, storeName, updater, updaterName));

        return this;
    };

    var _part = function _part(partName, partProvider) {
        var storeName = TopState.state.lastStoreName;

        if (!storeName) {
            throw new Error('.part() should be after .store()');
        }
        if ('function' !== typeof atlantState.stores[storeName]._constructor) {
            throw new Error("Constructor not implemented in store ", storeName);
        }
        if (partName in atlantState.stores[storeName].parts) {
            throw new Error("Cannot reimplement part ", partName, " in store ", storeName);
        }

        atlantState.stores[storeName].parts[partName] = partProvider;

        return this;
    };

    var _setInterval = s.setInterval;

    var _setTimeout = s.setTimeout;

    var _destroy = function _destroy() {
        // Object.keys(viewSubscriptionsUnsubscribe).forEach(function(viewName){ // Removing atom subscriptions
        //     viewSubscriptionsUnsubscribe[viewName]();
        //     console.log('atom: unsubscribe', viewName)
        // })
        Object.keys(atlantState.viewData).forEach(function (viewName) {
            // Destroying view scopes cache
            atlantState.viewData[viewName] = void 0;
            _utilsLog2['default'].log('clear view cache', viewName);
        });

        prefs.render.destroy(); // Destroying view cache

        _incBaseStreams2['default'].destroy();

        s = l = simpleRender = reactRender = utils = Bacon = _ = interfaces = StateClass = clientFuncs = safeGoToCopy = null; // @TODO more

        atlantState.streams.onDestroyStream.push();
    };

    /**
     * Atlant API
     *
     */

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.when = function (masks, fn) {
        return _when.bind(this)(masks, fn, types.Matching['continue'], types.WhenOrMatch.when);
    };

    this.pre = _pre.bind(this);

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     */
    this.lastWhen = function (masks, fn) {
        return _when.bind(this)(masks, fn, types.Matching.stop, types.WhenOrMatch.when);
    };

    // Match declare a route which will be ignored by .otherwise()
    this.match = function (masks, fn) {
        return _when.bind(this)(masks, fn, types.Matching['continue'], types.WhenOrMatch.match);
    };

    // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
    this.otherwise = function (fn) {
        return _action.call(this, atlantState.streams.otherwiseStream, fn, false, 'otherwise');
    };

    // Creates stream which will be called when render error is happend
    this.error = function (fn) {
        return _action.call(this, atlantState.streams.errorStream, fn, false, 'error');
    };

    // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
    // this.catch = _catch;

    // Creates custom stream which accepts Bacon stream
    this.action = function (action, fn) {
        return _action.call(this, action, fn, true, 'action');
    };

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

    this.views['break'] = function (viewName) {
        unsubscribeView(viewName);
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
    this.attach = s.tryD(_attach);
    // After publish and first render the contents will be transferet to callback (first parameter).
    this.stringify = _stringify;
    this.setTimeout = _setTimeout;
    this.setInterval = _setInterval;

    /**
     * Utils
     * These commands doesn't return "this".
     */
    // Returns atlant.js version
    this.version = require('atlant-version');
    // Returns timestamp of the creation time
    this.build = require('atlant-build');

    this.destroy = _destroy;
    this.isServer = function () {
        return 'undefined' === typeof window;
    };
    this.isBrowser = function () {
        return 'undefined' !== typeof window;
    };

    this.utils = require('inc/tools'); // @TODO: rename to 'tools'
    this.utils.setTitle = this.utils.setTitle.bind(void 0, atlantState.titleStore);
    this.utils.getTitle = this.utils.getTitle.bind(void 0, atlantState.titleStore);
    // Needed only for browsers not supporting canceling history.scrollRestoration
    this.utils.blockScroll = this.utils.blockScroll;
    this.utils.unblockScroll = this.utils.unblockScroll;

    this.state = {};

    this.data = Object.defineProperties({}, {
        routes: {
            get: function get() {
                return _(atlantState.routes).uniq() // @TODO better not to double it for info :) 
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

    // Create stream.
    this.stream = function (_) {
        return new _incStream2['default'](atlantState, prefs);
    };

    return this;
}

if ('undefined' !== typeof window) window.Atlant = Atlant;
module.exports = Atlant;

},{"atlant-build":2,"atlant-version":3,"inc/base-streams":4,"inc/clientFuncs":5,"inc/interfaces":6,"inc/state":8,"inc/storage":9,"inc/stream":10,"inc/tools":11,"inc/types":12,"inc/wrap-push-state.js":13,"renders/react":14,"renders/simple":15,"utils/lib":16,"utils/log":17,"utils/utils":18,"views/views":19}],2:[function(require,module,exports){
"use strict";

module.exports = new Date().getTime();

},{}],3:[function(require,module,exports){
'use strict';

module.exports = '0.4.65';

},{}],4:[function(require,module,exports){
"use strict";

exports.__esModule = true;
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

exports["default"] = baseStreams;
module.exports = exports["default"];

},{}],5:[function(require,module,exports){
"use strict";

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _utilsLog = require('utils/log');

var _utilsLog2 = _interopRequireDefault(_utilsLog);

var s = require('utils/lib'),
    _ = window._,
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
        _utilsLog2['default'].log('inject accessor return nothing:' + inject);
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

    data = s.extend(refsData, upstream.params, data, joinsData);

    return data;
};

var catchError = function catchError(e) {
    if (e && e.stack) {
        _utilsLog2['default'].error(e.message, e.stack);
    } else {
        _utilsLog2['default'].error('Unknown error');
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

},{"utils/lib":16,"utils/log":17}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
"use strict";

var performance = window.performance || window.msPerformance || window.webkitPerformance;

if (!performance || !performance.now) {
  performance = Date;
}

module.exports = performance;

},{}],8:[function(require,module,exports){
"use strict";

var _ = window._;

var StateType = function StateType(state) {
    var newState = _.extend({}, { lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0 }, state);
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

    this.first();

    return this;
};

module.exports = StateClass;

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
"use strict";

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var baseStreams = require('inc/base-streams'),
    s = require('utils/lib'),
    StateClass = require('inc/state'),
    types = require('inc/types'),
    interfaces = require('inc/interfaces'),
    clientFuncs = require('inc/clientFuncs'),
    utils = require('utils/utils'),
    performance = require('inc/performance');

var Stream = function Stream(atlantState, prefs) {

    var TopState = new StateClass(); // State which up to when
    var State = new StateClass(); // State which up to any last conditional: when, if

    var injectsGrabber = new interfaces.injectsGrabber();
    var dependsName = new interfaces.dependsName();
    var withGrabber = new interfaces.withGrabber();
    var id = _.uniqueId();
    var root = baseStreams.bus();

    var _viewsViews = require("views/views");

    var _viewsViews2 = _interopRequireDefault(_viewsViews);

    var unsubscribeView = _viewsViews2['default'](atlantState);

    var lastWhen;

    var streamState = {};

    var streamCallbacks = [];

    var renderView = (function () {

        var renderIntoView = function renderIntoView(viewProvider, upstream, viewName, render, scope) {
            var renderD = s.promiseD(render); // decorating with promise
            return renderD(viewProvider, upstream, atlantState.activeStreamId, viewName, scope).then(function (_) {
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
            })['catch'](clientFuncs.catchError);
        };

        var subscribeView = function subscribeView(viewName, doRenderIntoView, scope, upstream) {

            if (!('chains' in upstream) || !Object.keys(upstream.chains).length) return; // If no store is selected for this view, then we should not subscribe on anything.

            var keys = Object.keys(upstream.chains);

            atlantState.viewSubscriptions[viewName] = Bacon.mergeAll(keys.map(function (store) {
                return atlantState.stores[store].bus;
            }));

            // if (upstream.render.subscribe) streamState.subscribersCount++;

            atlantState.viewSubscriptionsUnsubscribe[viewName] = atlantState.viewSubscriptions[viewName].onValue((function (upstream, viewName, scope, doRenderIntoView, value) {
                var start = performance.now();

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

                if ('undefined' === typeof window.selectCount) window.selectCount = 0;
                if ('undefined' === typeof window.selectTime) window.selectTime = 0;
                window.selectTime = window.selectTime + performance.now() - start;
                window.selectCount++;
                window.getSelectTime = function (_) {
                    return window.selectTime / window.selectCount;
                };

                var data = _.extend({}, scope, value);

                if (!_.isEqual(data, atlantState.viewData[viewName])) {
                    scope = data;
                    atlantState.viewData[viewName] = data;
                    doRenderIntoView(data); // Here we using scope updated from store!

                    if (streamState.resolveWhen && streamState.resolveWhen(data) && streamCallbacks.length) {
                        streamCallbacks.forEach(function (_) {
                            return _(data);
                        });
                    }
                }

                // streamState.updates.swap(_ => _ - 1 / streamState.subscribersCount); // if there is an subscription, then always do this
                // console.log('swapping:', streamState.updates.unwrap())
                return upstream;
            }).bind(void 0, upstream, viewName, scope, doRenderIntoView));
        };

        return function (upstream) {
            if (void 0 === upstream || atlantState.activeStreamId.value !== upstream.id) return false;

            try {
                var viewName = s.dot('.render.viewName', upstream);
                if (!viewName) return;
                // Choose appropriate render.
                var render;

                if (types.RenderOperation.refresh === upstream.render.renderOperation) {
                    utils.goTo(window.location.pathname, void 0, true);

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
                    atlantState.lastPath = path;
                    utils.replace(path); // just rename url

                    return;
                } else if (types.RenderOperation.change === upstream.render.renderOperation) {
                    var path = s.apply(viewProvider, scope);
                    atlantState.lastReferrer = atlantState.lastPath;
                    atlantState.lastPath = path;
                    utils.change(path); // Push url to history without atlant to react on new value.

                    return;
                } else {

                    if (types.RenderOperation.render === upstream.render.renderOperation || types.RenderOperation.draw === upstream.render.renderOperation) {
                        render = prefs.render.render.bind(prefs.render);
                    } else if (types.RenderOperation.clear === upstream.render.renderOperation) {
                        render = prefs.render.clear.bind(prefs.render);
                    }

                    var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render);
                    atlantState.viewData[viewName] = scope;

                    unsubscribeView(viewName);

                    var renderResult = doRenderIntoView(scope); // sync operation

                    if (upstream.render.subscribe && types.RenderOperation.clear !== upstream.render.renderOperation) // Subscriber only after real render - Bacon evaluates subscriber immediately
                        subscribeView(viewName, doRenderIntoView, scope, upstream);

                    upstream.render.component = renderResult;
                    return upstream;
                }
            } catch (e) {
                console.error(e.message, e.stack);
            }
        };
    })();

    (function () {
        var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
        var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));

        TopState.first();
        State.first();

        var whenId = _.uniqueId();
        var depName = _.uniqueId();
        var injects = injectsGrabber.init(depName, State.state);
        var nameContainer = dependsName.init(depName, State.state);
        var stats = TopState.state.stats;

        // streamState.subscribersCount = 0;

        lastWhen = root.map((function (depName, injects, nameContainer, stats, whenId, depValue) {
            if ('undefined' === typeof depValue) {
                depValue = {};
            }
            if ('object' === typeof depValue) {
                if (!('mask' in depValue)) depValue.mask = atlantState.lastMask;
                if (!('masks' in depValue)) depValue.masks = atlantState.lastMask;
                if (!('pattern' in depValue)) depValue.pattern = atlantState.lastMask;
                if (!('location' in depValue)) depValue.location = atlantState.lastPath;
                if (!('referrer' in depValue)) depValue.referrer = atlantState.lastReferrer;
                if (!('history' in depValue)) depValue.history = atlantState.lastHistory;
            }

            var stream = injectsGrabber.add(depName, depValue, injects, {});
            stream = dependsName.add(depName, nameContainer, stream);
            stream.params = s.extend({}, depValue);

            stream.stats = stats;
            stream.whenId = whenId;
            stream.id = atlantState.activeStreamId.value;
            // stream.id = _.uniqueId(); // Should it be so at error?

            return stream;
        }).bind(void 0, depName, injects, nameContainer, stats, whenId));

        State.state.lastIf = void 0;
        State.state.lastDep = void 0;
        State.state.lastDepName = depName;
        State.state.lastWhen = lastWhen;
        State.state.lastOp = State.state.lastWhen;
        State.state.lastOpId = whenId;
        TopState.state.lastAction = depName;
    })();

    /* depends */
    var _depends = (function () {

        var createDepStream = function createDepStream(stream, opId, depName, dep, injects, store, isAtom) {
            var nameContainer = dependsName.init(depName, State.state);
            var withs = withGrabber.init(State.state);

            stream = stream.map(dependsName.add.bind(dependsName, depName, nameContainer)).map(withGrabber.add.bind(withGrabber, withs));

            if ('function' !== typeof dep) {
                stream = stream.map((function (opId, depName, dep, upstream) {
                    if (!upstream.depends) upstream.depends = {};
                    upstream.depends[depName] = dep;
                    upstream.opId = opId;
                    return upstream;
                }).bind(void 0, opId, depName, dep));
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
                        if (!upstream.isInterceptor) atlantState.streams.interceptorBus.push({ upstream: upstream, scope: results }); // pushing into global depends .interceptor()
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
        var zippersJoin = function zippersJoin(prevDepName, currDepName, x, y) {
            x.depends = s.extend({}, x.depends, y.depends);
            x.injects = x.injects.concat(y.injects);
            return x;
        };

        return function (dependency, dependsBehaviour, store, isAtom) {
            if (!State.state.lastWhen) throw new Error('"depends" should nest "when"');

            var prefix = dependsBehaviour === types.Depends['continue'] ? '_and_' : '_';
            var opId = _.uniqueId();
            var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = State.state.lastOp;
            if (dependsBehaviour === types.Depends.async) {
                lastOp = State.state.lastIf || State.state.lastWhen;
            }

            injectsGrabber.init(depName, State.state);

            var thisDep = createDepStream(lastOp, opId, depName, dependency, State.state.lastInjects, store, isAtom);

            if (dependsBehaviour === types.Depends.async && State.state.lastDep) {
                // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = State.state.lastDep.zip(thisDep, zippersJoin.bind(void 0, State.state.lastDepName, depName));
            }

            State.state.lastDep = thisDep;
            State.state.lastDepName = depName;
            State.state.lastOp = thisDep;
            State.state.lastOpId = opId;

            return this;
        };
    })();

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

        var commonIf = State.state.lastOp.map((function (ifId, fn, condition, upstream) {
            var scope = clientFuncs.createScope(upstream);
            var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
            upstream.check = checkCondition(scope);
            return upstream;
        }).bind(void 0, ifId, fn, condition));

        var thisIf = commonIf.map(_.extend.bind(_, {})) // Copy
        .filter(function (_) {
            return boolTransform(_.check);
        }).map((function (ifId, depName, injects, upstream) {
            delete upstream.check;
            var stream = injectsGrabber.add(depName, {}, injects, upstream);
            return stream;
        }).bind(void 0, ifId, depName, injects));

        var thisElse = commonIf.map(_.extend.bind(_, {})) // Copy
        .filter(function (_) {
            return !boolTransform(_.check);
        }).map((function (ifId, depName, injects, upstream) {
            delete upstream.check;
            var stream = injectsGrabber.add(depName, {}, injects, upstream);
            return stream;
        }).bind(void 0, ifId, depName, injects));

        State.state.lastIf = thisIf;
        State.state.lastElse = thisElse;
        State.state.lastOp = State.state.lastIf;
        State.state.lastOpId = ifId;
        State.state.lastDep = void 0;

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

    var _render = (function () {
        var closeBlock = function closeBlock(renderOperation, viewName) {

            if (void 0 !== State.state.lastIf && renderOperation !== types.RenderOperation.draw) {

                var dep = State.state.lastDep ? State.state.lastDep.merge(State.state.lastElse) : void 0;
                var op = State.state.lastOp.merge(State.state.lastElse);

                State.rollback();

                State.state.lastDep = dep;
                State.state.lastOp = op;
            }
        };
        return function (renderProvider, viewName, once, renderOperation) {
            // /check
            if (!State.state.lastOp) throw new Error('"render" should nest something');
            if ('function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.nope && renderOperation != types.RenderOperation.refresh) {
                console.log('Atlant.js: render first param should be function or URI', renderProvider, renderOperation);
                throw new Error('Atlant.js: render first param should be function or URI');
            }
            s.type(viewName, 'string');
            s.type(renderOperation, 'number');
            viewName = viewName || s.last(prefs.viewState);

            if (!viewName) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');

            var closeThisBlock = closeBlock.bind(this, renderOperation, viewName);

            if (renderOperation === types.RenderOperation.nope) {
                closeThisBlock();State.state.lastOp.onValue(function (_) {
                    return _;
                });return this;
            } // Do nothing if "nope"
            // ------end of check/

            var subscribe = 'once' !== once ? true : false;
            var renderId = _.uniqueId();

            var renderStream = State.state.lastOp.map(function (upstream) {
                if (!upstream.isAction && upstream.id !== atlantState.activeStreamId.value) return Bacon.never(); // Obsolete streams invoked on previous route.

                upstream.render = { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: types.RenderOperationKey[renderOperation], subscribe: subscribe, parent: State.state.lastOpId };

                return renderView(upstream);
            });

            if (renderOperation === types.RenderOperation.draw) {
                State.state.lastOp = renderStream;
                State.state.lastOpId = renderId;
            } else {
                renderStream.onValue(function (_) {
                    // if ( renderOperation === types.RenderOperation.draw )  {
                    //     prefs.onDrawEndCallbacks.forEach( _ => _() ) // process user onDrawEnd signal
                    // }
                    return _;
                });
            }

            closeThisBlock();

            return this;
        };
    })();

    var _end = function _end() {

        State.state.lastOp.onValue(function (_) {
            return _;
        }); // Subscribing to last item, else this .if() will be not executed - because of Bacon lazyness

        if (void 0 !== State.state.lastIf) {
            State.rollback();
        }

        return this;
    };

    var _update = function _update(dependsBehaviour, key) {
        if (!State.state.lastOp) throw new Error('"update" should nest something');
        s.type(key, 'string');

        // streamState.updates.swap(_ => _ + 1);

        return _depends.bind(this)((function (key, id) {
            if (key in atlantState.emitStreams) atlantState.emitStreams[key].push(id);else console.log("\nAtlant.js: Warning: event key" + key + " is not defined");
        }).bind(void 0, key), dependsBehaviour);

        return this;
    };

    var _log = function _log() {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        return _depends.bind(this)((function (args, scope) {
            try {
                console.log.apply(console, args.concat(scope));
                return void 0;
            } catch (e) {
                return void 0;
            }
        }).bind(void 0, args), types.Depends['continue']);
    };

    var _select = function _select(dependsBehaviour, isAtom, partName, storeName, dependsOn) {
        if (!(storeName in atlantState.stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
        if (!(partName in atlantState.stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
        if (dependsOn && 'string' !== typeof dependsOn) throw new Error('atlant.js: dependsOn param should be a string');

        return _depends.bind(this)((function (storeName, partName) {
            return (function (storeName, partName, id) {
                var value;
                try {
                    // console.log('executing select', partName , 'from', '<' + storeName + '>', atlantState.stores[storeName].staticValue, 'with', atlantState.stores[storeName].parts[partName], '(',id(),')', ' = ', atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id()))
                    value = atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id());
                } catch (e) {
                    console.error('select', partName, 'from', storeName, 'failed:', e.stack);
                    value = void 0;
                }
                return value;
            }).bind(void 0, storeName, partName);
        }).bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: atlantState.stores[storeName].bus, partProvider: atlantState.stores[storeName].parts[partName], storeData: atlantState.stores[storeName] }, isAtom);
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

    var _resolveWhen = function _resolveWhen(truthfulFn) {
        streamState.resolveWhen = truthfulFn;
        return this;
    };

    /**
     *  Asyncroniously run the dependency. 
     */
    this.async = function (dependency) {
        return _depends.bind(this)(dependency, false, types.Depends.async);
    };
    /*
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     * */
    this.dep = function (dependency) {
        return _depends.bind(this)(dependency, false, types.Depends['continue']);
    };
    /*
     * .data() allow catch every peace of data which where piped with .depends(), .and()
     **/

    // Store dispatch
    this.update = _update.bind(this, types.Depends['continue']);
    // Query store with atom creation
    this.select = _select.bind(this, types.Depends['continue'], true);
    // Just query store, no updates will be received
    this.query = _select.bind(this, types.Depends['continue'], false);

    /*
     * Allows give name for .depends()
     */
    this.name = _as;
    // value can be deferred if used with .select()
    this.as = _as;

    // create scope for data provider .select(), .depends() are supported
    this['with'] = _with;
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
    this.inject = _inject;
    // Will accept the same scope as .and(), .render(), .if()
    this.join = _join;
    // Creates new branch if computated callback is true. Warning: the parent branch will be executed still. Render it with .nope() if no render should happend.
    this['if'] = _if.bind(this, s.id);
    this.unless = _if.bind(this, s.negate);
    this.end = _end;
    this.resolveWhen = _resolveWhen;
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

    this.push = function (_) {
        root.push(_);
    };

    this.onValue = function (_) {
        streamCallbacks.push(_);
    };
};

exports['default'] = Stream;
module.exports = exports['default'];

},{"inc/base-streams":4,"inc/clientFuncs":5,"inc/interfaces":6,"inc/performance":7,"inc/state":8,"inc/types":12,"utils/lib":16,"utils/utils":18,"views/views":19}],11:[function(require,module,exports){
"use strict";

var utils = require('utils/utils'),
    _ = window._,
    s = require('utils/lib');

var _test = function _test(path, mask) {
    if (!path || !mask) return false;

    return void 0 !== utils.matchRoute(path, mask);
};

var _return = function _return(path, mask) {
    if (!path || !mask) return false;

    return void 0 !== utils.matchRoute(path, mask) ? mask : void 0;
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

var _blockScroll = function _blockScroll() {
    return utils.blockScroll();
};

var _unblockScroll = function _unblockScroll() {
    return utils.unblockScroll();
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
    getTitle: _getTitle,
    unblockScroll: _unblockScroll,
    blockScroll: _blockScroll
};

},{"utils/lib":16,"utils/utils":18}],12:[function(require,module,exports){
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

module.exports = {
    RenderOperation: RenderOperation,
    RenderOperationKey: RenderOperationKey,
    Depends: Depends,
    WhenOrMatch: WhenOrMatch,
    Matching: Matching
};

},{}],13:[function(require,module,exports){
"use strict";
//https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
// Polyfill for "new CustomEvent"
(function () {

    if ('undefined' === typeof window) return;
    if (typeof window.CustomEvent === "function") return;

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
    window.history.pushState.overloaded = true;
};

module.exports = { wrapPushState: wrapPushState };

},{}],14:[function(require,module,exports){
"use strict";

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _utilsLog = require('utils/log');

var _utilsLog2 = _interopRequireDefault(_utilsLog);

var s = require('utils/lib'),
    u = require('utils/utils'),
    _ = window._,
    Promise = window.Promise;

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
        if (!instances[name]) {
            instances[name] = React.createFactory(wrappers[name])();
        }
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
    var attachedViews = [];

    this.render = function (viewProvider, upstream, activeStreamId, name, scope) {
        _utilsLog2['default'].time('rendering view ' + name);

        state.getOrCreate(name); // Always should be first to ensure that it is a simple div to lower influence of React.renderToStaticMarkup

        if (upstream.isAction || upstream.id === activeStreamId.value) {
            // Checking, should we continue or this stream already obsolete. 
            state.set(name, [viewProvider, scope]);
        }

        var instance = state.getThis(name);

        if (instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate();
        // if(instance) instance.forceUpdate(); // If root component contained this view is not yet rendered, then it's not a big deal. When it will be rendered, it will catch all rendered instances of it's children and draw them.

        _utilsLog2['default'].timeEnd('rendering view ' + name);

        return state.getInstance(name);
    };

    this.clear = function (viewProvider, upstream, activeStreamId, name, scope) {
        return this.render(function () {
            return React.createElement('div');
        }, upstream, activeStreamId, name, scope);
    };

    this.attach = function (name, selector) {
        if (typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.');

        var element = document.querySelector(selector);
        if (!element) throw Error("AtlantJs, React render: can\'t find the selector" + selector);

        state.getOrCreate(name);
        var root = state.getInstance(name);

        try {
            React.render(root, element);
            attachedViews.push(name);
        } catch (e) {
            _utilsLog2['default'].error(e.message, e.stack);
            React.unmountComponentAtNode(element);
        }
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
        state.set(name, component);
        state.getOrCreate(name);
        return state.getThis(name);
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
        attachedViews = [];
        state.destroy();
    };
};

module.exports = Render;

},{"utils/lib":16,"utils/log":17,"utils/utils":18}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
"use strict";

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var _utilsLog = require("utils/log");

var _utilsLog2 = _interopRequireDefault(_utilsLog);

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
        _utilsLog2["default"].log(what);
        return what;
    };

    this.logIt = function () {
        var args = that.a2a(arguments);
        return function (what) {
            _utilsLog2["default"].log.apply(_utilsLog2["default"], args.concat(what));
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

    this["if"] = _.curry(function (condition, then, value) {
        if (condition(value)) return then(value);else return value;
    });

    this.type = function (item, type) {

        if (type !== typeof item && item) {
            var error = new Error('Type Error: ' + item + ' should be ' + type);
            _utilsLog2["default"].error(error.message, error.stack);
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
                _utilsLog2["default"].error(e.message, e.stack);
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

},{"utils/log":17}],17:[function(require,module,exports){
"use strict";

exports.__esModule = true;
var s = require('utils/lib');

var Log = function Log() {
    var on = false;
    var atlantPrefix = 'Atlant.js: ';

    Object.defineProperty(this, 'verbose', {
        get: function get(_) {
            return on;
        },
        set: function set(_) {
            on = _;return on;
        }
    });

    this.log = function () {
        if (!on) return;

        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        console.log.apply(console, [atlantPrefix].concat(args));
    };

    this.warn = function () {
        if (!on) return;

        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
        }

        console.warn.apply(console, [atlantPrefix].concat(args));
    };

    this.error = function () {
        if (!on) return;

        for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
        }

        console.error.apply(console, [atlantPrefix].concat(args));
    };

    this.time = function (name) {
        if (!on) return;
        if (console.time) {
            return console.time(atlantPrefix + name);
        }
    };

    this.timeEnd = function (name) {
        if (!on) return;
        if (console.timeEnd) {
            return console.timeEnd(atlantPrefix + name);
        }
    };
    return this;
};

var instance = new Log();

exports['default'] = instance;
module.exports = exports['default'];

},{"utils/lib":16}],18:[function(require,module,exports){
"use strict";

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var s = require('utils/lib'),
    _ = window._;

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

    setTimeout(function (_) {
        return history.pushState(state, null, url);
    }, 0); // setTimeout turns on safari optimizations and we didn't see the crazy jumps.
};

utils.newPage = true;

utils.saveType = function (field) {
    window.history.replaceState(_extends(_defineProperty({}, field, true), window.history.state), null);
};

utils.clearState = function () {
    var state = _extends({}, window.history.state);
    delete state.scrollTop;
    delete state.forceRouteChange;
    delete state.referrer;
    delete state.url;
    window.history.replaceState(state, null);
};

utils.saveScroll = _.debounce(function (event) {
    var state = _extends({}, history.state, { scrollTop: window.pageYOffset });

    window.history.replaceState(state, null);
}, 50);

utils.body = document.querySelector('body');
utils.html = document.documentElement;

utils.getPageHeight = function height(_) {
    return Math.max(utils.body.scrollHeight, utils.body.offsetHeight, utils.html.clientHeight, utils.html.scrollHeight, utils.html.offsetHeight);
};

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
            event.stopPropagation();
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
utils.matchRoute = _.curry(s.memoize(function (path, mask) {
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

    return isMatched ? dst : void 0;
}));

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

utils.blockScroll = function (titleStore, title) {
    // freezing view;
    var scrollPosition = window.scrollY;
    if (utils.body && !('scrollRestoration' in history)) {
        utils.body.style.position = 'fixed';
        utils.body.style.width = '100%';
        utils.body.style.marginTop = -scrollPosition + 'px';
        return true;
    }
    return false;
};

utils.unblockScroll = function (titleStore, title) {
    if (utils.body && !('scrollRestoration' in history)) {
        utils.body.style.position = null;
        utils.body.style.width = null;
        utils.body.style.marginTop = null;
        return true;
    }
    return false;
};

module.exports = utils;

},{"utils/lib":16}],19:[function(require,module,exports){
'use strict';

exports.__esModule = true;
var s = require('utils/lib');

var unsubscribeView = s.curry(function (atlantState, viewName) {
    try {
        // turn off all subscriptions of selects for this view
        if (atlantState.viewSubscriptionsUnsubscribe[viewName]) {
            // finish Bus if it exists;
            atlantState.viewSubscriptionsUnsubscribe[viewName]();
        }
    } catch (e) {
        console.error('unsubscribe error', e.stack);
    }
});

exports['default'] = unsubscribeView;
module.exports = exports['default'];

},{"utils/lib":16}]},{},[1])
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var _create = __webpack_require__(1);

	var _create2 = _interopRequireDefault(_create);

	var _keys = __webpack_require__(2);

	var _keys2 = _interopRequireDefault(_keys);

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	var _log = __webpack_require__(4);

	var _log2 = _interopRequireDefault(_log);

	var _stream = __webpack_require__(13);

	var _baseStreams = __webpack_require__(15);

	var _baseStreams2 = _interopRequireDefault(_baseStreams);

	var _lib = __webpack_require__(5);

	var _views = __webpack_require__(19);

	var _views2 = _interopRequireDefault(_views);

	var _uniq = __webpack_require__(26);

	var _uniq2 = _interopRequireDefault(_uniq);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var build = __webpack_require__(27);
	var version = __webpack_require__(28);
	var s = __webpack_require__(5);
	var utils = __webpack_require__(24);
	var simpleRender = __webpack_require__(29);
	var reactRender = __webpack_require__(30);
	var Bacon = __webpack_require__(12);
	var interfaces = __webpack_require__(22);
	var StateClass = __webpack_require__(20);
	var Storage = __webpack_require__(31);
	var types = __webpack_require__(21);
	var wrapHistoryApi = __webpack_require__(32).wrapHistoryApi;
	var tools = __webpack_require__(33);

	// @TODO: fast switching generate console.error.
	// @TODO: #hashes are ignored
	// @TODO: check(true) to check only this view params (by specifically set fields or somehow)
	// @TODO: depCache to check only this dep params (by specifically set fields or somehow)

	function Atlant() {
	  var atlant = this;

	  // Preferences set by user
	  var prefs = {
	    parentOf: {},
	    checkInjectsEquality: true,
	    skipRoutes: [], // This routes will be skipped in StreamRoutes
	    viewState: ['root'],
	    on: { renderEnd: void 0 }, // callback which will be called on finishing when rendering
	    scrollElement: function scrollElement() {
	      return typeof document !== 'undefined' ? utils.body : void 0;
	    },

	    defaultScrollToTop: true,
	    pre: void 0
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
	    devStreams: {
	      renderEndStream: _baseStreams2.default.bus(),
	      otherwiseStream: _baseStreams2.default.bus(),
	      publishStream: _baseStreams2.default.bus(), // Here we can put init things.
	      errorStream: _baseStreams2.default.bus(),
	      onDestroyStream: _baseStreams2.default.bus()
	    },
	    whens: {}, // storing whens
	    titleStore: { value: '' },
	    viewSubscriptionsUnsubscribe: {},
	    viewSubscriptions: {},
	    streams: {},
	    fns: {},
	    interceptors: [],
	    atlant: this,
	    scrollState: utils.getScrollState()
	  };

	  var unsubscribeView = (0, _views2.default)(atlantState);

	  _log2.default.level = '';

	  // Patching goTo for further use
	  var safeGoToCopy = utils.goTo;
	  utils.goTo = safeGoToCopy.bind(utils, false);

	  // Browser specific actions.
	  // registering wrapHistoryApi, attaching atlant events to links
	  if (typeof window !== 'undefined') {
	    if (!window.stores) window.stores = {}; // Should be defined for debuggins reasons

	    // Clearing current history state
	    if ('scrollRestoration' in history) {
	      history.scrollRestoration = 'manual';
	    }
	    utils.clearState();

	    wrapHistoryApi(window);

	    // Subscribe to clicks and keyboard immediatelly. Document already exists.
	    utils.attachGuardToLinks();
	  }

	  // can be removed, just informational
	  _baseStreams2.default.onValue(atlantState.devStreams.renderEndStream, s.baconTryD(function (_) {
	    return _log2.default.log('render end:', _);
	  }));

	  var TopState = new StateClass(); // State which up to when

	  var routeChangedStream = atlantState.devStreams.publishStream.merge(Bacon.fromBinder(function (sink) {
	    if (typeof window === 'undefined') return;
	    var routeChanged = function routeChanged(sink, event) {
	      try {
	        (function () {
	          // Using state from event. At this point the history.state is stil old.
	          var state = event instanceof PopStateEvent ? event.state : event.detail.state; // CustomEvent has details and state inside. PopStateEvent has just state inside.

	          // On pushstate event the utils.getLocation() will give url of previous route.
	          // Otherwise on popstate utils.getLocation() return current URI.
	          var path = event instanceof PopStateEvent ? utils.getLocation() : event.detail.url;

	          path = utils.rebuildURL(path);

	          var finishScroll = void 0;
	          var minHeightBody = void 0;
	          var loader = document.querySelector('.root-loader');
	          var trySetScroll = function trySetScroll(scrollTop) {
	            if (scrollTop !== 'number') return;
	            atlant.state.scrollRestoration = true;

	            var bodyHeight = utils.getPageHeight() + window.innerHeight;

	            if (!('scrollRestoration' in history)) loader.style.visibility = 'visible';

	            if (bodyHeight < scrollTop) {
	              utils.body.style.minHeight = minHeightBody = scrollTop + window.innerHeight + 'px';
	            }

	            finishScroll = function (scrollTop, installedHeight) {
	              // utils.unblockScroll();
	              atlant.state.scrollRestoration = false;
	              window.scrollTo(0, scrollTop);
	              if (!('scrollRestoration' in history)) loader.style.visibility = null;
	              window.setTimeout(function () {
	                if (utils.body.style.minHeight === installedHeight) {
	                  utils.body.style.minHeight = null;
	                }
	              }, 100);
	            }.bind(void 0, scrollTop, minHeightBody);

	            if (window && !window.history.pushState.overloaded) wrapHistoryApi(window);
	          };

	          var savedScrollTop = atlantState.scrollState[path];
	          if (event instanceof PopStateEvent) {
	            trySetScroll(savedScrollTop);
	          } else if (0 === savedScrollTop) {
	            finishScroll = function finishScroll() {
	              if (!('scrollRestoration' in history)) loader.style.visibility = null;
	            };
	          }

	          if (path !== atlantState.lastPath || event && event.detail && event.detail.state && event.detail.state.forceRouteChange) {
	            // if (!('scrollRestoration' in history)) { utils.unblockScroll();  } // removing fixed just before rendering
	            sink({
	              path: path,
	              referrer: atlantState.lastPath,
	              history: event
	            });
	          }
	          // ,postponed: postponedCleanup
	          if (finishScroll) {
	            requestAnimationFrame(finishScroll);
	          }
	        })();
	      } catch (e) {
	        atlant.state.scrollRestoration = false;
	        if (!('scrollRestoration' in history)) loader.style.visibility = null;
	        utils.body.style.minHeight = null;
	        // utils.unblockScroll();
	        _log2.default.error(e.stack);
	      }
	    }.bind(void 0, sink);
	    window.addEventListener('popstate', routeChanged);
	    window.addEventListener('pushstate', routeChanged);
	    window.addEventListener('scroll', utils.saveScroll);

	    if (!('scrollRestoration' in history)) {
	      var _loader = document.querySelector('.root-loader');
	      if (_loader) _loader.style.visibility = null;
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
	    var stream = void 0;
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
	    var stream = (0, _extends3.default)({}, upstream);

	    // Storing here the data for actions.
	    atlantState.lastPath = stream.path;
	    atlantState.lastReferrer = stream.referrer;
	    atlantState.lastHistory = stream.history;
	    atlantState.lastMask = void 0;

	    stream.id = (0, _lib.uniqueId)();
	    atlantState.activeStreamId.value = stream.id;

	    return stream;
	  });

	  atlantState.rootStream = Bacon.fromBinder(function (sink) {
	    _baseStreams2.default.onValue(routeChangedStream, function (sink, _) {
	      if (prefs.pre) prefs.pre();
	      sink(_);
	    }.bind(void 0, sink));
	  }).takeUntil(_baseStreams2.default.destructorStream);

	  atlantState.rootStream.onValue(s.tryD(function (upstream) {
	    var skipRoutes = prefs.skipRoutes.map(function (_) {
	      return utils.matchRoute(upstream.path, _) || utils.matchRoute(utils.getPossiblePath(upstream.path), _);
	    }).filter(function (_) {
	      return !!_;
	    });
	    if (skipRoutes.length) {
	      atlantState.devStreams.renderEndStream.push({ httpStatus: 404, httpMessage: 'Resource is forbidden' });
	      return;
	    }

	    var _whens = (0, _keys2.default)(atlantState.whens).map(function (_) {
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
	      if (whenData.isMatch && types.Matching.once === whenData.matchingBehaviour && whenData.isDone) return;

	      whenData.isDone = true;

	      // Storing here the data for actions.
	      atlantState.lastMask = whenData.route.masks;

	      var depData = {
	        location: upstream.path,
	        mask: whenData.mask,
	        pattern: whenData.mask,
	        masks: whenData.route.masks,
	        referrer: upstream.referrer,
	        history: upstream.history,
	        params: whenData.params
	      };
	      depData = (0, _extends3.default)({}, depData, whenData.params);
	      atlantState.whenData = depData;

	      if (whenData.when.type === types.WhenOrMatch.when && (typeof whenData.scrollToTop.value === 'function' ? whenData.scrollToTop.value(depData) : whenData.scrollToTop.value) && typeof window !== 'undefined') {
	        window.scrollTo(0, 0);
	      }

	      var stream = whenData.route.fn instanceof _stream.AtlantStreamConstructor ? whenData.route.fn : whenData.route.fn(); // @TODO should be a AtlantStreamConstructor.

	      if (stream instanceof _stream.AtlantStreamConstructor) {
	        _log2.default.warn('Failed stream source:', whenData.route.fn);throw new Error('You should end the AtlantStreamConstructor. Try add more .end()\'s ');
	      }
	      if (!stream || !(stream instanceof _stream.AtlantStream)) {
	        _log2.default.warn('Failed stream source:', whenData.route.fn);throw new Error('Unknown return from AtlantStreamConstructor function, should be AtlantStream', whenData.route.fn);
	      }

	      if (whenData.when.type === types.WhenOrMatch.when) stream.then(function (_) {
	        return atlantState.devStreams.renderEndStream.push(_);
	      });

	      if ('pushSync' in stream) {
	        stream.pushSync(depData);
	      } else {
	        stream.push(depData);
	      }
	    });

	    if (!_whens.items.length || !_whens.found) {
	      // Only matches or nothing at all
	      atlantState.devStreams.otherwiseStream.push(upstream);
	      return;
	    }
	  }));

	  // Base

	  // When

	  var _when = function () {

	    return function (masks, fn, matchingBehaviour, whenType) {
	      TopState.first();

	      if (-1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.');
	      masks = masks.split('||').map(s.trim).filter(function (_) {
	        return _.length;
	      });

	      if (!masks.length) throw new Error('At least one route mask should be specified.');

	      if ('function' !== typeof fn) {
	        _log2.default.warn('Failed stream source:', fn);throw new Error('Make use "fn = _ => AtlantStream" as second parameter of atlant.when() for ' + masks);
	      }

	      TopState.state.lastMasks = masks;

	      if (masks.filter(function (mask) {
	        return '*' === mask;
	      }).length && whenType === types.WhenOrMatch.when) {
	        throw new Error('Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")');
	      }

	      var whenId = (0, _lib.uniqueId)();
	      var name = whenType === types.WhenOrMatch.match ? 'match' : 'when';
	      var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
	      var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));
	      name = name + createNameFromMasks(masks) + (0, _lib.uniqueId)();

	      // Allows attaching injects to .when().
	      var scrollToTop = { value: whenType === types.WhenOrMatch.match ? false : true };
	      TopState.state.scrollToTop = scrollToTop;

	      if (types.WhenOrMatch.when === whenType) // Informational thing
	        masks.forEach(function (_) {
	          return atlantState.routes.push(utils.stripLastSlash(_));
	        });

	      atlantState.whens[name] = {
	        when: { id: whenId, type: whenType },
	        route: { masks: masks, fn: fn },
	        isFinally: false,
	        isMatch: types.WhenOrMatch.match === whenType,
	        scrollToTop: scrollToTop,
	        matchingBehaviour: matchingBehaviour
	      };

	      return this;
	    };
	  }();

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

	  // Not ordered commands

	  // Function: skip
	  // Skip: Sets the list of route masks which should be skipped by Atlant.
	  // @param path
	  // @returns atlant
	  // @private
	  var _skip = function _skip() {
	    for (var _len = arguments.length, paths = Array(_len), _key = 0; _key < _len; _key++) {
	      paths[_key] = arguments[_key];
	    }

	    s.map(function (_) {
	      return prefs.skipRoutes.push(_);
	    }, paths);
	    return this;
	  };

	  //  Use this method to publish routes when
	  var _publish = function _publish(path) {
	    if (path) s.type(path, 'string');
	    atlantState.devStreams.publishStream.push({ published: true, path: path });
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

	  var _onRenderEnd = function _onRenderEnd(callback) {
	    // Use this to get early callback for server render
	    _baseStreams2.default.onValue(atlantState.devStreams.renderEndStream, s.baconTryD(callback));
	    return this;
	  };

	  var _onDestroy = function _onDestroy(callback) {
	    // Use this to get early callback for server render
	    _baseStreams2.default.onValue(atlantState.devStreams.onDestroyStream, s.baconTryD(callback));
	    return this;
	  };

	  var _use = function _use(render) {
	    s.type(render, 'object');
	    // @TODO: check render for internal structure
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
	    _log2.default.verbose = on;
	    return this;
	  };

	  var _redirectTo = function _redirectTo(url) {
	    return utils.goTo(url);
	  };

	  var _moveTo = function _moveTo(url) {
	    if (typeof window !== 'undefined') return window.location.assign(url);else _log2.default.error('no window object, cannot do window.location.assign(url)...');
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
	      throw new Error('Serialize already implemented in store ', storeName);
	    }
	    if ('function' !== typeof serializeProvider) {
	      throw new Error('Serialize should be a function for ', storeName);
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
	      throw new Error('Constructor already implemented in store ', storeName);
	    }
	    if ('function' !== typeof constructorProvider) {
	      throw new Error('Constructor should be a function for ', storeName);
	    }

	    atlantState.stores[storeName]._constructor = function (_) {
	      return Storage.load(storeName) || constructorProvider();
	    };
	    atlantState.stores[storeName].changes = _baseStreams2.default.bus();
	    atlantState.stores[storeName].staticValue = atlantState.stores[storeName]._constructor();
	    atlantState.stores[storeName].bus = atlantState.stores[storeName].changes.scan(atlantState.stores[storeName].staticValue, function (storeName, state, updater) {
	      var newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
	      atlantState.stores[storeName].staticValue = newState;

	      if (typeof window !== 'undefined') window.stores[storeName] = newState;

	      {
	        (function () {
	          var serialize = atlantState.stores[storeName]._serialize;
	          if (serialize) setTimeout(function () {
	            Storage.persist(storeName, serialize(newState));
	          }, 1000);
	        })();
	      }

	      return newState;
	    }.bind(void 0, storeName)).skipDuplicates().toEventStream();

	    _baseStreams2.default.onValue(atlantState.stores[storeName].bus, function () {});

	    return this;
	  };

	  var setUpdater = function setUpdater(storeName, updaterName, updater) {
	    if (updaterName in atlantState.stores[storeName].updaters) {
	      throw new Error('Cannot reimplement updater ', updaterName, ' in store ', storeName);
	    }
	    if (!(updaterName in atlantState.emitStreams)) atlantState.emitStreams[updaterName] = _baseStreams2.default.bus();

	    atlantState.stores[storeName].updaters[updaterName] = updater;

	    _baseStreams2.default.onValue(atlantState.emitStreams[updaterName], function (storeName, updater, updaterName, scope) {
	      // scope is the value of .update().with(scope) what was pushed in
	      atlantState.stores[storeName].changes.push(function (scope, updater, storeName, updaterName, state) {
	        // state is the value which passed through atom
	        try {
	          return updater(state, scope);
	        } catch (e) {
	          _log2.default.warn('source', updater);
	          _log2.default.error('Warning: updater "' + updaterName + '" failed on store "' + storeName + '"', e);
	          return state;
	        }
	      }.bind(void 0, scope, updater, storeName, updaterName));
	    }.bind(void 0, storeName, updater, updaterName));
	  };

	  var _updater = function _updater(updaterNames, updater) {
	    var storeName = TopState.state.lastStoreName;

	    if (!storeName) {
	      throw new Error('.updater() should be after .store()');
	    }
	    if ('function' !== typeof atlantState.stores[storeName]._constructor) {
	      throw new Error('Constructor not implemented in store ', storeName);
	    }

	    updaterNames = Array.isArray(updaterNames) ? updaterNames : [updaterNames];

	    updaterNames.forEach(function (_) {
	      return setUpdater(storeName, _, updater);
	    });

	    return this;
	  };

	  var _part = function _part(partName, partProvider) {
	    var storeName = TopState.state.lastStoreName;

	    if (!storeName) {
	      throw new Error('.part() should be after .store()');
	    }
	    if ('function' !== typeof atlantState.stores[storeName]._constructor) {
	      throw new Error('Constructor not implemented in store ', storeName);
	    }
	    if (partName in atlantState.stores[storeName].parts) {
	      throw new Error('Cannot reimplement part ', partName, ' in store ', storeName);
	    }

	    atlantState.stores[storeName].parts[partName] = partProvider;

	    return this;
	  };

	  var _setInterval = s.setInterval;

	  var _setTimeout = s.setTimeout;

	  var _destroy = function _destroy() {
	    (0, _keys2.default)(atlantState.viewData).forEach(function (viewName) {
	      // Destroying view scopes cache
	      atlantState.viewData[viewName] = void 0;
	      _log2.default.log('clear view cache', viewName);
	    });

	    prefs.render.destroy(); // Destroying view cache

	    _baseStreams2.default.destroy();

	    // s = l = simpleRender = reactRender = utils = Bacon = interfaces = StateClass = safeGoToCopy = null;// @TODO more

	    atlantState.devStreams.onDestroyStream.push();
	  };

	  // Atlant API

	  // Creates route stream by route expression
	  // @param mask - route expression /endpoint/:param1/:param2/endpoint2
	  //
	  this.when = function (masks, fn) {
	    return _when.bind(this)(masks, fn, types.Matching.continue, types.WhenOrMatch.when);
	  };

	  this.pre = _pre.bind(this);

	  //
	  // Creates route stream by route expression which will prevent other matches after.
	  // @param mask - route expression /endpoint/:param1/:param2/endpoint2
	  this.lastWhen = function (masks, fn) {
	    return _when.bind(this)(masks, fn, types.Matching.stop, types.WhenOrMatch.when);
	  };

	  // Match declare a route which will be ignored by .otherwise()
	  this.match = function (masks, fn) {
	    return _when.bind(this)(masks, fn, types.Matching.continue, types.WhenOrMatch.match);
	  };

	  // Match declare a route which will be ignored by .otherwise()
	  this.matchOnce = function (masks, fn) {
	    return _when.bind(this)(masks, fn, types.Matching.once, types.WhenOrMatch.match);
	  };

	  // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
	  this.otherwise = function (fn) {
	    atlant.streams.get.call(this, 'otherwise', fn, true);return this;
	  };

	  // Creates stream which will be called when render error is happend
	  this.error = function (fn) {
	    atlant.streams.get.call(this, 'error', fn, true);return this;
	  };

	  // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
	  // this.catch = _catch;

	  // Creates custom stream which accepts Bacon stream
	  // "otherwise", "error", "interceptor-n" are reserved names
	  this.action = function (actionName, fn) {
	    atlant.streams.get.call(this, actionName, fn, true);return this;
	  };

	  // creates branch which can destruct all what declared by .when() or .match()
	  // this.finally =  _finally; // was removed, not reimplemented yet

	  // side-effect
	  this.interceptor = function (fn) {
	    var interceptorName = 'interceptor-' + (0, _lib.uniqueId)();
	    atlantState.interceptors.push(interceptorName);

	    try {
	      atlant.streams.get.call(this, interceptorName, fn, false);
	    } catch (e) {
	      delete atlantState.interceptors[atlantState.interceptors.indexOf(interceptorName)];
	    }

	    return this;
	  };

	  // Stores!
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

	  // Setups
	  // If true then view will be re-rendered only when injects are changed. Accepts boolean. Default true
	  this.check = _check;
	  // wait or not for resources loading when going to next route when link tapped
	  this.await = _await;
	  // Display all internal messages.
	  this.verbose = _verbose;
	  // This routes will be ignored by atlant even if they are declared by .when() or .match()
	  this.skip = _skip;
	  // Set view active by default (no need to mention in second parameter of .draw
	  this.set = _set;
	  // Roolback previous set
	  this.unset = _unset;
	  // Use another render. simple render is default
	  this.use = _use;
	  // the element which will be scrolled on scroll to top / history top
	  this.scrollElement = _scrollElement;
	  // the default value of to scroll or not to scroll to top on route change. Default is true.
	  this.defaultScrollToTop = _defaultScrollToTop;

	  // Commands!
	  // Use this when you finished declaring routes and want to start routing. Can be used for drawing another route at current route without redirect (accepts url).
	  this.publish = _publish;

	  // Commands allows perform manipulations of atlant immediatelly.

	  // Here you can manipulate views.
	  this.views = (0, _create2.default)(null);
	  // set component value into view
	  // this.put :: viewName :: component
	  this.views.put = function (viewName, component) {
	    return prefs.render.put(viewName, component);
	  };

	  this.views.break = function (viewName) {
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

	  // Plugins!

	  // Contains available renders
	  this.renders = { react: reactRender, simple: simpleRender };

	  // Events!

	  // Called everytime when route/action is rendered.
	  this.onRenderEnd = _onRenderEnd;
	  // Called when destroy initiated.
	  this.onDestroy = _onDestroy;
	  // Called everytime when draw renders.
	  // Accepts element. After publish and first render the contents will be attached to this element.
	  this.attach = s.tryD(_attach);
	  // After publish and first render the contents will be transferet to callback (first parameter).
	  this.stringify = _stringify;
	  this.setTimeout = _setTimeout;
	  this.setInterval = _setInterval;

	  // Utils
	  // These commands doesn't return "this".
	  // Returns atlant.js version

	  this.version = version;
	  // Returns timestamp of the creation time
	  this.build = build;

	  this.destroy = _destroy;
	  this.isServer = function isServer() {
	    return typeof window === 'undefined';
	  };
	  this.isBrowser = function isServer() {
	    return typeof window !== 'undefined';
	  };

	  this.utils = tools; // @TODO: rename to 'tools'
	  this.utils.setTitle = this.utils.setTitle.bind(void 0, atlantState.titleStore);
	  this.utils.getTitle = this.utils.getTitle.bind(void 0, atlantState.titleStore);
	  // Needed only for browsers not supporting canceling history.scrollRestoration
	  this.utils.blockScroll = this.utils.blockScroll;
	  this.utils.unblockScroll = this.utils.unblockScroll;

	  this.state = {};

	  this.data = {
	    get routes() {
	      return (0, _uniq2.default)(atlantState.routes);
	    } };
	  // This command will immediatelly redirect to param url
	  // @TODO better not to double it for info :)
	  this.goTo = _redirectTo;
	  // The alias of goTo
	  this.redirectTo = _redirectTo;
	  // Will hard redirect to param url (page will be reloaded by browser)
	  this.moveTo = _moveTo;

	  // Create stream.
	  this.stream = function (name) {
	    return new _stream.AtlantStreamConstructor(name, atlantState, (0, _extends3.default)({}, prefs, { canBeIntercepted: true }));
	  };

	  // Create stream which cannot be intercepted
	  this.interceptorStream = function (name) {
	    return new _stream.AtlantStreamConstructor(name, atlantState, (0, _extends3.default)({}, prefs, { canBeIntercepted: false }));
	  };

	  this.streams = {
	    get: function get(name, fn) {
	      if ('string' !== typeof name) {
	        if (fn) _log2.default.warn('Failed stream source:', fn);
	        throw new Error('Provide AtlantStream name.');
	      }

	      if (!name) {
	        if (fn) _log2.default.warn('Failed stream source:', fn);
	        throw new Error('Atlant.js stream name is not provided!');
	      }

	      var stream = atlantState.streams[name];

	      if (fn && stream && stream.isAttached()) {
	        _log2.default.warn('source:', fn);
	        throw new Error('Several actions with 1 name is not supported. The ' + name + ' is not unique.');
	      }

	      if (!stream) {
	        stream = new _stream.AtlantStream(name, atlantState);
	        atlantState.streams[name] = stream;
	      }

	      if (fn && stream && !stream.isAttached()) {
	        stream.attach(fn);
	      }

	      return stream;
	    }
	  };

	  return this;
	}

	if (typeof window !== 'undefined') window.Atlant = Atlant;
	module.exports = Atlant;

/***/ },
/* 1 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/core-js/object/create");

/***/ },
/* 2 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/core-js/object/keys");

/***/ },
/* 3 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/helpers/extends");

/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	var s = __webpack_require__(5);

	var Log = function Log() {
	    var on = false;
	    var level;
	    var atlantPrefix = 'Atlant.js: ';

	    Object.defineProperty(this, 'verbose', {
	        get: function get() {
	            return on;
	        },
	        set: function set(_) {
	            on = _;return on;
	        }
	    });

	    Object.defineProperty(this, 'level', {
	        get: function get() {
	            return level;
	        },
	        set: function set(_) {
	            if (_ === 'errors' || _ === 'warnings') level = _;return level;
	        }
	    });

	    this.log = function () {
	        var _console;

	        if (!on) return;
	        if (level === 'errors' || level === 'warnings') return;

	        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
	            args[_key] = arguments[_key];
	        }

	        (_console = console).log.apply(_console, [atlantPrefix].concat(args));
	    };

	    this.warn = function () {
	        var _console2;

	        if (!on) return;
	        if (level === 'errors') return;

	        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
	            args[_key2] = arguments[_key2];
	        }

	        (_console2 = console).warn.apply(_console2, [atlantPrefix].concat(args));
	    };

	    this.error = function () {
	        var _console3;

	        for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
	            args[_key3] = arguments[_key3];
	        }

	        (_console3 = console).error.apply(_console3, [atlantPrefix].concat(args));
	    };

	    this.time = function (name) {
	        if (!on) return;
	        if (level === 'errors' || level === 'warnings') return;

	        if (console.time) {
	            return console.time(atlantPrefix + name);
	        }
	    };

	    this.timeEnd = function (name) {
	        if (!on) return;
	        if (level === 'errors' || level === 'warnings') return;

	        if (console.timeEnd) {
	            return console.timeEnd(atlantPrefix + name);
	        }
	    };

	    return this;
	};

	var instance = new Log();

	exports.default = instance;

/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var _getPrototypeOf = __webpack_require__(6);

	var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

	var _stringify = __webpack_require__(7);

	var _stringify2 = _interopRequireDefault(_stringify);

	var _promise = __webpack_require__(8);

	var _promise2 = _interopRequireDefault(_promise);

	var _keys = __webpack_require__(2);

	var _keys2 = _interopRequireDefault(_keys);

	var _typeof2 = __webpack_require__(9);

	var _typeof3 = _interopRequireDefault(_typeof2);

	var _create = __webpack_require__(1);

	var _create2 = _interopRequireDefault(_create);

	var _log = __webpack_require__(4);

	var _log2 = _interopRequireDefault(_log);

	var _curry = __webpack_require__(10);

	var _curry2 = _interopRequireDefault(_curry);

	var _cloneDeep = __webpack_require__(11);

	var _cloneDeep2 = _interopRequireDefault(_cloneDeep);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var container = (0, _create2.default)(null);

	var Bacon = __webpack_require__(12);

	var s = function () {
	    var _this = this;

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

	    this.unary = function (fn) {
	        return function (val) {
	            return fn.call(this, val);
	        };
	    };

	    this.compose = function () {
	        for (var _len = arguments.length, fns = Array(_len), _key = 0; _key < _len; _key++) {
	            fns[_key] = arguments[_key];
	        }

	        return function (value) {
	            return fns.reduceRight(function (acc, fn) {
	                return fn(acc);
	            }, value);
	        };
	    };

	    this.uniqueId = function () {
	        var counter = 0;
	        return function () {
	            return Number(counter++).toString();
	        };
	    }();

	    /**
	     * Accepts collection.
	     * it pass obj value and object name to fn (temporary 2 args)
	     * @type {Function}
	     */
	    this.map = (0, _curry2.default)(function (fn, obj) {
	        if (!obj) return [];
	        if (obj && obj.map) return obj.map(that.unary(fn));

	        var mapped = {};

	        for (var name in obj) {
	            mapped[name] = fn(obj[name]);
	        }

	        return mapped;
	    });

	    // @TODO create mapKeys

	    this.fmap = (0, _curry2.default)(function (fn, obj) {
	        return obj.fmap(fn);
	    });

	    // @TODO check immutability/mutability
	    this.filter = (0, _curry2.default)(function (fn, obj) {
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

	    this.filterKeys = (0, _curry2.default)(function (fn, obj) {
	        if (!obj) return obj;

	        var filtered = {};

	        for (var name in obj) {
	            if (fn(name)) {
	                filtered[name] = obj[name];
	            }
	        }

	        return filtered;
	    });

	    this.reduce = (0, _curry2.default)(function (fn, startValue, obj) {
	        if (!obj) return startValue;
	        if (obj && obj.reduce) Array.prototype.reduce.call(obj, fn, startValue);

	        var reduced = {};

	        for (var name in obj) {
	            reduced = fn(reduced, obj[name], name);
	        }

	        return reduced;
	    });

	    this.concat = (0, _curry2.default)(function (a, b) {
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

	    this.eq = (0, _curry2.default)(function (obj, obj2) {
	        return obj === obj2;
	    });

	    this.notEq = (0, _curry2.default)(function (obj, obj2) {
	        return obj !== obj2;
	    });

	    this.empty = function (obj) {
	        return obj === null || obj === void 0 || obj === '' || obj instanceof Array && 0 === obj.length || 'object' === (typeof obj === 'undefined' ? 'undefined' : (0, _typeof3.default)(obj)) && 0 === (0, _keys2.default)(obj).length;
	    };
	    this.notEmpty = this.compose(this.negate, this.empty);

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
	    this.dot = (0, _curry2.default)(function (expression, obj) {
	        return expression.split('.').filter(that.notEmpty).reduce(that.flipSimpleDot, obj);
	    });

	    // expression is ".something" or ".something.something"
	    this.flipDot = (0, _curry2.default)(function (obj, expression) {
	        return that.dot(expression, obj);
	    });

	    this.set = (0, _curry2.default)(function (item, obj, value) {
	        if (item) {
	            obj[item] = value;
	            return obj;
	        } else {
	            return value;
	        }
	    });

	    this.plus = (0, _curry2.default)(function (item1, item2) {
	        return item1 + item2;
	    });

	    this.trim = function (string) {
	        return string.trim();
	    };

	    this.replace = (0, _curry2.default)(function (where, replacer, obj) {
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

	    this.split = (0, _curry2.default)(function (char, obj) {
	        return obj.split(char);
	    });

	    this.log = function (what) {
	        _log2.default.log(what);
	        return what;
	    };

	    this.logIt = function () {
	        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
	            args[_key2] = arguments[_key2];
	        }

	        return function (what) {
	            _log2.default.log.apply(_log2.default, args.concat(what));
	            return what;
	        };
	    };

	    this.instanceOf = function (type, object) {
	        return object instanceof type;
	    };

	    this.typeOf = (0, _curry2.default)(function (type, object) {
	        return type === (typeof object === 'undefined' ? 'undefined' : (0, _typeof3.default)(object));
	    });

	    // Promises
	    this.promise = function (value) {
	        return new _promise2.default(function (fullfill, reject) {
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
	                hash += currentArg === Object(currentArg) ? (0, _stringify2.default)(currentArg) : currentArg;
	                fn.memoize || (fn.memoize = {});
	            }
	            return hash in fn.memoize ? fn.memoize[hash] : fn.memoize[hash] = fn.apply(this, args);
	        };
	    };

	    this.ifelse = (0, _curry2.default)(function (condition, then, _else, value) {
	        if (condition(value)) return then(value);else return _else(value);
	    });

	    this.if = (0, _curry2.default)(function (condition, then, value) {
	        if (condition(value)) return then(value);else return value;
	    });

	    this.type = function (item, type) {

	        if (type !== (typeof item === 'undefined' ? 'undefined' : (0, _typeof3.default)(item)) && item) {
	            var error = new Error('Type Error: ' + item + ' should be ' + type);
	            _log2.default.error(error.message, error.stack);
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
	                _log2.default.error(e.message, e.stack);
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
	            return _promise2.default.reject(e);
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
	                for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
	                    args[_key3] = arguments[_key3];
	                }

	                return fn.apply(this, args);
	            } catch (e) {
	                return nothing;
	            }
	        };
	    };

	    // This function creates copy of the object.
	    this.copy = function (o) {
	        return JSON.parse((0, _stringify2.default)(o));
	    };

	    this.isObject = function (_) {
	        return _ === Object(_);
	    };

	    this.isPlainObject = function (_) {
	        return Object(_) === _ && ((0, _getPrototypeOf2.default)(_) === Object.prototype || null === (0, _getPrototypeOf2.default)(_));
	    };

	    this.clone = function (obj) {
	        return (0, _cloneDeep2.default)(obj, function (value) {
	            if (typeof value === 'function' || !isPlainObject(value)) {
	                return value;
	            }
	        });
	    };

	    this.maybeS = this.maybe.bind(this, '');
	    this.maybeV = this.maybe.bind(this, void 0);

	    this.deferred = function () {
	        var resolve, reject, promise;
	        if ('undefined' !== typeof _promise2.default) promise = new _promise2.default(function (resolver, rejecter) {
	            resolve = resolver;reject = rejecter;
	        });
	        return { promise: promise, resolve: resolve, reject: reject };
	    };

	    this.onNextEventLoop = function (f) {
	        var _deferred = _this.deferred();

	        var promise = _deferred.promise;
	        var resolve = _deferred.resolve;
	        var reject = _deferred.reject;

	        setTimeout(function () {
	            var value = f();
	            return value.then(resolve).catch(reject);
	        }, 0);
	        return promise;
	    };

	    return this;
	}.bind(container)();

	module.exports = s;

/***/ },
/* 6 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/core-js/object/get-prototype-of");

/***/ },
/* 7 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/core-js/json/stringify");

/***/ },
/* 8 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/core-js/promise");

/***/ },
/* 9 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/helpers/typeof");

/***/ },
/* 10 */
/***/ function(module, exports) {

	module.exports = require("lodash/curry");

/***/ },
/* 11 */
/***/ function(module, exports) {

	module.exports = require("lodash/cloneDeep");

/***/ },
/* 12 */
/***/ function(module, exports) {

	module.exports = require("baconjs");

/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});

	var _defineProperty2 = __webpack_require__(14);

	var _defineProperty3 = _interopRequireDefault(_defineProperty2);

	var _promise = __webpack_require__(8);

	var _promise2 = _interopRequireDefault(_promise);

	var _keys = __webpack_require__(2);

	var _keys2 = _interopRequireDefault(_keys);

	var _extends3 = __webpack_require__(3);

	var _extends4 = _interopRequireDefault(_extends3);

	var _typeof2 = __webpack_require__(9);

	var _typeof3 = _interopRequireDefault(_typeof2);

	exports.AtlantStream = AtlantStream;
	exports.AtlantStreamConstructor = AtlantStreamConstructor;

	var _baseStreams = __webpack_require__(15);

	var _baseStreams2 = _interopRequireDefault(_baseStreams);

	var _performance = __webpack_require__(16);

	var _performance2 = _interopRequireDefault(_performance);

	var _location = __webpack_require__(17);

	var _isEqual = __webpack_require__(18);

	var _isEqual2 = _interopRequireDefault(_isEqual);

	var _views = __webpack_require__(19);

	var _views2 = _interopRequireDefault(_views);

	var _log2 = __webpack_require__(4);

	var _log3 = _interopRequireDefault(_log2);

	var _lib = __webpack_require__(5);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var s = __webpack_require__(5),
	    StateClass = __webpack_require__(20),
	    types = __webpack_require__(21),
	    interfaces = __webpack_require__(22),
	    clientFuncs = __webpack_require__(23),
	    utils = __webpack_require__(24);


	var Bacon = __webpack_require__(12);

	function AtlantStream(name, atlantState) {
	  var _this = this;

	  var from = arguments.length <= 2 || arguments[2] === undefined ? 'fromUser' : arguments[2];

	  var context = atlantState.context;
	  _log3.default.log('baseStreams.bus:', _baseStreams2.default.bus);
	  var bus = _baseStreams2.default.bus();
	  var resolveBus = _baseStreams2.default.bus();
	  var fn = void 0;

	  var subscribers = []; // fn's which subscribed to stream.
	  var waiters = []; // here pushes which come before stream has fn attached.
	  var unsubscribe = function unsubscribe() {
	    return subscribers = [];
	  };
	  var worker = function worker(depValue) {
	    var _s$deferred = s.deferred();

	    var promise = _s$deferred.promise;
	    var resolve = _s$deferred.resolve;
	    var reject = _s$deferred.reject;


	    if ('undefined' === typeof depValue) {

	      depValue = {};
	    }
	    if ('object' === (typeof depValue === 'undefined' ? 'undefined' : (0, _typeof3.default)(depValue))) {
	      depValue = (0, _extends4.default)({ params: atlantState.whenData }, depValue);
	    }

	    var userStream = fn();

	    if (userStream instanceof AtlantStreamConstructor) {
	      _log3.default.warn('Failed stream source:', fn);throw new Error('You should end the AtlantStreamConstructor to create AtlantStream. Try add more .end()\'s ');
	    }
	    if (!userStream || !(userStream instanceof AtlantStream)) {
	      _log3.default.warn('Failed stream source:', fn);throw new Error('Constructor function should return AtlantStream.');
	    }

	    userStream.then(resolve);
	    userStream.push(depValue); // AtlantStream

	    return promise;
	  };

	  this.isAttached = function () {
	    return !!fn;
	  };

	  var push = function push(isSync, args) {
	    // If it is constructor stream, then it postpones pushes till fn generator will be attached.

	    var _s$deferred2 = s.deferred();

	    var promise = _s$deferred2.promise;
	    var resolve = _s$deferred2.resolve;
	    var reject = _s$deferred2.reject;


	    var workerSync = function workerSync() {
	      return worker(args).then(resolve).catch(reject);
	    };
	    var workerAsync = function workerAsync() {
	      return s.onNextEventLoop(function () {
	        return worker(args);
	      }).then(resolve).catch(reject);
	    };
	    var pusher = isSync ? workerSync : workerAsync;

	    if (!_this.isAttached()) {
	      _log3.default.log('action:', name, 'is not ready!');waiters.push(pusher);
	    } else {
	      pusher();
	    }

	    return promise;
	  };

	  var pushBus = function pushBus(isSync, args) {
	    var syncCall = function syncCall() {
	      return bus.push(args);
	    };
	    var asyncCall = function asyncCall() {
	      return setTimeout(function () {
	        return bus.push(args);
	      });
	    }; // We don'y neet to return a promise here
	    var pusher = isSync ? syncCall : asyncCall;
	    return pusher();
	  };

	  this.attach = function (_) {
	    if (!_this.isAttached() && _ && typeof _ === 'function') {
	      fn = _;
	      waiters.forEach(function (_) {
	        return _();
	      });
	      waiters = [];
	    }
	  };

	  this.pushSync = function (args) {
	    return from === 'fromUser' ? push(true, args) : pushBus(true, args);
	  };
	  this.push = function (args) {
	    return from === 'fromUser' ? push(false, args) : pushBus(false, args);
	  };
	  this.then = function (fn) {
	    return subscribers.push(fn), unsubscribe;
	  }; // Register subscribers

	  this._exportBus = function () {
	    return bus;
	  }; // @TODO deprecated
	  this._exportResolveBus = function () {
	    return resolveBus;
	  }; // @TODO deprecated

	  return this;
	}

	function AtlantStreamConstructor(name, atlantState, prefs) {
	  var _this2 = this;

	  var TopState = new StateClass(); // State which up to when
	  var State = new StateClass(); // State which up to any last conditional: when, if

	  var injectsGrabber = new interfaces.injectsGrabber();
	  var dependsName = new interfaces.dependsName();
	  var withGrabber = new interfaces.withGrabber();
	  var id = (0, _lib.uniqueId)();

	  var atlantStream = new AtlantStream(name, false, atlantState, 'fromConstructor');

	  var unsubscribeView = (0, _views2.default)(atlantState);

	  var streamState = {
	    name: name,
	    root: atlantStream._exportBus(),
	    resolveBus: atlantStream._exportResolveBus(),
	    canBeIntercepted: true
	  };

	  var renderView = function () {

	    var renderIntoView = function renderIntoView(viewProvider, upstream, viewName, render, scope) {
	      var renderD = s.promiseD(render); // decorating with promise
	      return renderD(viewProvider, upstream, atlantState.activeStreamId, viewName, scope).then(function (_) {
	        var stream = (0, _extends4.default)({}, upstream);

	        if (!_.code || 'notActiveStream' !== _.code) {
	          stream.render.component = _; // pass rendered component. it stale hold before streams get zipped.
	        }

	        return stream;
	      });
	    };

	    var subscribeView = function subscribeView(viewName, doRenderIntoView, scope, upstream) {

	      if (!('chains' in upstream) || !(0, _keys2.default)(upstream.chains).length) return; // If no store is selected for this view, then we should not subscribe on anything.

	      var keys = (0, _keys2.default)(upstream.chains);

	      atlantState.viewSubscriptions[viewName] = Bacon.mergeAll(keys.map(function (store) {
	        return atlantState.stores[store].bus;
	      }));

	      // if (upstream.render.subscribe) streamState.subscribersCount++;

	      atlantState.viewSubscriptionsUnsubscribe[viewName] = atlantState.viewSubscriptions[viewName].onValue(function (upstream, viewName, scope, doRenderIntoView, value) {
	        var start = _performance2.default.now();

	        value = (0, _keys2.default)(upstream.chains).map(function (_) {
	          return upstream.chains[_];
	        }).reduce(function (acc, i) {
	          return acc.concat(i);
	        }, []).reduce(function (acc, i) {
	          return acc.concat(i);
	        }, []).reduce(function (acc, i) {
	          return (0, _extends4.default)({}, acc, i());
	        }, {});

	        var data = (0, _extends4.default)({}, scope, value);

	        if (!(0, _isEqual2.default)(data, atlantState.viewData[viewName])) {
	          scope = data;
	          atlantState.viewData[viewName] = data;
	          doRenderIntoView(data); // Here we using scope updated from store!

	          if (streamState.resolveWhen && streamState.resolveWhen(data)) {
	            streamState.resolveBus.push(data);
	          }
	        }

	        return upstream;
	      }.bind(void 0, upstream, viewName, scope, doRenderIntoView));
	    };

	    return function (upstream) {
	      if (void 0 === upstream || atlantState.activeStreamId.value !== upstream.id) return false;

	      try {
	        var viewName = s.dot('.render.viewName', upstream);
	        if (!viewName) return;
	        // Choose appropriate render.
	        var render;

	        if (types.RenderOperation.refresh === upstream.render.renderOperation) {
	          if (typeof window !== 'undefined') utils.goTo(_location.getPathname.bind(context)(), void 0, true);else _log3.default.error('cannot redirect because of window.location');

	          return _promise2.default.resolve(upstream);
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

	          return _promise2.default.resolve(upstream);
	        } else if (types.RenderOperation.move === upstream.render.renderOperation) {
	          if (typeof viewProvider === 'function') {
	            _location.assign.bind(context)(viewProvider(scope));
	          } else {
	            _location.assign.bind(context)(viewProvider);
	          }

	          return _promise2.default.resolve(upstream);
	        } else if (types.RenderOperation.replace === upstream.render.renderOperation) {

	          var path = s.apply(viewProvider, scope);
	          atlantState.lastPath = path;
	          utils.replace(path); // just rename url

	          return _promise2.default.resolve(upstream);
	        } else if (types.RenderOperation.change === upstream.render.renderOperation) {
	          var path = s.apply(viewProvider, scope);
	          atlantState.lastReferrer = atlantState.lastPath;
	          atlantState.lastPath = path;
	          utils.change(path); // Push url to history without atlant to react on new value.

	          return _promise2.default.resolve(upstream);
	        } else {

	          if (types.RenderOperation.draw === upstream.render.renderOperation) {
	            render = prefs.render.render.bind(prefs.render);
	          } else if (types.RenderOperation.clear === upstream.render.renderOperation) {
	            render = prefs.render.clear.bind(prefs.render);
	          }

	          var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render);

	          atlantState.viewData[viewName] = scope;

	          unsubscribeView(viewName);

	          var renderResult = doRenderIntoView(scope).then(function () {
	            if (upstream.render.subscribe && types.RenderOperation.clear !== upstream.render.renderOperation) // Subscriber only after real render - Bacon evaluates subscriber immediately
	              subscribeView(viewName, doRenderIntoView, scope, upstream);

	            upstream.render.component = renderResult;
	            return upstream;
	          }).catch(function (e) {
	            _log3.default.error(e.stack);atlantState.devStreams.errorStream.push();return Bacon.End();
	          });

	          return renderResult;
	        }
	      } catch (e) {
	        _log3.default.error(e.message, e.stack);
	      }
	    };
	  }();

	  (function () {
	    var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
	    var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));

	    TopState.first();
	    State.first();

	    var whenId = (0, _lib.uniqueId)();
	    var depName = (0, _lib.uniqueId)();
	    var injects = injectsGrabber.init(depName, State.state);
	    var nameContainer = dependsName.init(depName, State.state);
	    var stats = TopState.state.stats;

	    State.state.lastOp = streamState.root.map(function (depName, injects, nameContainer, stats, whenId, depValue) {
	      if ('undefined' === typeof depValue) {
	        depValue = {};
	      }
	      if ('object' === (typeof depValue === 'undefined' ? 'undefined' : (0, _typeof3.default)(depValue))) {
	        if (!('mask' in depValue)) depValue.mask = atlantState.lastMask;
	        if (!('masks' in depValue)) depValue.masks = atlantState.lastMask;
	        if (!('pattern' in depValue)) depValue.pattern = atlantState.lastMask;
	        if (!('location' in depValue)) depValue.location = atlantState.lastPath;
	        if (!('referrer' in depValue)) depValue.referrer = atlantState.lastReferrer;
	        if (!('history' in depValue)) depValue.history = atlantState.lastHistory;
	      }

	      var stream = injectsGrabber.add(depName, depValue, injects, {});
	      stream = dependsName.add(depName, nameContainer, stream);
	      stream.params = (0, _extends4.default)({}, depValue);

	      stream.stats = stats;
	      stream.whenId = whenId;
	      stream.id = atlantState.activeStreamId.value;

	      return stream;
	    }.bind(void 0, depName, injects, nameContainer, stats, whenId));

	    State.state.lastIf = void 0;
	    State.state.lastDep = void 0;
	    State.state.lastDepName = depName;
	    State.state.lastOpId = whenId;
	    TopState.state.lastAction = depName;
	  })();

	  /* depends */
	  var _depends = function () {

	    var createDepStream = function createDepStream(stream, opId, depName, dep, injects, store, isAtom) {
	      var nameContainer = dependsName.init(depName, State.state);
	      var withs = withGrabber.init(State.state);

	      stream = stream.map(dependsName.add.bind(dependsName, depName, nameContainer)).map(withGrabber.add.bind(withGrabber, withs));

	      if ('function' !== typeof dep) {
	        stream = stream.map(function (opId, depName, dep, upstream) {
	          if (!upstream.depends) upstream.depends = {};
	          upstream.depends[depName] = dep;
	          upstream.opId = opId;
	          return upstream;
	        }.bind(void 0, opId, depName, dep));
	      } else {

	        stream = stream.flatMap(function (store, depName, dep, isAtom, upstream) {
	          // Execute the dependency
	          var scope = clientFuncs.createScope(upstream);
	          var where = upstream.with && 'value' in upstream.with ? upstream.with.value : s.id;
	          var atomParams = function (scope, where, updates) {
	            return where((0, _extends4.default)({}, scope, updates));
	          }.bind(this, scope, where);

	          var treatDep = s.compose(clientFuncs.convertPromiseD, s.promiseTryD);
	          var atomValue = atomParams();
	          return treatDep(dep)(atomValue).mapError(function (_) {
	            _log3.default.error('Network error: status === ', _.status);return _;
	          }).flatMap(function (upstream, atomParams, results) {
	            if ('function' === typeof results) results = results.bind(void 0, atomParams);

	            if (streamState.canBeIntercepted && s.isObject(results) && 'status' in results) {
	              var _ret = function () {
	                // @TODO status is hardcoded here, should use promises instead

	                var finish = _baseStreams2.default.bus();
	                var res = finish.take(1).flatMap(function (_) {
	                  return _;
	                });
	                var counter = _baseStreams2.default.bus();
	                var scan = counter.scan(atlantState.interceptors.length - 1, function (a, b) {
	                  return a - b;
	                });
	                scan.onValue(function (_) {
	                  if (_ === 0) {
	                    finish.push(results);
	                  }
	                });

	                atlantState.interceptors.forEach(function (name) {
	                  var finishes = atlantState.atlant.streams.get(name).push({ name: upstream.ref, value: results });
	                  finishes.then(function (_) {
	                    return counter.push(1);
	                  }).catch(function (_) {
	                    finish.push(Bacon.End());
	                  });
	                });

	                res.onValue(function (_) {
	                  return _;
	                });
	                return {
	                  v: res
	                };
	              }();

	              if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
	            } else {
	              return results;
	            }
	          }.bind(void 0, upstream, atomParams)).map(function (upstream, atomParams, store, depName, isAtom, atomValue, results) {
	            if (!upstream.depends) upstream.depends = {};
	            upstream.depends[depName] = results;

	            if (!upstream.atomIds) upstream.atomIds = [];

	            if ('undefined' !== typeof store && isAtom) {
	              upstream.atomParams = atomParams;
	              upstream.atomIds.push({ ref: upstream.ref, fn: atomParams, partProvider: store.partProvider, storeData: store.storeData });
	            }

	            return upstream;
	          }.bind(void 0, upstream, atomParams, store, depName, isAtom, atomValue));
	        }.bind(void 0, store, depName, dep, isAtom));
	      }

	      stream = stream // Treat dependency results
	      .map(function (depName, injects, upstream) {
	        // upstream.dependNames store name of all dependencies stored in upstream.
	        return injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);
	      }.bind(void 0, depName, injects)).mapError(function (_) {
	        _log3.default.error('Unhandled error', _);
	      });

	      stream = stream // Add select subscriptions
	      .map(function (depName, store, dep, isAtom, upstream) {
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

	            getValue = function (ref, atomParams, u) {
	              var params = atomParams.bind(this, u);
	              var res = dep()(params);
	              var result = (0, _extends4.default)({}, u, (0, _defineProperty3.default)({}, ref, res));
	              return result;
	            }.bind(void 0, upstream.ref, upstream.atomParams);

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
	      }.bind(void 0, depName, store, dep, isAtom));

	      return stream;
	    };

	    /**
	     * Join 2 streams into 1
	     */
	    var zippersJoin = function zippersJoin(prevDepName, currDepName, x, y) {
	      x.depends = (0, _extends4.default)({}, x.depends, y.depends);
	      x.injects = x.injects.concat(y.injects);
	      return x;
	    };

	    return function (dependency, dependsBehaviour, store, isAtom) {

	      var prefix = dependsBehaviour === types.Depends.continue ? '_and_' : '_';
	      var opId = (0, _lib.uniqueId)();
	      var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + (0, _lib.uniqueId)();

	      var lastOp = State.state.lastOp;

	      injectsGrabber.init(depName, State.state);

	      var thisOp = createDepStream(lastOp, opId, depName, dependency, State.state.lastInjects, store, isAtom);

	      State.state.lastDep = thisOp;
	      State.state.lastDepName = depName;
	      State.state.lastOp = thisOp;
	      State.state.lastOpId = opId;

	      return this;
	    };
	  }();

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
	    var ifId = (0, _lib.uniqueId)();

	    var depName = 'if_' + (0, _lib.uniqueId)();
	    var injects = injectsGrabber.init(depName, State.state);

	    var commonIf = State.state.lastOp.map(function (ifId, fn, condition, upstream) {
	      var scope = clientFuncs.createScope(upstream);
	      var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
	      upstream.check = checkCondition(scope);
	      return upstream;
	    }.bind(void 0, ifId, fn, condition));

	    var thisIf = commonIf.map(function (_) {
	      return (0, _extends4.default)({}, _);
	    }) // Copy
	    .filter(function (_) {
	      return boolTransform(_.check);
	    }).map(function (ifId, depName, injects, upstream) {
	      delete upstream.check;
	      var stream = injectsGrabber.add(depName, {}, injects, upstream);
	      return stream;
	    }.bind(void 0, ifId, depName, injects));

	    var thisElse = commonIf.map(function (_) {
	      return (0, _extends4.default)({}, _);
	    }) // Copy
	    .filter(function (_) {
	      return !boolTransform(_.check);
	    }).map(function (ifId, depName, injects, upstream) {
	      delete upstream.check;
	      var stream = injectsGrabber.add(depName, {}, injects, upstream);
	      return stream;
	    }.bind(void 0, ifId, depName, injects));

	    State.state.lastIf = thisIf;
	    State.state.lastElse = thisElse;
	    State.state.lastOp = State.state.lastIf;
	    State.state.lastOpId = ifId;
	    State.state.lastDep = void 0;

	    // Nulling for async
	    // State.state.lastAsync = void 0;
	    // State.state.lastBeforeAsync = thisIf;

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

	  var closeBlock = function closeBlock(renderOperation, viewName) {
	    if (void 0 !== renderOperation && renderOperation === types.RenderOperation.draw) return _this2;

	    if (void 0 !== State.state.lastIf) {

	      var dep = State.state.lastDep ? State.state.lastDep.merge(State.state.lastElse) : void 0;
	      var op = State.state.lastOp.merge(State.state.lastElse);

	      State.rollback();

	      State.state.lastDep = dep;
	      State.state.lastOp = op;

	      return _this2;
	    } else {
	      // State.state.lastOp.onValue(_ => console.log('did last op'));
	      return atlantStream;
	    }
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

	  var _render = function () {

	    return function (renderProvider, viewName, once, renderOperation) {
	      // /check
	      if (!State.state.lastOp) throw new Error('"render" should nest something');
	      if ('function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.refresh) {
	        _log3.default.log('Atlant.js: render first param should be function or URI', renderProvider, renderOperation);
	        throw new Error('Atlant.js: render first param should be function or URI');
	      }
	      s.type(viewName, 'string');
	      viewName = viewName || s.last(prefs.viewState);

	      if (!viewName) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');

	      var closeThisBlock = closeBlock.bind(this, renderOperation, viewName);

	      // ------end of check/

	      var subscribe = 'once' !== once ? true : false;
	      var renderId = (0, _lib.uniqueId)();

	      var renderStream = State.state.lastOp.flatMap(function (upstream) {
	        if (!upstream.isAction && upstream.id !== atlantState.activeStreamId.value) return Bacon.never(); // Obsolete streams invoked on previous route.

	        upstream.render = { id: renderId, renderProvider: renderProvider, viewName: viewName, renderOperation: renderOperation, type: renderOperation, subscribe: subscribe, parent: State.state.lastOpId };

	        return Bacon.fromPromise(renderView(upstream));
	      });

	      if (renderOperation === types.RenderOperation.draw) {
	        State.state.lastOp = renderStream;
	        State.state.lastOpId = renderId;
	      } else {
	        renderStream.onValue(function (_) {
	          return _;
	        });
	      }

	      return closeThisBlock();
	    };
	  }();

	  var _end = function _end() {

	    State.state.lastOp.onValue(function (_) {
	      return _;
	    }); // Subscribing to last item, else this .if() will be not executed - because of Bacon lazyness

	    return closeBlock.bind(this)();
	  };

	  var _update = function _update(dependsBehaviour, key) {
	    if (!State.state.lastOp) throw new Error('"update" should nest something');
	    s.type(key, 'string');

	    return _depends.bind(this)(function (key, id) {
	      if (key in atlantState.emitStreams) atlantState.emitStreams[key].push(id);else _log3.default.log('\nAtlant.js: Warning: event key' + key + ' is not defined');
	    }.bind(void 0, key), dependsBehaviour);

	    return this;
	  };

	  var _select = function _select(dependsBehaviour, isAtom, partName, storeName, dependsOn) {
	    if (!(storeName in atlantState.stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
	    if (!(partName in atlantState.stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
	    if (dependsOn && 'string' !== typeof dependsOn) throw new Error('atlant.js: dependsOn param should be a string');

	    return _depends.bind(this)(function (storeName, partName) {
	      return function (storeName, partName, id) {
	        var value;
	        try {
	          value = atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id());
	        } catch (e) {
	          _log3.default.error('select', partName, 'from', storeName, 'failed:', e.stack);
	          value = void 0;
	        }
	        return value;
	      }.bind(void 0, storeName, partName);
	    }.bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: atlantState.stores[storeName].bus, partProvider: atlantState.stores[storeName].parts[partName], storeData: atlantState.stores[storeName] }, isAtom);
	  };

	  var _log = function _log() {
	    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
	      args[_key] = arguments[_key];
	    }

	    return _depends.bind(this)(function (args, scope) {
	      try {
	        _log3.default.log.apply(_log3.default, args.concat(scope));
	        return void 0;
	      } catch (e) {
	        return void 0;
	      }
	    }.bind(void 0, args), types.Depends.continue);
	  };

	  var _push = function _push(isSync, stream) {
	    return _depends.bind(this)(function (scope) {
	      stream = atlantState.atlant.streams.get(stream);
	      if (isSync) stream.pushSync(scope);else stream.push(scope);
	      return void 0;
	    }, false, types.Depends.continue);
	  };

	  var _reject = function _reject() {
	    State.state.lastOp = State.state.lastOp.flatMap(function (_) {
	      streamState.resolveBus.push(_promise2.default.reject(_));
	      return Bacon.End(_);
	    });

	    return this;
	  };
	  var _resolve = function _resolve() {
	    State.state.lastOp = State.state.lastOp.flatMap(function (_) {
	      streamState.resolveBus.push(_promise2.default.resolve(_));
	      return Bacon.End(_);
	    });

	    return this;
	  };

	  // Create scope for prefixed method (currently .select(), .update(), .depends())
	  var _with = function _with(scopeProvider) {
	    var scopeProvider = typeof scopeProvider === 'undefined' ? function (_) {
	      return {};
	    } : scopeProvider;
	    if (typeof scopeProvider !== 'function') {
	      _log3.default.warn('param passed:', scopeProvider);
	      throw new Error('.with should receive a function');
	    }

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
	    return _depends.bind(this)(dependency, types.Depends.async);
	  };
	  /*
	   *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
	   * */
	  this.dep = function (dependency) {
	    return _depends.bind(this)(dependency, types.Depends.continue);
	  };
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
	  this.inject = _inject;
	  // Will accept the same scope as .and(), .render(), .if()
	  this.join = _join;
	  // Creates new branch if computated callback is true. Warning: the parent branch will be executed still. End it with .end().
	  this.if = _if.bind(this, s.id);
	  this.unless = _if.bind(this, s.negate);
	  this.end = _end;
	  this.resolveWhen = _resolveWhen;
	  /**
	   * Renders declaratins
	   */
	  // Prints the scope which will be passed to ".render()". Use params as prefixes for logged data.
	  this.log = _log;
	  // shortcode for .dep( _ => atlant.streams.get('streamName').push(_))
	  this.push = _push.bind(this, false);
	  this.pushSync = _push.bind(this, true);
	  this.resolve = _resolve.bind(this);
	  this.reject = _reject.bind(this);

	  /* Renders the view. first - render provider, second - view name. Draws immediatelly */
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

	  // This 2 methods actually not exists in stream. They can be called if streams is already declared, but then trryed to continue to configure
	  this.onValue = function () {
	    return _log3.default.error('You have lost at least 1 .end() in stream declaration:', fn);
	  };
	}

/***/ },
/* 14 */
/***/ function(module, exports) {

	module.exports = require("babel-runtime/helpers/defineProperty");

/***/ },
/* 15 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});

	var _create = __webpack_require__(1);

	var _create2 = _interopRequireDefault(_create);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var Bacon = __webpack_require__(12);

	var baseStreams = (0, _create2.default)(null);

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

	exports.default = baseStreams;

/***/ },
/* 16 */
/***/ function(module, exports) {

	'use strict';

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	/**
	 * Small polyfill for 'performance'.
	 */

	var performance = typeof window !== 'undefined' && (window.performance || window.msPerformance || window.webkitPerformance);

	if (!performance || !performance.now) {
	  performance = Date;
	}

	exports.default = performance;

/***/ },
/* 17 */
/***/ function(module, exports) {

	'use strict';

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	exports.getPathname = getPathname;
	exports.assign = assign;
	/**
	 * This is realization of location protocol for server side.
	 *
	 * */

	function getPathname() {
	  return this.pathname;
	}

	function assign(value) {
	  console.log('assign!:', value);
	}

/***/ },
/* 18 */
/***/ function(module, exports) {

	module.exports = require("lodash/isEqual");

/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});

	var _curry = __webpack_require__(10);

	var _curry2 = _interopRequireDefault(_curry);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var s = __webpack_require__(5);

	var unsubscribeView = (0, _curry2.default)(function (atlantState, viewName) {
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

	exports.default = unsubscribeView;

/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var StateType = function StateType(state) {
	    var newState = (0, _extends3.default)({ lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0 }, state);
	    return newState;
	};

	var StateClass = function StateClass() {
	    var states;

	    this.state = void 0;

	    this.first = function () {
	        states = [];
	        this.state = StateType();
	        states.push(this.state);
	        if (typeof window !== 'undefined') window.states = states;
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

/***/ },
/* 21 */
/***/ function(module, exports) {

	"use strict";

	var _Symbol = _Symbol;

	if (void 0 === _Symbol) _Symbol = function _Symbol(_) {
	    return _;
	};

	var RenderOperation = {
	    draw: _Symbol('draw'),
	    replace: _Symbol('replace'),
	    change: _Symbol('change'),
	    clear: _Symbol('clear'),
	    redirect: _Symbol('redirect'),
	    refresh: _Symbol('refresh'),
	    move: _Symbol('move')
	};

	// Matching enum for when.
	var Matching = {
	    stop: _Symbol('stop'),
	    continue: _Symbol('continue'),
	    once: _Symbol('once')
	};

	var WhenOrMatch = {
	    when: _Symbol('when'),
	    match: _Symbol('match')
	};

	// Depends enum
	var Depends = {
	    async: _Symbol('async'),
	    continue: _Symbol('continue')
	};

	var get = function get(_) {
	    // _.__proto__.contructor.name
	    return (((_ || { __proto__: void 0 }).__proto__ || { constructor: void 0 }).constructor || { name: void 0 }).name;
	};

	module.exports = {
	    RenderOperation: RenderOperation,
	    Depends: Depends,
	    WhenOrMatch: WhenOrMatch,
	    Matching: Matching,
	    get: get
	};

/***/ },
/* 22 */
/***/ function(module, exports) {

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
	        upstream.with = data;
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

/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	var _create = __webpack_require__(1);

	var _create2 = _interopRequireDefault(_create);

	var _promise = __webpack_require__(8);

	var _promise2 = _interopRequireDefault(_promise);

	var _curry = __webpack_require__(10);

	var _curry2 = _interopRequireDefault(_curry);

	var _log = __webpack_require__(4);

	var _log2 = _interopRequireDefault(_log);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var s = __webpack_require__(5),
	    Bacon = __webpack_require__(12);

	var catchError;

	var convertPromiseD = (0, _curry2.default)(function (promiseProvider, upstream) {
	    var promise = promiseProvider(upstream);
	    if (s.isPromise(promise)) {
	        promise = promise.catch(function (e) {
	            if (e.stack) {
	                catchError(e);
	            }
	            return _promise2.default.reject(e);
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

	    return s.reduce(fn, (0, _create2.default)(null), upstream.refs);
	};

	var getScopeDataFromStream = function getScopeDataFromStream(upstream) {
	    var scope = (0, _create2.default)(null);
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

	    var injects = s.compose(s.reduce(function (acc, _) {
	        return (0, _extends3.default)({}, acc, _);
	    }, {}), s.dot('injects'))(upstream);
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
	                return inject.expression((0, _extends3.default)({}, refsData, injectsData.object));
	            });
	        }
	    };

	    var takeAccessor = s.flipDot(upstream);
	    var takeFunction = function takeFunction(fn) {
	        return fn.apply();
	    };
	    var fullfil = s.map(s.compose(s.ifelse(s.typeOf('string'), takeAccessor, takeFunction), formatInjects));

	    injectsData.object = fullfil(injects);
	    var data = injectsData.object;
	    var joinsData = fullfil(joins);

	    data = (0, _extends3.default)({}, refsData, upstream.params, data, joinsData);

	    return data;
	};

	var catchError = function catchError(e) {
	    if (e && e.stack) {
	        _log2.default.error(e.message, e.stack);
	    } else {
	        _log2.default.error('Unknown error');
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

/***/ },
/* 24 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	var _lib = __webpack_require__(5);

	var _debounce = __webpack_require__(25);

	var _debounce2 = _interopRequireDefault(_debounce);

	var _curry = __webpack_require__(10);

	var _curry2 = _interopRequireDefault(_curry);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	// This component holds state of Scroll
	var scrollState = {};

	var utils = function () {
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
	        parseURL: (0, _lib.memoize)(function (url) {
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
	        })
	        /**
	         *  URL query parser for old links to post and story
	         * */
	        , parseSearch: (0, _lib.memoize)(function (search) {
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
	}();

	utils.isIE = function () {
	    if (typeof window === 'undefined') return false;

	    var isIE11 = navigator.userAgent.indexOf(".NET") > -1;
	    var isIELess11 = navigator.appVersion.indexOf("MSIE") > -1;
	    var isMobileIE = navigator.userAgent.indexOf('IEMobile') > -1;
	    return isIE11 || isIELess11 || isMobileIE;
	};

	utils.getScrollState = function () {
	    return scrollState;
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

	    var state = { url: url, referrer: window.location.href, forceRouteChange: redirectForce };

	    scrollState[url] = 0;

	    setTimeout(function () {
	        return history.pushState(state, null, url);
	    }, 0); // setTimeout turns on safari optimizations and we didn't see the crazy jumps.
	};

	utils.clearState = function () {
	    var state = (0, _extends3.default)({}, window.history.state);
	    delete state.forceRouteChange;
	    delete state.referrer;
	    delete state.url;
	    window.history.replaceState(state, null);
	};

	utils.saveScroll = (0, _debounce2.default)(function (event) {
	    scrollState[window.location.pathname] = window.pageYOffset;
	}, 100);

	utils.body = typeof document !== 'undefined' ? document.querySelector('body') : void 0;
	utils.html = typeof document !== 'undefined' ? document.documentElement : void 0;

	utils.getPageHeight = function height() {
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
	    return (0, _lib.head)(masks.filter(function (mask) {
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
	utils.matchRoute = (0, _curry2.default)((0, _lib.memoize)(function (path, mask) {
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
	        var searches = utils.parseSearch(parsed.search); // add search params
	        dst = (0, _extends3.default)({}, searches, dst);
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

/***/ },
/* 25 */
/***/ function(module, exports) {

	module.exports = require("lodash/debounce");

/***/ },
/* 26 */
/***/ function(module, exports) {

	module.exports = require("lodash/uniq");

/***/ },
/* 27 */
/***/ function(module, exports) {

	"use strict";

	module.exports = new Date().getTime();

/***/ },
/* 28 */
/***/ function(module, exports) {

	'use strict';

	module.exports = '0.4.80';

/***/ },
/* 29 */
/***/ function(module, exports) {

	'use strict';

	/*
	 * Very simple render. uses viewName as attribute name of attribute and installs string inside
	 */
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

/***/ },
/* 30 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var _promise = __webpack_require__(8);

	var _promise2 = _interopRequireDefault(_promise);

	var _keys = __webpack_require__(2);

	var _keys2 = _interopRequireDefault(_keys);

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	var _log = __webpack_require__(4);

	var _log2 = _interopRequireDefault(_log);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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

	                    if (Array.isArray(views[name])) return views[name][0]((0, _extends3.default)({}, this.props, views[name][1]));else return views[name];
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
	        return (0, _keys2.default)(views);
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
	    var selectors = {};

	    this.render = function (viewProvider, upstream, activeStreamId, name, scope) {
	        _log2.default.time('rendering view ' + name);

	        state.getOrCreate(name); // Always should be first to ensure that it is a simple div to lower influence of React.renderToStaticMarkup

	        if (upstream.isAction || upstream.id === activeStreamId.value) {
	            // Checking, should we continue or this stream already obsolete.
	            state.set(name, [viewProvider, scope]);
	        }

	        var instance = state.getThis(name);

	        var error = false;

	        var update = function update() {
	            try {
	                instance.forceUpdate();
	            } catch (e) {
	                _log2.default.error(e.stack);
	                error = true;
	            }
	        };

	        if (!error && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) {
	            update();
	        }

	        _log2.default.timeEnd('rendering view ' + name);

	        return error ? _promise2.default.reject() : _promise2.default.resolve(state.getInstance(name));
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
	            selectors[name] = selector;
	        } catch (e) {
	            _log2.default.error(e.message, e.stack);
	            React.unmountComponentAtNode(element);
	        }
	    };

	    /* Return ready string representation
	     * options parameter can be used to control what you will get.
	     * */
	    this.stringify = function (name, options) {
	        if (options && options.static) return React.renderToStaticMarkup(state.getInstance(name));else return React.renderToString(state.getInstance(name));
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
	        selectors = [];
	        state.destroy();
	    };
	};

	module.exports = Render;

/***/ },
/* 31 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var _stringify = __webpack_require__(7);

	var _stringify2 = _interopRequireDefault(_stringify);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var Storage = {
	  storage: typeof window !== 'undefined' && window.localStorage,
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
	    this.storage.setItem(storeName, (0, _stringify2.default)(newState));
	    // console.timeEnd('persist'+ storeName)
	    return void 0;
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

/***/ },
/* 32 */
/***/ function(module, exports) {

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
	var wrapHistoryApi = function wrapHistoryApi(window) {
	    var pushState = window.history.pushState;
	    var replaceState = window.history.replaceState;

	    var tryState = function tryState(params) {
	        try {
	            return pushState.apply(window.history, params);
	        } catch (e) {
	            console.error("Can't push state:", e);
	            if (params[2]) {
	                window.location.assign(params[2]); // Fallback to location Api
	            } else {
	                    window.location.replace(window.location.toString()); // Fallback to location Api
	                }
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

	    window.history.replaceState = function () {
	        for (var _len = arguments.length, params = Array(_len), _key = 0; _key < _len; _key++) {
	            params[_key] = arguments[_key];
	        }

	        try {
	            return replaceState.apply(window.history, params);
	        } catch (e) {
	            console.error('Can\'t replace state:', e.stack, 'Fallback to location Api');
	            if (params[2]) {
	                window.location.replace(params[2]); // Fallback to location Api
	            } else {
	                    window.location.replace(window.location.toString()); // Fallback to location Api
	                }
	            return void 0;
	        }
	    };
	    window.history.replaceState.overloaded = true;
	};

	module.exports = { wrapHistoryApi: wrapHistoryApi };

/***/ },
/* 33 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var _extends2 = __webpack_require__(3);

	var _extends3 = _interopRequireDefault(_extends2);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var utils = __webpack_require__(24),
	    s = __webpack_require__(5);

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
	    var searches = utils.parseSearch(parsed.search);
	    return (0, _extends3.default)({}, searches, params);
	};

	var _parseAll = function _parseAll(path, masks) {
	    if (!path || !masks || 0 === masks.length) return {};

	    return utils.addSlashes(masks).map(_parse.bind(void 0, path)).reduce(function (acc, i) {
	        return (0, _extends3.default)({}, acc, i);
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
	    test: _test
	    // testAll :: path -> [mask] -> Bool
	    , testAll: _testAll,
	    return: _return,
	    returnAll: _returnAll
	    // parse :: path -> mask -> {params}
	    , parse: _parse
	    // parseAll :: path -> [mask] -> {params}
	    , parseAll: _parseAll,
	    setTitle: _setTitle,
	    getTitle: _getTitle,
	    unblockScroll: _unblockScroll,
	    blockScroll: _blockScroll
	};

/***/ }
/******/ ]);
import { Console as console, server, error, render, action } from './utils/log';
import { AtlantStreamConstructor, AtlantStream } from './inc/stream';
import baseStreams from './inc/base-streams';
import { uniqueId } from './utils/lib';
import { unsubscribeView } from './views';
import uniq from 'lodash/uniq';
import { getLocation, assign } from './utils/location';

import * as location from './utils/location';
import * as history from './utils/history';
import * as events from './events';

import { map, convertGetters } from './utils/iterables';

const build = require('./atlant-build');
const version = require('./atlant-version');
const s = require('./utils/lib');
const utils = require('./utils/utils');
const reactRender = require('./renders/react');
const simpleRender = require('./renders/simple');
const Bacon = require('baconjs');
const StateClass = require('./inc/state');
const Storage = require('./inc/storage');
const types = require('./inc/types');
const wrapHistoryApi = require('./inc/wrap-history-api.js').wrapHistoryApi;
const tools = require('./inc/tools');

// @TODO: fast switching generate console.error.
// @TODO: #hashes are ignored
// @TODO: check(true) to check only this view params (by specifically set fields or somehow)
// @TODO: depCache to check only this dep params (by specifically set fields or somehow)


function Atlant() {
  const atlant = this;

  // Preferences set by user
  const prefs = {
    parentOf: {},
    checkInjectsEquality: true,
    skipRoutes: [],  // This routes will be skipped in StreamRoutes
    viewState: ['root'],
    on: { renderEnd: void 0 }, // callback which will be called on finishing when rendering
    scrollElement() { return typeof document !== 'undefined' ? utils.body : void 0; },
    defaultScrollToTop: true,
    pre: void 0,
  };

  // Contains state shared across atlant
  const atlantState = {
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
    routes: [],  // Routes collected
    devStreams: {
      renderEndStream: baseStreams.bus(),
      otherwiseStream: baseStreams.bus(),
      publishStream: baseStreams.bus(), // Here we can put init things.
      errorStream: baseStreams.bus(),
      onDestroyStream: baseStreams.bus(),
    },
    whens: {}, // storing whens
    titleStore: { value: '' },
    viewSubscriptionsUnsubscribe: {},
    viewSubscriptions: {},
    streams: {},
    fns: {},
    interceptors: [],
    atlant: this,
    scrollState: utils.getScrollState(),
    context: typeof window !== 'undefined' ? window : {},
    callbacks: {
      onUpdate: {},
    },
    register: false, // are tricky promises registered
  };

  // Patching goTo for further use
  const safeGoToCopy = utils.goTo;
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
  baseStreams.onValue(atlantState.devStreams.renderEndStream, s.baconTryD(_ => server::console.log('render end:')));

  const TopState = new StateClass(); // State which up to when

  const routeChangedStream = atlantState.devStreams.publishStream
    .merge(Bacon.fromBinder(function (sink) {
      if (typeof window === 'undefined') return;
      const routeChanged = function routeChanged(sink, event) {
        try {
          // Using state from event. At this point the history.state is stil old.
          let state = event instanceof PopStateEvent ? event.state : event.detail.state; // CustomEvent has details and state inside. PopStateEvent has just state inside.

          // On pushstate event the context::getLocation() will give url of previous route.
          // Otherwise on popstate context.getLocation() return current URI.
          let path = event instanceof PopStateEvent ? atlantState.context::getLocation() : event.detail.url;

          path = utils.rebuildURL(path);

          let finishScroll;
          let minHeightBody;
          const loader = document.querySelector('.root-loader');
          const trySetScroll = function (scrollTop) {
            if (scrollTop !== 'number') return;
            atlant.state.scrollRestoration = true;

            const bodyHeight = utils.getPageHeight() + window.innerHeight;

            if (!('scrollRestoration' in history)) loader.style.visibility = 'visible';

            if (bodyHeight < scrollTop) {
              utils.body.style.minHeight = minHeightBody = `${scrollTop + window.innerHeight}px`;
            }

            finishScroll = ((scrollTop, installedHeight) => {
              // utils.unblockScroll();
              atlant.state.scrollRestoration = false;
              window.scrollTo(0, scrollTop);
              if (!('scrollRestoration' in history)) loader.style.visibility = null;
              window.setTimeout(() => {
                if (utils.body.style.minHeight === installedHeight) {
                  utils.body.style.minHeight = null;
                }
              }, 100);
            }).bind(void 0, scrollTop, minHeightBody);

            if (!window.history.pushState.overloaded) wrapHistoryApi(window);
          };

          const savedScrollTop = atlantState.scrollState[path];
          if (event instanceof PopStateEvent) {
            trySetScroll(savedScrollTop);
          } else if (0 === savedScrollTop) {
            finishScroll = (() => {
              if (!('scrollRestoration' in history)) loader.style.visibility = null;
            });
          }

          if (path !== atlantState.lastPath || (event && event.detail && event.detail.state && event.detail.state.forceRouteChange)) {
            // if (!('scrollRestoration' in history)) { utils.unblockScroll();  } // removing fixed just before rendering
            sink({
              path: path
                , referrer: atlantState.lastPath
                , history: event,
              // ,postponed: postponedCleanup
            });
          }
          if (finishScroll) { requestAnimationFrame(finishScroll); }
        } catch (e) {
          atlant.state.scrollRestoration = false;
          if (!('scrollRestoration' in history)) loader.style.visibility = null;
          utils.body.style.minHeight = null;
          // utils.unblockScroll();
          error::console.error(e.message, e.stack);
        }
      }.bind(void 0, sink);
      window.addEventListener('popstate', routeChanged);
      window.addEventListener('pushstate', routeChanged);
      window.addEventListener('scroll', utils.saveScroll);

      if (!('scrollRestoration' in history)) {
        let loader = document.querySelector('.root-loader');
        if (loader) loader.style.visibility = null;
        utils.body.style.minHeight = null;

        // utils.unblockScroll();
      }

      utils.saveScroll();
    }))
    .scan(void 0, function (previous, current) {
      if ((previous && previous.hasOwnProperty('published')) || current.hasOwnProperty('published')) {
        current.published = true;
      }
      return current;
    })
    .filter(function (upstream) { return upstream && upstream.hasOwnProperty('published'); })
    .map(function (upstream) {
      let stream;
      if (upstream.path) { // get from sink
        stream = upstream;
      } else { // get from published
        const path = utils.rebuildURL(atlantState.context::getLocation());
        let referrer = utils.rebuildURL(utils.getReferrer());

        stream = {
          path: path
            , referrer: referrer
            , history: upstream.history,
        };
      }

      return stream;
    })
    .map(function (upstream) {
      let stream = { ...upstream };

      // Storing here the data for actions.
      atlantState.lastPath = stream.path;
      atlantState.lastReferrer = stream.referrer;
      atlantState.lastHistory = stream.history;
      atlantState.lastMask = void 0;

      stream.id = uniqueId();
      atlantState.activeStreamId.value = stream.id;

      return stream;
    });

  atlantState.rootStream = Bacon.fromBinder(function (sink) {
    baseStreams.onValue(routeChangedStream, function (sink, _) {
      if (prefs.pre) prefs.pre();
      sink(_);
    }.bind(void 0, sink));
  })
    .takeUntil(baseStreams.destructorStream);


  atlantState.rootStream
    .onValue(s.tryD(function (upstream) {
      const skipRoutes = prefs.skipRoutes.map(_ => utils.matchRoute(upstream.path, _) || utils.matchRoute(utils.getPossiblePath(upstream.path), _)).filter(_ => !!_);
      if (skipRoutes.length) {
        atlantState.devStreams.renderEndStream.push({ httpStatus: 404, httpMessage: 'Resource is forbidden' });
        return;
      }

      const _whens = Object.keys(atlantState.whens)
        .map(_ => atlantState.whens[_])
        .map(when => {
          let route = when.route.masks // masks
            .map(_ => ({ mask: _, params: utils.matchRoute(upstream.path, _) }))
            .filter(_ => _.params);

          route = s.head(route);
          if (route) {
            when.params = route.params;
            when.mask = route.mask;
          } else {
            when.params = void 0;
            when.mask = void 0;
          }

          return when;
        })
        .filter(_ => _.params)
        .reduce((acc, i) => {  // filtering all when's after matched one
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

      const matched = _whens.items.map(whenData => {
        if (whenData.isMatch && types.Matching.once === whenData.matchingBehaviour && whenData.isDone) return void 0;
        whenData.isDone = true;

        // Storing here the data for actions.
        atlantState.lastMask = whenData.route.masks;

        let depData = {
          location: upstream.path,
          mask: whenData.mask,
          pattern: whenData.mask,
          masks: whenData.route.masks,
          referrer: upstream.referrer,
          history: upstream.history,
          params: whenData.params,
        };
        depData = { ...depData, ...whenData.params };
        atlantState.whenData = depData;

        if (whenData.when.type === types.WhenOrMatch.when && (typeof whenData.scrollToTop.value === 'function' ? whenData.scrollToTop.value(depData) : whenData.scrollToTop.value) && typeof window !== 'undefined') {
          window.scrollTo(0, 0);
        }

        const stream = whenData.route.fn instanceof AtlantStreamConstructor ? whenData.route.fn : whenData.route.fn(); // @TODO should be a AtlantStreamConstructor.

        if (stream instanceof AtlantStreamConstructor) { error::console.warn('Failed stream source:', whenData.route.fn); throw new Error('You should end the AtlantStreamConstructor. Try add more .end()\'s '); }
        if (!stream || !(stream instanceof AtlantStream)) { error::console.warn('Failed stream source:', whenData.route.fn); throw new Error('Unknown return from AtlantStreamConstructor function, should be AtlantStream', whenData.route.fn); }

        const { promise, resolve } = s.deferred();
        stream.then(_ => (server::console.log('end stream for', whenData.mask), resolve(_)));

        if ('pushSync' in stream) {
          stream.pushSync(depData);
        } else {
          stream.push(depData);
        }

        return promise;
      }).filter(_ => _);

      server::console.log('waiting for ', matched.length, 'end streams');
      Promise.all(matched).then(_ => atlantState.devStreams.renderEndStream.push(_));


      if (!_whens.items.length || !_whens.found) {  // Only matches or nothing at all
        atlantState.devStreams.otherwiseStream.push(upstream);
        return;
      }
    }));


  // Base

  // When

  const _when = (function () {

    return function (masks, fn, matchingBehaviour, whenType) {
      TopState.first();

      if (-1 !== masks.indexOf('&&')) throw new Error('&& declarations not yet supported.');
      masks = masks
        .split('||')
        .map(s.trim)
        .filter(function (_) { return _.length; });

      if (!masks.length) throw new Error('At least one route mask should be specified.');

      if ('function' !== typeof fn) { error::console.warn('Failed stream source:', fn); throw new Error('Make use "fn = _ => AtlantStream" as second parameter of atlant.when() for ' + masks); }

      TopState.state.lastMasks = masks;

      if (masks.filter(function (mask) { return '*' === mask;}).length && whenType === types.WhenOrMatch.when) { throw new Error('Atlant.js: Error! You using atlant.when("*") which is prohibited. For astericks use atlant.match("*")'); }

      let whenId = uniqueId();
      let name = (whenType === types.WhenOrMatch.match) ? 'match' : 'when';
      let sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
      let createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));
      name = name + createNameFromMasks(masks) + uniqueId();

      // Allows attaching injects to .when().
      let scrollToTop = { value: whenType === types.WhenOrMatch.match ? false : true };
      TopState.state.scrollToTop = scrollToTop;

      if (types.WhenOrMatch.when === whenType) // Informational thing
        masks.forEach(_ => atlantState.routes.push(utils.stripLastSlash(_)));

      atlantState.whens[name] = {
        when: { id: whenId, type: whenType },
        route: { masks, fn },
        isFinally: false,
        isMatch: types.WhenOrMatch.match === whenType,
        scrollToTop,
        matchingBehaviour,
      };

      return this;
    };
  })();

  let _pre = function (fn) {
    prefs.pre = fn;
    return this;
  };

  let _defaultScrollToTop = function (value) {
    this.prefs.defaultScrollToTop = value;

    return this;
  };

  let _scrollToTop = function (value) {
    if (void 0 !== TopState.state.scrollToTop) {
      TopState.state.scrollToTop.value = value;
    }

    return this;
  };



  let _check = function (isCheck) {
    if ('undefined' === typeof isCheck)
      throw new Error('Atlant.js: check require boolean parameter.');


    prefs.checkInjectsEquality = isCheck;
    return this;
  };

  // Not ordered commands

  // Function: skip
  // Skip: Sets the list of route masks which should be skipped by Atlant.
  // @param path
  // @returns atlant
  // @private
  let _skip = function (...paths) {
    s.map(_ => prefs.skipRoutes.push(_), paths);
    return this;
  };

  //  Use this method to publish routes when
  let _publish = function (path) {
    if (path) s.type(path, 'string');
    atlantState.devStreams.publishStream.push({ published: true, path: path });
  };

  let _set = function (view) {
    s.type(view, 'string');

    prefs.viewState.push(view);
    return this;
  };

  let _unset = function () {
    if (prefs.viewState.length > 1) prefs.viewState.pop();
    return this;
  };


  let _use = function (render) {
    s.type(render, 'object');
    // @TODO: check render for internal structure
    if (prefs.render) throw new Error('You can specify render only once.');

    prefs.render = render;
    return this;
  };

  let _scrollElement = function (elementFn) {
    s.type(elementFn, 'function');
    prefs.scrollElement = elementFn;
    return this;
  };


  let _attach = function (viewName, selector) {
    s.type(viewName, 'string');
    s.type(selector, 'string');

    prefs.render.attach(viewName, selector);

    return this;
  };

  let _stringify = function (viewName, options) {
    return prefs.render.stringify(viewName, options);
  };

  let _await = function (shouldAWait) {
    utils.goTo = safeGoToCopy.bind(utils, shouldAWait);
    return this;
  };

  const _setConsoleProfile = function _setConsoleProfile(profile) {
    error.active = profile.error;
    server.active = profile.server;
    render.active = profile.render;
    action.active = profile.action;

    return this;
  };


  let _redirectTo = function (url) {
    return utils.goTo(url);
  };

  let _moveTo = function (url) {
    atlantState.context::assign(url);
  };

  let _store = function (storeName) {
    TopState.first();
    TopState.state.lastStoreName = storeName;

    if (!(storeName in atlantState.stores)) atlantState.stores[storeName] = {
      _constructor: void 0,
      updater: void 0,
      value: Storage.load(storeName) || void 0,
      staticValue: Storage.load(storeName) || void 0,
      updaters: {},
      parts: {},
    };

    return this;
  };

  let _serialize = function (serializeProvider) {
    let storeName = TopState.state.lastStoreName;
    if (!storeName) { throw new Error('.serialize() should be after .store()'); }
    if ('function' === typeof atlantState.stores[storeName]._serialize) { throw new Error('Serialize already implemented in store ', storeName);}
    if ('function' !== typeof serializeProvider) { throw new Error('Serialize should be a function for ', storeName);}

    atlantState.stores[storeName]._serialize = serializeProvider;

    return this;
  };

  let _constructor = function (constructorProvider) {
    let storeName = TopState.state.lastStoreName;
    if (!storeName) { throw new Error('.constructor() should be after .store()'); }
    if ('function' === typeof atlantState.stores[storeName]._constructor) { throw new Error('Constructor already implemented in store ', storeName);}
    if ('function' !== typeof constructorProvider) { throw new Error('Constructor should be a function for ', storeName);}

    atlantState.stores[storeName]._constructor = _ => Storage.load(storeName) || constructorProvider();
    atlantState.stores[storeName].changes = baseStreams.bus();
    atlantState.stores[storeName].staticValue = atlantState.stores[storeName]._constructor();
    atlantState.stores[storeName].bus = atlantState.stores[storeName].changes.scan(atlantState.stores[storeName].staticValue, function (storeName, state, updater) {
      let newState = updater(s.copy(state)); // Copying here is necessary for successfull equality checks: else this checks will return always true
      atlantState.stores[storeName].staticValue = newState;

      if (typeof window !== 'undefined') window.stores[storeName] = newState;

      {
        let serialize = atlantState.stores[storeName]._serialize;
        if (serialize) setTimeout(function () {Storage.persist(storeName, serialize(newState));}, 1000);
      }

      return newState;
    }.bind(void 0, storeName)).skipDuplicates().toEventStream();

    baseStreams.onValue(atlantState.stores[storeName].bus, function () {});

    return this;
  };

  let setUpdater = function (storeName, updaterName, updater) {
    if (updaterName in atlantState.stores[storeName].updaters) { throw new Error('Cannot reimplement updater ', updaterName, ' in store ', storeName);}
    if (!(updaterName in atlantState.emitStreams)) atlantState.emitStreams[updaterName] = baseStreams.bus();

    atlantState.stores[storeName].updaters[updaterName] = updater;

    baseStreams.onValue(atlantState.emitStreams[updaterName], function (storeName, updater, updaterName, scope) { // scope is the value of .update().with(scope) what was pushed in
      atlantState.stores[storeName].changes.push(function (scope, updater, storeName, updaterName, state) {  // state is the value which passed through atom
        try {
          return updater(state, scope);
        } catch (e) {
          error::console.warn('source', updater);
          error::console.error('Warning: updater "' + updaterName + '" failed on store "' + storeName + '"', e);
          return state;
        }
      }.bind(void 0, scope, updater, storeName, updaterName));
    }.bind(void 0, storeName, updater, updaterName));
  };

  let _updater = function (updaterNames, updater) {
    let storeName = TopState.state.lastStoreName;

    if (!storeName) { throw new Error('.updater() should be after .store()'); }
    if ('function' !== typeof atlantState.stores[storeName]._constructor) { throw new Error('Constructor not implemented in store ', storeName);}

    updaterNames = Array.isArray(updaterNames) ? updaterNames : [updaterNames];

    updaterNames.forEach(_ => setUpdater(storeName, _, updater));

    return this;
  };

  let _part = function (partName, partProvider) {
    let storeName = TopState.state.lastStoreName;

    if (!storeName) { throw new Error('.part() should be after .store()'); }
    if ('function' !== typeof atlantState.stores[storeName]._constructor) { throw new Error('Constructor not implemented in store ', storeName);}
    if (partName in atlantState.stores[storeName].parts) { throw new Error('Cannot reimplement part ', partName, ' in store ', storeName);}

    atlantState.stores[storeName].parts[partName] = partProvider;

    return this;
  };

  let _setInterval = s.setInterval;

  let _setTimeout = s.setTimeout;

  let _destroy = function () {
    Object.keys(atlantState.viewData).forEach(function (viewName) { // Destroying view scopes cache
      atlantState.viewData[viewName] = void 0;
      server::console.log('clear view cache', viewName);
    });

    prefs.render.destroy(); // Destroying view cache

    baseStreams.destroy();

    // s = l = simpleRender = reactRender = utils = Bacon = interfaces = StateClass = safeGoToCopy = null;// @TODO more

    atlantState.devStreams.onDestroyStream.push();
  };

  var _update = function(key, id){
    if (key in atlantState.emitStreams) atlantState.emitStreams[key].push(id);
    else console.log(`\nAtlant.js: Warning: event key ${key} is not defined`);
  }

  const _register = promises => {
    if (!atlantState.register) {
      Promise.all(promises)
        .then(_ => (server::console.log('Tricky promises resolved.'), _))
        .then(_ => atlantState.devStreams.renderEndStream.push({ trickyData: _ }));
    } else {
      error::console.error('Tricky promises already registered!');
    }

    atlantState.register = true;
    return this;
  };

  // Atlant API

  // Creates route stream by route expression
  // @param mask - route expression /endpoint/:param1/:param2/endpoint2
  //
  this.when = function (masks, fn) { return _when.bind(this)(masks, fn, types.Matching.continue, types.WhenOrMatch.when); };

  this.pre = _pre.bind(this);

  //
  // Creates route stream by route expression which will prevent other matches after.
  // @param mask - route expression /endpoint/:param1/:param2/endpoint2
  this.lastWhen = function (masks, fn) { return _when.bind(this)(masks, fn, types.Matching.stop, types.WhenOrMatch.when); };

  // Match declare a route which will be ignored by .otherwise()
  this.match = function (masks, fn) { return _when.bind(this)(masks, fn, types.Matching.continue, types.WhenOrMatch.match); };

  // Match declare a route which will be ignored by .otherwise()
  this.matchOnce = function (masks, fn) { return _when.bind(this)(masks, fn, types.Matching.once, types.WhenOrMatch.match); };

  // declare branch that will work if no routes declared by .when() are matched. Routes declared by .match() will be ignored even if they matched.
  this.otherwise = function (fn) { atlant.streams.get.call(this, 'otherwise', fn, true); return this; };

  // Creates stream which will be called when render error is happend
  this.error = function (fn) { atlant.streams.get.call(this, 'error', fn, true); return this; };


  // Creates stream which will be called when status!= undefined is happend @TODO change this to : when reject is happend
  // this.catch = _catch;

  // Creates custom stream which accepts Bacon stream
  // "otherwise", "error", "interceptor-n" are reserved names
  this.action = function (actionName, fn) { atlant.streams.get.call(this, actionName, fn, true); return this; };

  // creates branch which can destruct all what declared by .when() or .match()
  // this.finally =  _finally; // was removed, not reimplemented yet

  // side-effect
  this.interceptor = function (fn) {
    let interceptorName = 'interceptor-' + uniqueId();
    atlantState.interceptors.push(interceptorName);

    try {
      atlant.streams.get.call(this, interceptorName, fn, false);
    } catch (e) {
      delete atlantState.interceptors[atlantState.interceptors.indexOf(interceptorName)];
    }

    return this;
  };

  this.register = _register;

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
  this.setConsoleProfile = _setConsoleProfile;
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
  // set default context. It could be either a "window" for browser either a { request, response } pair on server
  this.setContext = context => do { atlantState.context = context; this; };


  // Commands!
  // Use this when you finished declaring routes and want to start routing. Can be used for drawing another route at current route without redirect (accepts url).
  this.publish = _publish;

  // Commands allows perform manipulations of atlant immediatelly.

  // Here you can manipulate views.
  this.views = Object.create(null);
  // set component value into view
  // this.put :: viewName :: component
  this.views.put = function (viewName, component) {
    return prefs.render.put(viewName, component);
  };

  this.views.break = function (viewName) {
    atlantState::unsubscribeView(viewName);
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
  // atlant.events.onDestory Called everytime when route/action is rendered.
  // atlant.events.onDestroy Called when destroy initiated.
  this.events = events::map(_ => _.bind(atlantState));

  // Stores!
  this.stores = {}
  this.stores.update = _update;


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
  this.isServer = function isServer() { return typeof window === 'undefined'; };
  this.isBrowser = function isServer() { return typeof window !== 'undefined'; };

  // This functions can be used either on server and on client
  this.utils = tools; // @TODO: rename to 'tools'
  this.utils.setTitle = atlantState.titleStore::this.utils.setTitle;
  this.utils.getTitle = atlantState.titleStore::this.utils.getTitle;

  this.utils.history = history::map(_ => _.bind(atlantState.context))::convertGetters();
  this.utils.location = location::map(_ => _.bind(atlantState.context))::convertGetters();

  this.state = {};



  this.data = {
    get routes() { return uniq(atlantState.routes); },    // @TODO better not to double it for info :)
  };
  // This command will immediatelly redirect to param url
  this.goTo = _redirectTo;
  // The alias of goTo
  this.redirectTo = _redirectTo;
  // Will hard redirect to param url (page will be reloaded by browser)
  this.moveTo = _moveTo;


  // Create stream.
  this.stream = (name) => new AtlantStreamConstructor(name, atlantState, { ...prefs, canBeIntercepted: true });

  // Create stream which cannot be intercepted
  this.interceptorStream = (name) => new AtlantStreamConstructor(name, atlantState, { ...prefs, canBeIntercepted: false });

  this.streams = {
    get: (name, fn) => {
      if ('string' !== typeof name) {
        if (fn) error::console.warn('Failed stream source:', fn);
        throw new Error('Provide AtlantStream name.');
      }

      if (!name) {
        if (fn) error::console.warn('Failed stream source:', fn);
        throw new Error('Atlant.js stream name is not provided!');
      }

      let stream = atlantState.streams[name];

      if (fn && stream && stream.isAttached()) {
        error::console.warn('source:', fn);
        throw new Error(`Several actions with 1 name is not supported. The ${name} is not unique.`);
      }

      if (!stream) {
        stream = new AtlantStream(name, atlantState);
        atlantState.streams[name] = stream;
      }

      if (fn && stream && !stream.isAttached()) {
        stream.attach(fn);
      }

      return stream;
    },
  };


  return this;
}

if (typeof window !== 'undefined') window.Atlant = Atlant;
module.exports = Atlant;

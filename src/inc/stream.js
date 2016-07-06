import { Console as console, server, error, action, render, client } from '../utils/log';
import baseStreams from './base-streams';
import Bacon from 'baconjs';
import s from '../utils/lib';
import types from './types';
import StateClass from './state';
import interfaces from './interfaces';
import clientFuncs from './clientFuncs';
import utils from '../utils/utils';
import { getPathname, assign } from '../utils/location';
import isEqual from 'lodash/isEqual';
import { unsubscribeView } from '../views';
import { uniqueId } from '../utils/lib';

export function AtlantStream(name, atlantState, from = 'fromUser') {
  const bus = baseStreams.bus();
  const resolveBus = baseStreams.bus();
  let fn;

  /*
    * subscriptions
  */
  const subscribers = []; // fn's which subscribed to stream.
  const unsubscribe = (index) => delete subscribers[index];
  this.then = fn => { // Register subscribers
    const index = subscribers.push(fn);
    return unsubscribe.bind(this, index);
  };
  resolveBus.onValue(scope => {
    subscribers.forEach(_ => _(scope));
  });

  /* workers */
  let waiters = []; // here pushes which come before stream has fn attached.
  const worker = depValue => {
    const { promise, resolve } = s.deferred();

    if (typeof depValue === 'undefined') {
      depValue = {};
    }
    if (typeof depValue === 'object') {
      depValue = { ...{ params: atlantState.whenData }, ...depValue };
    }

    const userStream = fn();

    if (userStream instanceof AtlantStreamConstructor) { error::console.warn('Failed stream source:', fn); throw new Error('You should end the AtlantStreamConstructor to create AtlantStream. Try add more .end()\'s '); }
    if (!userStream || !(userStream instanceof AtlantStream)) { error::console.warn('Failed stream source:', fn); throw new Error('Constructor function should return AtlantStream.'); }

    userStream.then(resolve);

    action::console.log('action', name, depValue);
    userStream.push(depValue); // AtlantStream

    return promise;
  };

  this.isAttached = () => !!fn;

  let push = (isSync, args) => {  // If it is constructor stream, then it postpones pushes till fn generator will be attached.
    let { promise, resolve, reject } = s.deferred();

    let workerSync = () => worker(args).then(resolve).catch(reject);
    let workerAsync = () => s.onNextEventLoop(() => worker(args)).then(resolve).catch(reject);
    let pusher = isSync ? workerSync : workerAsync;

    if (!this.isAttached()) { action::console.log('action:', name, 'is not ready!'); waiters.push(pusher); }
    else { pusher(); }

    return promise;
  };

  const pushBus = (isSync, args) => {
    const syncCall = () => bus.push(args);
    const asyncCall = () => setTimeout(() => bus.push(args)); // We don'y neet to return a promise here
    const pusher = isSync ? syncCall : asyncCall;
    return pusher();
  };

  this.attach = _ => {
    if (!this.isAttached() && _ && typeof _ === 'function') {
      fn = _;
      waiters.forEach(_ => _());
      waiters = [];
    }
  };

  this.pushSync = (args) => from === 'fromUser' ? push(true, args) : pushBus(true, args);
  this.push = (args) => from === 'fromUser' ? push(false, args) : pushBus(false, args);

  this._exportBus = () => bus; // @TODO deprecated
  this._exportResolveBus = () => resolveBus; // @TODO deprecated

  return this;
}

export function AtlantStreamConstructor(name, atlantState, prefs) {
  const context = atlantState.context;

  var TopState = new StateClass(); // State which up to when
  var State = new StateClass(); // State which up to any last conditional: when, if

  var injectsGrabber = new interfaces.injectsGrabber();
  var dependsName = new interfaces.dependsName();
  var withGrabber = new interfaces.withGrabber();
  var id = uniqueId();

  let atlantStream = new AtlantStream(name, false, atlantState, 'fromConstructor');

  const streamState = {
    name,
    root: atlantStream._exportBus(),
    resolveBus: atlantStream._exportResolveBus(),
    canBeIntercepted: true,
    resolveWhen: () => true,
    resolved: false,
  };

  const resolveStatus = (scope) => {
    if (!streamState.resolved && streamState.resolveWhen && streamState.resolveWhen(scope)) {
      streamState.resolved = true;
      streamState.resolveBus.push(scope);
    }
  };


  var renderView = function () {

    let renderIntoView = function (viewProvider, upstream, viewName, render, scope) {
      var renderD = s.promiseD(render); // decorating with promise
      return renderD(viewProvider, upstream, atlantState.activeStreamId, viewName, scope)
                .then(function (_) {
                  var stream = { ...upstream };

                  if (!_.code || 'notActiveStream' !== _.code) {
                    stream.render.component = _;  // pass rendered component. it stale hold before streams get zipped.
                  }

                  return stream;
                });
    };

    let subscribeView = function (viewName, doRenderIntoView, scope, upstream) {

      if (!('chains' in upstream) || !Object.keys(upstream.chains).length) return;  // If no store is selected for this view, then we should not subscribe on anything.

      let keys = Object.keys(upstream.chains);

      atlantState.viewSubscriptions[viewName] = Bacon
                .mergeAll(keys.map(store => atlantState.stores[store].bus));

      atlantState.viewSubscriptionsUnsubscribe[viewName] = atlantState.viewSubscriptions[viewName].onValue(function (upstream, viewName, scope, doRenderIntoView, value) {
        value = Object.keys(upstream.chains)
                    .map(_ => upstream.chains[_])
                    .reduce((acc, i) => acc.concat(i), [])
                    .reduce((acc, i) => acc.concat(i), [])
                    .reduce((acc, i) => ({ ...acc, ...i() }), {});

        let data = { ...scope, ...value };

        if (!isEqual(data, atlantState.viewData[viewName])) {
          scope = data;
          atlantState.viewData[viewName] = data;
          doRenderIntoView(data); // Here we using scope updated from store!

          resolveStatus(data);
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
        let render;

        if (types.RenderOperation.refresh === upstream.render.renderOperation) {
          const pathname = context::getPathname();
          utils.goTo(pathname, void 0, true);

          return Promise.resolve(upstream);
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

          return Promise.resolve(upstream);
        } else if (types.RenderOperation.move === upstream.render.renderOperation) {
          if (typeof viewProvider === 'function') {
            context::assign(viewProvider(scope));
          } else {
            context::assign(viewProvider);
          }

          return Promise.resolve(upstream);
        } else if (types.RenderOperation.replace === upstream.render.renderOperation) {

          var path = s.apply(viewProvider, scope);
          atlantState.lastPath = path;
          utils.replace(path); // just rename url


          return Promise.resolve(upstream);
        } else if (types.RenderOperation.change === upstream.render.renderOperation) {
          var path = s.apply(viewProvider, scope);
          atlantState.lastReferrer = atlantState.lastPath;
          atlantState.lastPath = path;
          utils.change(path); // Push url to history without atlant to react on new value.


          return Promise.resolve(upstream);
        } else {

          if (types.RenderOperation.draw === upstream.render.renderOperation) {
            render = prefs.render.render.bind(prefs.render);
          } else if (types.RenderOperation.clear === upstream.render.renderOperation) {
            render = prefs.render.clear.bind(prefs.render);
          }

          var doRenderIntoView = renderIntoView.bind(void 0, viewProvider, upstream, viewName, render);

          atlantState.viewData[viewName] = scope;

          unsubscribeView.bind(atlantState)(viewName);

          var renderResult = doRenderIntoView(scope).then(() => {
            if (upstream.render.subscribe && types.RenderOperation.clear !== upstream.render.renderOperation)  // Subscriber only after real render - Bacon evaluates subscriber immediately
              subscribeView(viewName, doRenderIntoView, scope, upstream);

            resolveStatus(scope);

            upstream.render.component = renderResult;
            return upstream;
          })
          .catch((e) => { error::console.error(e.message, e.stack); atlantState.devStreams.errorStream.push(); return Bacon.End(); });


          return renderResult;

        }

      } catch (e) {
        error::console.error(e.message, e.stack);
      }

    };
  }();


  (function () {
    var sanitizeName = s.compose(s.replace(/:/g, 'By_'), s.replace(/\//g, '_'));
    var createNameFromMasks = s.compose(s.reduce(s.plus, ''), s.map(sanitizeName));

    TopState.first();
    State.first();

    var whenId = uniqueId();
    var depName = uniqueId();
    var injects = injectsGrabber.init(depName, State.state);
    var nameContainer = dependsName.init(depName, State.state);
    var stats = TopState.state.stats;

    State.state.lastOp = streamState.root
            .map(function (depName, injects, nameContainer, stats, whenId, depValue) {
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
              stream.params = { ...depValue };

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

  }());

    /* depends */
  var _depends = function () {

    var createDepStream = function (stream, opId, depName, dep, injects, store, isAtom) {
      var nameContainer = dependsName.init(depName, State.state);
      var withs = withGrabber.init(State.state);

      stream = stream
                .map(dependsName.add.bind(dependsName, depName, nameContainer))
                .map(withGrabber.add.bind(withGrabber, withs));

      if ('function' !== typeof dep) {
        stream = stream
                    .map(function (opId, depName, dep, upstream) {
                      if (!upstream.depends) upstream.depends = {};
                      upstream.depends[depName] = dep;
                      upstream.opId = opId;
                      return upstream;
                    }.bind(void 0, opId, depName, dep));
      } else {

        stream = stream
                    .flatMap(function (store, depName, dep, isAtom, upstream) {  // Execute the dependency
                      var scope = clientFuncs.createScope(upstream);
                      var where = (upstream.with && 'value' in upstream.with) ? upstream.with.value : s.id;
                      var atomParams = ((scope, where, updates) => where({ ...scope, ...updates })).bind(this, scope, where);

                      var treatDep = s.compose(clientFuncs.convertPromiseD, s.promiseTryD);
                      var atomValue = atomParams();
                      return treatDep(dep)(atomValue)
                            .mapError(function (_) { error::console.error('Network error: status === ', _.status); return _;})
                            .flatMap(function (upstream, atomParams, results) {
                              if ('function' === typeof results) results = results.bind(void 0, atomParams);

                              if (streamState.canBeIntercepted && s.isObject(results) && 'status' in results) { // @TODO status is hardcoded here, should use promises instead

                                const finish = baseStreams.bus();
                                const res = finish.take(1).flatMap(_ => _);
                                const counter = baseStreams.bus();
                                const scan = counter.scan(atlantState.interceptors.length - 1, (a, b) => a - b);
                                scan.onValue(_ => { if (_ === 0) {finish.push(results);} });

                                atlantState.interceptors
                                        .forEach(name => {
                                          let finishes = atlantState.atlant.streams.get(name).push({ name: upstream.ref, value: results });
                                          finishes.then(_ => counter.push(1)).catch(_ => {
                                            finish.push(Bacon.End());
                                          });
                                        });

                                res.onValue(_ => _);
                                return res;
                              } else {
                                return results;
                              }

                            }.bind(void 0, upstream, atomParams))
                            .map(function (upstream, atomParams, store, depName, isAtom, atomValue, results) {
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
                .map(function (depName, injects, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.
                  return injectsGrabber.add(depName, upstream.depends[depName], injects, upstream);
                }.bind(void 0, depName, injects))
                .mapError(function (_) { error::console.error('Unhandled error', _);});

      stream = stream // Add select subscriptions
                .map(function (depName, store, dep, isAtom, upstream) { // upstream.dependNames store name of all dependencies stored in upstream.

                    // if( !('ref' in upstream) || 'undefined' === typeof upstream.ref || '' === upstream.ref  ) {
                    //     throw new Error('Every select should have name.')
                    // }

                  if ('undefined' !== typeof upstream.ref && 'undefined' !== typeof store && isAtom) {
                    if (!('chains' in upstream)) upstream.chains = {};
                    if (!(store.storeName in upstream.chains)) upstream.chains[store.storeName] = [];
                    if (!('select' in upstream)) upstream.select = {};

                    if ('undefined' !== typeof store.dependsOn && '' !== store.dependsOn && !(store.dependsOn in upstream.select)) throw new Error(`Select "${upstream.ref}"" cannot depend on unknown select: "${store.dependsOn}"`);

                    var getValue = function (ref, atomParams, u) {
                      let params = atomParams.bind(this, u);
                      let res = dep()(params);
                      let result = { ...u, ...{ [ref]: res } };
                      return result;
                    }.bind(void 0, upstream.ref, upstream.atomParams);

                    let dependence = 'undefined' !== typeof store.dependsOn && '' !== store.dependsOn && store.dependsOn in upstream.select ? upstream.select[store.dependsOn] : void 0; // dependence is just a function which return value

                    if (!dependence && upstream.lastSelect && 'undefined' === typeof store.dependsOn && '' !== store.dependsOn) dependence = upstream.select[upstream.lastSelect];

                    let f = dependence ? _ => getValue(dependence(_)) : getValue;

                    upstream.lastSelect = upstream.ref;
                    upstream.chains[store.storeName].push(f);
                    upstream.select[upstream.ref] = f;

                  }

                  return upstream;
                }.bind(void 0, depName, store, dep, isAtom));


      return stream;
    };

        /**
         * Join 2 streams into 1
         */
    var zippersJoin = function (prevDepName, currDepName, x, y) {
      x.depends = { ...x.depends, ...y.depends };
      x.injects = x.injects.concat(y.injects);
      return x;
    };

    return function (dependency, dependsBehaviour, store, isAtom) {

      var prefix = (dependsBehaviour === types.Depends.continue) ? '_and_' : '_';
      var opId = uniqueId();
      var depName = (State.state.lastDepName ? State.state.lastDepName + prefix : 'depend_') + uniqueId();

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
  var _if = function (boolTransform, condition) {
    s.type(boolTransform, 'function');
    s.type(condition, 'function');

    var fn = s.compose(boolTransform, condition);
    var fnNegate = s.compose(s.negate, boolTransform, condition);

    if (! State.state.lastOp) { throw new Error('"if" should nest something.'); }

    State.divide();
    var ifId = uniqueId();

    var depName = 'if_' + uniqueId();
    var injects = injectsGrabber.init(depName, State.state);

    var commonIf = State.state.lastOp
            .map(function (ifId, fn, condition, upstream) {
              var scope = clientFuncs.createScope(upstream);
              var checkCondition = s.compose(clientFuncs.applyScopeD, s.tryD)(fn);
              upstream.check = checkCondition(scope);
              return upstream;
            }.bind(void 0, ifId, fn, condition));

    var thisIf = commonIf
            .map(_ => ({ ..._ })) // Copy
            .filter(_ => boolTransform(_.check))
            .map(function (ifId, depName, injects, upstream) {
              delete upstream.check;
              var stream = injectsGrabber.add(depName, {}, injects, upstream);
              return stream;
            }.bind(void 0, ifId, depName, injects));

    var thisElse = commonIf
            .map(_ => ({ ..._ })) // Copy
            .filter(_ => !boolTransform(_.check))
            .map(function (ifId, depName, injects, upstream) {
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



  var _inject = function (key, expression) {
    s.type(key, 'string');
    if (! State.state.lastDepName) throw new Error('.inject should follow .depends');

    State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression };

    return this;
  };

  var _join = function (key, expression) {
    s.type(key, 'string');
    State.state.lastInjects[key] = { name: State.state.lastDepName, expression: expression, injects: Array.prototype.slice.apply(State.state.lastInjects) };

    return this;
  };

  const closeBlock = (renderOperation) => {
    if (void 0 !== renderOperation && renderOperation === types.RenderOperation.draw) return this;

    const finishedStream = void 0 === State.state.lastIf;
    if (!finishedStream) {
      const dep = State.state.lastDep ? State.state.lastDep.merge(State.state.lastElse) : void 0;
      const op = State.state.lastOp.merge(State.state.lastElse);

      State.rollback();

      State.state.lastDep = dep;
      State.state.lastOp = op;
    } else {
      State.state.lastOp.onValue(upstream => {
        const scope = clientFuncs.createScope(clientFuncs.getScopeDataFromStream(upstream));
        resolveStatus(scope);
      });
    }

    return !finishedStream ? this : atlantStream;
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

  const _render = (function () {

    return function (renderProvider, viewName, once, renderOperation) {
            // /check
      if (! State.state.lastOp) throw new Error('"render" should nest something');
      if ('function' !== typeof renderProvider && 'string' !== typeof renderProvider && renderOperation != types.RenderOperation.refresh) {
        error::console.log('Atlant.js: render first param should be function or URI', renderProvider, renderOperation);
        throw new Error('Atlant.js: render first param should be function or URI');
      }
      s.type(viewName, 'string');
      viewName = viewName || s.last(prefs.viewState);

      if (!viewName) throw new Error('Default render name is not provided. Use set( {view: \'viewId\' }) to go through. ');

      const closeThisBlock = closeBlock.bind(this, renderOperation);
      // ------end of check/

      const subscribe = once !== 'once';
      const renderId = uniqueId();


      const renderStream = State.state.lastOp.flatMap(upstream => {
        if (!upstream.isAction && upstream.id !== atlantState.activeStreamId.value) return Bacon.never(); // Obsolete streams invoked on previous route.

        upstream.render = { id: renderId, renderProvider, viewName, renderOperation, type: renderOperation, subscribe, parent: State.state.lastOpId };

        return Bacon.fromPromise(renderView(upstream));
      });

      if (renderOperation === types.RenderOperation.draw) {
        State.state.lastOp = renderStream;
        State.state.lastOpId = renderId;
      } else {
        renderStream.onValue(_ => _);
      }

      return closeThisBlock();
    };
  })();


  var _end = function () {

    State.state.lastOp.onValue(_ => _); // Subscribing to last item, else this .if() will be not executed - because of Bacon lazyness

    return closeBlock.bind(this)();
  };

  var _update = function (dependsBehaviour, key) {
    if (! State.state.lastOp) throw new Error('"update" should nest something');
    s.type(key, 'string');

    return _depends.bind(this)(function (key, id) {
      if (key in atlantState.emitStreams) atlantState.emitStreams[key].push(id);
      else error::console.log('\nAtlant.js: Warning: event key' + key + ' is not defined');
    }.bind(void 0, key), dependsBehaviour);


    return this;
  };

  var _select = function (dependsBehaviour, isAtom, partName, storeName, dependsOn) {
    if (!(storeName in atlantState.stores)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(', storeName + ')');
    if (!(partName in atlantState.stores[storeName].parts)) throw new Error('atlant.js: store ' + storeName + ' is not defined. Use atlant.store(' + storeName + ')');
    if (dependsOn && 'string' !== typeof dependsOn) throw new Error('atlant.js: dependsOn param should be a string');

    return _depends.bind(this)(function (storeName, partName) {
      return function (storeName, partName, id) {
        var value;
        try {
          value = atlantState.stores[storeName].parts[partName](atlantState.stores[storeName].staticValue, id());
        } catch (e) {
          error::console.error('select', partName, 'from', storeName, 'failed:', e.message, e.stack);
          value = void 0;
        }
        return value;
      }.bind(void 0, storeName, partName);
    }.bind(void 0, storeName, partName), dependsBehaviour, { storeName: storeName, dependsOn: dependsOn, partName: partName, bus: atlantState.stores[storeName].bus, partProvider: atlantState.stores[storeName].parts[partName], storeData: atlantState.stores[storeName] }, isAtom);
  };

  var _log = function (...args) {
    return _depends.bind(this)(function (args, scope) {
      try {
        client::console.log(...args, ...scope);
        return void 0;
      } catch (e) {
        return void 0;
      }
    }.bind(void 0, args), types.Depends.continue);
  };

  var _push = function (isSync, stream) {
    return _depends.bind(this)(function (scope) {
      stream = atlantState.atlant.streams.get(stream);
      if (isSync) stream.pushSync(scope); else stream.push(scope);
      return void 0;
    }, false, types.Depends.continue);
  };

  var _reject = function () {
    State.state.lastOp = State.state.lastOp.flatMap(_ => {
      streamState.resolveBus.push(Promise.reject(_));
      return Bacon.End(_);
    });

    return this;
  };
  var _resolve = function () {
    State.state.lastOp = State.state.lastOp.flatMap(_ => {
      streamState.resolveBus.push(Promise.resolve(_));
      return Bacon.End(_);
    });

    return this;
  };


    // Create scope for prefixed method (currently .select(), .update(), .depends())
  var _with = function (scopeProvider) {
    var scopeProvider = (typeof(scopeProvider) === 'undefined') ? _ => ({}) : scopeProvider;
    if (typeof scopeProvider !== 'function') {
      error::console.warn('param passed:', scopeProvider);
      throw new Error('.with should receive a function');
    }

    if (State.state.lastWith && 'value' in State.state.lastWith) throw new Error('too many .with() after scope receiver');

    withGrabber.tail(scopeProvider, State.state);

    return this;
  };


  var _as = function (name) {
    dependsName.tailFill(name, State.state);
    return this;
  };

  var _resolveWhen = function (truthfulFn) {
    streamState.resolveWhen = truthfulFn;
    return this;
  };

    /**
     *  Asyncroniously run the dependency.
     */
  this.async = function (dependency) { return _depends.bind(this)(dependency, types.Depends.async); };
    /*
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     * */
  this.dep = function (dependency) { return _depends.bind(this)(dependency, types.Depends.continue); };
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
  this.draw = function draw(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'always', types.RenderOperation.draw);};

    /* Do not subscribe selects on view */
  this.drawOnce = function drawOnce(renderProvider, viewName) {return _render.bind(this)(renderProvider, viewName, 'once', types.RenderOperation.draw);};

    /* clears default or provided viewName */
  this.clear = function clear(viewName) {return _render.bind(this)(() => void 0, viewName, 'once', types.RenderOperation.clear);};

    // Soft atlant-inside redirect.
  this.redirect = function redirect(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.redirect);};
    // Soft atlant-inside refresh.
  this.refresh = function refresh(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.refresh);};
    //  Fake redirect. Atlant will just change URL but routes will not be restarted. Referrer stays the same.
  this.replace = function replace(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.replace);};
    // Same as replace, but store the replaced url in html5 location history. Referrer also changed.
  this.change = function change(replaceProvider) {return _render.bind(this)(replaceProvider, void 0, 'once', types.RenderOperation.change);};
    // Force redirect event to current route
    // this.force = _.force;
    // Redirects using location.assign - the page *WILL* be reloaded instead of soft atlant-inside redirect.
  this.move = function move(redirectProvider) {return _render.bind(this)(redirectProvider, void 0, 'once', types.RenderOperation.move);};

    // This 2 methods actually not exists in stream. They can be called if streams is already declared, but then trryed to continue to configure
  this.onValue = () => error::console.error('You have lost at least 1 .end() in stream declaration:', fn);
}


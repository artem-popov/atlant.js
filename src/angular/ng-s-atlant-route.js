/**
 *
 * @TODO: fast switching generate console.error.
 */
angular.module('atlant', []).service('$atlantRoute', ['$http', '$templateCache', '$compile', '$s', '$location', '$rootScope', '$timeout', '$controller', 'CacheService', '$atlantParams', function($http, $templateCache, $compile, $s, $location, $rootScope, $timeout, $controller, CacheService, $atlantParams) {

    // Initialization specific vars
    var isRenderApplyed  // Is Render already set OnValue for renders
        ,defaultViewId = 'streamView'
        ,skipRoutes = []  // This routes will be skipped in StreamRoutes
        ,params = [] // Route mask params parsed
        ,routes = []  // Routes collected
        ,streams = {} // Streams collected
        ,renderNames = []
        ,parentOf = {}
        ,viewNames = [];

//    var log = $s.nop;
    var log = console.log.bind(console, '--');

    var state
        ,states
        ,oldStates = [];

    var StateType = function(state) {
        $.extend( this, {lastWhen: void 0, lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastWhenName: void 0, lastInjects: void 0} );
        $.extend( this, state );
    };

    var State = function(){
        return {
            first: function(){
                states = [];
                state = new StateType();
                states.push(state);
            },
            divide: function() {
                state = new StateType(state);
                state.lastDep = void 0;

                states.push(state);
            },
            rollback: function() {
                var oldState = states.pop();
                oldStates.push(oldState);
                state = states[states.length-1];
            },
            print: function(message, state) {
                //log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
            }
        }
    }();

    // Streams specific vars
    var viewRendered = {}  // Flag that this view is rendered. Stops other streams to perform render then.
        ,dependViews = {}  // Set the views hirearchy. Both for streams and for render.
        ,defaultRoutes = {}
        ,isLastWasMatched = false // Allow lastWhen to stop other when's execution/
        ,renders = {}  // Each view has it's own item in "renders" ender which is a merge of renders into this view. OnValue will catch once for lastRender.view
 		,lastRedirect
        ,viewReady = {}

    // Render specific vars
    var lastScopes = {}   // Each viewId has it's own scope - used on render.
        ,dataByView = {}  // This data will be injected into scope when render occurs.
        ,scopeAttached = {}; // Registering view templateUrl to know that this url was rendered in that view. Stops rendering this URL in this view then.


    // Matching enum for when.
    var Matching = {
        stop: _.uniqueId(),
        continue: _.uniqueId()
    }

    // Depends enum
    var Depends = {
        parallel: _.uniqueId(),
        continue: _.uniqueId()
    }

    // Save/restore state of the stream.
    var Upstream = function() {
        var data = {};
        return {
            // join :: containerName -> propertyName -> upstream
            join: $s.curry( function(containerName, propertyName, upstream) {

                if ( containerName && propertyName ) {
                    if ( ! data[containerName] ) data[containerName] = {};
                    if ( ! data[containerName][propertyName] ) data[containerName][propertyName] = {};

                    data[containerName][propertyName] = upstream;
                }

                if ( ! containerName && ! propertyName ){
                    $s.merge(data, upstream);
                }

                if ( containerName && ! propertyName ){
                    if ( ! data[containerName] ) data[containerName] = {};
                    $s.merge(data[containerName], upstream);
                }

                if (containerName,propertyName && data[containerName][propertyName] && upstream !== data[containerName][propertyName]) {
                    var e = new Error('E001: Upstream join equality test failed! ');
                    console.error(e.stack)
                    throw e;
                }

                upstream = data;
                data = {};
                return upstream;
            })
            // fmap :: fn -> obj
            ,fmap: $s.curry(function(fn, obj) {
                data = fn.call(this, data, obj);
                return data;
            })
            ,clear: function(upstream){
                data = {};
                return upstream;
            }
        }
    };

    var utils = function() {
        return {
            /**
             * Redirect to the other path using $location
             * @param upstream
             * @returns {*}
             */
            redirectTo: function(url, params) {
                $location.path(utils.interpolate(url, params)).replace();
            }
            /**
             * @returns interpolation of the redirect path with the parametrs
             */
            ,interpolate: function(string, params) {
                var result = [];
                forEach((string||'').split(':'), function(segment, i) {
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
            }
            ,getPossiblePath: function (route) {
                return (route[route.length-1] == '/')
                    ? route.substr(0, route.length-1)
                    : route +'/';
            }
            /**
             *  URL query parser for old links to post and story
             * */
            ,parseURLQuery: function(){
                var query = location.search.substring(1);
                var params = query.split('&');
                var result = {};
                for(var i = 0; i < params.length; i++){
                    var item = params[i].split('=');
                    result[item[0]] = item[1];
                }
                return result;
            }

            /**
             * Main function for parse new path
             * @param path
             * @returns {bool} false | {*}
             */
            ,matchRoutes: function(path, routes, matchingBehaviour){
                matchingBehaviour = matchingBehaviour || Matching.continue;
                var routes =  routes
                    .map(function(route) {
                        return matchRouteLast( path, matchingBehaviour, route );
                    })
                    .filter($s.notEmpty)

                return $s.head(routes);
            }
        };
    }();

    var clientFuncs = function() {

        var convertPromiseD = $s.curry(function(promiseProvider, upstream) {
            return Bacon.fromPromise( promiseProvider( upstream ) );
        });

        var safeD = function(fn){
            return function() {
                try {
                    return fn.apply(this, arguments);
                } catch(e) {
                    console.error('"User function wasn\'t successefull: ', e.message, e.stack);
                    return Bacon.Error('Exception');;
                }
            }
        };

        // Provides last depend data as param for .if command
        var injectParamsD = $s.curry(function(lastDepName, fn) {
            return function(upstream) {
                console.log('in provider:', upstream, lastDepName);
                var args = [{ params:upstream.params, mask:upstream.route.mask }];

                console.log('ub provider:', lastDepName );

                if (lastDepName && upstream.depends && upstream.depends[lastDepName]) {
                    args.push( upstream.depends[lastDepName] );
                }

                args.push( upstream );
                return fn.apply(this, args);
            }
        });

        return { convertPromiseD:convertPromiseD, safeD: safeD, injectParamsD:injectParamsD };
    }();


    var add = function(name, value) {
        if (exports.streams[name]) throw new Error('This stream is already defined!:', name);
        state.lastName = name;
        streams[name] = { name:name, stream: value }
    }


    /* Exports */
    var exports = {
        streams:streams
        ,info:[]
        ,routes:{}
    }

    /* Helpers */


    var assignRenders = function(){

        var templateRetrieve = $s.curry( function(templateUrl, upstream) {
            return $http
                .get(templateUrl, {cache: $templateCache})
                .then(function(response) { return response.data; });
        });

        var renderStopper = function(upstream) {
            if ( viewRendered[upstream.render.viewId] || isRedirected ) return false;
            else viewRendered[upstream.render.viewId] = true;
            return true;
        };

        var assignRender = function(stream) {
            var ups = Upstream();

            // Registering render for view.
            stream
                .filter( renderStopper )
                .map( ups.fmap(_.extend) )
                .flatMap( function(upstream) {
                    if (upstream.render.templateUrl) {
                        return clientFuncs.convertPromiseD( templateRetrieve( upstream.render.templateUrl ), upstream );
                    } else {
                        return Bacon.constant(upstream.render.template);
                    }
                })
                .mapError(function() { console.error((new Error('Error rendering template.')).stack); return ''; })
                .map(ups.join('render', 'template'))
                .onValue( renderStream );
        };

        var assignLastRedirect = function() {
            if (!lastRedirect) return;
            lastRedirect.onValue(function(upstream){
                log('Redirecting!', utils.interpolate(upstream.redirectUrl, upstream.params));
                isRedirected = true;
                utils.redirectTo(upstream.redirectUrl, upstream.params);
                $location.url( utils.interpolate() );
            });
        };

        var yC = function(x,y) {
            return x.id === y.id ? y : false;
        };

        var getOrderedStreams = function(name, stream) {
            if (! parentOf[name] ) return stream;

            log('View dependentions:', name, JSON.stringify(stream), 'are depends on', parentOf[name], JSON.stringify(renders[parentOf[name]]));
            var parentStream = viewReady[parentOf[name]];
            stream = Bacon.combineWith(yC, parentStream, stream).changes().filter(function(x){return x});

            return stream;
        };

        return function() {
            if ( isRenderApplyed ) return;

            isRenderApplyed = true;
            for(var viewId in renders) {
                var orderedStreams = $s.map(getOrderedStreams.bind(this, viewId), renders[viewId])
                $s.map(assignRender, orderedStreams);
            }

            for(var viewId in defaultRoutes) {
                assignRender(defaultRoutes[viewId]);
            }

            assignLastRedirect();
        };
    }();

	/* Render Stream */
    var renderStream = function(){

        var simpleType = function(data, key) {
            return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
        }
        var injectDependsIntoScope = function ( scope, upstream ) {
            var viewName =  upstream.render.viewId;

            var injects = $s.compose( $s.reduce($s.extend, {}), $s.dot('injects') )(upstream);
            var data = $s.map( $s.parse(upstream), injects );
            var saveData4Childs = $s.set(viewName, dataByView)(data);

            $s.extend( data, dataByView[parentOf[viewName]])
            console.log('datax:',upstream,data);

            $s.extend( scope, data );
            Object.keys(data).filter(simpleType.bind(this, data)).map(function(key){
                Object.defineProperty(scope, key, {
                    get: function () {
                        return $s.parse( upstream, injects[key] );
                    }
                });
            });
        };
        var destroyScope = function (scope) {
            if (scope) {
                scope.$destroy();
                scope = null;
            }
        };
        var clearView = function (view, scope) {
            view.html('');
            if (scope) {
                destroyScope(scope);
            }
        }

        return function(upstream) {
            var controller = upstream.render.controller;
            var templateUrl = upstream.render.templateUrl;
            var viewId = upstream.render.viewId;

            if ( ! upstream.render.template ) { // Just clearing view
                var view = $( '#' + viewId );
                clearView(view, void 0);
                return;
            }

            $timeout( function(){
                if ( scopeAttached[viewId] !== templateUrl ) { // stopping re-rendering the same tpl again and again

                    var lastScope = $rootScope.$new();
                    injectDependsIntoScope(lastScope, upstream);
                    var view = $( '#' + viewId );

//                    log('lastscope is:',lastScopes[templateUrl]);
                    clearView(view, lastScopes[templateUrl]);
                    view.html(upstream.render.template);
                    var link = $compile(view.contents());

                    try {                   // Unsafe app code inside ;)
                        if (controller) {
                            controller = $controller( controller, {$scope:lastScope});
                            view.children().data('$ngControllerController', controller);
                        }
                        link(lastScope);
                    } catch(e) {
                        console.error('Controller cannot be instantiated:', e.message, e.stack);
                    }

                    lastScopes[templateUrl] = lastScope;
                    scopeAttached[viewId] = templateUrl; // mask this tpl as rendered.
                    log('rendering!:',controller, 'with', templateUrl, 'into', viewId, view[0] );
                    log('render data is: ', upstream);
                    log('scope is: ', lastScope);
                } else {
                    log('Caching template because it is already rendered in the view: "', templateUrl, '" in "', viewId, '"');
                }

                log('SIGNAL:',upstream.render.viewId, 'pushed signal', upstream );
                if (viewReady[upstream.render.viewId])
                    viewReady[upstream.render.viewId].push(upstream);

                $rootScope.$apply();
            });

        };

    }();




	/* matchRouteLast */
    var matchRouteLast = function(){
        var matchRouteWrapper = function(path, route){
            var match = matchRoute(path, route.mask);

            return match ? { params:match, route:route } : null;
        }

        /**
         * Pure Matching function
         * @param on - current locatin url
         * @param when - compare mask
         * @returns (*)
         */
        var matchRoute = $s.memoize( function(path, mask){ //@TODO add real match, now works only for routes without params
            // TODO(i): this code is convoluted and inefficient, we should construct the route matching
            //   regex only once and then reuse it

            var negate = '!' == mask[0];
            if (negate) {
                mask = mask.slice(1, mask.length-1);
            }

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

            var match = path.match(new RegExp(regex));
            if (match) {
                forEach(params, function(name, index) {
                    dst[name] = match[index + 1];
                });

                dst = $.extend(utils.parseURLQuery(), dst);
            } else if( negate ) {
                dst = {}
                match = true;
            }

            return match ? dst  : null;
        });

        return $s.curry( function(path, matchingBehaviour, route) {
            if ('string' === typeof route) route = {mask:route};
            var match = matchRouteWrapper(path, route);
            if (match && Matching.stop === matchingBehaviour) {
                isLastWasMatched = true;
            }
            return match;
        });
    }();


    /**
     * When
     */
    var when = function(){
        var sanitizeName = $s.compose( $s.replace(/:/g, 'By_'), $s.replace(/\//g,'_') );
        var maskValidation = function(mask) {
            if ('string' != typeof mask) throw new Error('Route mask should be string.');
            if ('' == mask) throw new Error('Route mask should not be empty.');
            return mask;
        }
        var createNameFromMasks = $s.compose( $s.reduce($s.plus, ''), $s.map(sanitizeName), $s.map(maskValidation));

        return function(masks, matchingBehaviour) {
            if ( 0 === masks.length ) throw new Error('At least one route mask should be specified.');
            State.first();

            var name = createNameFromMasks(masks);

            var ups = Upstream();


            masks.forEach(function(mask) {
                $s.push({mask: mask}, routes);
                $s.push({mask: utils.getPossiblePath(mask), redirectTo: mask}, routes);
            });

            state.lastWhen = rootStream
                .map(ups.fmap(_.extend))
                .map( function(upstream) {
                    return masks
                        .filter(function() { return ! isLastWasMatched; }) // do not let stream go further if other is already matched.
                        .map( matchRouteLast( upstream.path, matchingBehaviour ) )
                        .filter( $s.notEmpty )                              // empty params means fails of route identity.
                } )
                .map($s.head)
                .filter( $s.notEmpty )
                .map(ups.join(void 0, void 0))

            state.lastWhen
                .onValue( function(upstream) {
                    if( upstream.redirectTo) {  // If the route is a "bad clone", then redirecting.
                        log('----------------Redirect:',upstream);
                        utils.redirectTo(upstream.redirectTo, upstream.params);
                    }
                });


            state.lastWhen
                .onValue(function(upstream) {
                    log('Matched route!', upstream);
                    exports.info = upstream;
                    $.extend( $atlantParams, upstream.params );
                });

            state.lastIf = void 0;
            state.lastDep = void 0;
            state.lastDepName = void 0;
            state.lastWhenName = name;
            state.lastOp = state.lastWhen;

            State.print('___When:'+JSON.stringify(masks), state);

            add(state.lastWhenName, state.lastWhen)

            return this;
        };
    }();

    /* depends */
    var depends = function() {

        var createDepStream = function(stream, depName, dep, injects) {

            var ups = Upstream();

            return stream
                .map( ups.fmap(_.extend) )
                .flatMap( $s.compose( clientFuncs.convertPromiseD, clientFuncs.safeD, clientFuncs.injectParamsD(state.lastDepName))( dep) )
                .mapError($s.id)
                .map( ups.join('depends', depName) )
                .map(function(upstream) { // upstream.dependNames store name of all dependencies stored in upstream.

                    if (!upstream.injects) upstream.injects = [];
                    upstream.injects.push(injects);

                    return upstream;
                });
        }

        /**
         * Join 2 streams into 1
         * @type {*|Function}
         */
        var zippersJoin = $s.curry( function(prevDepName, currDepName, x, y) {
            x.depends = $s.extend( x.depends, y.depends );
            x.injects = x.injects.concat(y.injects);
            return x;
        });

//        var cachedPromise = $s.curry( function(cacheName, cacheKey, dependency, upstream) {
//            return dependency(upstream).then(function (response) {
//                return response;
//            });
//        });

        //var cachedDep = cacheKey ? cachedPromise(cacheName, cacheKey, dependency) : dependency;

        return function(dependency, dependsBehaviour ) {
            if ( ! state.lastWhen ) throw new Error('"depends" should nest "when"');

            var prefix = (dependsBehaviour === Depends.continue) ? '_and_' : '_';
            var depName = (state.lastDepName ? state.lastDepName + prefix : 'depend_') + _.uniqueId();

            var lastOp = state.lastOp;
            if (dependsBehaviour === Depends.parallel) {
                lastOp = state.lastIf || state.lastWhen;
            }

            state.lastInjects = {}; // Here we will store further injects with ".inject"

            var thisDep = createDepStream(lastOp, depName, dependency, state.lastInjects )

            if( dependsBehaviour === Depends.parallel && state.lastDep) { // if deps was before then we need to zip all of them to be arrived simultaneously
                thisDep = state.lastDep.zip( thisDep, zippersJoin( state.lastDepName, depName ) );
            }

            state.lastDep = thisDep;
            state.lastDepName = depName;
            state.lastOp = state.lastDep;

            add( depName, thisDep );

            State.print(depName, state);
            return this;
        };
    }();

    /* Base and helper streams*/
    log('registering base streams...');

    // Because we are using the same ng-view with angular, then we need to know when it's filled by ng.
    $rootScope.$on('$routeChangeSuccess', function() {
        scopeAttached = {};
        lastScopes = {};
    });

    var routeChangedStream = Bacon
        .fromBinder(function(sink) {
            $rootScope.$on('$locationChangeSuccess', function(event, route) { sink(route); });
        })
        .map(function(route) {
            isLastWasMatched = false;
            isRedirected = false;
            viewRendered = [];
            scopeAttached = [];
            dataByView = {};
            return {
                path: $location.path()
            };
        })
        .filter( $s.compose( $s.empty, $s.flip(utils.matchRoutes)(Matching.continue, skipRoutes), $s.dot('path')  )) // If route marked as 'skip', then we should not treat it at all.


    var rootStream = Bacon.fromBinder(function(sink) {
            routeChangedStream.onValue(function(upstream) {
                assignRenders();
                sink(upstream);
            });
        }).map(function(upstream){upstream.id = _.uniqueId(); return upstream;})

    var otherWiseRootStream = rootStream
        .filter( $s.compose( $s.empty, $s.flip(utils.matchRoutes)(Matching.stop, routes),  $s.dot('path') ))
        .map( $s.logIt('Otherwise is in work.') );

    /* Base */

    /**
     * Creates route stream by route expression which will prevent other matches after.
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _lastWhen = function() {
        return when.bind(this)($s.a2a( arguments ), Matching.stop);
    }

    /**
     * Creates route stream by route expression
     * @param mask - route expression /endpoint/:param1/:param2/endpoint2
     * @returns {*}
     */
    var _when = function() {
        return when.bind(this)($s.a2a( arguments ), Matching.continue);
    }

    /**
     * Inject dependency in last route stream. Only one dependency allowed at once.
     * @name name - name of dependency. Should be unique, will be injected into controller.
     * @param dependency - promise (for first version).
     * @returns {*}
     */
    var _depends = function( dependency ) {
        return depends.bind(this)( dependency, Depends.parallel);
    }

    /**
     *  Continuesly run the dependency. First executed previous dependency, and only after - this one.
     */
    var _and = function( dependency ) {
        return depends.bind(this)( dependency, Depends.continue);
    }

    var _inject = function( key, expression ) {
        if ( ! state.lastInjects ) throw new Error('.inject should follow .depends');
        state.lastInjects[key] = '.depends.' + state.lastDepName + (expression ? expression : '' );
        return this;
    }
    /**
     * Turn the mode when "depends" will chain flatmap to the "dependencyStream" and not to the "when"/route stream.
     * @param dependencyStream
     * @returns {attachTo}
     */
//    var switchTo = function(dependencyStream) {
//
//        state.lastDep = streams[dependencyStream];
//        state.lastIf = void 0;
//
//        return this;
//    }



    /**
    	if Function
     * Adds filter into dependency/when
     * @param fn
     */
    var _if = function(fn, name) {

        if ( ! state.lastOp ) { throw new Error('"if" should nest something.'); }

        State.divide();

        state.lastIf = state.lastOp.filter( clientFuncs.safeD( clientFuncs.injectParamsD( state.lastDepName ) ) (fn) );
        state.lastOp = state.lastIf;

        var name = name ? name : _.uniqueId();
        add( name, state.lastIf );

        State.print('_if__After:', state);

        return this;
    }


    /**
     * render Function	
     * Customize the stream which created by "when" route.
     * Applyed to any stream and will force render of "template" with "controller" into "view"
     * @param controller
     * @param templateUrl
     * @param viewId - directive name which will be used to inject template
     * @returns {*}
     */
    var _render = function(){
        var parseViewName = function(viewName) {
            var relation = viewName.split('.');
            var name, parent;
            if ( 2 == relation.length ) {
                name = relation[1];
                parent = relation[0];
            }
            if ( 1 == relation.length ) {
                name = relation[0];
            }

            return {name:name, parent:parent};
        };
        return function(controller, tpl, viewId){

            if ( ! state.lastOp ) throw new Error('"render" should nest something');

            viewId = viewId || defaultViewId;

            var nameObject = parseViewName(viewId);
            if (nameObject.parent && ! parentOf[nameObject.name] ) parentOf[nameObject.name] = nameObject.parent;
            var name = nameObject.name;
            var ups = Upstream();

            var template = (tpl && ':' === tpl[0]) ? tpl.slice(1, tpl.length-1): '';
            var templateUrl = (tpl && ':' !== tpl[0]) ? tpl: '';

            var thisRender = state.lastOp
                .map(ups.fmap(_.extend))
                .map(function() { return {controller:controller, template:template, templateUrl:templateUrl, viewId:name, parentView:nameObject.parent }; })
                .map(ups.join('render', void 0));

            // Later when the picture of streams inheritance will be all defined, the streams will gain onValue per viewId.
            if ( ! renders[name] ) renders[name] = [];
            renders[name].push(thisRender);

            if( ! viewReady[name]) viewReady[name] = new Bacon.Bus(); // This will signal that this view is rendered. Will be used in onValue assignment.

            if (void 0 !== state.lastIf) State.rollback();
            State.print('_____renderStateAfter:'+controller, state);

            return this;
        };
    }();

    var _clear = function(viewId) {
        return _render.bind(this)(void 0, void 0, viewId);
    }

    var _redirect = function(url){

        if ( ! state.lastOp ) throw new Error('"redirect" should nest something');

        var ups = Upstream();

        var thisRedirect = (state.lastIf || state.lastDep || state.lastWhen)
            .map(ups.fmap(_.extend))
            .map(function() { return url; })
            .map(ups.join('render', 'redirectUrl'));

        lastRedirect = lastRedirect ? lastRedirect.merge(thisRedirect) : thisRedirect;

        if (void 0 !== state.lastIf) State.rollback();

        return this;
    }

    /**
     * Set "Global" dependency, which will be included in every stream after "when"
     * Can be as many dependencies as need
     */
//    var set = function() {
//        return this;
//    }
//
//    /**
//     * Unset "Global" dependency
//     */
//    var unset = function() {
//        return this;
//    }

    /* Not ordered commands */
    /**
     * Default route.
     * @param name
     * @param route
     * @returns {otherwise}
     */
    var _otherwise = function(controller, templateUrl, viewId) {

        viewId = viewId || defaultViewId;

        var ups = Upstream();

        defaultRoutes[viewId] = otherWiseRootStream
            .map(ups.fmap(_.extend))
            .map(function() { return {controller:controller, templateUrl:templateUrl, viewId:viewId }; })
            .map(ups.join('render', void 0))

        add('defaultOf'+viewId, defaultRoutes[viewId])
        return this;
    }

    /**
     * Set default view
     * @param view - is a directive for injecting template
     * @returns {$routeStreams}
     */
    var _defaultView = function( viewId ) {
        defaultViewId = viewId;
        return this;
    }


    /**
     * Function: skip
     * Skip: Sets the list of route masks which should be skipped by routeStreams.
     * @param path
     * @returns {$routeStreams}
     * @private
     */
    var _skip = function(){
        var pushSkipVariants = function(path) {
                skipRoutes.push( {mask: path} );
                skipRoutes.push( {mask: utils.getPossiblePath(path)} );
        };

        return function (path){
            if (1 < arguments.length) {
                $s.map( pushSkipVariants, $s.a2a(arguments) );
            } else {
                pushSkipVariants(path);
            }
            return this;
        }
    }();

    return {
        defaultView: _defaultView
        ,when: _when
        ,lastWhen: _lastWhen
        ,depends: _depends
        ,and: _and
        ,inject: _inject
        ,if: _if
        ,render: _render
        ,clear: _clear
        ,redirect: _redirect
        ,otherwise: _otherwise
        ,skip: _skip
//      ,switchTo:switchTo
//      ,set:set
//      ,unset:unset
        ,exports:exports
    };
}]);

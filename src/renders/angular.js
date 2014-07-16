var templateRtrieve = s.curry( function(templateUrl, upstream) {
      return $http
          .get(templateUrl, {cache: $templateCache})
          .then(function(response) { return response.data; });
});

angularRender = function(upstream) {   
    var ups = Upstream();
    return Bacon.const(upstream)
               .map( ups.fmap(_.extend) )
               .flatMap(function(upstream) {
                   if (upstream.render.templateUrl) {
                       return clientFuncs.convertPromiseD( templateRetrieve( upstream.render.templateUrl     ), upstream );
                   } else {
                       return Bacon.constant(upstream.render.template);
                   }
              })
              .mapError(function() { console.error((new Error('Error rendering template.')).stack); return ''; })
              .map(ups.join('render', 'template'))
              .onValue( renderStream );

}


/* Render Stream */
var renderStream = function(){

    var simpleType = function(data, key) {
        return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
    }
    var injectDependsIntoScope = function ( scope, upstream ) {
        var viewName =  upstream.render.viewId;

        var injects = s.compose( s.reduce(s.extend, {}), s.dot('injects') )(upstream);
        var data = s.map( s.parse(upstream), injects );
        var saveData4Childs = s.set(viewName, dataByView)(data);

        s.extend( data, dataByView[parentOf[viewName]])
        console.log('datax:',upstream,data);

        s.extend( scope, data );
        Object.keys(data).filter(simpleType.bind(this, data)).map(function(key){
            Object.defineProperty(scope, key, {
                get: function () {
                    return s.parse( upstream, injects[key] );
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
                        controller = $controller( controller, {scope:lastScope});
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



"use strict";

var s = require('utils/lib')
        ,_ = require('lodash')
        ,Promise = require('promise')
        ,Bacon = require('baconjs')

import console from 'utils/log';

var catchError;

var convertPromiseD = s.curry(function(promiseProvider, upstream) {
    var promise = promiseProvider( upstream );
    if ( s.isPromise( promise ) ){
        promise = promise
            .catch( function(e) {  
                if (e.stack) { 
                    catchError(e);
                }
                return Promise.reject(e)
            })
        return Bacon.fromPromise( promise );
    } else {
        return Bacon.constant(promise);
    }
});

var applyScopeD = function(fn) {
    return function(scope) {
        return fn.call(this, scope)
    }
};

var getRefsData = function( upstream ) {
    if ( !upstream.refs ) return {}

    var fn = function(res, depName, refName) {
        if ( 'undefined' !== refName && depName in upstream.depends ) {
            res[refName] = upstream.depends[depName];
            if ('function' === typeof res[refName]) { 
                res[refName] = res[refName]()
            }
        }

        return res;
    }

    return s.reduce( fn, Object.create(null), upstream.refs)
}

var getScopeDataFromStream = function( upstream ){
    var scope = Object.create(null);
    scope.refs = upstream.refs;
    scope.depends = upstream.depends;
    scope.injects = upstream.injects;
    scope.params = upstream.params;
    scope.path = upstream.path;
    scope.route = upstream.route;
    return s.clone(scope);
}

/**
    * Injects depend values from upstream into object which is supplyed first.
    */
var createScope = function ( upstream ) {
    var refsData = getRefsData( upstream ); 

    var warning = function(inject) { console.log('inject accessor return nothing:' + inject) }
    var injects = s.compose( s.reduce(s.extend, {}), s.dot('injects') )(upstream);
    var joins = s.filter( function(inject){ return inject.hasOwnProperty('injects') }, injects);
    injects = s.filter( function(inject){ return !inject.hasOwnProperty('injects') }, injects);
    var injectsData = { object: void 0};

    var formatInjects = function(inject) {
        var container = ( inject.hasOwnProperty('injects') ) ? '' : '.depends.' + inject.name;

        if ('string' === typeof inject.expression)
            return container + (inject.expression ? inject.expression : '' );

        if ('undefined' === typeof inject.expression)
            return container;

        if ( !inject.hasOwnProperty('injects') ) {
            return s.baconTryD(function() {
                return inject.expression(upstream.depends[inject.name]) 
            })
        } else {  
            return s.baconTryD(function() {
                return inject.expression( s.extend( refsData, injectsData.object) ) 
            })
        }
    }

    var takeAccessor = s.compose( s.if(s.eq(void 0), warning), s.flipDot(upstream) );
    var takeFunction = function(fn){return fn.apply();}
    var fullfil = s.map( s.compose( s.ifelse(s.typeOf('string'), takeAccessor, takeFunction)
                                    , formatInjects)); 

    injectsData.object = fullfil( injects );
    var data = injectsData.object;
    var joinsData = fullfil( joins );

    data = s.extend( refsData, upstream.params, data, joinsData ); 

    return data;
};

var catchError = function(e) {
    if (e && e.stack) {
        console.error(e.message, e.stack);
    } else {
        console.error('Unknown error');
    }
    return e;
}

module.exports = { 
    convertPromiseD: convertPromiseD
    ,applyScopeD: applyScopeD
    ,createScope: createScope
    ,getRefsData: getRefsData
    ,catchError: catchError
    ,getScopeDataFromStream: getScopeDataFromStream
};


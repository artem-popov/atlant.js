"use strict";
var s = require('./lib')

// Save/restore state of the stream.
var Upstream = function() {
    var data = {};
    var _fmap = s.curry(function(fn, obj) {
        data = fn.call(this, data, obj);
        return data;
    });

    var _join = s.curry( function(containerName, propertyName, upstream) {
        if ( containerName && propertyName ) {
            if ( ! data[containerName] ) data[containerName] = {};
            if ( ! data[containerName][propertyName] ) data[containerName][propertyName] = {};

            data[containerName][propertyName] = upstream;
        }

        if ( ! containerName && ! propertyName ){
            s.merge(data, upstream);
        }

        if ( containerName && ! propertyName ){
            if ( ! data[containerName] ) data[containerName] = {};
            s.merge(data[containerName], upstream);
        }

        if (containerName,propertyName && data[containerName][propertyName] && upstream !== data[containerName][propertyName]) {
            var e = new Error('E001: Upstream join equality test failed! ');
            console.error(e.message, e.stack)
            throw e;
        }

        upstream = data;
        data = {};
        return upstream
    }) 

    return {
        // join :: containerName -> propertyName -> upstream
        join: _join
        // fmap :: fn -> obj
        ,fmap: _fmap
        ,push: function( obj ) { 
            return _fmap(_.extend, obj)
        }
        ,pop: function() {
            var upstream = data;
            data = {};
            return upstream;
        }
        ,clear: function(upstream){
            data = {};
            return upstream
        }
    }
};

module.exports = Upstream;

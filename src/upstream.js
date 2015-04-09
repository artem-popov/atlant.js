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

        if ( ! data[containerName] ) data[containerName] = {};
        s.merge(data[containerName], upstream);

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
            data = obj;
            return data;
        }
        ,pop: function() {
            var upstream = data;
            data = [];
            return upstream;
        }
        ,getLast: function() {
            return data;
        }
        ,clear: function(upstream){
            data = [];
            return upstream
        }
    }
};

module.exports = Upstream;

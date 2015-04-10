"use strict";

var Bacon = require('baconjs');
var l = require('lodash');

module.exports = function(Counter, whenCount)  {

    var Upstream = require('./upstream.js')
        ,s = require('./lib')

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();
    var taskRendered = new Bacon.Bus();
    var drawEnd = new Bacon.Bus();
    var taskRenderedAndMapped = taskRendered
        .map(function(u){
            var obj = {};
            obj[u.render.viewName] = u;
            return obj;
        })

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var ups2 = new Upstream();
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .merge(nullifyScan)
        .scan([], function(oldVal, newVal) {  // Gathering the upstreams which come here.
            if (newVal === 'nullify') {
                oldVal = []
                ups.clear();
                return oldVal
            }
            oldVal.push(newVal); 
            return oldVal;
        })
        .map( s.compose( ups2.push, ups2.clear ) )
        .map( ups.pop ) // Restoring stream which initially come
        .map( Counter.decrease )
        .filter( function(value) { return 0 === value; })
        .map( ups2.pop )  // Yes the counter now zero, so we can apply gathered streams together
        .changes()
        .merge(nullifyScan)
        .scan({}, function(sum, newVal) {  // creating hash of streams with viewName as key
            if (newVal === 'nullify') {
                sum = {};
                ups2.clear();
                return sum
            }

            if ( !(newVal instanceof Array) ) 
                newVal = [newVal];
            
            newVal
                .map(function(val){
                    sum[val.render.viewName] = val;
                })

            return sum;
        })
        .filter(s.notEmpty) // Still this hash can be nullified, so stay aware.
        .changes()
        .filter( function(_) { return 0 === --whenCount.value; } ) // Here checking is there all whens are ended.
        .merge(taskRenderedAndMapped)
        .map(function(u){
            return s.reduce(function(sum, value, key){if ('undefined' !== key) sum[key] = value; return sum}, {}, u)
        })
        .filter(s.notEmpty) // nopes.

    return { 
        renderEndStream: renderEndStream 
        ,whenRenderedStream: whenRenderedStream  
        ,nullifyScan: nullifyScan 
        ,taskRendered: taskRendered
        ,drawEnd: drawEnd
    }
}

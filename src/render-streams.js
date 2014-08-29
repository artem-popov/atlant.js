"use strict";

var Bacon = require('baconjs');

module.exports = function(Counter, whenCount)  {

    var Upstream = require('./upstream.js')
        ,s = require('./lib')

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var ups2 = new Upstream();
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .scan([], function(oldVal, newVal) {
            oldVal.push(newVal); 
            return oldVal;
        })
        .map( s.compose( ups2.push, ups2.clear ) )
        .map( ups.pop )
        .map( Counter.decrease )
        .filter( function(value) { return 0 === value; })
        .map( ups2.pop )
        .changes()
        .merge(nullifyScan)
        .scan({}, function(oldVal, newVal) {
            if (newVal == 'nullify') {
                oldVal = {};
                return oldVal
            }

            if ( !(newVal instanceof Array) ) 
                newVal = [newVal];
            
            newVal.map(function(val){
                oldVal[val.render.viewName] = val;
            })

            return oldVal;
        })
        .filter(s.notEmpty)
        .changes()
        .filter( function(upstream) { return 0 === --whenCount.value; } )

    return { 
        renderEndStream: renderEndStream 
        ,whenRenderedStream: whenRenderedStream  
        ,nullifyScan: nullifyScan 
    }
}

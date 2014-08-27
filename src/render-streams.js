"use strict";


module.exports = function(Counter, whenCount)  {

    var Upstream = require('./upstream.js')
        ,s = require('./lib')

    var whenRenderedStream = new Bacon.Bus(); // Stream for finishing purposes
    var nullifyScan = new Bacon.Bus();

    /* Counting all renders of all whens. When zero => everything is rendered. */
    var ups = new Upstream();
    var renderEndStream = whenRenderedStream
        .map( s.compose( ups.push, ups.clear ) )
        .map( Counter.decrease )
        .filter(function(value) {
            return 0 === value;
        })
        .map( ups.pop ) 
        .merge(nullifyScan)
        .scan({}, function(oldVal, newVal) {
            if (newVal == 'nullify') {
                oldVal = {};
            } else {
                oldVal[newVal.render.viewName] = newVal;
            }
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

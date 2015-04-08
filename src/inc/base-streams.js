"use strict";

var Bacon = require('baconjs');

var baseStreams = Object.create(null);

var unnamed = [];
var unsubs = [];

baseStreams.destructorStream = new Bacon.Bus();

baseStreams.bus = function(){
    var bus = new Bacon.Bus();
    unnamed.push(bus);
    return bus;
}

baseStreams.onValue = function(stream, f){
    var unsub = stream.onValue(f);
    unsubs.push(unsub);
    return unsub;
}

baseStreams.destroy = function() {
    baseStreams.destructorStream.push();
    unnamed.map(function(bus){
        bus.end();
    })
    unsubs.map(function(handler){
        handler();
    })
    unnamed.length = 0;
    unsubs.length = 0;
}

module.exports = baseStreams;



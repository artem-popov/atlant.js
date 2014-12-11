"use strict";

var s = require('../lib');

var Log = function Log(){
    var on = false;
    this.verbose = function(turnOn){
        on = turnOn;
    }

    this.log = function() {
        if (!on) return;
        console.log.apply(console, arguments)
    }

    this.logTime = function() {
        if (!on) return;
        if (console.time) {
            return console.time.apply(console, s.a2a(arguments))
        }
    } 

    this.logTimeEnd = function() {
        if (!on) return;
        if (console.timeEnd) {
            return console.timeEnd.apply(console, s.a2a(arguments))
        }
    }
    return this;
}

var instance;
module.exports = function() {
    if(instance) return instance;
    instance = new Log();
    return instance;
}

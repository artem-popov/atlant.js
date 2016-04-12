"use strict";

var s = require('utils/lib');

var Log = function Log(){
    var on = false;
    var atlantPrefix = 'Atlant.js: ';

    Object.defineProperty(this, 'verbose', { 
        get: () => on 
        ,set: _ => { on = _; return on }
    });
    
    this.log = function(...args) {
        if (!on) return;
        
        console.log(atlantPrefix, ...args)
    }

    this.warn = function(...args) {
        if (!on) return;
        
        console.warn(atlantPrefix, ...args)
    }

    this.error = function(...args) {
        if (!on) return;
        
        console.error(atlantPrefix, ...args)
    }

    this.time = function(name) {
        if (!on) return;
        if (console.time) {
            return console.time(atlantPrefix + name)
        }
    } 

    this.timeEnd = function(name) {
        if (!on) return;
        if (console.timeEnd) {
            return console.timeEnd(atlantPrefix + name)
        }
    }
    return this;
}

var instance = new Log();

export default instance;

"use strict";

var s = require('./lib');

var Log = function Log(){
    var on = false;
    var level;
    var atlantPrefix = 'Atlant.js: ';

    Object.defineProperty(this, 'verbose', { 
        get: () => on 
        ,set: _ => { on = _; return on }
    });

    Object.defineProperty(this, 'level', { 
        get: () => level 
        ,set: _ => { if(_ === 'errors' || _ === 'warnings') level = _; return level }
    });
    
    this.log = function(...args) {
        if (!on) return;
        if(level === 'errors' || level === 'warnings') return;
        
        console.log(atlantPrefix, ...args)
    }

    this.warn = function(...args) {
        if (!on) return;
        if(level === 'errors') return;

        console.warn(atlantPrefix, ...args)
    }

    this.error = function(...args) {
        console.error(atlantPrefix, ...args)
    }

    this.time = function(name) {
        if (!on) return;
        if(level === 'errors'|| level === 'warnings') return;

        if (console.time) {
            return console.time(atlantPrefix + name)
        }
    } 

    this.timeEnd = function(name) {
        if (!on) return;
        if(level === 'errors'|| level === 'warnings') return;

        if (console.timeEnd) {
            return console.timeEnd(atlantPrefix + name)
        }
    }

    return this;
}

var instance = new Log();

export default instance;

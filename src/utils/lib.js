"use strict";

var container = Object.create(null);

import console from './log';
import curry from 'lodash/curry';

const Bacon = require('baconjs');

var s = (function(){


    var that = this;
    this.id = function(value) { return value; }
    this.nop = function() { return void 0; }

    this.pass = function() { return function(promise) { return promise; } }
    this.inject = function(data) { return function() { return data; } }
    /**
     *
     * @param fn - promise callback
     * @param fn2 - reject callback
     * @returns {Function}
     */
    this.then = function(fn, fn2) { return function(promise) { return promise.then(fn, fn2); }; }

    this.unary = function(fn) {
        return function(val) {
            return fn.call(this, val);
        }
    }

   this.compose = function (...fns) {

     return function (value) {
       return fns.reduceRight((acc, fn) => fn(acc), value )
     };
   };

   this.uniqueId = (function(){
     let counter = 0;
     return function(){
       return Number(counter++).toString();
     }
   })()


    /**
     * Accepts collection.
     * it pass obj value and object name to fn (temporary 2 args)
     * @type {Function}
     */
    this.map = curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.map(that.unary(fn));

        var mapped = {};

        for( var name in obj ) {
            mapped[name] = fn(obj[name]);
        }

        return mapped;

    });

    // @TODO create mapKeys


    this.fmap = curry( function(fn, obj) {
        return obj.fmap(fn);
    });

    // @TODO check immutability/mutability
    this.filter = curry( function(fn, obj) {
        if ( ! obj ) return [];
        if (obj && obj.map) return obj.filter(that.unary(fn));

        var filtered = {};

        for( var name in obj ) {
            if ( fn(obj[name]) ) {
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    this.filterKeys = curry( function(fn, obj) {
        if ( ! obj ) return obj;

        var filtered = {};

        for( var name in obj ) {
            if ( fn(name) ) {
                filtered[name] = obj[name];
            }
        }

        return filtered;

    });

    this.reduce = curry( function(fn, startValue, obj) {
        if ( !obj ) return startValue;
        if (obj && obj.reduce) Array.prototype.reduce.call(obj, fn, startValue);

        var reduced = {};

        for( var name in obj ) {
            reduced = fn(reduced, obj[name], name);
        }

        return reduced;
    });

    this.concat = curry( function(a, b) {
        return b.concat(a);
    });

    this.flatMap = function(arr) {
        return Array.prototype.concat.apply([], arr);
    }

    this.last = function(arr) {
        if (arr) {
            return arr[arr.length-1];
        } else {
            return void 0;
        }
    };
    this.head = function(arr) {
        if (arr) {
            return arr[0];
        } else {
            return void 0;
        }
    };

    this.diff = function(a, b) {
        a = a.slice();
        b.forEach(function(_){
            var index = a.indexOf(_);
            if( -1 !==  index) a.splice(index, 1);
        })
        return a;
    };

    this.negate = function(obj) {
        return !obj;
    }

    this.eq = curry( function(obj, obj2) {
        return obj === obj2
    });

    this.notEq = curry( function(obj, obj2) {
        return obj !== obj2
    });

    this.empty = function(obj) {
        return obj === null || obj === void 0 || obj === '' || ( (obj instanceof Array) && 0 === obj.length ) || ('object' === typeof obj && 0 === Object.keys(obj).length);
    }
    this.notEmpty = this.compose( this.negate, this.empty );

    this.simpleDot = function(expression, obj) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    this.flipSimpleDot = function(obj, expression) {
        if ( obj ) {
            return obj[expression];
        } else {
            return void 0;
        }
    }

    // expression is ".something" or ".something.something"
    this.dot = curry( function(expression, obj) {
        return expression.split('.').filter(that.notEmpty).reduce(that.flipSimpleDot, obj);
    });

    // expression is ".something" or ".something.something"
    this.flipDot = curry( function(obj, expression) {
        return that.dot(expression, obj);
    });

    this.set = curry( function(item, obj, value) {
        if(item) {
            obj[item] = value;
            return obj;
        } else {
            return value;
        }
    });

    this.plus = curry( function(item1, item2) {
        return item1 + item2;
    });

    this.trim = function(string) {
        return string.trim();
    }

    this.replace = curry( function(where, replacer, obj) {
        return obj.replace(where, replacer);
    });

    this.push = function( item, obj ) {
        if ( ! obj ) {
            return function(obj) { return obj.push(item); };
        } else {
            return obj.push(item);
        }
    };

    this.split = curry( function( char, obj ) {
        return obj.split(char);
    });

    this.log = function(what) {
        console.log(what);
        return what;
    }

    this.logIt = function(...args) {
        return function(what) {
            console.log.apply(console, args.concat(what) );
            return what;
        }
    };

    this.instanceOf = function( type, object ) {
        return object instanceof type;
    }

    this.typeOf = curry(function( type, object ) {
        return type === typeof object;
    });


    // Promises
    this.promise = function(value) {
        return new Promise( function(fullfill, reject ) {
             fullfill(value);
        });
    }

    this.promiseD = function(promiseProvider) {
        return function() {
            var result = promiseProvider.apply(this, arguments );
            if ( 'Promise' === result.constructor.name){
                return result;
            } else {
                return that.promise(result);
            }
        }
    }

    //memoize.js - by @addyosmani, @philogb, @mathias
    // with a few useful tweaks from @DmitryBaranovsk
    this.memoize = function( fn ) {
        return function () {
            var args = Array.prototype.slice.call(arguments),
                hash = "",
                i  = args.length;
            var currentArg = null;
            while(i--){
                currentArg = args[i];
                hash += (currentArg === Object(currentArg)) ? JSON.stringify(currentArg) : currentArg;
                fn.memoize || (fn.memoize = {});
            }
            return (hash in fn.memoize) ? fn.memoize[hash] :
                fn.memoize[hash] = fn.apply( this , args );
        };
    }

    this.ifelse = curry( function(condition, then, _else, value){
        if( condition( value ) ) return then(value);
        else return _else(value)
    });

    this.if = curry( function(condition, then, value){
        if( condition( value ) ) return then(value);
        else return value;
    });

    this.type = function(item, type) {

        if ( type !== typeof item && item ) {
            var error = new Error('Type Error: ' + item + ' should be ' + type);
            console.error(error.message, error.stack)
            throw error;
        }
    }

    this.simpleType = function(data, key) {
        return 'string' === typeof data[key] || 'number' === typeof data[key] || 'boolean' === typeof data[key]
    }

    this.isPromise = function(promise) {
        if ( promise && 'function' === typeof promise.then ) return true;
        else return false;
    }

    this.tryF = function(fallbackValue, fn){
        return function() {
            try {
                return fn.apply(this, arguments)
            } catch(e) {
                return fallbackValue
            }
        }
    }

    this.tryD = function(fn, errorCallback){
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch(e) {
                console.error(e.message, e.stack);
                if( errorCallback) return errorCallback(e);
            }
        }
    };

    this.baconTryD = function(fn) {
        return that.tryD(fn, function(e) { return Bacon.Error(e) })
    }

    this.promiseTryD = function(fn) {
        return that.tryD(fn, function(e) { return Promise.reject(e) })
    }

    this.apply = function(doProvider, value) {
        if ('function' === typeof doProvider) {
            return doProvider(value);
        } else {
            return doProvider;
        }
    }

   this.maybe = function(nothing, fn){
       return function(...args){
           try {
               return fn.apply(this, args)
           } catch (e) {
               return nothing
           }
       }
   }

   // This function creates copy of the object.
   this.copy = function(o){
       return JSON.parse(JSON.stringify(o))
   }

   this.isObject = _ => _ === Object(_);

   this.isPlainObject = _ => Object(_) === _ && (Object.getPrototypeOf(_) === Object.prototype || null === Object.getPrototypeOf(_));


   /**
    * Deep merge two objects.
    * @param target
    * @param source
    */
   this.mergeDeep = (target, source) => {
     if (this.isPlainObject(target) && this.isPlainObject(source)) {
       Object.keys(source).forEach(key => {
         if (this.isPlainObject(source[key])) {

           if (!target[key]) Object.assign(target, { [key]: {} });
           this.mergeDeep(target[key], source[key]);
         } else {
           Object.assign(target, { [key]: source[key] });
         }
       });
     }
     return target;
   }

   this.clone = _ => this.mergeDeep({}, _);


   this.maybeS = this.maybe.bind(this, '')
   this.maybeV = this.maybe.bind(this, void 0)

   return this;

}.bind(container))();

module.exports = s;

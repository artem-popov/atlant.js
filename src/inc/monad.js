'use strict';

//    var identity = MONAD();
//    var monad = identity("Hello world.");
//    monad.then(alert);

//    var ajax = MONAD()
//        .lift('alert', alert);
//    var monad = ajax("Hello world.");
//    monad.alert();

//    var maybe = MONAD(function (monad, value) {
//        if (value === null || value === undefined) {
//            monad.is_null = true;
//            monad.then = function () {
//                return monad;
//            };
//            return null;
//        }
//        return value;
//    });
//    var monad = maybe(null);
//    monad.then(alert);    // Nothing happens.

export function MONAD(prototype, modifier) { // Actually it's just a functor
    prototype = prototype || null;

    function unit(scope) { // @TODO make value immutable?
        var monad = Object.create(prototype); // always return new monad.

        // console.log('initial value:', value)
        prototype.then = function (func) {
            
            console.log('the stack is:', scope.stack)
            let val = scope.value.then(func);
            // console.log('then value:', value, func, val)

            return unit(scope);
        };

        prototype.whenEnd = function() {
            if (scope.stack.length) { 
                value = scope.stack[0]    
                scope.stack = []; 
                scope.stack.push(value);
            }
            return this;
        }

        if ('function' === typeof modifier) {
            value = modifier(value, monad, scope);
            if (!scope.stack) scope.stack = [];
            scope.stack.push(value);
        }

        return monad;
    }
    // unit.method = function (name, func) { // just some additional staff
    //     prototype[name] = func;
    //     return unit;
    // };
    unit.add = function (name, func) {
        prototype[name] = function() {
            return this.then(func.apply(this, arguments));
        }
        return unit;
    };
    return unit;
}


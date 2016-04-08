"use strict"; 

var Symbol = Symbol;

if (void 0 === Symbol) Symbol = _ => _;

var RenderOperation = {
    draw: Symbol('draw')
    ,replace: Symbol('replace')
    ,change: Symbol('change')
    ,clear: Symbol('clear')
    ,redirect: Symbol('redirect')
    ,refresh: Symbol('refresh')
    ,move: Symbol('move')
}

// Matching enum for when.
var Matching = {
    stop: _.uniqueId()
    ,continue: _.uniqueId()
    ,once: _.uniqueId()
}

var WhenOrMatch = {
    when: _.uniqueId()
    ,match: _.uniqueId()
}

// Depends enum
var Depends = {
    async: _.uniqueId()
    ,continue: _.uniqueId()
}

var get = _ => {
    // _.__proto__.contructor.name
    return ( ( (_ || {__proto__: void 0}).__proto__ || {constructor: void 0} ).constructor || {name: void 0}).name
}

module.exports = {
    RenderOperation,
    Depends,
    WhenOrMatch,
    Matching,
    get
}

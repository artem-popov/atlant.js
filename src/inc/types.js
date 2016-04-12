"use strict"; 

var Symbol = Symbol;
var lodash = require('lodash');

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
    stop: lodash.uniqueId()
    ,continue: lodash.uniqueId()
    ,once: lodash.uniqueId()
}

var WhenOrMatch = {
    when: lodash.uniqueId()
    ,match: lodash.uniqueId()
}

// Depends enum
var Depends = {
    async: lodash.uniqueId()
    ,continue: lodash.uniqueId()
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

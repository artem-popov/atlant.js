"use strict"; 

var Symbol = Symbol;

if (void 0 === Symbol) Symbol = _ => _;

var RenderOperation = {
    render: Symbol('render')
    ,draw: Symbol('draw')
    ,replace: Symbol('replace')
    ,change: Symbol('change')
    ,clear: Symbol('clear')
    ,redirect: Symbol('redirect')
    ,refresh: Symbol('refresh')
    ,move: Symbol('move')
    ,nope: Symbol('nope')
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


module.exports = {
    RenderOperation,
    Depends,
    WhenOrMatch,
    Matching
}

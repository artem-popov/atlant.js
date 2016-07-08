var Symbol = Symbol;

if (void 0 === Symbol) Symbol = _ => _;

var RenderOperation = {
  draw: Symbol('draw')
    , replace: Symbol('replace')
    , change: Symbol('change')
    , clear: Symbol('clear')
    , redirect: Symbol('redirect')
    , refresh: Symbol('refresh')
    , move: Symbol('move'),
};

// Matching enum for when.
var Matching = {
  stop: Symbol('stop')
    , continue: Symbol('continue')
    , once: Symbol('once'),
};

var WhenOrMatch = {
  when: Symbol('when')
    , match: Symbol('match'),
};

// Depends enum
var Depends = {
  async: Symbol('async')
    , continue: Symbol('continue'),
};

var get = _ => {
    // _.__proto__.contructor.name
  return (((_ || { __proto__: void 0 }).__proto__ || { constructor: void 0 }).constructor || { name: void 0 }).name;
};

module.exports = {
  RenderOperation,
  Depends,
  WhenOrMatch,
  Matching,
  get,
};

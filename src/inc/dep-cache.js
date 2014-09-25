var s = require('../lib')

//
// Cache. Infinity one.
var depCache = function() {
    var cache = {};

    this.has = function(name, scope) {
        var key = name + JSON.stringify(scope);
        return !!cache[key]
    }
    this.get = function(name, scope) {
        var key = name + JSON.stringify(scope);
        return cache[key];
    }
    this.put = function(name, scope, dep) {
        var key = name + JSON.stringify(scope);
        cache[key] = dep
        return dep;
    }
}
module.exports = depCache;


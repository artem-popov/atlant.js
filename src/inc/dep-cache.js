//
// Cache. Infinity one.
var depCache = function() {
    var cache = {};
    this.has = function(name) {
        console.log('has', name, 'in cache?', !!cache[name], cache)
        return !!cache[name]
    }
    this.get = function(name) {
        console.log('get ', name, 'from cache', cache)
        return cache[name];
    }
    this.put = function(name, scope, dep) {
        console.log('put ', name, 'equal', dep, 'of scope', scope, ' to cache', cache)
        cache[name] = dep
        return dep;
    }
}
module.exports = depCache;


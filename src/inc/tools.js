"use strict";

var utils = require('../utils/utils')
    ,_ = require('lodash')
    ,s = require('../utils/lib')
;

var _test = function(path, mask){
    if ( !path || !mask ) return false;

    return null !== utils.matchRoute(path, mask)
}

var _return = function(path, mask){
    if ( !path || !mask ) return false;

    return null !== utils.matchRoute(path, mask) ? mask : void 0
}

var _testAll = function(path, masks){
    if ( !path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks)
    .map(_test.bind(void 0, path))
    .reduce( function(v, i) { return v || i }, false)
}

var _returnAll = function(path, masks){
    if ( !path || !masks || 0 === masks.length) return false;

    return utils.addSlashes(masks)
                .map(_return.bind(void 0, path))
                .filter( function(_){ return _ })
                .map(utils.stripLastSlash)
                .reduce(function(acc, i){if(-1 === acc.indexOf(i)) acc.push(i); return acc}, []) // only unique elements because of stripped slash on end */ became * 
}

var _parse = function(path, mask){
    if ( !path || !mask ) return {};

    var params = utils.matchRoute(path, mask);
    var parsed = utils.parseURL( path );
    var searches = _.clone( utils.parseSearch(parsed.search), true); // add search params
    return _.extend(searches, params);
}

var _parseAll = function(path, masks){
    if ( !path || !masks || 0 === masks.length) return {};

    return utils.addSlashes(masks)
    .map(_parse.bind(void 0, path))
    .reduce( function(v, i) { return _.merge(v, i) }, {})
}

var _setTitle = function(titleStore, title){
    if (!title) return;

    if( typeof document !== 'undefined' ) {
        document.title = title;
    } else {
        titleStore.value = title
    }

}

var _getTitle = function(titleStore, title){
    return titleStore.value
}

var _blockScroll = function(){
    return utils.blockScroll()
}

var _unblockScroll = function(){
    return utils.unblockScroll()
}

module.exports = {
    // test :: path -> mask -> Bool
    test: _test
    // testAll :: path -> [mask] -> Bool
    ,testAll: _testAll
    ,return: _return
    ,returnAll: _returnAll
    // parse :: path -> mask -> {params}
    ,parse: _parse
    // parseAll :: path -> [mask] -> {params}
    ,parseAll: _parseAll
    ,setTitle: _setTitle
    ,getTitle: _getTitle
    ,unblockScroll: _unblockScroll
    ,blockScroll: _blockScroll
};


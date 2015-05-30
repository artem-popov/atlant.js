"use strict";

var utils = require('../utils');

var ScrollManager = function(prefs){
    this.scrollPositions = {}; 
    this.prefs = prefs;
    if ( 'undefined' !== typeof window) window.scrollPositions = this.scrollPositions;
    return this
};
ScrollManager.prototype.uri2Key = function(uri){
    return uri
    .toLowerCase()
    .replace(/\/+$/, "");  // Remove any trailing slashes.
}
ScrollManager.prototype.saveURI = function(uri){

    var uriKey = this.uri2Key(uri);  

    var scrollPosition = utils.getScrollTop( this.prefs.scrollElement );

    console.log( 'saving for ', uriKey, scrollPosition )
    this.scrollPositions[uriKey] = scrollPosition; 
}
ScrollManager.prototype.restoreURI = function(uri){

    var uriKey = this.uri2Key(uri);  

    console.log('restoring for:', this, uriKey, this.scrollPositions[uriKey])
    utils.setScrollTop( this.prefs.scrollElement, this.scrollPositions[uriKey] )
}

module.exports = ScrollManager;

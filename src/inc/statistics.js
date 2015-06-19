"use strict";

var utils = require('../utils');
var tools = require('./tools');
var s = require('../lib');

/**
 * This statistics module used for calculating the end of the atoms updating.
 * First part is working out at registration level.
 *
 */
var Stat = function(){
    var statObject = {};
    var storeByEvent = {}; // Hash: 'eventName" : ['store1', 'store2']

    if('undefined' !== typeof window) window.statObject = statObject; //@TODO debug information

    this.whenStat = function(params){
        var masks = params.masks
            ,eventKey = params.eventKey
            ,ifId = params.ifId
            ,ifIds = params.ifIds

        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);

            if( !(mask in statObject) ) { 
                statObject[mask] = { updatesList: [], lastOp: [], ifList: {} }
            }

            if (ifId) { 
                statObject[mask].ifList[ifId] = {updatesList: []}
            }

            if(eventKey && ifIds) ifIds.forEach(function(ifId) { 
                statObject[mask].ifList[ifId].updatesList.push(eventKey);
            })
            if(eventKey) statObject[mask].updatesList.push(eventKey);

        })

        return statObject;
    }

    var getAllExceptAsterisk = function(statObject){
        return Object.keys(statObject).filter( function(_){ return '*' !== _ } )
    }

    this.getFinalOpByUrl = function(url){
        var stream, streams = [];

        if( '*' in statObject ) streams.push(statObject['*'].finalOp);

        stream = Bacon.combineAsArray(
                tools
                    .returnAll(url, getAllExceptAsterisk(statObject) )
                    .map(function(_){ return statObject[_].finalOp })
                    .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
                    .concat(streams)
        )

        return stream;
    }

    this.getUpdatesByUrlAndIfId = function(url, ifId){

        return tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ return (ifId in statObject[_].ifList) ? statObject[_].ifList[ifId].updatesList : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

    }

    var getStoreWeights = _.memoize(function(url){
        var weights = [];

        if( '*' in statObject ) weights = weights.concat(statObject['*'].updatesList);

        weights = tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ return statObject[_].updatesList })
            .concat(weights)
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .reduce(function(acc, i){ if(i in acc ) acc[i]++; else acc[i] = 1; return acc }, {})

        return weights;
    })

    this.getWeight = function(url, storeName){

        var weights = getStoreWeights(url);
        return (storeName in weights) ? weights[storeName] : 0;
    }

    this.putLink = function(storeName, eventName) {
        if (!(eventName in storeByEvent)) storeByEvent[eventName] = [];
        storeByEvent[eventName].push(storeName);
    }

    this.getStores = function(eventNames) { 
        return eventNames
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
    }

    return this;
}

module.exports = Stat;



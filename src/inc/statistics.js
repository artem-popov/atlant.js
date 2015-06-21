"use strict";

var utils = require('../utils');
var tools = require('./tools');
var s = require('../lib');
var _ = require('lodash');
var Bacon = require('baconjs');

/**
 * This statistics module used for calculating the end of the atoms updating.
 * First part is working out at registration level.
 *
 */
var Stat = function(){
    var statObject = {};
    var storeByEvent = {}; // Hash: 'eventName" : ['store1', 'store2']

    if('undefined' !== typeof window) window.statObject = statObject; //@TODO debug information

    var getAllExceptAsterisk = function(statObject){
        return Object.keys(statObject).filter( function(_){ return '*' !== _ } )
    }

    this.whenStat = function(params){
        var masks = params.masks
            ,eventKey = params.eventKey
            ,ifId = params.ifId
            ,ifIds = params.ifIds
            ,atom = params.atom
            ,actionId = params.actionId

        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);

            if( !(mask in statObject) )  
                statObject[mask] = {}
            
            if( !(actionId in statObject[mask]) )  
                statObject[mask][actionId] = { updatesList: [], lastOp: [], ifList: {}, atomList: [] }

            if (ifId) { 
                statObject[mask][actionId].ifList[ifId] = {updatesList: []}
            }

            if(eventKey && ifIds) ifIds.forEach(function(ifId) { 
                statObject[mask][actionId].ifList[ifId].updatesList.push(eventKey);
            })
            if(eventKey) statObject[mask][actionId].updatesList.push(eventKey);

            if(atom) statObject[mask][actionId].atomList.push(atom);
        })

        return statObject;
    }

    this.removeUpdates = function(actionId, masks, updates){
        console.log('removing updates...', updates)
        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);
            updates.forEach(function(update){
                if (actionId in statObject[mask]) {
                    var index = statObject[mask][actionId].updatesList.indexOf(update);
                    console.log('before removal!', mask, update, statObject[mask].updatesList)
                    if( -1 !== index ) statObject[mask][actionId].updatesList.splice(index, 1);
                    console.log('removed!', mask, update, statObject[mask][actionId].updatesList)
                }
            }) 

        })
    }

    this.getUpdatesByUrl = function(actionId, url, ifId){

        return tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ 
                return (actionId in statObject[_] 
                                      && 'ifList' in statObject[_][actionId] 
                                      && ifId in statObject[_][actionId].ifList) ? statObject[_][actionId].ifList[ifId].updatesList : [] 
            })
            .filter( function(_){ return _.length })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

    }

    var getSeqSum = function(actionId, url, seq){
        var weights = this.getStoreWeights(actionId, url);

        var value = seq
            .map(function(_){ return weights[_] })

            console.log('value', value)
            value.reduce(function(acc, _, index, array){ 
                return acc + _ * ( array.length - index )
            })

        return value
    }

    this.getSum = function(actionId, url){
        var asteriskAtoms = [];
        
        if( '*' in statObject ) asteriskAtoms = Object.keys(statObject['*'])
                                    .map(function(id){ return 'atomList' in statObject['*'][id] ? statObject['*'][id].atomList : []})
                                    .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

        var atoms = tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ return actionId in statObject[_] ? statObject[_][actionId].atomList : []})

            .concat(asteriskAtoms)
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

        var atomSum = getSeqSum.bind(this, actionId, url);
        var sum = atomSum(atoms) + atomSum(asteriskAtoms);

        return sum;
    }

    this.getStoreWeights = function(actionId, url){
        var weights = [];

        if( '*' in statObject ) weights = Object.keys(statObject['*'])
                        .map(function(id){ return statObject['*'][id].updatesList })
                        .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

        weights = tools
            .returnAll(url, getAllExceptAsterisk(statObject) )
            .map(function(_){ return actionId in statObject[_] ? statObject[_][actionId].updatesList : [] })
            .concat(weights)
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .reduce(function(acc, i){ if(i in acc ) acc[i]++; else acc[i] = 1; return acc }, {})

        return weights;
    }

    this.getWeight = function(actionId, url, storeName){
        var weights = this.getStoreWeights(actionId, url);
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



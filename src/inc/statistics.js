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
            ,view = params.view

        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);

            if( !(mask in statObject) )  
                statObject[mask] = {}
            
            if( !(actionId in statObject[mask]) )  
                statObject[mask][actionId] = { updatesList: [], lastOp: [], ifList: {}, atomList: [], viewList: [] }

            if (ifId) { 
                statObject[mask][actionId].ifList[ifId] = {updatesList: []}
            }

            if(eventKey && ifIds) ifIds.forEach(function(ifId) { 
                statObject[mask][actionId].ifList[ifId].updatesList.push(eventKey);
            })
            if(eventKey) statObject[mask][actionId].updatesList.push(eventKey);

            if(atom) statObject[mask][actionId].atomList.push(atom);

            if(view) statObject[mask][actionId].viewList.push(view);
        })

        return statObject;
    }

    this.removeUpdates = function(actionId, masks, updates){
        // console.log('removing updates...', updates)
        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);
            updates.forEach(function(update){
                if (actionId in statObject[mask]) {
                    var index = statObject[mask][actionId].updatesList.indexOf(update);
                    // console.log('before removal!', mask, update, statObject[mask].updatesList)
                    if( -1 !== index ) statObject[mask][actionId].updatesList.splice(index, 1);
                    // console.log('removed!', mask, update, statObject[mask][actionId].updatesList)
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

    var countActionViews = function(mask, actionId){
        var action = statObject[mask][actionId];
        return ( action && 'viewList' in action ? action.viewList : [] )
                .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
                .reduce(function(acc, i){ if (-1 !== acc.indexOf(i)) { return acc } else { acc.push(i); return acc}}, [])
                .reduce(function(acc, i){ return acc + 1 }, 0);
    }

    var replaceNamesWithWeights = function(weights, seq){
        return seq
            .map(function(_){ return weights[_] })
            .map( function(_){ return void 0 === _ ? 0 : _ } )
    }

    this.getSum = function(url){ 

        var number = tools
            .returnAll(url, Object.keys(statObject) )
            .filter(function(mask){ return '*/' !== mask })
            .map( function(mask){ // each action is atoms group/seq with it's own view names
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        var action = statObject[mask][actionId];
                                        var weights = this.getStoreWeights(url);
                                        var replacer = replaceNamesWithWeights.bind(this, weights);

                                        var viewsNum = countActionViews(mask, actionId);   

                                        var actionNum = replacer( action && 'atomList' in action ? action.atomList : [] )
                                                    .reduce( function(acc, i){ return acc + i }, 0) // sum

                                        console.log('OOO:', weights, action.atomList, actionNum, viewsNum)

                                        return viewsNum * actionNum;
                                    }.bind(this))
                                    .reduce( function(acc, i){ return acc + i }, 0) // sum
            }.bind(this)) 

        console.log('pre:',number )

        return number.reduce(function(acc, i){ return acc + i}, 0);
    }

    this.getStoreWeights = function(url){

        return tools
            .returnAll(url, Object.keys(statObject) )
            .filter(function(mask){ return '*/' !== mask })
            .map(function(mask){ 
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        return statObject[mask][actionId].updatesList
                                    })
                                    .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .reduce(function(acc, i){ if(i in acc ) acc[i]++; else acc[i] = 1; return acc }, {})

    }

    this.getWeight = function(actionId, url, storeName){
        var weights = this.getStoreWeights(url);
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



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

    this.whens = function(){
        return Object.keys(statObject).filter( function(_){ return '*' === _ || -1 !== _.indexOf('/') })
    }

    this.whenStat = function(params){
        var masks = params.masks
            ,eventKey = params.eventKey
            ,render = params.render
            ,ifId = params.ifId
            ,ifIds = params.ifIds
            ,atom = params.atom
            ,actionId = params.actionId
            ,view = params.view

        // console.log('whenStat:', params)
        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);

            if( !(mask in statObject) )  
                statObject[mask] = {}
            
            if( !(actionId in statObject[mask]) )  
                statObject[mask][actionId] = { updatesList: [], rendersList: [], removedRendersList: [], removedUpdatesList: [], lastOp: [], ifList: {}, atomList: [], viewList: [] }

            if (ifId) { 
                statObject[mask][actionId].ifList[ifId] = {updatesList: [], rendersList: []}
            }

            if(eventKey && ifIds) ifIds.forEach(function(ifId) { 
                console.log('registering update for', eventKey, ifId)
                statObject[mask][actionId].ifList[ifId].updatesList.push(eventKey);
            })

            if(render && ifIds) ifIds.forEach(function(ifId) { 
                statObject[mask][actionId].ifList[ifId].rendersList.push(render);
            })

            if(render) statObject[mask][actionId].rendersList.push(render);
            if(eventKey) statObject[mask][actionId].updatesList.push(eventKey);

            if(atom) statObject[mask][actionId].atomList.push(atom);

            if(view) statObject[mask][actionId].viewList.push(view);
        })

        return statObject;
    }

    this.cleanUpRemoved = function(){
        Object.keys(statObject)
            .forEach(function(mask){
                Object.keys(statObject[mask])
                    .forEach(function(actionId){
                        statObject[mask][actionId].removedUpdatesList = []
                        statObject[mask][actionId].removedRendersList = []
                    })
            })
    }

    var removeTokenized = function(listOfRemoved, actionId, masks, items){
        masks.forEach(function(mask){
            mask = utils.sanitizeUrl(mask);
            items.forEach(function(item){
                if (actionId in statObject[mask]) {
                    statObject[mask][actionId][listOfRemoved].push(item);
                }
            }) 

        })
    }

    this.removeUpdates = removeTokenized.bind(this, 'removedUpdatesList');
    this.removeRenders = removeTokenized.bind(this, 'removedRendersList');

    // asked by canceled ifs to pipe into removeUpdates and removeRenders
    var getTokenByUrl = function(token, actionId, url, ifId){

        return tools
            .returnAll(url, this.whens() )
            .filter(function(_){ 
                return actionId in statObject[_] 
            })
            .map(function(_){ 

                console.log('getToken:', statObject[_][actionId].ifList[ifId].updatesList.length)
                return ( 'ifList' in statObject[_][actionId] 
                                        && ifId in statObject[_][actionId].ifList) 
                                            ? statObject[_][actionId].ifList[ifId][token] 
                                            : [] 
            })
            .filter( function(_){ return _.length })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap

    }

    this.getRendersByUrl = getTokenByUrl.bind(this, 'rendersList')
    this.getUpdatesByUrl = getTokenByUrl.bind(this, 'updatesList')

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

    this.getRenderSum = function(url){ // Returns predicted count of renders
        var number = tools
            .returnAll(url, this.whens() )
            .map( function(mask){ // each action is atoms group/seq with it's own view names
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        var removedRenders = statObject[mask][actionId].removedRendersList.length;
                                        var renders = statObject[mask][actionId].rendersList.length;
                                        return renders - removedRenders
                                    })
                                    .reduce( function(acc, i){ return acc + i }, 0) // sum
            })

        number = number.reduce(function(acc, i){ return acc + i}, 0);

        return number
    }

    this.getSum = function(url){  // Returns predicted sum of atom calls

        var number = tools
            .returnAll(url, this.whens() )
            // .filter(function(mask){ return '|)}>#' !== mask })  //just ignore |)}># in ['*', '|)}>#']
            .map( function(mask){ // each action is atoms group/seq with it's own view names
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        var action = statObject[mask][actionId];
                                        var weights = this.getStoreWeights(url);
                                        var replacer = replaceNamesWithWeights.bind(this, weights);

                                        var viewsNum = countActionViews(mask, actionId);   

                                        var actionNum = replacer( action && 'atomList' in action ? action.atomList : [] )
                                                    .reduce( function(acc, i){ return acc + i }, 0) // sum

                                        // console.log('OOO:', weights, action.atomList, actionNum, viewsNum)

                                        return viewsNum * actionNum;
                                    }.bind(this))
                                    .reduce( function(acc, i){ return acc + i }, 0) // sum
            }.bind(this)) 


        return number.reduce(function(acc, i){ return acc + i}, 0);
    }

    this.getStoreWeights = function(url){

        return tools
            .returnAll(url, this.whens() )
            // .filter(function(mask){ return '|)}>#' !== mask }) //just ignore |)}># in ['*', '|)}>#']
            .map(function(mask){ 
                return Object.keys(statObject[mask])
                                    .map(function(actionId){
                                        return s.diff(statObject[mask][actionId].updatesList, statObject[mask][actionId].removedUpdatesList) 
                                    })
                                    .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .map(function(eventName){ return eventName in storeByEvent ? storeByEvent[eventName] : [] })
            .reduce(function(acc, i){ return acc.concat(i) }, []) // flatmap
            .reduce(function(acc, i){ if(i in acc ) acc[i]++; else acc[i] = 1; return acc }, {})

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



"use strict";

var _ = require('lodash');

var StateType = function(state) {
    var newState = _.extend( {}, {lastWhen: void 0, lastActionId: void 0, lastIf: void 0, lastIfIds: [], lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0, stats: { keys: [] }, scrollToTop: void 0  }, state);
    newState.lastIfIds = [].concat( newState.lastIfIds );
    return newState
};

var StateClass = function(){
    var states;

    this.state = void 0;

    this.first = function(){
        states = [];
        this.state = StateType();
        states.push(this.state);
        if('undefined' !== typeof window) window.states = states;
    }

    this.divide = function() {
        this.state = new StateType(this.state);
        this.state.lastDep = void 0;

        states.push(this.state);
    }

    this.rollback = function() {
        states.pop();
        this.state = states[states.length-1];
    }

    this.print = function(message, state) {
        //log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
    }

    return this;
};

module.exports = StateClass;

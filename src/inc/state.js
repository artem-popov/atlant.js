'use strict';

var StateType = function (state) {
  var newState = { ...{ lastIf: void 0, lastDep: void 0, lastName: void 0, lastDepName: void 0, lastInjects: void 0, lastStoreName: void 0 }, ...state };
  return newState;
};

var StateClass = function () {
  var states;

  this.state = void 0;

  this.first = function () {
    states = [];
    this.state = StateType();
    states.push(this.state);
    if (typeof window !== 'undefined') window.states = states;
  };

  this.divide = function () {
    this.state = new StateType(this.state);
    this.state.lastDep = void 0;

    states.push(this.state);
  };

  this.rollback = function () {
    states.pop();
    this.state = states[states.length - 1];
  };

  this.print = function (message, state) {
        // log(message, JSON.stringify([ 'W:',state.lastWhen, "I:",state.lastIf, 'D:',state.lastDep, 'O:',state.lastOp ]));
  };

  this.first();

  return this;
};

module.exports = StateClass;

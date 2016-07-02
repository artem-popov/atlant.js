import { Console as console, error } from '../utils/log';
import curry from 'lodash/curry';
var s = require('../utils/lib');

var unsubscribeView = curry(function (atlantState, viewName) {
  try {
        // turn off all subscriptions of selects for this view
    if (atlantState.viewSubscriptionsUnsubscribe[viewName]) {  // finish Bus if it exists;
      atlantState.viewSubscriptionsUnsubscribe[viewName]();
    }
  } catch (e) {
    error::console.error('unsubscribe error', e.message, e.stack);
  }
});

export default unsubscribeView;


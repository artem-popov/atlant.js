import curry from 'lodash/curry';
var s = require('../utils/lib');

var unsubscribeView = function(viewName){
    try{
        // turn off all subscriptions of selects for this view
        if( this.viewSubscriptionsUnsubscribe[viewName] ) {  // finish Bus if it exists;
            this.viewSubscriptionsUnsubscribe[viewName]()
        }
    } catch(e){
        console.error('unsubscribe error', e.stack)
    }
};

export default unsubscribeView;


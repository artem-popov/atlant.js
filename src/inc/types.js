"use strict"; 


var RenderOperation = {
    render: parseInt(_.uniqueId())
    ,draw: parseInt(_.uniqueId())
    ,replace: parseInt(_.uniqueId())
    ,change: parseInt(_.uniqueId())
    ,clear: parseInt(_.uniqueId())
    ,redirect: parseInt(_.uniqueId())
    ,refresh: parseInt(_.uniqueId())
    ,move: parseInt(_.uniqueId())
    ,nope: parseInt(_.uniqueId())
}

var RenderOperationKey = {};
RenderOperationKey[RenderOperation.render] = 'render'; 
RenderOperationKey[RenderOperation.draw] = 'draw'; 
RenderOperationKey[RenderOperation.replace] = 'replace'; 
RenderOperationKey[RenderOperation.change] = 'change'; 
RenderOperationKey[RenderOperation.clear] = 'clear'; 
RenderOperationKey[RenderOperation.redirect] = 'redirect'; 
RenderOperationKey[RenderOperation.refresh] = 'refresh'; 
RenderOperationKey[RenderOperation.move] = 'move'; 
RenderOperationKey[RenderOperation.nope] = 'nope'; 

// Matching enum for when.
var Matching = {
    stop: _.uniqueId()
    ,continue: _.uniqueId()
    ,once: _.uniqueId()
}

var WhenOrMatch = {
    when: _.uniqueId()
    ,match: _.uniqueId()
}

// Depends enum
var Depends = {
    async: _.uniqueId()
    ,continue: _.uniqueId()
}


module.exports = {
    RenderOperation,
    RenderOperationKey,
    Depends,
    WhenOrMatch,
    Matching
}

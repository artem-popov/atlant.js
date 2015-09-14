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


module.exports = {
    RenderOperation: RenderOperation,
    RenderOperationKey: RenderOperationKey  
}

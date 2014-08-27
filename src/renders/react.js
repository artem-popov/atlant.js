"use strict";
var React = require('react');

var reactRender = { 
    render: function(viewProvider, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            var component = viewProvider(scope); 
            //@TODO: check type of returned value; 
            return resolve(component);
        });

        return rendered;
    }
    ,clear: function(viewProvider, element, scope) {
        return new Promise( function( resolve, reject ){
            return resolve(React.DOM.div(null));
        });
    }
    ,attach: function(component, selector) {
        var rendered = new Promise( function( resolve, reject ){

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )
            if ( !component ) throw Error('AtlantJs, React render: no component provided. ')

            React.renderComponent( component, element, resolve );

        });

        return rendered;
    }
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
    ,attach: reactRender.attach
}

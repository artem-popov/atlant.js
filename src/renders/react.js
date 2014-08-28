"use strict";
var React = require('react');

var updateComponent = [];
var views = [];
var wrappers = [];

var reactRender = { 
    render: function(viewProvider, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            views[name] = viewProvider(scope);  
            if( updateComponent[name] ) updateComponent[name]();
            //@TODO: check type of returned value; 
            return resolve(views[name]);
        });

        return rendered;
    }
    ,clear: function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){
            views[name] = React.DOM.div(null);
            if( updateComponent[name] ) updateComponent[name]();
            return resolve(views[name]);
        });
    }
    ,attach: function(component, name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( !window ) throw Error('AtlantJs, React render: not in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )
            if ( !component ) throw Error('AtlantJs, React render: no component provided. ')

            var wrapper = React.createClass({
                getInitialState: function() {
                    updateComponent[name] = function(){
                        this.forceUpdate() 
                    }.bind(this);
                    return {}
                }
                ,render: function(){
                    return views[name];
                }
            })
            views[name] = component;
            wrappers[name] = wrapper;
            React.renderComponent(wrappers[name](), element, resolve );

        });

        return attached;
    }
    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    ,toString: function(name, options) {
        if ( options && options.static)
            return React.renderComponentToStaticMarkup(views[name]);
        else 
            return React.renderComponentToString(views[name]);
    }
    /* Can return in it's own render format. For React.js it means React component */
    ,toSource: function(name, options) {
       return views[name];
    }
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
    ,attach: reactRender.attach
    ,toString: reactRender.toString
    ,toSource: reactRender.toSource
}

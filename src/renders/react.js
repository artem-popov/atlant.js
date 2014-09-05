"use strict";
var React = require('react');

var views = [];

var Wrapper = (function(){
    var wrappers = {}
        ,thises = {}
        ,instances = {};

    return { 
        check: function(name) {
            if ( !wrappers[name] ) {
                wrappers[name] = React.createClass({
                    render: function(){
                        // if ( views[name] ) 
                        thises[name] = this;

                        if ( !views[name] ) views[name] = React.DOM.div(null); 

                        return views[name];
                        // else
                        // console.log('imhere')
                        // return React.DOM.div(); 
                    }
            })}    
            instances[name] = wrappers[name]();
        }
        ,getWrapper: function(name) {
            return wrappers[name];
        }
        ,getInstance: function(name) {
            return instances[name];
        }
        ,getThis: function(name) {
            return thises[name];
        }
    }
})();

var reactRender = { 
    render: function(viewProvider, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            console.log('rendering the name:', name)

            // get new component somehow.
            views[name] = viewProvider(scope);  

            Wrapper.check(name);

            return resolve(Wrapper.getInstance(name)); 
        });

        return rendered;
    }
    ,clear: function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){

            views[name] = React.DOM.div(null);
            Wrapper.check(name);

            return resolve(Wrapper.getInstance(name));
        });
    }
    ,attach: function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( !window ) throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            React.renderComponent(Wrapper.getInstance(name), element, resolve );

        });

        return attached;
    }
    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    ,stringify: function(name, options) {
        if ( options && options.static)
            return React.renderComponentToStaticMarkup(views[name]);
        else 
            return React.renderComponentToString(views[name]);
    }
    /* Can return inner view representation. For React.js it means React component */
    ,get: function(name, options) {
        Wrapper.check(name);
        var instance = Wrapper.getWrapper(name);
        return instance;
    }
    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    ,innerView: React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })
    ,forceUpdate: function(name) {
        return new Promise( function( resolve, reject) {
            var instance = Wrapper.getThis(name);
            instance.forceUpdate( resolve )
        })
    } 
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
    ,attach: reactRender.attach
    ,stringify: reactRender.stringify
    ,get: reactRender.get
    ,on: { renderEnd: reactRender.forceUpdate }
    ,innerView: reactRender.innerView
}

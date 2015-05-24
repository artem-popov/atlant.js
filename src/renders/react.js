"use strict";
var React = require('react')
     ,s = require('./../lib')
     ,_ = require('lodash')
     ,u = require('../utils')
     ,l = require('../inc/log')();

var State = function(){
    var wrappers = {}
        ,views = {}
        ,thises = {}
        ,instances = {};

        this.check = function(name) {
            if ( !wrappers[name] ) {
                wrappers[name] = React.createClass({
                    render: function(){
                        thises[name] = this;
                        if ( !views[name] ) views[name] = React.DOM.div(null); 

                        return views[name];
                    }
            })}    
            if ( !instances[name] ) 
                instances[name] = wrappers[name]();
        }

        this.getState = function(name) {
            return wrappers[name];
        }

        this.getInstance = function(name) {
            return instances[name];
        }

        this.getThis = function(name) {
            return thises[name];
        }

        this.set = function(name, view){
            views[name] = view;
            return void 0;
        }

        this.list = function(){
            if (! views ) return [];
            return Object.keys(views);
        }

        return this;
};

var Render = function() {
    var state = new State();

    this.name = 'React';
    var rootName = void 0;

    this.render = function(viewProvider, upstream, activeStreamId, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            l.log('%cbegin rendering view ' + name, 'color: #0000ff');
            l.logTime('rendered view ' + name);

            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.  
                // get new component somehow.
                state.set(name, viewProvider(scope));  
            }
            var instance = state.getThis(name);
            state.check(name);
            if( rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate();

            l.logTimeEnd('rendered view ' + name);
            return resolve(state.getInstance(name));  
        });

        return rendered;
    }

    this.clear = function(viewProvider, upstream, activeStreamId, name, scope) {
        return new Promise( function( resolve, reject ){

            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.  
                state.set(name, React.DOM.div(null));
            }
            var instance = state.getThis(name);
            state.check(name);
            if( rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate();

            return resolve(state.getInstance(name));
        });
    }

    this.attach = function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            var root = state.getInstance(name);

            if ( !root ) { throw new Error('AtlantJs: Please use .render(component, "' + name + '") to render something') }

            try{
                React.renderComponent(root, element, function(){ rootName = name; resolve() } );
            } catch(e) {
                console.error(e.message, e.stack)

                var element = document.querySelector('#rootView');
                React.unmountComponentAtNode(element);

                reject(e);
            }

        });

        return attached;
    }

    /* Return ready string representation 
     * options parameter can be used to control what you will get.
     * */
    this.stringify = function(name, options) {
        if ( options && options.static)
            return React.renderComponentToStaticMarkup(state.getInstance(name));
        else 
            return React.renderComponentToString(state.getInstance(name));
    }

    /* Can return inner view representation. For React.js it means React component */
    this.get = function(name, options) {
        state.check(name);
        var instance = state.getState(name);
        return instance;
    }

    this.list = function(){
        return state.list(); 
    }

    this.put = function(name, component){
        state.set(name, component);  
        state.check(name);
        return component;
    }

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })
}

module.exports = Render;

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

        return this;
};

var Render = function() {
    var state = new State();

    this.name = 'React';

    this.render = function(viewProvider, upstream, activeStreamId, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            l.log('%cbegin rendering view ' + name, 'color: #0000ff');
            l.logTime('rendered view ' + name);

            // console.log('---every view:', name, upstream.id)
            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.  
                // get new component somehow.
                state.set(name, viewProvider(scope));  
            } else {
                console.log('---STOP-X1!', upstream, name, upstream.id, activeStreamId.value);
            }

            var instance = state.getThis('name');
            state.check(name);

            l.logTimeEnd('rendered view ' + name);
            return resolve(state.getInstance(name));  
        });

        return rendered;
    }

    this.clear = function(viewProvider, upstream, activeStreamId, name, scope) {
        return new Promise( function( resolve, reject ){

            if( !upstream.isAction && upstream.id !== activeStreamId.value ) { console.log('---STOP-X2!', name, upstream.id, activeStreamId.value); return resolve({code: 'notActiveStream', upstream: upstream, activeStreamId: activeStreamId.value });} // Checking, should we continue or this stream already obsolete. 

            state.set(name, React.DOM.div(null));
            state.check(name);

            return resolve(state.getInstance(name));
        });
    }

    this.update = function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){

            // state.check(name);

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
                React.renderComponent(root, element, resolve );
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

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        render: function() {
            return React.DOM.div(null);
        }
    })

    this.on = { 
        renderEnd: function(name) {
            return new Promise( function( resolve, reject) {
                var instance = state.getThis(name);
                try {
                    if (instance) { 
                        l.log('%cbegin force update of ' + name, 'color: #0000ff');
                        l.logTime('update of ' + name + ' finished')
                        if( instance.isMounted()) instance.forceUpdate(s.compose( l.logTimeEnd.bind(l, 'update of ' + name + ' finished'), resolve));
                        else l.log('the instance is not mounted!', 'color: #0000ff')
                    } else {
                        l.log('%cno need of ' + name + ' update', 'color: #0000ff');
                        resolve();
                    }
                } catch(e) { 
                    console.error(e.message, e.stack)
                    reject({error:e});

                    var element = document.querySelector('#rootView');
                    React.unmountComponentAtNode(element);
                }
            })
        }
        ,error:function(){
            // trying to restore...
            try{
                // React.renderComponent(React.DOM.div('Hey! Error in the city!'), element, function(){l.log('view restored!')} );
                //instance.forceUpdate(resolve);
            } catch(e){
                console.error(e.message, e.stack)
            }
        }
    }
}

module.exports = Render;

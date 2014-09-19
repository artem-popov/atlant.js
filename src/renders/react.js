"use strict";
var React = require('react')
     ,s = require('./../lib')
     ,_ = require('lodash')

var State = function(){
    var wrappers = {}
        ,views = {}
        ,thises = {}
        ,instances = {}
        ,renders = [];

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

        this.pushRenders = function(name) {
            renders.push(name)
        }

        this.getRenders = function(){
            return _.uniq(renders);
        }

        this.cleanRenders = function(){
            renders = [];
        }

        return this;
};

var Render = function() {
    var state = new State;

    this.name = 'React';

    this.render = function(viewProvider, name, scope ) {
        var rendered = new Promise( function( resolve, reject ){
            console.time('rendering view ' + name);

            // get new component somehow.
            state.set(name, viewProvider(scope));  
            var instance = state.getThis('name');
            state.check(name);

            state.pushRenders(name);
            console.timeEnd('rendering view ' + name);

            return resolve(state.getInstance(name)); 
        });

        return rendered;
    }

    this.clear = function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){

            state.set(name, React.DOM.div(null));
            state.check(name);

            return resolve(state.getInstance(name));
        });
    }

    this.attach = function(name, selector) {
        var attached = new Promise( function( resolve, reject ){
            if ( !window ) throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error('AtlantJs, React render: can\'t find the selector' + selector )

            React.renderComponent(state.getInstance(name), element, resolve );

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

    this.on = { renderEnd: function(name) {
        return new Promise( function( resolve, reject) {
            var instance = state.getThis(name);
            try {
                if (instance) { 
                    console.time('forcing update of root')
                    instance.forceUpdate(s.compose( console.timeEnd.bind(console, 'forcing update of root'), resolve));
                    s.map(function(view){ console.log('view rendered:', view) }, state.getRenders());
                    state.cleanRenders();
                } else {
                    resolve();
                }
            } catch(e) { 
                console.error(e.message, e.stack)
                reject({error:e});
                // trying to restore...
                state.set(name, React.DOM.div(null)); 
                try{
                    instance.forceUpdate(resolve);
                } catch(e){
                    console.error(e.message, e.stack)
                }
            }
        })
    }} 

}

module.exports = Render;

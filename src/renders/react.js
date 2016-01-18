"use strict";
var s = require('./../lib')
     ,_ = require('lodash')
     ,u = require('../utils')
     ,Promise = require('promise')
     ,l = require('../inc/log')();

var State = function(React){
    var wrappers = {}
        ,views = {}
        ,thises = {}
        ,instances = {};

        this.getOrCreate = function(name) {
            if ( !wrappers[name] ) {
                wrappers[name] = React.createClass({
                    render: function(){ // name in this function is passed by value
                        thises[name] = this;
                        if ( !views[name] ) views[name] = React.createElement('div');

                        if ( _.isArray( views[name] ) )
                            return  views[name][0]( _.extend( {}, this.props, views[name][1] ) )
                        else
                            return views[name];
                    }
            })}
            if ( !instances[name] )
                instances[name] = React.createFactory(wrappers[name])();
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

        this.destroy = function(){
            wrappers = {};
            views = {};
            thises = {};
            instances = {};
        }

        return this;
};

var Render = function(React) {
    var state = new State(React);

    this.name = 'React';
    var rootName = void 0; // @TODO should be another way to recognize rootName, because there are can be more then 1 of attaches

    this.render = function(viewProvider, upstream, activeStreamId, name, scope ) {
        var rendered = new Promise( function( name, upstream, activeStreamId, viewProvider, scope, resolve, reject ){
            l.log('%cbegin rendering view ' + name, 'color: #0000ff');
            l.logTime('rendered view ' + name);

            if( upstream.isAction || upstream.id === activeStreamId.value ) {// Checking, should we continue or this stream already obsolete.
                // get new component somehow.
                state.set(name, [viewProvider, scope]);
            }
            // console.time('renering ' + name);
            state.getOrCreate(name);
            var instance = state.getThis(name);

            if( rootName !== name && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) instance.forceUpdate(/* console.timeEnd.bind(console, 'renering ' + name) */);

            // console.log('Atlant.js: rendered the view.', name)
            return resolve(state.getInstance(name));
        }.bind(void 0, name, upstream, activeStreamId, viewProvider, scope));

        return rendered;
    }

    this.clear = function(viewProvider, upstream, activeStreamId, name, scope ) {
        return this.render(function(){return React.createElement('div')}, upstream, activeStreamId, name, scope )
    }


    this.attach = function(name, selector) {
        var attached = new Promise( function( name, selector, resolve, reject ){
            if ( typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.')

            var element = document.querySelector(selector);
            if ( !element )   throw Error("AtlantJs, React render: can\'t find the selector" + selector )

            var root = state.getInstance(name);

            if ( !root ) { throw new Error('AtlantJs: Please use .render(component, "' + name + '") to render something') }

            try{
                React.render(root, element, function(){ rootName = name; /* console.log("React said it's attached!"); */ resolve() } );
            } catch(e) {
                console.error(e.message, e.stack)

                var element = document.querySelector('#rootView');
                React.unmountComponentAtNode(element);

                reject(e);
            }

        }.bind(void 0, name, selector));

        return attached;
    }

    /* Return ready string representation
     * options parameter can be used to control what you will get.
     * */
    this.stringify = function(name, options) {
        if ( options && options.static)
            return React.renderToStaticMarkup(state.getInstance(name));
        else
            return React.renderToString(state.getInstance(name));
    }

    /* Can return inner view representation. For React.js it means React component */
    this.get = function(name, options) {
        state.getOrCreate(name);
        return state.getState(name);
    }

    this.list = function(){
        return state.list();
    }

    this.put = function(name, component){
        // console.log('Atlant.js: put the view.')
        state.set(name, component);
        state.getOrCreate(name);        
        return state.getThis(name);
    }

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
    this.innerView = React.createClass({
        render: function() {
            return React.createElement('div');
        }
    })

    this.destroy = function(){
        rootName = void 0;
        state.destroy()
    }
}

module.exports = Render;

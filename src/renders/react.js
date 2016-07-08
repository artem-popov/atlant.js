import { Console as console, render, error } from '../utils/log';

const State = function State(React) {
  let wrappers = {};
  let views = {};
  let thises = {};
  let instances = {};

  this.getOrCreate = function(name) {
    if ( !wrappers[name] ) {
      wrappers[name] = React.createClass({
        displayName: name + '.AtlantWrap',

        render: function render() {
          // name in this function is passed by value
          thises[name] = this;
          if (!views[name]) views[name] = React.createElement('div');

          if (Array.isArray(views[name])) { //came from .draw
            let el;
            const view = views[name][0];
            const props = views[name][1];
            if(typeof(view) === 'function'){  // .draw(props=><Component {...props}/>, 'myView')
              if(!view.type){
                el = view(props) || React.createElement('noscript');
              } else { // react component, .draw(Component, 'myView')
                el = React.createElement(view, props);
              }
            } else {
              el = view;
            }
            return React.cloneElement(el, this.props);
          }else {
            return views[name];
          }
        }
      })}
    if ( !instances[name] ) {
      instances[name] = React.createElement(wrappers[name]);
    }
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

var Render = function (React) {
  var state = new State(React);

  this.name = 'React';
  var selectors = {};

  this.render = function (viewProvider, upstream, activeStreamId, name, scope) {
    render::console.time('rendering view ' + name);

    state.getOrCreate(name); // Always should be first to ensure that it is a simple div to lower influence of React.renderToStaticMarkup

    if (upstream.isAction || upstream.id === activeStreamId.value) {// Checking, should we continue or this stream already obsolete.
      state.set(name, [viewProvider, scope]);
    }

    var instance = state.getThis(name);

    let isError = false;

    let update = () => {
      try {
        instance.forceUpdate();
      } catch (e) {
        error::console.error(e.message, e.stack);
        isError = true;
      }
    };

    if (!isError && instance && instance.isMounted && instance.isMounted() && instance.forceUpdate) {
      update();
    }

    render::console.timeEnd('rendering view ' + name);

    return isError ? Promise.reject() : Promise.resolve(state.getInstance(name));
  };

  this.clear = function (viewProvider, upstream, activeStreamId, name, scope) {
    return this.render(function () {return React.createElement('div');}, upstream, activeStreamId, name, scope);
  };


  this.attach = function (name, selector) {
    if (typeof window === 'undefined') throw Error('AtlantJs, React render: attach not possible in browser.');

    var element = document.querySelector(selector);
    if (!element) throw Error("AtlantJs, React render: can\'t find the selector" + selector);

    state.getOrCreate(name);
    var root = state.getInstance(name);

    try {
      React.render(root, element);
      selectors[name] = selector;
    } catch (e) {
      error::console.error(e.message, e.stack);
      React.unmountComponentAtNode(element);
    }
  };

    /* Return ready string representation
     * options parameter can be used to control what you will get.
     * */
  this.stringify = function (name, options) {
    if (options && options.static)
      return React.renderToStaticMarkup(state.getInstance(name));
    else
            return React.renderToString(state.getInstance(name));
  };

    /* Can return inner view representation. For React.js it means React component */
  this.get = function (name, options) {
    state.getOrCreate(name);
    return state.getState(name);
  };

  this.list = function () {
    return state.list();
  };

  this.put = function (name, component) {
    state.set(name, component);
    state.getOrCreate(name);
    return state.getThis(name);
  };

    /**
     * InnerView component. Can be used inside parent (for example 'root') to render named inner views.
     */
  this.innerView = React.createClass({
    render: function () {
      return React.createElement('div');
    },
  });

  this.destroy = function () {
    selectors = [];
    state.destroy();
  };
};

module.exports = Render;

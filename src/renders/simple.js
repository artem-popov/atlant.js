/*
 * Very simple render. uses viewName as attribute name of attribute and installs string inside
 */
var simpleRender = {
  render: function (viewProvider, name, scope) {
    var fragment = document.createDocumentFragment();
    var viewPromise = viewProvider(scope);
    return viewPromise.then(fragment.appendChild).then(function () {
      var element = document.querySelector('#' + name);
      element.appendChild(fragment);
    });
  }
    , clear: function () {
      var element = document.querySelector('#' + name).innerHTML = '';
      return s.promise('');
    },
};

module.exports = {
  name: 'simple'
    , render: simpleRender.render
    , clear: simpleRender.clear,
};


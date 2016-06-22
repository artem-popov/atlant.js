'use strict';

var dependsName = function () {
  this.init = function (depName, state) {
    if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!');
    var nameContainer = {};
    state.lastNameContainer = nameContainer; // Here we will store further names with ".name"
    return nameContainer;
  };

    // Add invocation when mapping stream, i.e. all data already exist
  this.add = function (depName, nameContainer, upstream) {
    if (!upstream.refs) upstream.refs = {};
    upstream.refs[nameContainer.ref] = depName;
    upstream.ref = nameContainer.ref;
    return upstream;
  };

  this.tailFill = function (value, state) {
    state.lastNameContainer.ref = value;
  };

  return this;
};

var withGrabber = function () {
  this.init = function (state) {
    var data = {};
    state.lastWith = data; // Here we will store further injects with ".transfers"
    return data;
  };
    // Add invocation when mapping stream.
  this.add = function (data, upstream) {
    upstream.with = data;
    return upstream;
  };
  this.tail = function (data, state) {
    if (void 0 === state.lastWith) throw new Error('Atlant.js: incompatible "with" provider! ');
    state.lastWith.value = data;
  };
  return this;
};

var injectsGrabber = function () {
  this.init = function (depName, state) {
    if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!');
    var injects = {};
    state.lastInjects = injects; // Here we will store further injects with ".inject"
    return injects;
  };
    // Add invocation when mapping stream.
  this.add = function (depName, depValue, injects, upstream) {
    if (!upstream.depends) { upstream.depends = {}; }
    upstream.depends[depName] = depValue;

    if (!upstream.injects) upstream.injects = [];
    upstream.injects.push(injects);
    return upstream;
  };
  return this;
};


module.exports = {
  injectsGrabber: injectsGrabber
                , dependsName: dependsName
                , withGrabber: withGrabber,
};

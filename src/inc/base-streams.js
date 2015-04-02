"use strict";

var Bacon = require('baconjs');

var baseStreams = Object.create(null);

baseStreams.destructorStream = new Bacon.Bus();

module.exports = baseStreams;

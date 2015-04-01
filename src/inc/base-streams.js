"use strict";

var Bacon = require('baconjs');

module.exports = function()  {

    var baseStreams = Object.create(null);

    baseStreams.destructorStream = new Bacon.Bus();

    return baseStreams;
}

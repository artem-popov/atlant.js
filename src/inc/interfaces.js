    // Help in creating injects tail
    // Include this before declaring streams: "var injects = prepare4injectsInit();"
    
var injectsGrabber = function() {
    this.init = function(depName, state) {
        if (!depName) throw new Error('Atlant.js: developer: you forgot the "depName"!')
        var injects = {};
        state.lastInjects = injects // Here we will store further injects with ".inject"
        return injects;
    }
    // Add invocation when mapping stream.
    this.add = function(depName, depValue, injects, upstream) {
        if( !upstream.depends ) { upstream.depends = {}; } 
        upstream.depends[depName] = depValue;

        if( !upstream.injects ) upstream.injects = [];
        upstream.injects.push(injects);
        return upstream
    }
    return this;
}

var whenCounter = function() {
    this.add = function(stream, whenCount) {
        return stream // counter for whens 
            .onValue(function(upstream) {
                whenCount.value++;
            });
    }
    return this;
}

module.exports = { 
                injectsGrabber:injectsGrabber
                ,whenCounter: whenCounter
}

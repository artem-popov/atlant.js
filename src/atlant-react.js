var React = require('react');

var reactRender = { 
    render: function(viewProvider, name, scope) {
        React.unmountComponentAtNode( document.querySelector( '#' + name ) );

        var rendered = new Promise( function( resolve, reject ){

            var onRender = function(result) {
                console.log('react result of rendering:', result);
                if (false) {
                    return reject();
                }
                return resolve();
            }

            React.renderComponent( viewProvider(scope), document.querySelector( '#' + name ), onRender );
        });


        return rendered;
    }
    ,clear: function(viewProvider, name, scope) {
        return new Promise( function( resolve, reject ){
            if (React.unmountComponentAtNode( document.querySelector( '#' + name ) )) {
                resolve();
            } else {
                reject();
            }
        });
    }
}

modules.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
}

var React = require('react');

var reactRender = { 
    render: function(viewProvider, element, scope ) {
        var rendered = new Promise( function( resolve, reject ){

            React.unmountComponentAtNode( element );

            var onRender = function(result) {
                return resolve();
            }

            var instance = React.renderComponent( viewProvider(scope), element, onRender );
        });

        return rendered;
    }
    ,clear: function(viewProvider, element, scope) {
        return new Promise( function( resolve, reject ){
            if (React.unmountComponentAtNode( element )) {
                console.log('successefully unmounted component')
                return resolve();
            } else {
                console.log('failed unmount component')
                return reject();
            }
        });
    }
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
}

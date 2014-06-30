var React = require('react');

var reactRender = { 
    render: function(viewProvider, element, scope ) {
        React.unmountComponentAtNode( element );

        var rendered = new Promise( function( resolve, reject ){

            var onRender = function(result) {
                
                console.log('react result of rendering:', result);
                if (false) {
                    return reject();
                }
                return resolve();
            }

            try{
                var instance = React.renderComponent( viewProvider(scope), element, onRender );
            } catch(e) {
                console.error( 'Atlantjs: React doesn\'t rendered component', e );
            }
        });


        return rendered;
    }
    ,clear: function(viewProvider, element, scope) {
        return new Promise( function( resolve, reject ){
            if (React.unmountComponentAtNode( element )) {
                resolve();
            } else {
                reject();
            }
        });
    }
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
}

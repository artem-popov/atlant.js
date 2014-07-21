var React = require('react');

var reactRender = { 
    render: function(viewProvider, element, scope ) {
        var rendered = new Promise( function( resolve, reject ){

            React.unmountComponentAtNode( element );

            var onRender = function(result) {
                return resolve();
            }

            try{
                console.log('prepare to render:', scope, viewProvider(scope), element);
                var instance = React.renderComponent( viewProvider(scope), element, onRender );
            } catch(e) {
                console.error( 'Atlantjs: React doesn\'t rendered component', e );
            }
        });


        return rendered;
    }
    ,clear: function(viewProvider, element, scope) {
        return new Promise( function( resolve, reject ){
            try{
                console.log('prepare to clear: ', element)
                if (React.unmountComponentAtNode( element )) {
                    console.log('successefully unmounted component')
                    return resolve();
                } else {
                    console.log('failed unmount component')
                    return reject();
                }
            } catch(e) {
                console.error( 'Atlantjs: React doesn\'t cleared component', e );
            }
        });
    }
}

module.exports = { 
    name: 'react'
    ,render: reactRender.render
    ,clear: reactRender.clear 
}

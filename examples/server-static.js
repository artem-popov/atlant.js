
var connect = require('connect')
    , url = require('url')
    , fs = require('fs')

connect()
    .use( connect.static('../lib') )
    .use( connect.static('./') )
    .use(function( req, res ){ // If resource not found, then always return cached index.html
        var s = fs.createReadStream( 'index.html' );
        s.once( 'fd', function () {res.writeHead( 200 );} );
        s.pipe( res );
    })
    .listen( 9500 );

console.log( 'Server listening on http://localhost:9500' );

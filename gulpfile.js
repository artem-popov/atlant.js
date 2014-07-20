var browserify = require('browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,source = require('vinyl-source-stream')
    ,literalify = require('literalify')
    ,connect = require('connect')
    ,fs = require('fs')
    ,serveStatic = require('serve-static')
    
var browOpt = {standalone: 'atlant'};
var dest = 'lib/';

var getLocalIndex = function(req, res, next){
    return fs.createReadStream('examples/index.html', {encoding: 'utf8'})
        .pipe(res);
}

/** Examples local server */
gulp.task('examples', function() {
    return connect()
        .use(serveStatic('examples/'))
        .use(serveStatic('lib/'))
        .use(getLocalIndex)
        .listen(9500);
});

gulp.task('watch', function() {
    return gulp
        .src('src/**/*.js')
        .pipe( plumber() )
        .pipe( watch( function(){ 
            var b = browserify( './src/atlant.js' );
            b.ignore('react');
            b.transform(literalify.configure({react: 'window.React'}));

            b.bundle({ standalone: 'atlant' }).pipe(source('./atlant.js'))
                .pipe( gulp.dest(dest) )
        }))
});

gulp.task('default', ['watch', 'examples']);


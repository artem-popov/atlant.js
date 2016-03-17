"use strict";

var browserify = require('browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,sourceStream = require('vinyl-source-stream')
    ,connect = require('connect')
    ,fs = require('fs')
    ,serveStatic = require('serve-static')
    ,Promise = require('promise')
    ,gutil = require('gulp-util')
    ,print = require('gulp-print')
    ,rename = require('gulp-rename')
    ,flow = require('flowcheck')
    ,argv = require('yargs').argv // there is also minimist package
    ,documentation = require('gulp-documentation')

var output = 'lib/';

var source = 'source' in argv ? argv.source : 'atlant.js';
var enableFlow = 'flow' in argv ? argv.flow : false;

var getLocalIndex = function(req, res, next){
    return fs.createReadStream('examples/index.html', {encoding: 'utf8'})
        .pipe(res);
}


/** Examples local server */
// not in use actually
gulp.task('examples', function() {
    return connect()
        .use(serveStatic('examples/'))
        .use(serveStatic('lib/'))
        .use(serveStatic('/bower_components/bacon/dist/'))
        .use(serveStatic('/bower_components/lodash/dist/'))
        .use(serveStatic('/bower_components/react/'))
        .use(getLocalIndex)
        .listen(9500);
});

gulp.task('watch', function() {
        process.env.NODE_PATH = 'modules/';
        return gulp
            .src(['src/**/*.js', 'src/**/*.sjs', 'src/**/*.ls'])
            .pipe( plumber() )
            .pipe( watch( function(){
                var literalify = require('literalify');
                var b = browserify( './src/' + source );
                b.ignore('react');
            //    b.transform(sweetify);
                b.transform(literalify.configure({
                    react: 'window.React'
                    ,lodash: 'window._'
                    ,baconjs: 'window.Bacon'
                    ,promise: 'window.Promise'
                }));

                b.bundle({ standalone: 'Atlant' }).pipe(sourceStream('./' + source))
                    .pipe( gulp.dest(output) )
            }))
});

var browserifyOptions = {
    entries: ['./src/' + source],
    debug: false,
    verbose: true,
    cache: {}, packageCache: {}, fullPaths: false, // Requirement of watchify
    extensions: ['.js'],
    global: false,
    bundleExternal: true,
    insertGlobals: false,
    detectGlobals: false
}

var literalifyConfig = {
    react: 'window.React'
    ,lodash: 'window._'
    ,baconjs: 'window.Bacon'
    ,promise: 'window.Promise'
}

var build = function(bundle){
    return bundle
        .on('error', function(err){
            gutil.log(gutil.colors.red('Error'), err.message);
            this.emit('end') 
        } )
        // .pipe(progress(process.stderr)) // Not usefull here
        .pipe(sourceStream('src/' + source))
        .pipe(rename('atlant.js'))
        .pipe(print())
        .pipe(gulp.dest(output))

}

var browserifyIt = function(isWatcher){
    process.env.NODE_PATH = 'src/';

    var browserify = require('browserify');

    var b = browserify(browserifyOptions)

    if (isWatcher) {

        var watchify = require('watchify');

        b = watchify(b)
            .on('update', function () { // When any files update
                var updateStart = Date.now();
                console.log('Updating!');

                build(b.bundle()); // at the moment browserify already obtained all transforms, etc.

                console.log('Updated!', (Date.now() - updateStart) + 'ms');
        })
    }

    var literalify = require('literalify');
    var babelify = require('babelify');

    if(enableFlow )
        b = b
            .transform(flow)

    b = b
        .transform(babelify.configure({loose: 'es6.modules', blacklist: [], ast: false, compact: false, optional: ["es7.comprehensions"]}))
        .transform(literalify.configure(literalifyConfig))
        .on('log', gutil.log)
        .on('time', function (time) {console.log('the time of:', time)})
        .on('file', function(file, id, parent){process.stdout.write(".");})

    return build(b.bundle({ standalone: 'Atlant' }));
}

gulp.task('browserify', function() {
    return browserifyIt(false)
});

gulp.task('browserifyWatcher', function() {
    return browserifyIt(true)
});


gulp.task('documentation', function () {

  gulp.src('src/utils.js')
    .pipe(documentation({ format: 'md' }))
    .pipe(gulp.dest('documentation.md'));

  // gulp.src('./index.js')
  //   .pipe(documentation({ format: 'html' }))
  //   .pipe(gulp.dest('html-documentation'));
  //
  // gulp.src('./index.js')
  //   .pipe(documentation({ format: 'json' }))
  //   .pipe(gulp.dest('json-documentation'));

});

gulp.task('default', ['browserifyWatcher']);

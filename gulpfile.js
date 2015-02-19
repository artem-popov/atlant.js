var browserify = require('browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,source = require('vinyl-source-stream')
    ,literalify = require('literalify')
    ,connect = require('connect')
    ,fs = require('fs')
    ,serveStatic = require('serve-static')
    ,Promise = require('promise')
    ,sweetify = require('sweetify')    

var browOpt = {standalone: 'atlant'};
var dest = 'lib/';

var getLocalIndex = function(req, res, next){
    return fs.createReadStream('examples/index.html', {encoding: 'utf8'})
        .pipe(res);
}

var exec = require('child_process').exec;
function execute(command, callback){
    exec(command, function(error, stdout, stderr){ callback(stdout); });
};

var getCommit = new Promise( function(resolve, reject) {
    execute("git rev-parse HEAD", function(commitCode){
        resolve(commitCode)
    });
});

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

var commitCode;
gulp.task('revision', function(done) {
    getCommit.then(function(commit){
        commitCode = commit;
        done();
    })
});

gulp.task('watch', function() {
        return gulp
            .src(['src/**/*.js', 'src/**/*.sjs', 'src/**/*.ls'])
            .pipe( plumber() )
            .pipe( watch( function(){ 
                var b = browserify( './src/atlant.js' );
                b.ignore('react');
            //    b.transform(sweetify);
                b.transform(literalify.configure({
                    react: 'window.React'
                    ,lodash: 'window._'
                    ,baconjs: 'window.Bacon'
                    ,promise: 'window.Promise'
                    ,AtlantVersion: "'0.3.25'"
                    ,AtlantBuild: '"' + (new Date().getTime()) + '"'
                    ,AtlantRevision: '"' + commitCode.trim() + '"'
                }));

                b.bundle({ standalone: 'Atlant' }).pipe(source('./atlant.js'))
                    .pipe( gulp.dest(dest) )
            }))
});

gulp.task('default', ['revision', 'watch']);

var browserify = require('browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,source = require('vinyl-source-stream')
    ,literalify = require('literalify')

var browOpt = {standalone: 'atlant'};
var dest = 'lib/';

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

gulp.task('default', ['watch']);


var browserify = require('browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,source = require('vinyl-source-stream')

var browOpt = {standalone: 'atlant'};
var dest = 'lib/';

gulp.task('watch', function() {
    return gulp
        .src('src/**/*.js')
        .pipe( plumber() )
        .pipe( watch( function(){ 
            console.log('hohoho');
            var b = browserify( './src/atlant.js' );
            b.ignore('react');
        
            b.bundle({ standalone: 'atlant' }).pipe(source('./atlant.js'))
                .pipe( gulp.dest(dest) )
                .on('data', function() {console.log('aaaaaa');})
        }))
});

gulp.task('default', ['watch']);


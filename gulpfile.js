var browserify = require('gulp-browserify')
    ,plumber = require('gulp-plumber')
    ,watch = require('gulp-watch')
    ,gulp = require('gulp')
    ,gulpIf = require('gulp-if')

var browOpt = {standalone: 'atlant', ignore: ['react']};
var dest = 'lib/';

gulp.task('watch', function() {
    gulp
        .src('src/**/*.js')
        .pipe( plumber() )
        .pipe( watch() ) 
        .pipe( gulpIf( /src\/atlant\.js/, browserify(browOpt) ) )
        .pipe( gulpIf( /src\/atlant\.js/ , gulp.dest(dest) ) )
});

gulp.task('default', ['watch']);


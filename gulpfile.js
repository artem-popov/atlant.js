
var gulp = require('gulp')
    ,browserify = require('gulp-browserify')


gulp.task('browserify', function() {
    gulp.src('src/atlant.js')
        .pipe(browserify({standalone: 'atlant', ignore: ['react']}))  
        .pipe(gulp.dest('lib/'));
});

gulp.task('default', ['browserify']);


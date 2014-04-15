
var gulp = require('gulp');
var traceur = require('gulp-traceur');


gulp.task('traceur', function() {
    gulp.src('src/**/*.js')
        .pipe(traceur({sourceMaps: true, experimental: true}))  
        .pipe(gulp.dest('lib/'));
});

gulp.task('default', ['traceur']);


/**
 * Pony.fm - A community for pony fan music.
 * Copyright (C) 2015 Peter Deltchev
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var gulp = require("gulp"),
    gutil = require("gulp-util"),
    plug = require("gulp-load-plugins")(),
    argv = require("yargs").argv,
    header = require("gulp-header"),
    webpack = require("webpack"),
    WebpackDevServer = require("webpack-dev-server"),
    webpackDevConfig = require("./webpack.dev.config.js"),
    webpackProductionConfig = require("./webpack.production.config.js"),
    webpackStream = require('webpack-stream'),
    _ = require("underscore"),
    runSequence = require("run-sequence"),
    rimraf = require("rimraf"),
    panini = require("panini"),
    inky = require("inky"),
    fs = require("fs"),
    siphon = require('siphon-media-query'),
    lazypipe = require('lazypipe'),
    ext_replace = require('gulp-ext-replace');

var plumberOptions = {
    errorHandler: plug.notify.onError("Error: <%= error.message %>")
};

var licenseHeader = [
    "/**",
    "* Pony.fm - A community for pony fan music.",
    "* Copyright (C) 2016 Peter Deltchev and others",
    "*",
    "* This program is free software: you can redistribute it and/or modify",
    "* it under the terms of the GNU Affero General Public License as published by",
    "* the Free Software Foundation, either version 3 of the License, or",
    "* (at your option) any later version.",
    "*",
    "* This program is distributed in the hope that it will be useful,",
    "* but WITHOUT ANY WARRANTY; without even the implied warranty of",
    "* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
    "* GNU Affero General Public License for more details.",
    "*",
    "* You should have received a copy of the GNU Affero General Public License",
    "* along with this program.  If not, see <http://www.gnu.org/licenses/>.",
    "*/",
    "",
    ""
].join('\n');


const PRODUCTION = !!(argv.production);


gulp.task("webpack-build", function() {
    return gulp.src(_.values(webpackProductionConfig.entry))
        .pipe(webpackStream(webpackProductionConfig))
        .pipe(header(licenseHeader))
        .pipe(gulp.dest('public'));
});


gulp.task("webpack-dev-server", function () {
    // Starts a webpack-dev-server
    var compiler = webpack(webpackDevConfig);

    new WebpackDevServer(compiler, {
        // server and middleware options, currently blank
        // stats: {chunks: false}
        stats: 'minimal'
    }).listen(61999, "localhost", function (err) {
        if (err)
            throw new gutil.PluginError("webpack-dev-server", err);

        // Server listening
        gutil.log("[webpack-dev-server]", "http://localhost:61999/webpack-dev-server/index.html");
    });
});


gulp.task("styles-app", function () {
    var includedStyles = [
        "resources/assets/styles/base/jquery-ui.css",
        "resources/assets/styles/base/colorbox.css",
        "resources/assets/styles/app.less"
    ];

    if (!argv.production) {
        // we also want to add the embed stuff, since we're in development mode
        // we want to watch embed files and re-compile them. However, we want
        // to leave this path out in production so that embed files are not bloating
        // the css file
        includedStyles.push("resources/assets/styles/embed.less");

        // Remove app.less from the cache so that it gets recompiled
        var styleCache = plug.cached.caches.styles;
        for (var file in styleCache) {
            if (!styleCache.hasOwnProperty(file))
                continue;

            if (!endsWith(file, "app.less"))
                continue;

            delete styleCache[file];
        }
    }

    // note that we're not doing autoprefixer on dev builds for now to shave off roughly 600-700 milliseconds per
    // build. It's already taking forever to recompile the less

    return argv.production
        // Production pipeline
        ? gulp.src(includedStyles, {base: "resources/assets/styles"})
        .pipe(plug.plumber(plumberOptions))
        .pipe(plug.if(/\.less/, plug.less()))
        .pipe(plug.autoprefixer({
            browsers: ["last 2 versions"],
            cascade: false
        }))
        .pipe(plug.concat("app.css"))
        .pipe(plug.cleanCss())
        .pipe(header(licenseHeader))
        .pipe(gulp.dest("public/build/styles"))

        // Development pipeline
        : gulp.src(includedStyles, {base: "resources/assets/styles"})
        .pipe(plug.plumber(plumberOptions))
        .pipe(plug.cached("styles"))
        .pipe(plug.sourcemaps.init())
        .pipe(plug.if(/\.less/, plug.less()))
        .pipe(header(licenseHeader))
        .pipe(plug.sourcemaps.write())
        .pipe(gulp.dest("public/build/styles"))
        .pipe(plug.livereload());
});

gulp.task("styles-embed", function () {
    // note that this task should really only ever be invoked for production
    // since development-mode watches and builds include the embed styles
    // already

    return gulp.src(["resources/assets/styles/embed.less"], {base: "resources/assets/styles"})
        .pipe(plug.less())
        .pipe(plug.autoprefixer({
            browsers: ["last 2 versions"],
            cascade: false
        }))
        .pipe(plug.concat("embed.css"))
        .pipe(plug.cleanCss())
        .pipe(header(licenseHeader))
        .pipe(gulp.dest("public/build/styles"));
});

gulp.task('copy:templates', function () {
    gulp.src([
        'public/templates/**/*.html'
    ])
        .pipe(plug.angularTemplatecache({
            module: "ponyfm",
            root: "/templates"
        }))
        .pipe(header(licenseHeader))
        .pipe(gulp.dest('public/build/scripts'));
});



//=============== ZURB Foundation Email stack =================//

// These tasks are adapted from ZURB's gulpfile (https://github.com/zurb/foundation-emails-template/blob/master/gulpfile.babel.js).
// They have been modified for ES5, Gulp 3 compatibility, and namespaced with "email-"
// to avoid collisions with Pony.fm's other Gulp tasks.

// Delete the "resources/views/emails/build" folder
// This happens every time a build starts
gulp.task("email-clean", function emailClean(done) {
    rimraf('resources/views/emails/build', done);
});

// Compile layouts, pages, and partials into flat HTML files
// Then parse using Inky templates
gulp.task("email-pages", function emailPages() {
    return gulp.src('resources/emails/src/pages/**/*.blade.php.hbs')
        .pipe(panini({
            root: 'resources/emails/src/pages',
            layouts: 'resources/emails/src/layouts',
            partials: 'resources/emails/src/partials',
            helpers: 'resources/emails/src/helpers'
        }))
        .pipe(inky())
        .pipe(ext_replace('.blade.php', '.blade.php.hbs'))
        .pipe(gulp.dest('resources/views/emails/build'));
});

// Reset Panini's cache of layouts and partials
gulp.task("email-reset-pages", function emailResetPages(done) {
    panini.refresh();
    done();
});

// Compile Sass into CSS
gulp.task("email-sass", function emailSass() {
    return gulp.src('resources/emails/src/assets/scss/app.scss')
        .pipe(plug.if(!PRODUCTION, plug.sourcemaps.init()))
        .pipe(plug.sass({
            includePaths: ['node_modules/foundation-emails/scss']
        }).on('error', plug.sass.logError))
        .pipe(plug.if(PRODUCTION, plug.uncss(
            {
                html: ['resources/views/emails/build/**/*.blade.php']
            })))
        .pipe(plug.if(!PRODUCTION, plug.sourcemaps.write()))
        .pipe(gulp.dest('resources/views/emails/build/css'));
});

// Copy and compress images
gulp.task("email-images", function emailImages() {
    return gulp.src('resources/emails/src/assets/img/**/*')
        .pipe(plug.imagemin())
        .pipe(gulp.dest('./resources/views/emails/build/assets/img'));
});

// Inline CSS and minify HTML
gulp.task("email-inline", function emailInline() {
    return gulp.src('resources/views/emails/build/**/*.blade.php')
        .pipe(plug.if(PRODUCTION, emailInliner('resources/views/emails/build/css/app.css')))
        .pipe(gulp.dest('resources/views/emails/build'));
});


// Helper tasks for email watchers
gulp.task("email-rebuild-handlebars", function(callback){
    runSequence("email-pages", "email-inline", callback);
});
gulp.task("email-rebuild-layouts", function(callback){
    runSequence("email-reset-pages", "email-pages", "email-inline", callback);
});
gulp.task("email-rebuild-sass", function(callback){
    runSequence("email-reset-pages", "email-sass", "email-pages", "email-inline", callback)
});

// Watch for file changes
gulp.task("email-watch", function (callback) {
    gulp.watch('resources/emails/src/pages/**/*.blade.php.hbs', ["email-rebuild-handlebars"]);
    gulp.watch(['resources/emails/src/layouts/**/*', 'resources/emails/src/partials/**/*'], ["email-rebuild-layouts"]);
    gulp.watch(['resources/emails/src/assets/scss/**/*.scss'], ["email-rebuild-sass"]);
    gulp.watch('resources/emails/src/assets/img/**/*', ["email-images"]);
    callback();
});


// Inlines CSS into HTML, adds media query CSS into the <style> tag of the email, and compresses the HTML
function emailInliner(css) {
    var css = fs.readFileSync(css).toString();
    var mqCss = siphon(css);

    return lazypipe()
        .pipe(plug.inlineCss, {
            applyStyleTags: false,
            removeStyleTags: true,
            preserveMediaQueries: true,
            removeLinkTags: false
        })
        .pipe(plug.replace, '<!-- <style> -->', "<style>" + mqCss + "</style>")
        .pipe(plug.replace, '<link rel="stylesheet" type="text/css" href="css/app.css">', '')
        .pipe(plug.htmlmin, {
            collapseWhitespace: true,
            minifyCSS: true
        });
}

// Build the "resources/views/emails/build" folder by running all of the above tasks
gulp.task('email-build', function(callback){
    runSequence("email-clean", "email-pages", "email-sass", "email-images", "email-inline", callback);
});


// Build emails, run the server, and watch for file changes
gulp.task('email-default', function(callback) {
    runSequence('email-build', "email-watch");
    callback();
});

//=============== END Zurb Foundation Email stack =================//

gulp.task('build', [
    'webpack-build',
    'copy:templates',
    'styles-app',
    'styles-embed',
    'email-build'
]);

gulp.task("watch-legacy", ["build"], function () {
    gulp.watch("resources/assets/styles/**/*.{css,less}", ["styles-app"]);
});

gulp.task("watch", ["webpack-dev-server", "email-default", "watch-legacy"], function () {});


function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

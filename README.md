Atlant.js is a micro-routing framework for Angular.js / React.js

It is provides robust routing and dependency injection mechanism. 

It uses bacon.js streams to work.

Examples and documentation are on the way.

The slides folder have slides of April 10 of 2014. 
The talk was about previous version of atlant.js named routeStreams.js.
DSL is a little obsolete.

#Where is the angular.js version?

src/angular/ng-s-atlant-route.js - main service, which accepts routes declarations.
src/angular/ng-s-atlant-params.js - service, which publish route params info
src/angular/ng-s-atlant-utils.js - internal utilities (do not use :)

#Which renders available?

- the angular render (obsolete yet)
- react render

#Install

```sh
bower install atlant.js
```


add to you index.html:

```html
<script src="lodash.min.js" type="text/javascipt"></script>
<script src="bacon.min.js" type="text/javascipt"></script>
<script src="atlant.js" type="text/javascipt"></script>
```

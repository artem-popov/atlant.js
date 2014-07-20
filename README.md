#Atlant.js
Atlant.js is a micro-routing framework for Angular.js / React.js

It provides robust routing and dependency injection mechanism. 

It uses bacon.js streams to work.

Examples and documentation are on the way.

The slides folder have slides of April 10 of 2014. 
The talk was about previous version of atlant.js named routeStreams.js.
DSL is a little obsolete.

##Where is the angular.js version?

```js
src/angular/ng-s-atlant-route.js // main service, which accepts routes declarations.
src/angular/ng-s-atlant-params.js // service, which publish route params info
src/angular/ng-s-atlant-utils.js // internal utilities (do not use :)
```

##Which renders available?

- the angular render (obsolete yet)
- react render

##Installation

```sh
bower install atlant.js
```


add to you index.html:

```html
<script src="lodash.min.js" type="text/javascipt"></script>
<script src="bacon.min.js" type="text/javascipt"></script>
<script src="atlant.js" type="text/javascipt"></script>
```

## API

### atlant.render:

```js
atlant.render :: function, string
atlant.render(renderFn [, view]) // renders renderFn to default view or mentioned view if defined.
```

#### renderFn:

```js
renderFn :: ( info, scope ) -> promise
var renderFn = ( info, scope ) => {
    return new Promise((resolve) => resolve());
}
```

### atlant.if:

```js
atlant.if :: function -> atlant
atlant.if( ifFn ) // bifurcates flow. the first render/clean/redirect after if will end created leaf of stream
```

```js
ifFn :: ( lastDep ) -> boolean
var ifFn = ( lastDep ) => {
    return 404 === lastDep.status ? false : true;
}
```

### atlant.when:

```js
atlant.when :: string -> atlant
atlant.when( routes ) // adds leaf with route mask 
```
"routes" are conditional like '/faq || /about', the "&&" and brackets not yet supported.

## Examples

This command will start examples server available at http://localhost:9500
```sh
gulp examples
```

For now it's not big deal.

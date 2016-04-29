#Atlant.js

![Atlant.js](/images/atlant-logo.png?raw=true)

Atlant.js is a micro-routing framework for React.js

It provides robust routing and dependency injection mechanism. 

It uses bacon.js streams to work.

Examples and documentation are on the way.

The slides folder have slides of April 10 of 2014. 
The talk was about previous version of atlant.js named routeStreams.js.
DSL is a little obsolete.

##Which renders available?

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

On it's way.

### Flow

Atlant watches when you touch links and manages them. 
use a attribute data-atlant="ignore" to skip this.

## How it look's like?

```js
atlant 
    .when('/', _ => atlant.stream().render(<Home/>).end() )
    .when('/login', _ => atlant.stream().render(<Login/>).end() )
    .when('/@:profileName', _ => atlant.stream()  
                            .select('profile').from('Profiles').where( _ => _.params.profileName )
                            .draw(<Profile/>, 'profileView')
                            .depends(_ => $.get(`/api/profiles/${_}`)).where( _ => _.params.profileName).as('profileFromBE')
                            .update('PROFILE').with(_ => _.profileFromBE)
                            .subscribe('warn')
                            .end()
    )
    .action('warn', _ => { console.log('Data Arrived!'); return Promise.resolve() } )
```

Awesome isn't it?

## Examples

Just install dependencies and open examples/index.html in browser.
```sh
bower install
```

Actually, no examples inside yet.



var animate = {
    before: function( clone, targetElement) {
        return new Promise( function( resolve, reject ) {
/*                 
            console.log('animating', clone, targetElement);
            console.log( 'props:', prev.offsetTop, prev.offsetLeft );
            cloned.style.position = 'absolute';
            cloned.style.top = 10;
            cloned.style.left = 10;
            cloned.classList.add("disappearedClass");

            prev.innerHtml = ''; // innerHtml is the fastest, prove: http://jsperf.com/innerhtml-vs-removechild/167
            prev.appendChild(newly);
            prev.classList.add("appearedClass");
            resolve();
            */
        })
    }
    /* If after returns the Promise, then the signal to render childView will be chined to that promise. */
    ,after: function( clone, targetElement) {
        return new Promise( function( resolve, reject) {
            clone.parentNode.removeChild(clone);
            resolve();
        })
    }
};

module.exports = animate;

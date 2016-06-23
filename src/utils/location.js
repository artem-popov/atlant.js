/**
 * This is realization of location protocol for client and server side.
 *
 * */


export function getPathname() {
  if (!('location' in this)) console.error('no window object, cannot do ...location.pathname...');
  return 'location' in this ? this.location.pathname : '';
}

export function getHref() {
  if (!('location' in this)) console.error('no window object, cannot do ...location.pathname...');
  return 'location' in this ? this.location.href : '';
}

export function getLocation() { // It could work either with window and with nodejs {req, res}.
  let result;

  if ('location' in this) {
    result = this.location.pathname + this.location.search;
  } else {
    console.error('no window object, cannot do ...getLocation(url)...');
    result = '';
  }

  return result;
}

export function assign(url) {
  let result;

  if ('location' in this) {
    result = this.location.assign(url);
  } else {
    console.error('no window object, cannot do ...assign(url)...');
  }

  return result;
}


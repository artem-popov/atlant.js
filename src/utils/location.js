import { Console as console, error } from './log';

/**
 * This is realization of location protocol for client and server side.
 *
 * */

export function getHash() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.hash...');
  return 'location' in this ? this.location.hash : '';
}
export function getHost() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.host...');
  return 'location' in this ? this.location.host : '';
}

export function getHostname() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.hostname...');
  return 'location' in this ? this.location.hostname : '';
}

export function getHref() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.href...');
  return 'location' in this ? this.location.href : '';
}

export function getOrigin() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.origin...');
  return 'location' in this ? this.location.origin : '';
}

export function getPathname() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.pathname...');
  return 'location' in this ? this.location.pathname : '';
}

export function getPort() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.port...');
  return 'location' in this ? this.location.port : '';
}

export function getProtocol() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.protocol...');
  return 'location' in this ? this.location.protocol : '';
}

export function getSearch() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.search...');
  return 'location' in this ? this.location.search : '';
}

export function reload() {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.reload...');
  return 'location' in this ? this.location.reload() : '';
}

export function replace(url) {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.replace...');
  return 'location' in this ? this.location.replace(url) : '';
}

export function assign(url) {
  if (!('location' in this)) error::console.error('no window object, cannot do ...location.assign...');
  return 'location' in this ? this.location.assign(url) : '';
}

export function getLocation() { // It could work either with window and with nodejs {req, res}.
  let result;

  if ('location' in this) {
    result = this.location.pathname + this.location.search;
  } else {
    error::console.error('no window object, cannot do ...getLocation(url)...');
    result = '';
  }

  return result;
}

export function assign(url) {
  let result;

  if ('location' in this) {
    result = this.location.assign(url);
  } else {
    error::console.error('no window object, cannot do ...assign(url)...');
  }

  return result;
}


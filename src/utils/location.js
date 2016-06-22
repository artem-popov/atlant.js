/**
 * This is realization of location protocol for server side.
 *
 * */


export function getPathname() {
  console.log('this:', this)
  return this.pathname;
}

export function getLocation() {
  let result;

  if ('pathname' in this && 'search' in this) {
    result = this.pathname + this.search;
  } else {
    console.error('no window object, cannot do ...getLocation(url)...');
    result = '';
  }

  return result;
}

export function assign(url) {
  let result;

  if ('assign' in this) {
    result = this.assign(url);
  } else {
    console.error('no window object, cannot do ...assign(url)...');
  }

  return result;
}


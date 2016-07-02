import { Console as console, error } from './log';

export function replaceState(state, title, location) {
  if (!('history' in this)) error::console.warn('called history.replaceState', 'state:', state, 'title:', title, 'location:', location);
  return 'history' in this ? this.history.replaceState(state, title, location) : void 0;
}

export function pushState(state, title, location) {
  if (!('history' in this)) error::console.warn('called history.pushState', 'state:', state, 'title:', title, 'location:', location);
  return 'history' in this ? this.history.pushState(state, title, location) : void 0;
}

export function getState() {
  if (!('history' in this)) error::console.warn('called get state on history');
  return history in this ? this.history.state : void 0;
}

export function setState(state) {
  if (!('history' in this)) error::console.warn('called set state on history', 'state:', state);
  if (history in this) this.history.state = state;
}

export function getLength() {
  if (!('history' in this)) error::console.warn('called get length on history');
  return history in this ? this.history.length : void 0;
}

export function getScrollRestoration() {
  if (!('history' in this)) error::console.warn('called get scroll restoration on history');
  return history in this ? this.history.scrollRestoration : void 0;
}


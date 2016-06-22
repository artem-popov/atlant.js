const history = typeof window !== 'undefined' && window.history || {
  replaceState(state, title, location) {
    console.warn('called history.replaceState', 'state:', state, 'title:', title, 'location:', location);
  },
  pushState(state, title, location) {
    console.warn('called history.pushState', 'state:', state, 'title:', title, 'location:', location);
  },
  get state() {
    console.warn('called get state on history');
  },
  set state(state) {
    console.warn('called set state on history', 'state:', state);
  },
};

export default history;


const Log = function Log() {
  let on = false;
  let level;
  const atlantPrefix = 'Atlant.js: ';

  Object.defineProperty(this, 'verbose', {
    get: () => on,
    set: _ => { on = _; return on; },
  });

  Object.defineProperty(this, 'level', {
    get: () => level,
    set: _ => { if (_ === 'errors' || _ === 'warnings') level = _; return level; },
  });

  this.log = function log(...args) {
    if (!on) return;
    if (level === 'errors' || level === 'warnings') return;

    console.log(atlantPrefix, ...args);
  };

  this.warn = function warn(...args) {
    if (!on) return;
    if (level === 'errors') return;

    console.warn(atlantPrefix, ...args);
  };

  this.error = function error(...args) {
    console.error(atlantPrefix, ...args);
  };

  this.time = function time(name) {
    if (!on) return;
    if (level === 'errors' || level === 'warnings') return;

    if (console.time) {
      console.time(atlantPrefix + name);
      return;
    }
  };

  this.timeEnd = function timeEnd(name) {
    if (!on) return;
    if (level === 'errors' || level === 'warnings') return;

    if (console.timeEnd) {
      console.timeEnd(atlantPrefix + name);
      return;
    }
    return;
  };

  return this;
};

const instance = new Log();

export default instance;

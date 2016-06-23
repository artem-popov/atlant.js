

// Actually can map mappable objects and pojo's
export function map(fn) {
  if (! this) return [];
  if (this && this.map) return this.map(fn);

  const mapped = {};

  Object.keys(this).forEach(key => mapped[key] = fn(this[key]));

  return mapped;
}

export function convertGetters() {
  const obtained = {};
  Object.keys(this).forEach(key => {
    const action = key.substring(0, 3);
    const newKey = key.slice(3);
    if (action === 'get' || action === 'set') {
      obtained[newKey] = { ...(obtained[newKey] || {}), [action]: key };
    }
  });

  obtained::map(pair => {
    let name = pair.get.slice(3);
    name = name[0].toLowerCase() + name.slice(1);
    Object.defineProperty(this, name, { get: this[pair.get], set: this[pair.set] });
    delete this[pair.get];
    delete this[pair.set];
  });

  return this;
}


const Storage = {
  storage: typeof window !== 'undefined' && window.localStorage,
  listen() {
    // window.addEventListener('storage', this.onChange);
  },
  stopListen() {
    // window.removeEventListener('storage', this.onChange);
  },
  onChange(key, newValue, oldValue, storageArea, url) {
    // console.log('storage changed', key, newValue, oldValue, storageArea, url);
  },
  setStorage(storage) {
    this.storage = storage;
  },
  persist(storeName, newState) {
    if (!this.storage) return void 0;

    // console.time('persist'+ storeName)
    this.storage.setItem(storeName, JSON.stringify(newState));
    // console.timeEnd('persist'+ storeName)
    return void 0;
  },
  load(storeName) {
    if (!this.storage) return void 0;

    // console.time('load'+ storeName)
    const value = JSON.parse(this.storage.getItem(storeName));
    // console.timeEnd('load'+ storeName)
    // console.log(storeName, 'value:', value)
    return value;
  },
};
module.exports = Storage;

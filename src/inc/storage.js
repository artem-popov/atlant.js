var Storage = {
    storage: localStorage,
    listen: function(){
        window.addEventListener('storage', this.onChange) 
    },
    stopListen: function(){
        window.removeEventListener('storage', this.onChange)
    },
    onChange: function(key, newValue, oldValue, storageArea, url){
        console.log('storage changed',key, newValue, oldValue, storageArea, url)
    },
    setStorage: function(storage){
        this.storage = storage
    },
    persist: function(storeName, newState){
        console.time('persist'+ storeName)
        this.storage.setItem(storeName, JSON.stringify(newState) );
        console.timeEnd('persist'+ storeName)
        return
    },
    load: function(storeName){
        console.time('load'+ storeName)
        var value = JSON.parse(this.storage.getItem(storeName));
        console.timeEnd('load'+ storeName)
        console.log(storeName, 'value:', value)
        return value
    }
}
module.exports = Storage;

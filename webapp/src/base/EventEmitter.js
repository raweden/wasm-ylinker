export class EventEmitter {
    
    constructor() {
    	this._listeners = {};
    }

    addListener(type, callback){
        this.on(type, callback);
    }

    on(type, callback) {
        if((typeof type !== "string" && typeof type !== "symbol") || typeof callback != "function")
            throw new TypeError("on() unexpected arguments provided")

        if (!this._listeners.hasOwnProperty(type)) {
        	let arr = [];
        	this._listeners[type] = arr;
        	arr.push(callback);
        } else {
        	let arr = this._listeners[type];
        	let idx = arr.indexOf(callback);
        	if (arr.indexOf(callback) == -1)
        		arr.push(callback);
        }
    }

    once(type, callback) {
        if(typeof callback  !== 'function')
            throw new TypeError('only takes instances of Function');
        
        var self = this;
        function g() {
            self.removeListener(type, g);
            callback.apply(this, arguments);
        };

        g.callback = callback;
        self.on(type, g);
        
        return this;
    }

    removeListener(type, callback){
        if((typeof type !== "string" && typeof type !== "symbol") || typeof callback != "function")
            throw new Error(".removeListener() unexpected argument provided");

        if(!this._listeners.hasOwnProperty(type))
            delete this._listeners[event];

        // Removes the listener if it exists under reference of the event type.
        const listeners = this._listeners[type];
        const index = listeners.indexOf(callback);
        if(index != -1)
            listeners.splice(index,1);

        // Removes the listeners array for the type if empty.
        if(listeners.length === 0){
            delete listeners[type];
        }
    }

    removeAllListeners(type) {
        if(this._listeners.hasOwnProperty(event)){
            delete this._listeners[event];
        }
    }

    listeners(type){
        return this._listeners.hasOwnProperty(type) ? this._listeners[type].slice() : null;
    }

    emit(type) {
        if(typeof type !== "string" && typeof type !== "symbol")
            throw new TypeError("emit() unexpected arguments provided");

        if(!this._listeners.hasOwnProperty(type))
            return;
        
        // copying the arguments provided to this method.
        const args = Array.prototype.slice.call(arguments);
        const listeners = this._listeners[type];
        const len = listeners.length;
        
        // emits the event to all registerd listeners.
        for(let i = 0; i < len; i++){
            let callback = listeners[i];
            if(typeof callback !== "function")
                continue;
            
            // calls the listener.
            callback.apply(this, args);
        }
    }
    
    destroy() {
        this._listeners.length = 0;
    }
};
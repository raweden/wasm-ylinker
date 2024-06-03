
/*
 * Copyright (c) 2023, 2024, Jesper Svensson All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. All advertising materials mentioning features or use of this software must
 *    display the following acknowledgement: This product includes software
 *    developed by the Jesper Svensson.
 * 4. Neither the name of the Jesper Svensson nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission. 
 * 
 * THIS SOFTWARE IS PROVIDED BY Jesper Svensson AS IS AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL Jesper Svensson BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { SECTION_TYPE_CUSTOM } from "./const";
import { type_name } from "./utils"

// section base classes

export class WebAssemblySection {

    /**
     * 
     * @param {integer} type 
     * @param {WebAssemblyModule} module 
     */
    constructor(type, module) {
        this.type = type;
        this.module = module;
        this._cache = undefined;
    }

    /**
     * Do not use the instance method, Declare a static decode on class level instead.
     * @param {Uint8Array} data 
     */
    decode(data) {
        throw new Error("subclasses of this class must override this method");
    }

    /**
     * 
     * @param {Object} options
     * @returns {Uint8Array|Uint8Array[]} 
     */
    encode(options) {
        throw new Error("subclasses of this class must override this method");
    }

    markDirty() {
        this._isDirty = true;
    }

    get isDirty() {
        return this._isDirty;
    }
}

export class WebAssemblyCustomSection extends WebAssemblySection {

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {string} name 
     */
    constructor(module, name) {
        super(SECTION_TYPE_CUSTOM, module);
        this.name = name;
    }
}

// base webassembly imported object types


export class ImportedFunction {

    constructor() {
        /** @type {string} */
        this.module = undefined;
        /** @type {string} */
        this.name = undefined;
        /** @type {WasmType} */
        this.type = undefined;
        /** @type {integer} */
        this._usage = 0;
    }
};

export class ImportedTable {

    constructor() {
        /** @type {string} */
        this.module = undefined;
        /** @type {string} */
        this.name = undefined;
        /** @type {integer} */
        this.min = null;
        /** @type {integer} */
        this.max = undefined;
        /** @type {integer} */
        this._usage = 0;
    }
};

export class ImportedMemory {

    constructor() {
        /** @type {string} */
        this.module = undefined;
        /** @type {string} */
        this.name = undefined;
        /** @type {integer} */
        this.min = undefined;
        /** @type {integer} */
        this.max = undefined;
        /** @type {boolean} */
        this.shared = false;
        /** @type {integer} */
        this._usage = 0;
    }
};

export class ImportedGlobal {

    constructor() {
        /** @type {string} */
        this.module = undefined;
        /** @type {string} */
        this.name = undefined;
        /** @type {integer} */
        this.type = undefined;
        /** @type {boolean} */
        this.mutable = false;
        /** @type {integer} */
        this._usage = 0;
    }

    static create(module, name, type, mutable) {
        let imp = new ImportedGlobal();
        imp.module = module;
        imp.name = name;
        imp.type = type;
        imp.mutable = mutable === true ? true : false;
        return imp;
    }
};

export class ImportedTag {

    constructor() {
        /** @type {string} */
        this.module = undefined;
        /** @type {string} */
        this.name = undefined;
        /** @type {WasmType} */
        this.type = undefined;
        /** @type {integer} */
        this._usage = 0;
    }
};


// basic webassembly object types

/**
 * @property {integer} type
 * @property {integer} usage 
 */
export class WasmLocal {

    /**
     * 
     * @param {integer} type 
     */
    constructor(type) {
        this.type = type;
        this.usage = 0;
    }
}

/**
 * 
 */
export class WasmDataSegment {

    constructor() {
        /** @type {????} */
        this._section = undefined;
        this.memory = undefined;
        /** @type {WasmInstruction[]} */
        this.inst = undefined;
        /** @type {integer} */
        this.size = undefined;
        /** @type {Uint8Array} */
        this._buffer = undefined;
        this._mutableDataBuffer = undefined;
        this._mutableDataOffset = undefined;
    }

    hasDataSegment(dataSegment) {
        
    }

    get buffer() {
        if (this._mutableDataBuffer) {
            let start = this._mutableDataOffset;
            let end = start + this.size;
            return this._mutableDataBuffer.slice(start, end);
        }

        return this._buffer;
    }
}

/**
 * The object class that represent a WebAssembly.Global in module and bytecode context.
 */
export class WasmGlobal {

    /**
     * 
     * @param {integer} type 
     * @param {boolean} mutable 
     * @param {?WasmInstruction[]} expr 
     */
    constructor(type, mutable, expr) {
        /** @type {integer} */
        this.type = type;
        /** @type {boolean} */
        this.mutable = mutable === true;
        /** @type {?WasmInstruction[]} */
        this.init = typeof expr == "object" ? expr : null;
        /** @type {integer} */
        this._usage = 0;
    }

    static createGlobalInt32(value, mutable) {
        let obj = new WasmGlobal(0x7F, mutable, null);
        obj.init = [{opcode: 0x41, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalInt64(value, mutable) {
        let obj = new WasmGlobal(0x7E, mutable, null);
        obj.init = [{opcode: 0x42, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalFloat32(value, mutable) {
        let obj = new WasmGlobal(0x7D, mutable, null);
        obj.init = [{opcode: 0x43, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalFloat64(value, mutable) {
        let obj = new WasmGlobal(0x7C, mutable, null);
        obj.init = [{opcode: 0x44, value: value}, {opcode: 0x0b}];
        return obj;
    }
};

/**
 */
export class WasmTable {

    constructor() {
        /** @type {integer} */
        this.reftype = undefined;
        /** @type {integer} */
        this.min = undefined;
        /** @type {integer} */
        this.max = undefined;
    }
}




/**
 * @property {WasmType} type
 * @property {WasmLocal[]} locals
 * @property {WasmInstruction[]} opcodes
 * @property {integer} narg Stores the original number of arguments declared by the type.
 * @property {integer} _usage Reference count, to keep track of if the object could be dropped, since it might not be used after mutation of the module.
 */
export class WasmFunction {

    constructor() {
        /** @type {WasmType} */
        this.type = undefined;
        /** @type {WasmLocal[]} */
        this.locals = undefined;
        /** @type {WasmInstruction[]} */
        this.opcodes = undefined;
        /** @type {integer} */
        this.narg = 0;
        /** @type {integer} */
        this._usage = 0;
    }
};

/**
 * TODO: use Object.freeze() to prevent mutation after creation.
 */
export class WasmType {

    constructor() {
        /** @type {integer[]} */
        this.argv = null;
        /** @type {integer} */
        this.argc = 0;
        /** @type {integer[]} */
        this.retv = null;
        /** @type {integer} */
        this.retc = 0;
    }

    static isEqual(type1, type2) {
        if (type1 === type2) {
            return true;
        }

        if (type1.argc != type2.argc) {
            return false;
        }

        if (type1.retc != type2.retc) {
            return false;
        }

        let argc = type1.argc;
        let retc = type1.retc;

        if (argc != 0) {

            let a1 = type1.argv;
            let a2 = type2.argv;

            if (!Array.isArray(a1) || !Array.isArray(a2)) {
                throw new Error("type inconsistency");
            }

            for (let x = 0; x < argc; x++) {
                if (a1[x] !== a2[x]) {
                    return false;
                }
            }
        }

        if (retc != 0) {

            let r1 = type1.retv;
            let r2 = type2.retv;

            if (!Array.isArray(type1.retv) || !Array.isArray(type2.retv))
                throw new Error("type inconsistency");

            for (let x = 0; x < retc; x++) {
                if (r1[x] !== r2[x]) {
                    return false;
                }
            }
        }

        return true;
    }


    static create(argv, retv) {
        let res = new WasmType();
        res.argv = argv;
        res.argc = Array.isArray(argv) ? argv.length : 0
        res.retv = retv;
        res.retc = Array.isArray(retv) ? retv.length : 0;
        Object.freeze(res);
        return res;
    }

    toString() {

        let arg, ret;
        let argv = this.argv;
        let argc = this.argc;
        if (argc == 0) {
            arg = "[]";
        } else if (argc == 1){
            arg = type_name(argv[0]);
            arg = '[' + arg + ']';
        } else {
            arg = [];
            for (let x = 0; x < argc; x++) {
                arg.push(type_name(argv[x]));
            }
            arg = '[' + arg.join(" ") + ']';
        }

        let retv = this.retv;
        let retc = this.retc;
        if (retc == 0) {
            ret = "[]";
        } else if (retc == 1){
            ret = type_name(retv[0]);
            ret = '[' + ret + ']';
        } else {
            ret = [];
            for (let x = 0; x < retc; x++) {
                ret.push(type_name(retv[x]));
            }
            ret = '[' + ret.join(" ") + ']';
        }

        return arg + " -> " + ret;
    }
};

export class WasmMemory {

    constructor() {
        /** @type {integer} */
        this.min = null;
        /** @type {integer} */
        this.max = null;
        /** @type {boolean} */
        this.shared = false;
    }
};

export class WasmTag {

    constructor() {
        /** @type {WasmType} */
        this.type = false;
    }
};

export class WasmElementSegment {

    constructor() {
        /** @type {integer} */
        this.kind = undefined;
        /** @type {WasmInstruction[]} */
        this.opcodes = undefined;
        /** @type {WasmFunction[]} */
        this.vector = undefined;
        /** @type {integer} */ // TODO: phase-out
        this.count = undefined;
    }
}

// export declaration type

export const WA_EXPORT_KIND_FUNC = 0;
export const WA_EXPORT_KIND_TABLE = 1;
export const WA_EXPORT_KIND_MEMORY = 2;
export const WA_EXPORT_KIND_GLOBAL = 3;
export const WA_EXPORT_KIND_TAG = 4;

/**
 * 
 * @param {string} str 
 * @returns {number}
 */
function fromExportKindString(str) {
    switch (str) {
        case "function":
            return WA_EXPORT_KIND_FUNC;
        case "table":
            return WA_EXPORT_KIND_TABLE;
        case "memory":
            return WA_EXPORT_KIND_MEMORY;
        case "global":
            return WA_EXPORT_KIND_GLOBAL;
        case "tag":
            return WA_EXPORT_KIND_TAG;
        default:
            return -1;
    }
}

export class WasmExport {

    /**
     * 
     * @param {number|string} kind 
     * @param {string} name 
     * @param {WasmFunction|WasmTable|WasmMemory|WasmGlobal|WasmTag} value 
     */
    constructor(kind, name, value) {
        if (typeof kind == "string") {
            kind = fromExportKindString(kind);
        }
        if (!Number.isInteger(kind) || kind < 0 || kind > WA_EXPORT_KIND_TAG) {
            throw new TypeError("invalid argument");
        }
        this._kind = kind;
        this.name = name;
        this.value = value;

        Object.freeze(this);
    }

    get kind() {
        let num = this._kind;
        switch (num) {
            case WA_EXPORT_KIND_FUNC:
                return "function";
            case WA_EXPORT_KIND_TABLE:
                return "table";
            case WA_EXPORT_KIND_MEMORY:
                return "memory";
            case WA_EXPORT_KIND_GLOBAL:
                return "global";
            case WA_EXPORT_KIND_TAG:
                return "tag";
        }
    }
}

// utility function for handling types

/**
 * Determines whether the given WebAssembly value type (the binary representation for i32, i64, f32, f64 etc.) is a valid type value.
 * @param {integer} type The wasm value type integer provided.
 * @returns {boolean}
 */
export function isValidValueType(type) {
    return type == 0x7F || type == 0x7E || type == 0x7D || type == 0x7C || type == 0x7B  || type == 0x70 || type == 0x6F;
}
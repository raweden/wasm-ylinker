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

// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
// https://en.wikipedia.org/wiki/LEB128
// https://nielsleenheer.com/articles/2017/the-case-for-console-hex/
// https://webassembly.github.io/spec/core/appendix/custom.html#binary-indirectnamemap
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
// https://github.com/WebAssembly/tool-conventions/issues/59

import { ByteArray, lengthBytesUTF8, lengthSLEB128, lengthULEB128 } from "./ByteArray";
import {u8_memcpy} from "./utils"
import { WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_F32, WA_TYPE_F64, WA_TYPE_VOID, WA_TYPE_V128, WA_TYPE_FUNC_REF, WA_TYPE_EXTERN_REF, RELOC_PAD,
    SECTION_TYPE_FUNCTYPE, SECTION_TYPE_IMPORT, SECTION_TYPE_FUNC, SECTION_TYPE_TABLE, SECTION_TYPE_TAG, SECTION_TYPE_MEMORY,
    SECTION_TYPE_GLOBAL, SECTION_TYPE_EXPORT, SECTION_TYPE_START, SECTION_TYPE_ELEMENT, SECTION_TYPE_CODE, SECTION_TYPE_DATA,
    SECTION_TYPE_DATA_COUNT, SECTION_TYPE_CUSTOM, __nsym } from "./const"
import { WA_TYPE_ANY, WA_TYPE_NUMRIC, opclsmap } from "./inst"
import { WebAssemblySection, WebAssemblyCustomSection, 
    WasmLocal, WasmGlobal, WasmType, WasmFunction, WasmTag, WasmTable, WasmMemory, WasmDataSegment, WasmElementSegment,
    ImportedFunction, ImportedGlobal, ImportedMemory, ImportedTable, ImportedTag,
    WasmExport, WA_EXPORT_KIND_FUNC, WA_EXPORT_KIND_TABLE, WA_EXPORT_KIND_MEMORY, WA_EXPORT_KIND_GLOBAL, WA_EXPORT_KIND_TAG
} from "./types";
import { byteCodeComputeByteLength, decodeByteCode, encodeByteCode } from "./bytecode";
import { WebAssemblyCustomSectionName } from "./name";
import { WebAssemblyCustomSectionProducers } from "./producers";
import { WebAssemblyCustomSectionTargetFeatures } from "./target_features";
import { WebAssemblyCustomSectionLinker } from "./linking"
import { WebAssemblyCustomSectionReloc } from "./reloc"



// Base Classes

function inst_name(opcode) {

}

/**
 * Returns the index range of opcodes that make up the given pull-index (indicating the "argument" position for a instruction or function call ).
 * 
 * @param {WasmFunction} fn The function scope in which the index carculation should be made.
 * @param {*} instructions  
 * @param {integer} fromIndex
 * @param {*} pullIndex
 * @returns {InstructionRange}
 */
export function rangeAtPullIndex(fn, instructions, fromIndex, pullIndex) {
    let pullcnt = pullIndex;
    let pushcnt = 0;
    let count = -1;

    let wasZero, first, last;

    let i = fromIndex;
    let ylen = pullIndex + 1;
    for (let y = 0; y < ylen; y++) {
        let islast = y == pullIndex;
        count = -1;
        if (islast)
            last = instructions[i];

        while (count != 0) {

            let inst = instructions[i--];
            let opcls = opclsmap.get(inst.opcode);
            let pullv, pushv;
            if (typeof opcls.push == "function") {
                pushv = opcls.push(fn, inst);
            } else {
                pushv = opcls.push;
            }

            if (pushv == WA_TYPE_I32 || pushv == WA_TYPE_I64 || pushv == WA_TYPE_F32 || pushv == WA_TYPE_F64 || pushv == WA_TYPE_V128  || pushv == WA_TYPE_NUMRIC  || pushv == WA_TYPE_ANY) {
                count++;
            }

            if (Array.isArray(pushv)) {
                debugger;
            }

            if (count == 0)
                wasZero = true;

            if (typeof opcls.pull == "function") {
                pullv = opcls.pull(fn, inst);
            } else {
                pullv = opcls.pull;
            }

            if (Array.isArray(pullv)) {
                count -= pullv.length;
            } else if (pullv && pullv != WA_TYPE_VOID) {
                count--;
            }

            if (islast && wasZero && inst.opcode == 0x22 && count == -1) {
                first = inst;
                break;
            }

            if (islast && count == 0) {
                first = inst;
                break;
            }
        }
    }

    //console.log("first: %o", first);
    //console.log("last: %o", last);

    return {start: instructions.indexOf(first), end: instructions.indexOf(last)};
}


/**
 * @TODO remove this function
 * walks the bytecode backwards to find the instruction which is the nearest instruction that would end up at position.
 * For example finding the memory address for a i32.store, it takes into account that stack might have been used in instruction
 * or a tree of instruction prior. This by counting push & pull to the stack from instructions.
 * 
 * @param  {WasmFunction} fn       The WebAssembly function scope.
 * @param  {Array}   instructions
 * @param  {integer}   fromIndex    The index to start from, should be the index directly prior to the instruction which consumes the values.
 * @param  {integer}   relative     The signatures are in reverse, so for example src in memory.copy would be at position 2.
 * @param  {Boolean}   captureRange Satisfies the pullv array of inst range that results in the instruction that ends up at the relative index.
 * @return {Instruction|Range}
 */
export function traverseStack(fn, instructions, fromIndex, relative, captureRange) {

    let count = -1;
    for (let i = fromIndex; i >= 0; i--) {
        let inst = instructions[i];
        let opcls = opclsmap.get(inst.opcode);
        let pullv, pushv;
        if (typeof opcls.push == "function") {
            pushv = opcls.push(fn, inst);
        } else {
            pushv = opcls.push;
        }

        if (pushv == WA_TYPE_I32 || pushv == WA_TYPE_I64 || pushv == WA_TYPE_F32 || pushv == WA_TYPE_F64 || pushv == WA_TYPE_V128  || pushv == WA_TYPE_NUMRIC  || pushv == WA_TYPE_ANY) {
            count++;
        }

        if (Array.isArray(pushv)) {
            debugger;
        }

        if (count == relative) {
            return inst;
        }

        if (typeof opcls.pull == "function") {
            pullv = opcls.pull(fn, inst);
        } else {
            pullv = opcls.pull;
        }

        if (Array.isArray(pullv)) {
            count -= pullv.length;
        } else if (pullv && pullv != WA_TYPE_VOID) {
            count--;
        }
    }

    return undefined;
}

function InstTraversal(opcodes) {

    let atEnd = false;
    let lidx = 0;
    let pseudo = null;
    let scope = opcodes;
    let scopes = [{scope: opcodes, index: undefined}];

    return function next() {

        if (pseudo !== null) {
            let tmp = pseudo;
            pseudo = null;
            return tmp;
        } else if (atEnd) {
            return null;
        }

        let inst = scope[lidx++];
        if ((inst.opcode == 0x02 || inst.opcode == 0x03 || inst.opcode == 0x04 || inst.opcode == 0x05) && inst.opcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.opcodes, inst: inst, index: undefined});
            scope = inst.opcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

            if (scope.inst.opcode == 0x04 && blkst.else) {
                let last = scopes[scopes.length - 1];
                last.scope = blkst.else.opcodes;
                last.inst = blkst.else;
                last.index = undefined;
                scope = last.scope;
                lidx = 0;
                pseudo = {opcode: 0x05};
            } else {
                while (scopes.length > 0) {
                    let tmp = scopes[scopes.length - 1];
                    if (tmp.index === undefined) {
                        console.error("scopes[i].index should not be undefined");
                        throw new Error("index is undefined");
                    }
                    if (tmp.index == tmp.scope.length) {
                        scopes.pop();
                    } else {
                        scope = tmp.scope;
                        lidx = tmp.index;
                        break;
                    }
                }

                if (scopes.length == 0)
                    atEnd = true;
            }
        }

        return inst;
    }
}

function InstToArray(opcodes) {

    let lidx = 0;
    let scope = opcodes;
    let scopes = [{opcodes: scope, inst: undefined, index: undefined}];
    let results = [];

    while (lidx < scope.length) {

        let inst = scope[lidx++];

        if ((inst.opcode == 0x02 || inst.opcode == 0x03 || inst.opcode == 0x04 || inst.opcode == 0x05) && inst.opcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.opcodes, inst: inst, index: undefined});
            scope = inst.opcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

        }

        return inst;
    }
}


// TODO: implement a Reader/Writter class which itself increments the read/write position.`


export class WebAssemblyFuncTypeSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_FUNCTYPE, module);

    }

    encode(options) {

        let totsz = 0;

        let types = this.module.types;
        let len = types.length;
        for (let i = 0; i < len; i++) {
            let type = types[i];
            let argc = Array.isArray(type.argv) ? type.argv.length : 0;
            let retc = Array.isArray(type.retv) ? type.retv.length : 0;
            totsz += lengthULEB128(argc);
            totsz += argc;
            totsz += lengthULEB128(retc);
            totsz += retc;
            totsz += 1; // prefix 0x60
        }

        totsz += lengthULEB128(len);
        let secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_FUNCTYPE);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset; // store bytes used for top of header, to make reloc work without the need to read.
        data.writeULEB128(len);

        
        len = types.length;
        for (let i = 0; i < len; i++) {
            let type = types[i]
            let prefix = data.writeUint8(0x60);

            let argv = type.argv;
            let argc = Array.isArray(argv) ? argv.length : 0;
            data.writeULEB128(argc);
            for (let x = 0; x < argc; x++) {
                data.writeUint8(argv[x]);
            }

            let retv = type.retv;
            let retc = Array.isArray(retv) ? retv.length : 0;
            data.writeULEB128(retc);
            for (let x = 0; x < retc; x++) {
                data.writeUint8(retv[x]);
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyFuncTypeSection}
     */
    static decode(module, data, size) {

        let types;
        if (!module.types) {
            types = [];
            module.types = types;
        } else {
            types = module.types;
        }

        let end = data.offset + size;
        let cnt = data.readULEB128();
        let functypes = [];
        for (let y = 0; y < cnt; y++) {
            let prefix = data.readUint8();
            if (prefix != 0x60) {
                console.error("invalid functype prefix 0x%s", prefix.toString(16));
                return null;
            }
            let argc = data.readULEB128();
            let argv = argc > 0 ? [] : null;
            for (let x = 0; x < argc; x++) {
                let type = data.readUint8();
                argv.push(type);
            }

            let retc = data.readULEB128();
            let retv = retc > 0 ? [] : null;
            for (let x = 0; x < retc; x++) {
                let type = data.readUint8();
                retv.push(type);
            }
            let functype = new WasmType();
            functype.argc = argc;
            functype.argv = argv;
            functype.retc = retc;
            functype.retv = retv;
            functype.typeidx = y; // TODO: remove me
            functype.count = 0;
            types.push(functype);
        }

        return new WebAssemblyFuncTypeSection(module);
    }
}


/**
 * @todo synthetize the .imports array rather than enforcing to maintain it..
 */
export class WebAssemblyImportSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_IMPORT, module);
        
    }

    encode(options) {

        let imports = [];
        let module = this.module;
        let functions = module.functions;
        let globals = module.globals;
        let memory = module.memory;
        let tables = module.tables;
        let tags = module.tags;
        let ylen = globals.length;
        let memPadTo = 0;
        if (options.mempad === true) {
            memPadTo = RELOC_PAD;
        }

        for (let i = 0; i < ylen; i++) {
            let glob = globals[i];
            if (!(glob instanceof ImportedGlobal))
                break;
            imports.push(glob);
        }

        ylen = memory.length;
        for (let i = 0; i < ylen; i++) {
            let mem = memory[i];
            if (!(mem instanceof ImportedMemory))
                break;
            imports.push(mem);
        }

        ylen = tables.length;
        for (let i = 0; i < ylen; i++) {
            let tbl = tables[i];
            if (!(tbl instanceof ImportedTable))
                break;
            imports.push(tbl);
        }

        ylen = tags.length;
        for (let i = 0; i < ylen; i++) {
            let tag = tags[i];
            if (!(tag instanceof ImportedTag))
                break;
            imports.push(tag);
        }

        ylen = functions.length;
        for (let i = 0; i < ylen; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction))
                break;
            imports.push(func);
        }


        let types = this.module.types;
        let total = 0;
        ylen = imports.length;
        let cnt = 0;
        for (let y = 0; y < ylen; y++) {
            let imp = imports[y];
            let len = lengthBytesUTF8(imp.module);
            total += len;
            len = lengthULEB128(len);
            total += len;
            len = lengthBytesUTF8(imp.name);
            total += len;
            len = lengthULEB128(len);
            total += len;

            if (imp instanceof ImportedFunction) {
                total += 1; // type
                let idx = types.indexOf(imp.type);
                if (idx == -1)
                    throw new ReferenceError(".type not defined");
                total += lengthULEB128(idx);
                cnt++;
            } else if (imp instanceof ImportedGlobal) {
                total += 3; // type, valuetype, mutable
                cnt++;
            } else if (imp instanceof ImportedMemory) {
                total += 2; // type, limits
                
                if (imp.max !== undefined && imp.max !== null && !Number.isInteger(imp.max))
                    throw new TypeError("INVALID_LIMIT_MAX");
                
                total += lengthULEB128(imp.min, memPadTo);
                if (imp.max !== null && imp.max !== undefined) {
                    total += lengthULEB128(imp.max, memPadTo);
                }
                cnt++;
            } else if (imp instanceof ImportedTable) {
                total += 3; // type, reftype, limits
                if (imp.max !== undefined && imp.max !== null && !Number.isInteger(imp.max))
                    throw new TypeError("INVALID_LIMIT_MAX");
                total += lengthULEB128(imp.min);
                if (imp.max !== null && imp.max !== undefined) {
                    total += lengthULEB128(imp.max);
                }
                cnt++;
            } else if (imp instanceof ImportedTag) {
                total += 2; // type, attribute
                let idx = types.indexOf(imp.type);
                if (idx == -1)
                    throw new ReferenceError(".type not defined");
                total += lengthULEB128(idx);
                cnt++;
            } else {
                console.error("unsupported import type");
                continue;
            }
        }

        total += lengthULEB128(cnt);
        let sz = lengthULEB128(total);
        let buf = new ArrayBuffer(total + sz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_IMPORT);
        data.writeULEB128(total);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);
        ylen = imports.length;
        for (let y = 0; y < ylen; y++) {
            let imp = imports[y];
            let strlen = lengthBytesUTF8(imp.module);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(imp.module);

            strlen = lengthBytesUTF8(imp.name);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(imp.name);

            if (imp instanceof ImportedFunction) {
                data.writeUint8(0x00);
                let idx = types.indexOf(imp.type);
                data.writeULEB128(idx);
            } else if (imp instanceof ImportedGlobal) {
                data.writeUint8(0x03);
                data.writeUint8(imp.type);
                data.writeUint8(imp.mutable ? 1 : 0);
            } else if (imp instanceof ImportedMemory) {
                data.writeUint8(0x02);
                if (imp.shared) {
                    if (imp.max === null || imp.max === undefined) {
                        data.writeUint8(0x02);
                        data.writeULEB128(imp.min, memPadTo);
                    } else {
                        data.writeUint8(0x03);
                        data.writeULEB128(imp.min, memPadTo);
                        data.writeULEB128(imp.max, memPadTo);
                    }

                } else {
                    if (imp.max === null || imp.max === undefined) {
                        data.writeUint8(0x00);
                        data.writeULEB128(imp.min, memPadTo);
                    } else {
                        data.writeUint8(0x01);
                        data.writeULEB128(imp.min, memPadTo);
                        data.writeULEB128(imp.max, memPadTo);
                    }

                }

            } else if (imp instanceof ImportedTable) {
                data.writeUint8(0x01);
                data.writeUint8(imp.reftype);                
                if (imp.max !== null && imp.max !== undefined) {
                    data.writeUint8(0x01);
                    data.writeULEB128(imp.min);
                    data.writeULEB128(imp.max);
                } else {
                    data.writeUint8(0x00);
                    data.writeULEB128(imp.min);
                }
            } else if (imp instanceof ImportedTag) {
                data.writeUint8(0x04);
                data.writeUint8(imp.attr);
                let idx = types.indexOf(imp.type);
                data.writeULEB128(idx);
            } else {
                console.error("unsupported import type");
                continue;
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyImportSection}
     */
    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let types = module.types;
        let results = [];
        for (let i = 0; i < cnt; i++) {
            let mlen = data.readULEB128();
            let mod = data.readUTF8Bytes(mlen);
            let nlen = data.readULEB128();
            let name = data.readUTF8Bytes(nlen);
            let type = data.readUint8();
            let imp;
            if (type == 0x00) {         // function
                imp = new ImportedFunction();
                let typeidx = data.readULEB128();
                imp.type = types[typeidx];
                imp.type.count++; // increment refcount.
                if (!module.functions) {
                    module.functions = [];
                }
                module.functions.push(imp);
            } else if (type == 0x01) {  // table
                imp = new ImportedTable();
                imp.reftype = data.readUint8();
                let limit = data.readUint8();
                if (limit == 0x01) {
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                } else if (limit == 0x00) {
                    imp.min = data.readULEB128();
                }
                if (!module.tables) {
                    module.tables = [];
                }
                module.tables.push(imp);
            } else if (type == 0x02) {  // memory
                let limit = data.readUint8();
                if (limit == 0x01) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                    imp.shared = false;
                } else if (limit == 0x00) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.shared = false;
                } else if (limit == 0x02) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.shared = true;
                } else if (limit == 0x03) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                    imp.shared = true;
                } else {
                    console.error("found memory limit of type %d", type);
                }
                if (!module.memory) {
                    module.memory = [];
                }
                module.memory.push(imp);
            } else if (type == 0x03) {  // global
                imp = new ImportedGlobal();
                let t = data.readUint8();
                imp.type = t;
                imp.mutable = data.readUint8() === 1;
                if (!module.globals) {
                    module.globals = [];
                }
                module.globals.push(imp);
            } else if (type == 0x04) {  // tag (wasm exception handling)
                imp = new ImportedTag();
                imp.attr = data.readUint8();
                imp.type = types[data.readULEB128()];
                if (!module.tags) {
                    module.tags = [];
                }
                module.tags.push(imp);
            } else {
                console.error("found unsupported import type %d", type);
                continue;
            }

            if (imp) {
                imp.module = mod;
                imp.name = name;
                results.push(imp);
            }
        }
        
        //console.log("import vector count: %d", cnt);
        //console.log(results);
        // TODO: map every existing module-name
        let section = new WebAssemblyImportSection(module);
        return section;
    }
}


export class WebAssemblyFunctionSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_FUNC, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let functions = mod.functions;
        let types = mod.types;
        let cnt, len = functions.length;
        let start = 0;

        // getting index where the imported functions ends.
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        cnt = len - start;

        for (let i = start; i < len; i++) {
            let func = functions[i];
            if (func instanceof ImportedFunction)
                throw new TypeError("found missplaced import");

            let typeidx = types.indexOf(func.type);
            if (typeidx == -1)
                throw new ReferenceError("type not found in vector");
            totsz += lengthULEB128(typeidx);
        }

        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_FUNC);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let func = functions[i];
            let typeidx = types.indexOf(func.type);
            data.writeULEB128(typeidx);
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyFunctionSection}
     */
    static decode(module, data, size) {
        
        let cnt = data.readULEB128();

        let functions;
        if (!module.functions) {
            module.functions = [];
        }

        let types = module.types;
        /*let len2 = functypes.length;
        for (let i = 0; i < len2; i++) {
            functypes[i].count = 0;
        }*/

        functions = module.functions;
        for (let i = 0; i < cnt; i++) {
            let typeidx = data.readULEB128();
            let fn = new WasmFunction();
            let type = types[typeidx];
            fn.type = type;
            type.count++;
            functions.push(fn);
        }

        return new WebAssemblyFunctionSection(module);
    }
}


export class WebAssemblyTableSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_TABLE, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let tables = mod.tables;
        let len = tables.length;
        let start = 0;
        let cnt = 0;

        // get the number of imports in begining.
        for (let i = 0; i < len; i++) {
            let table = tables[i];
            if (!(table instanceof ImportedTable)) {
                start = i;
                break;
            }
        }

        for (let i = start; i < len; i++) {
            let table = tables[i];
            if (table instanceof ImportedTable)
                throw new ReferenceError("imports mixed");

            if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                totsz += lengthULEB128(table.min);
                totsz += lengthULEB128(table.max);
            } else if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                totsz += lengthULEB128(table.min);
            } else {
                throw new TypeError("invalid definition of table object");
            }
            cnt++;
        }

        totsz += cnt * 2; // for table.reftype + table.limits (type)
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_TABLE);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let table = tables[i];
            data.writeUint8(table.reftype);
            if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                data.writeUint8(0x01);
                data.writeULEB128(table.min);
                data.writeULEB128(table.max);
            } else if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                data.writeUint8(0x00);
                data.writeULEB128(table.min);
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyTableSection}
     */
    static decode(module, data, size) {
        
        let cnt = data.readULEB128();
        let vector, tables = [];
        if (!module.tables)
            module.tables = [];
        vector = module.tables;
        for (let i = 0; i < cnt; i++) {
            let table = {};
            table.reftype = data.readUint8();
            let limits = data.readUint8();
            if (limits == 0x00) {
                table.min = data.readULEB128();
            } else if (limits == 0x01) {
                table.min = data.readULEB128();
                table.max = data.readULEB128();
            }
            tables.push(table);
            vector.push(table);
        }

        return new WebAssemblyTableSection(module);
    }
}

export class WebAssemblyTagSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_TAG, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let types = mod.types;
        let tags = mod.tags;
        let len = tags.length;
        let start = 0;
        let cnt = 0;

        // get the number of imports in the start of the array.
        for (let i = 0; i < len; i++) {
            let tag = tags[i];
            if (!(tag instanceof ImportedTag)) {
                start = i;
                break;
            }
        }

        for (let i = start; i < len; i++) {
            let idx, tag = tags[i];
            if (tag instanceof ImportedTag)
                throw new ReferenceError("imports mixed");

            idx = types.indexOf(tag.type);
            if (idx === -1)
                throw new ReferenceError("missing type spec");
            totsz += lengthULEB128(idx);

            cnt++;
        }

        totsz += cnt; // accounting for tag.attr
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_TAG);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let idx, tag = tags[i];
            idx = types.indexOf(tag.type);
            data.writeUint8(tag.attr);
            data.writeULEB128(idx);
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyTagSection}
     */
    static decode(module, data, size) {
        
        let types = module.types;
        let typemax = types.length - 1;
        let cnt = data.readULEB128();
        let tags;
        if (!module.tags)
            module.tags = [];
        tags = module.tags;
        for (let i = 0; i < cnt; i++) {
            let tag = new WasmTag();
            tag.attr = data.readUint8();
            let idx = data.readULEB128();
            if (idx < 0 || idx > typemax)
                throw new ReferenceError("missing type spec");
            tag.type = types[idx];
            tags.push(tag);
        }

        console.log(tags);

        return new WebAssemblyTagSection(module);
    }
}

export class WebAssemblyMemorySection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_MEMORY, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let vector = mod.memory;
        let len = vector.length;
        let cnt = 0;
        let memPadTo = 0;
        if (options.mempad === true) {
            memPadTo = RELOC_PAD;
        }

        for (let i = 0; i < len; i++) {
            let mem = vector[i];
            if (mem instanceof ImportedMemory)
                continue;

            if (mem.shared) {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                    totsz += lengthULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                } else {
                    throw new TypeError("invalid memory definition");
                }

            } else {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                    totsz += lengthULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                } else {
                    throw new TypeError("invalid memory definition");
                }
            }
            cnt++;
        }

        totsz += cnt; // accounts for the byte(s) used by mem.limits
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_MEMORY);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);

        for (let i = 0; i < len; i++) {
            let mem = vector[i];
            if (mem instanceof ImportedMemory)
                continue;

            if (mem.shared) {
                //
                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    data.writeUint8(0x03);
                    data.writeULEB128(mem.min, memPadTo);
                    data.writeULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    data.writeUint8(0x02);
                    data.writeULEB128(mem.min, memPadTo);
                }

            } else {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    data.writeUint8(0x01);
                    data.writeULEB128(mem.min, memPadTo);
                    data.writeULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    data.writeUint8(0x00);
                    data.writeULEB128(mem.min, memPadTo);
                }
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyMemorySection}
     */
    static decode(module, data, size) {
        let end = data.offset + size;
        let cnt = data.readULEB128();
        let vector;
        if (!module.memory) {
            vector = [];
            module.memory = vector;
        } else {
            vector = module.memory;
        }

        for (let i = 0; i < cnt; i++) {
            let limit = data.readUint8();
            let mem = new WasmMemory();
            if (limit == 0x01) {
                mem.min = data.readULEB128();
                mem.max = data.readULEB128();
                mem.shared = false;
            } else if (limit == 0x00) {
                mem.min = data.readULEB128();
                mem.shared = false;
            } else if (limit == 0x02) {
                mem.min = data.readULEB128();
                mem.shared = true;
            } else if (limit == 0x03) {
                mem.min = data.readULEB128();
                mem.max = data.readULEB128();
                mem.shared = true;
            }
            vector.push(mem);
        }

        return new WebAssemblyMemorySection(module);
    }
}


export class WebAssemblyGlobalSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_GLOBAL, module);
        
    }

    encode(options) {
        let vector = [];
        let mod = this.module;
        let globals = mod.globals;
        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            glob.index = i;
            if (glob instanceof ImportedGlobal)
                continue;
            vector.push(glob);
        }

        let secsz = 0;
        secsz += lengthULEB128(vector.length);
        len = vector.length;
        for (let i = 0; i < len; i++) {
            let glob = vector[i];
            secsz += byteCodeComputeByteLength(mod, glob.init, null);
            secsz += 2;
        }

        let totsz = lengthULEB128(secsz);
        totsz += secsz + 1;

        let buf = new ArrayBuffer(totsz);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_GLOBAL);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(vector.length);
        for (let i = 0; i < len; i++) {
            let glob = vector[i];
            data.writeUint8(glob.type);
            data.writeUint8(glob.mutable);
            encodeByteCode(mod, glob.init, null, data);
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyGlobalSection}
     */
    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let vector;
        if (!module.globals) {
            vector = [];
            module.globals = vector;
        } else {
            vector = module.globals;
        }
        
        for (let i = 0; i < cnt; i++) {
            let type = data.readUint8();
            let mut = data.readUint8();
            let opcode = decodeByteCode(data, module);
            let obj = new WasmGlobal(type, (mut === 1), opcode.opcodes);
            vector.push(obj);
            data.offset = opcode.end;
        }

        return new WebAssemblyGlobalSection(module);
    }
}

const ERR_INDEX_RANGE = "Index out of range";
const ERR_EXPORT_INVL_TYPE = "Invalid export type";

/**
 * @todo how to handle reference count for exports?
 * @todo unify .value instead of dedicated property per each type?
 * @todo merge all types to WasmExport and use ._kind internally with integer and .kind getter with string value.
 */
export class WebAssemblyExportSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_EXPORT, module);
        this.data = undefined;
    }

    encode(options) {

        let mod = this.module;
        let exported = mod.exports;
        let indexes = [];
        let secsz = lengthULEB128(exported.length);
        secsz += exported.length; // each export have a type-id
        let len = exported.length;
        for (let i = 0; i < len; i++) {
            /** @type {WasmExport} */
            let exp = exported[i];
            let nlen = lengthBytesUTF8(exp.name);
            secsz += nlen;
            secsz += lengthULEB128(nlen);
            let idx = -1;
            if (exp._kind == WA_EXPORT_KIND_FUNC) {
                idx = mod.functions.indexOf(exp.value);
                //if (exp._function._usage <= 0)
                //    throw new ReferenceError("exporting function with usage zero");
            } else if (exp._kind == WA_EXPORT_KIND_TABLE) {
                idx = mod.tables.indexOf(exp.value);
            } else if (exp._kind == WA_EXPORT_KIND_MEMORY) {
                idx = mod.memory.indexOf(exp.value);
            } else if (exp._kind == WA_EXPORT_KIND_GLOBAL) {
                idx = mod.globals.indexOf(exp.value);
            } else if (exp._kind == WA_EXPORT_KIND_TAG) {
                idx = mod.tags.indexOf(exp.value);
            }

            if (idx === -1)
                throw TypeError("invalid reference or type");
            indexes.push(idx);
            secsz += lengthULEB128(idx);
        }

        let totsz = secsz + 1;
        totsz += lengthULEB128(secsz);
        let buf = new ArrayBuffer(totsz);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_EXPORT);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(len);

        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            let idx = indexes[i];
            let strlen = lengthBytesUTF8(exp.name);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(exp.name);
            if (exp._kind == WA_EXPORT_KIND_FUNC) {
                data.writeUint8(0x00);
                data.writeULEB128(idx);
            } else if (exp._kind == WA_EXPORT_KIND_TABLE) {
                data.writeUint8(0x01);
                data.writeULEB128(idx);
            } else if (exp._kind == WA_EXPORT_KIND_MEMORY) {
                data.writeUint8(0x02);
                data.writeULEB128(idx);
            } else if (exp._kind == WA_EXPORT_KIND_GLOBAL) {
                data.writeUint8(0x03);
                data.writeULEB128(idx);
            } else if (exp._kind == WA_EXPORT_KIND_TAG) {
                data.writeUint8(0x04);
                data.writeULEB128(idx);
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyExportSection}
     */
    static decode(module, data, size) {

        const max_func = module.functions.length;
        const max_tbl = module.tables.length;
        const max_mem = module.memory.length;
        const max_glob = module.globals.length;
        const max_tag = module.tags.length;

        let cnt = data.readULEB128();
        let vector = [];
        for (let i = 0; i < cnt; i++) {

            let func, tbl, mem, glob, tag;
            let nlen = data.readULEB128();
            let name = data.readUTF8Bytes(nlen);
            let type = data.readUint8();
            let idx = data.readULEB128();
            let exp = null;

            if (type == 0x00) {
                if (idx < 0 || idx >= max_func) {
                    throw new RangeError(ERR_INDEX_RANGE);
                }
                func = module.functions[idx];
                if (!func || func instanceof ImportedFunction) {
                    throw new TypeError(ERR_EXPORT_INVL_TYPE);
                }

                exp = new WasmExport(WA_EXPORT_KIND_FUNC, name, func);
            } else if (type == 0x01) {
                if (idx < 0 || idx >= max_tbl) {
                    throw new RangeError(ERR_INDEX_RANGE);
                }
                tbl = module.tables[idx];
                if (!tbl || tbl instanceof ImportedTable) {
                    throw new TypeError(ERR_EXPORT_INVL_TYPE);
                }

                exp = new WasmExport(WA_EXPORT_KIND_TABLE, name, tbl);
            } else if (type == 0x02) {
                if (idx < 0 || idx >= max_mem) {
                    throw new RangeError(ERR_INDEX_RANGE);
                }
                mem = module.memory[idx];
                if (!mem || mem instanceof ImportedMemory) {
                    throw new TypeError(ERR_EXPORT_INVL_TYPE);
                }
                exp = new WasmExport(WA_EXPORT_KIND_MEMORY, name, mem);
            } else if (type == 0x03) {
                if (idx < 0 || idx >= max_glob) {
                    throw new RangeError(ERR_INDEX_RANGE);
                }
                glob = module.globals[idx];
                if (!glob || glob instanceof ImportedGlobal) {
                    throw new TypeError(ERR_EXPORT_INVL_TYPE);
                }
                exp = new WasmExport(WA_EXPORT_KIND_GLOBAL, name, glob);
            } else if (type == 0x04) {
                if (idx < 0 || idx >= max_tag) {
                    throw new RangeError(ERR_INDEX_RANGE);
                }
                tag = module.tags[idx];
                if (!tag || tag instanceof ImportedTag) {
                    throw new TypeError(ERR_EXPORT_INVL_TYPE);
                }
                exp = new WasmExport(WA_EXPORT_KIND_TAG, name, tag);
            } else {
                console.warn("export of type %d is not supported", type);
            }

            if (exp !== null) {
                vector.push(exp);
            } else {
                throw new ReferenceError("Not a Export!");
            }
        }

        //console.log(results);
        //console.log(vector);

        let section = new WebAssemblyExportSection(module);
        section.data = vector;
        module["exports"] = vector;
        return section;
    }
}


export class WebAssemblyStartSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_START, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let funcidx = mod.functions.indexOf(mod.startfn);
        if (funcidx == -1)
            throw new ReferenceError("mod.startfn not defined in mod.functions");

        totsz += lengthULEB128(funcidx);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_START);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(funcidx);

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyStartSection}
     */
    static decode(module, data, size) {
        let funcidx = data.readULEB128();
        let func = module.functions[funcidx];
        module.startfn = func;
        
        return new WebAssemblyStartSection(module);
    }
}


/**
 * @todo there is alot more kinds to add support for https://webassembly.github.io/spec/core/binary/modules.html#element-section
 */
export class WebAssemblyElementSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_ELEMENT, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let functions = mod.functions;
        let elementSegments = mod.elementSegments;
        let ylen = elementSegments.length;

        for (let y = 0; y < ylen; y++) {
            let element = elementSegments[y];
            let kind = element.kind;
            if (kind == 0x00) {

                totsz += byteCodeComputeByteLength(mod, element.opcodes, null);
                let vector = element.vector;
                let xlen = vector.length;
                for (let x = 0; x < xlen; x++) {
                    let func = vector[x];
                    let funcidx = functions.indexOf(func);
                    if (funcidx === -1)
                        throw ReferenceError("function in element is not defined in module.functions");
                    totsz += lengthULEB128(funcidx);
                }

                totsz += lengthULEB128(xlen);
                totsz += lengthULEB128(element.kind);
            } else if (kind == 0x01) {
                let vector = element.vector;
                let xlen = vector.length;
                for (let x = 0; x < xlen; x++) {
                    let func = vector[x];
                    let funcidx = functions.indexOf(func);
                    if (funcidx === -1)
                        throw ReferenceError("function in element is not defined in module.functions");
                    totsz += lengthULEB128(funcidx);
                }

                totsz += lengthULEB128(xlen);
                totsz += lengthULEB128(0x00);           // element.elemtype
                totsz += lengthULEB128(element.kind);
            } else {
                throw new ReferenceError("Other element.kind not supported");
            }
        }

        totsz += lengthULEB128(ylen);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_ELEMENT);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(ylen);

        for (let y = 0; y < ylen; y++) {
            let element = elementSegments[y];
            let kind = element.kind;
            if (kind == 0x00) {
                data.writeULEB128(kind);
                encodeByteCode(mod, element.opcodes, null, data);
                let vector = element.vector;
                let xlen = vector.length;
                data.writeULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let func = vector[x];
                    let funcidx = functions.indexOf(func);
                    data.writeULEB128(funcidx);
                }
            } else if (kind == 0x01) {
                data.writeULEB128(kind);
                data.writeULEB128(0x00);
                let vector = element.vector;
                let xlen = vector.length;
                data.writeULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let func = vector[x];
                    let funcidx = functions.indexOf(func);
                    data.writeULEB128(funcidx);
                }
            }
        }

        return buf;

    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyElementSection}
     */
    static decode(module, data, size) {
        
        let cnt = data.readULEB128();
        let functions = module.functions;
        let elementSegments = [];
        module.elementSegments = elementSegments;
        for (let i = 0; i < cnt; i++) {
            let kind = data.readULEB128();
            if (kind == 0x00) {
                let expr = decodeByteCode(data, module);
                let idx;
                if (expr.opcodes.length == 2 && expr.opcodes[0].opcode == 0x41 && expr.opcodes[1].opcode == 0x0B) {
                    idx = expr.opcodes[0].value;
                } else if (expr.opcodes.length == 2 && expr.opcodes[0].opcode == 0x23 && expr.opcodes[1].opcode == 0x0B) {
                    console.warn("implement support for global.get");
                    idx = 1;
                } else {
                    console.log(expr);
                    throw new TypeError("only static offset expressions supported ATM");
                }

                let vlen = data.readULEB128();
                let tableidx = 0;
                let table;
                if (Array.isArray(module.tables[tableidx].contents)) {
                    table = module.tables[0].contents;
                } else {
                    table = [undefined];
                    module.tables[0].contents = table;
                }
                let vec = [];
                //vec.length = idx + vlen;
                for (let x = 0; x < vlen; x++) {
                    let funcidx = data.readULEB128();
                    let fn = functions[funcidx];
                    table[idx++] = fn;
                    vec.push(fn);
                    fn._usage++;
                }

                let element = new WasmElementSegment();
                element.kind = kind;
                element.opcodes = expr.opcodes;
                element.vector = vec;
                element.count = vlen;
                elementSegments.push(element);

                //console.log("kind: %d expr: %o vec(funcidx) %o", kind, expr, vec);
            } else if (kind == 0x01) {
                let elemtype = data.readULEB128();
                let vlen = data.readULEB128();
                let tableidx = 0;
                let table;
                let vec = [];
                //vec.length = idx + vlen;
                for (let x = 0; x < vlen; x++) {
                    let funcidx = data.readULEB128();
                    let fn = functions[funcidx];
                    vec.push(fn);
                    fn._usage++;
                }

                let element = new WasmElementSegment();
                element.kind = kind;
                element.elemtype = elemtype;
                element.opcodes = undefined;
                element.vector = vec;
                element.count = vlen;
                elementSegments.push(element);
            }
        }

        //console.log("element section vector count: %d", cnt);

        return new WebAssemblyElementSection(module);
    }
}


/**
 * Holds cache for the input wasm binary.
 */
class WebAssemblyModuleCache {

}



export class WebAssemblyCodeSection extends WebAssemblySection {

    /**
     * @param {WebAssemblyModule} module 
     */
    constructor(module) {
        super(SECTION_TYPE_CODE, module);
        
    }

    encode(options) {

        let mod = this.module;
        let funcvec = mod.functions;
        let anyDirty = false;
        let len = funcvec.length;
        let org = mod._buffer;
        let start = 0;
        // first lets find where the our first non-import appears.
        for (let i = 0; i < len; i++) {
            let func = funcvec[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        let sec_sz = 0;
        let buffers = [];
        let modcnt = 0;
        let relocatable = options.relocatable === true;
        let wcb = options.write_callback;
        let has_wcb = typeof wcb == "function";

        let cnt = funcvec.length - start;
        let cntsz = lengthULEB128(cnt); // put this here to be able to do data relative offsets.

        for (let i = start; i < len; i++) {
            let func = funcvec[i];
            /*let debug = false;

            if (i == 214) {
                debugger;
            }*/

            let localsmapped;
            let subsz = 0;

            let locals = func.locals;
            if (locals && locals.length) {
                localsmapped = [];
                let count = 0;              // current count of type
                let type;                   // current type

                let xlen = locals.length;
                let narg = func.narg;
                for (let x = narg; x < xlen; x++) {
                    let local = locals[x];
                    if (local.type != type) {
                        if (type !== undefined)
                            localsmapped.push({type: type, count: count});
                        type = local.type;
                        count = 1; // reset
                    } else {
                        count++;
                    }
                }

                // will always miss the last one if any.
                if (count > 0) {
                    localsmapped.push({type: type, count: count});
                }

                xlen = localsmapped.length;
                subsz += lengthULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let local = localsmapped[x];
                    subsz += lengthULEB128(local.count);
                    subsz += 1;
                }

            } else {
                subsz += lengthULEB128(0);
            }

            let opcodesz = byteCodeComputeByteLength(mod, func.opcodes, func.locals, false, relocatable);
            let totsz = subsz + opcodesz;
            totsz += lengthULEB128(subsz + opcodesz);
            let buf = new ArrayBuffer(totsz);
            let data = new ByteArray(buf);
            buffers.push(buf);
            data.writeULEB128(subsz + opcodesz);
            let xlen = localsmapped ? localsmapped.length : 0;
            data.writeULEB128(xlen);
            if (xlen > 0) {
                for (let x = 0; x < xlen; x++) {
                    let local = localsmapped[x];
                    data.writeULEB128(local.count);
                    data.writeUint8(local.type);
                }
            }
            let tmp = data.offset;
            encodeByteCode(mod, func.opcodes, func.locals, data, relocatable ? (sec_sz + cntsz) : undefined);
            if (data.offset - tmp != opcodesz) {
                console.error("[%d] generated opcodes %d !== %d (real vs. computed)", i, data.offset - tmp, opcodesz);
            }
            sec_sz += buf.byteLength;
            modcnt++;

            // 1. encode opcodes but hold for pushing it into buffers.
            // 2. pre-compute locals + locals-count + entry-size
            // 3. encode the above, and push it into buffers.
            // 4. push opcode into buffers.
        }

        let headsz = 1 + lengthULEB128(sec_sz + cntsz); // section-type + section-length;
        headsz += cntsz;
        let header = new ArrayBuffer(headsz);
        let data = new ByteArray(header);
        data.writeUint8(SECTION_TYPE_CODE);
        data.writeULEB128(sec_sz + cntsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(cnt);
        buffers.unshift(header);

        return buffers;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCodeSection}
     */
    static decode(module, data, size, options) {
        
        let end = data.offset + size;
        let cnt = data.readULEB128();
        let idx = 0;
        let functions = module.functions;
        let start = 0;
        let reloc = options && options.linking === true ? true : false;

        // first lets find where the our first non-import appears.
        for (let i = 0; i < functions.length; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        for (let y = 0; y < cnt; y++) {
            let tmp1 = data.offset;
            let bytesz = data.readULEB128();
            let tmp = data.offset;
            let lcnt = data.readULEB128();
            let _locals;
            let tlocals;
            /** @type {WasmFunction} */
            let func = functions[start++];
            let type = func.type;
            if (type.argv && type.argv.length > 0) {
                _locals = [];
                // arguments or aka. param(s) are also locals.
                let argv = type.argv;
                let zlen = argv.length
                for(let z = 0;z < zlen;z++) {
                    let t = argv[z];
                    let local = new WasmLocal(t);
                    _locals.push(local);
                }
            }
            if (!_locals && lcnt > 0) {
                _locals = [];
            }
            if (lcnt > 0)
                tlocals = [];

            for(let i = 0;i < lcnt;i++) {
                let n = data.readULEB128();
                let t = data.readUint8();
                tlocals.push({count: n, type: t});
                for (let x = 0; x < n; x++) {
                    let local = new WasmLocal(t);
                    _locals.push(local);
                }
            }

            let opcode_start = data.offset;
            let opcode_end = tmp + bytesz;
            let opcodes = decodeByteCode(data, module, _locals, reloc);
            
            func.narg = type.argc;
            func.locals = _locals;
            func._tlocals = tlocals;
            func.codeStart = tmp1;
            func.opcode_start = opcode_start;
            func.opcode_end = opcode_end;
            func.opcodes = opcodes.opcodes;
            data.offset = opcode_end;
        }

        return new WebAssemblyCodeSection(module);
    }
}

// FIXME: is this even used anywhere now?
function prepareModuleEncode(mod) {
    let vector = mod.types;
    let len = vector.length;
    for (let i = 0; i < len; i++) {
        let type = vector[i];
        type.typeidx = i;
    }

    vector = mod.globals;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let glob = vector[i];
        glob._index = i;
    }

    vector = mod.tables;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let table = vector[i];
        table._index = i;
    }

    vector = mod.memory;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let mem = vector[i];
        mem._index = i;
    }

    vector = mod.functions;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let func = vector[i];
        func._index = i;
    }
}


export class WebAssemblyDataSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_DATA, module);
    }

    hasDataSegment(dataSegment) {

    }

    encode(options) {
        let mod = this.module;
        let hdroff;
        let segments;
        if (options.dataSegments) {
            segments = options.dataSegments;
        } else {
            segments = this.module.dataSegments;
        }

        let secsz;
        let tot = 0;
        let len = segments.length;
        for (let i = 0; i < len; i++) {
            let seg = segments[i];
            let kind = seg.kind;
            if (kind == 0x00) {
                tot += lengthULEB128(kind);
                tot += byteCodeComputeByteLength(mod, seg.inst.opcodes, null);
                tot += lengthULEB128(seg.size);
                tot += seg.size;
            } else if (kind == 0x01) {
                tot += lengthULEB128(kind);
                tot += lengthULEB128(seg.size);
                tot += seg.size;
            } else if (kind == 0x02) {
                tot += lengthULEB128(kind);
                let memidx = seg.memory ? mod.memory.indexOf(seg.memory) : -1;
                if (memidx == -1) {
                    throw new ReferenceError("memory ref not defined in module.memory");
                }
                tot += lengthULEB128(memidx);
                tot += byteCodeComputeByteLength(mod, seg.inst.opcodes, null);
                tot += lengthULEB128(seg.size);
                tot += seg.size;
            }
        }
        tot += lengthULEB128(len); // vector-length
        secsz = tot;
        tot += lengthULEB128(tot); // section-size
        tot += 1;                  // section-signature

        let buffer = new Uint8Array(tot); // {dst-offset, size}
        let data = new ByteArray(buffer);
        data.writeUint8(SECTION_TYPE_DATA);
        data.writeULEB128(secsz);
        hdroff = data.offset;
        this._dylink0_hdroff = hdroff;
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let seg = segments[i];
            let kind = seg.kind;
            if (kind == 0x00) {
                data.writeULEB128(kind); // seg.kind (not implemented)
                encodeByteCode(mod, seg.inst.opcodes, null, data);
                data.writeULEB128(seg.size);
                if (seg._mutableDataBuffer) {
                    let off = seg._mutableDataOffset;
                    seg._dylink0_loc = (data.offset - hdroff); // store encoded offset to allow this to be encoded in dylink.0 section
                    u8_memcpy(seg._mutableDataBuffer, off, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                } else {
                    seg._dylink0_loc = (data.offset - hdroff); 
                    u8_memcpy(seg._buffer, 0, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                }
            } else if (kind == 0x01) {
                data.writeULEB128(kind);
                data.writeULEB128(seg.size);
                if (seg._mutableDataBuffer) {
                    let off = seg._mutableDataOffset;
                    seg._dylink0_loc = (data.offset - hdroff); 
                    u8_memcpy(seg._mutableDataBuffer, off, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                } else {
                    seg._dylink0_loc = (data.offset - hdroff); 
                    u8_memcpy(seg._buffer, 0, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                }
            } else if (kind == 0x02) {
                data.writeULEB128(kind);
                let memidx = mod.memory.indexOf(seg.memory);
                data.writeULEB128(memidx);
                encodeByteCode(mod, seg.inst.opcodes, null, data);
                data.writeULEB128(seg.size);
                if (seg._mutableDataBuffer) {
                    let off = seg._mutableDataOffset;
                    seg._dylink0_loc = (data.offset - hdroff); 
                    u8_memcpy(seg._mutableDataBuffer, off, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                } else {
                    seg._dylink0_loc = (data.offset - hdroff); 
                    u8_memcpy(seg._buffer, 0, seg.size, buffer, data.offset);
                    data.offset += seg.size;
                }
            }
        }

        return buffer;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size
     * @param {string} name The name of the custom-section, called with this parameter set to undefined if not decoding a custom-section.
     * @param {object} options 
     * @returns {WebAssemblyDataSection}
     */
    static decode(module, data, size, name, options) {

        let cnt = data.readULEB128();
        let noCopy = options && options.noCopy != undefined ? options.noCopy : false;
        let segments;
        if (!module.dataSegments) {
            segments = [];
            module.dataSegments = segments;
        } else if (Array.isArray(module.dataSegments) && module.dataSegments.length == 0) {
            segments = module.dataSegments;


        } else if (Array.isArray(module.dataSegments) && module.dataSegments.length == cnt){
                segments = [];
                module.dataSegments = segments;
        } else {
            throw new TypeError("module already defines dataSegment with another count");
        }
        let end = data.offset + size;
        let results = [];
        for (let i = 0; i < cnt; i++) {
            let kind = data.readULEB128();
            if (kind == 0x00) {
                let inst = decodeByteCode(data, module, null);
                data.offset = inst.end;
                let datasz = data.readULEB128();
                let segment = new WasmDataSegment();
                segment.kind = kind;
                segment.memory = module.memory[0];
                segment.inst = inst;
                segment.offset = data.offset;
                segment.size = datasz;
                if (!noCopy)
                    segment._buffer = data._u8.slice(data.offset, data.offset + datasz);
                segments.push(segment);
                data.offset += datasz;
            } else if (kind == 0x01) {
                // init b*, mode passive` is not implemented"
                let datasz = data.readULEB128();
                let segment = new WasmDataSegment();
                segment.kind = kind;
                segment.memory = undefined
                segment.inst = undefined;
                segment.offset = data.offset;
                segment.size = datasz;
                if (!noCopy)
                    segment._buffer = data._u8.slice(data.offset, data.offset + datasz);
                segments.push(segment);
                data.offset += datasz;
            } else if (kind == 0x02) {
                // init b*, mode active {memory, offset }
                let memidx = data.readULEB128();
                let inst = decodeByteCode(data, module, null);
                data.offset = inst.end;
                let datasz = data.readULEB128();
                let segment = new WasmDataSegment();
                segment.kind = kind;
                segment.memory = module.memory[memidx];
                segment.inst = inst;
                segment.offset = data.offset;
                segment.size = datasz;
                if (!noCopy)
                    segment._buffer = data._u8.slice(data.offset, data.offset + datasz);
                segments.push(segment);
                data.offset += datasz;
            } else {
                console.warn("unsupported data-segment mode!");
                break;
            }
        }

        return new WebAssemblyDataSection(module);
    }
}

export class WebAssemblyDataCountSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_DATA_COUNT, module);
        this.count = 0;
    }

    encode(options) {
        let dataSegments = this.module.dataSegments;
        let totsz, secsz = lengthULEB128(dataSegments.length);
        totsz = secsz;
        totsz += lengthULEB128(secsz);
        let buffer = new Uint8Array(totsz + 1);
        let data = new ByteArray(buffer);
        data.writeUint8(SECTION_TYPE_DATA_COUNT);
        data.writeULEB128(secsz);
        this._dylink0_hdroff = data.offset;
        data.writeULEB128(dataSegments.length);

        return buffer;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyDataCountSection}
     */
    static decode(module, data, size) {
        let cnt = data.readULEB128();
        let section = new WebAssemblyDataCountSection(module);
        section.count = cnt;
        if (!module.dataSegments) {
            let vec = [];
            vec.length = cnt;
            module.dataSegments = vec;
        }
        return section;
    }
}

function findCustomSectionByName(sections, name) {
    let len = sections.length;
    for (let i = 0; i < len; i++) {
        let sec = sections[i];
        if (sec.type == 0x00 && sec.name == name) {
            return sec;
        }
    }

    return null;
}

//
// known custom sections.
// 

// https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md


// https://github.com/WebAssembly/tool-conventions/blob/main/DynamicLinking.md
export class WebAssemblyCustomSectionDylink0 extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "dylink.0");
    }

    encode(options) {

    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionDylink0}
     */
    static decode(module, data, size) {

        let info;

        let end = data.offset + size;
        while (data.offset < end) {
            let id = data.readUint8();
            let sz = data.readULEB128();
            let substart = data.offset;
            if (id == 0x01) { // WASM_DYLINK_MEM_INFO
                let memsz = data.readULEB128();
                let memalignment = data.readULEB128();
                let tablesz = data.readULEB128();
                let tablealignment = data.readULEB128();
                console.log({memorysize: memsz, memoryalignment: memalignment, tablesize: tablesz, tablealignment: tablealignment});
            } else if (id == 0x02) { // WASM_DYLINK_NEEDED
                let entries = [];
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let strsz = data.readULEB128();
                    let str = data.readUTF8Bytes(strsz);
                    entries.push(str);
                }
                console.log(entries);
            } else if (id == 0x03) { // WASM_DYLINK_EXPORT_INFO
                let strsz = data.readULEB128();
                let name = data.readUTF8Bytes(strsz);
                let flags = data.readULEB128();
                console.log("name = %s flags = %d", name, flags);
            } else if (id == 0x04) { // WASM_DYLINK_IMPORT_INFO
                let strsz = data.readULEB128();
                let name = data.readUTF8Bytes(strsz);
                strsz = data.readULEB128();
                let field = data.readUTF8Bytes(strsz);
                let flags = data.readULEB128();
                console.log("name = %s field = %s flags = %d", name, field, flags);
            }

            data.offset = substart + sz;
        }

        return new WebAssemblyCustomSectionDylink0(module);
    }
}




// Common Custom Section Name 


// clang & wasm-ld modules

/*
export const WASM_SYM_BINDING_WEAK = 0x01;
export const WASM_SYM_BINDING_LOCAL = 0x02;
export const WASM_SYM_VISIBILITY_HIDDEN = 0x04;
export const WASM_SYM_UNDEFINED = 0x10;
export const WASM_SYM_EXPORTED = 0x20;
export const WASM_SYM_EXPLICIT_NAME = 0x40;
export const WASM_SYM_NO_STRIP = 0x80;
export const WASM_SYM_TLS = 0x100;
export const WASM_SYM_ABSOLUTE = 0x200;
export const WASM_SYM_EXTERNAL = 0x400;                // not standard.
export const WASM_SYM_EXTERNAL_DLSYM = 0x2000;         // not standard. Used internally in dylinker to indicate that symbol is external but should a table index rather than a import, converts direct calls to indirect calls and adds a relocation.
export const WASM_SYM_WEAK_EXTERNAL = 0x400;           // not standard. use external dylib symbol over internal if found,
export const WASM_SYM_INTERNAL = 0x800;                // not standard.
export const WASM_SYM_LINKTIME_CONSTRUCT = 0x1000;     // not standard.
*/

/*
export const R_WASM_FUNCTION_INDEX_LEB = 0x00;
export const R_WASM_TABLE_INDEX_SLEB = 0x01;
export const R_WASM_TABLE_INDEX_I32 = 0x02;
export const R_WASM_MEMORY_ADDR_LEB = 0x03;
export const R_WASM_MEMORY_ADDR_SLEB = 0x04;
export const R_WASM_MEMORY_ADDR_I32 = 0x05;
export const R_WASM_TYPE_INDEX_LEB = 0x06;
export const R_WASM_GLOBAL_INDEX_LEB = 0x07;
export const R_WASM_FUNCTION_OFFSET_I32 = 0x08;
export const R_WASM_SECTION_OFFSET_I32 = 0x09;
export const R_WASM_EVENT_INDEX_LEB = 0x10;
export const R_WASM_GLOBAL_INDEX_I32 = 0x13;
export const R_WASM_MEMORY_ADDR_LEB64 = 0x14;
export const R_WASM_MEMORY_ADDR_SLEB64 = 0x15;
export const R_WASM_MEMORY_ADDR_I64 = 0x16;
export const R_WASM_TABLE_INDEX_SLEB64 = 0x18;
export const R_WASM_TABLE_INDEX_I64 = 0x19;
export const R_WASM_TABLE_NUMBER_LEB = 0x20;
*/


function isValidSectionType(type) {

}

function encodeWebAssemblyBinary(mod, options) {
    // check outputAction() in script.js for impl.
}

/**
 */
export class WebAssemblyModule {

    constructor() {
        /** @type {WasmDataSegment[]} */
        this.dataSegments = undefined;
        /** @type {WasmElementSegment[]} */
        this.elementSegments = undefined;
        /** @type {WasmExport[]} */
        this.exports = undefined;
        /** @type {Array.<ImportedFunction|WasmFunction>} */
        this.functions = undefined;
        /** @type {Array.<ImportedGlobal|WasmGlobal>} */
        this.globals = undefined;
        /** @type {Array.<ImportedTable|WasmTable>} */
        this.tables = undefined;
        /** @type {Array.<ImportedMemory|WasmMemory>} */
        this.memory = undefined;
        /** @type {Array.<ImportedTag|WasmTag>} */
        this.tags = undefined;
        /** @type {Array.<WasmType>} */
        this.types = undefined;

        /** @type {WasmFunction} Only set on modules that declares a start section. */
        this.startfn = undefined;

        /** @type {Array.<WebAssemblySection|Object>} */
        this.sections = undefined;

        /** @type {integer} */
        this._version = undefined;
        /** @type {WasmExport[]} */
        this._explicitExported = []; // exports added trough module.appendExport
    }

    /**
     * The WebAssemblyModule on which the method is called is considered to be the target, 
     * the object representation of wasmModule will be altered to fit into the target module.
     *
     * This action leaves the module provided in wasmModule argument in a unusable state; it will not encode
     * after this action is applied, encoding will throw a reference error. To mark this module as unusable
     * the tables for functions, types and more set to null.
     *
     * Its possible to merge for example merge within a single module as well, replacing a call to one function
     * with a call to another function from the same module.
     *
     * If type declartion with matching signature is found within the target module that is to be
     * used within the resulting object representation, opcode are change accordingly. If a type
     * declartion does not exists in target, its added.
     *
     * The `replacementMap` argument allows for references to be replaced at both sides;
     * for example a imported function in `wasmModule` can be replaced with a actual method from this.
     *
     * data-segments are inserted if there is no conflict for that address range, RELOC based data segments
     * could allow data-segments in the `wasmModule` to be merged at a non-conflict location.
     * 
     * @param  {WebAssemblyModule} wasmModule
     * @param  {Map} replacementMap 
     * @return {void}
     */
    mergeWithModule(wasmModule, replacementMap) {

        if (wasmModule != this) {
            throw new ReferenceError("merge with self not allowed"); // use mergeWithModule(null, map) to merge within the module itself.
        }

        let funcmap = new Map();
        let memmap = new Map();
        let tblmap = new Map();
        let glbmap = new Map();
        let tagmap = new Map();

        if (wasmModule) {

            // merges the type table of the two modules.
            let oldtypes = []; // types to be replaced in wasmModule
            let newtypes = []; // replacment for above, index mapped; oldtypes[i] = newtypes[i]
            let addtypes = []; // types to be added to this

            let stypes = this.types;
            let otypes = wasmModule.types;
            let xlen = otypes.length;
            let ylen = stypes.length;
            for (let x = 0; x < xlen; x++) {
                let t1 = otypes[x];
                let anymatch = false;
                for (let y = 0; y < ylen; y++) {
                    let t2 = stypes[y];
                    if (WasmType.isEqual(t1, t2)) {
                        oldtypes.push(t1);
                        newtypes.push(t2);
                        anymatch = true;
                        break;
                    }
                }

                if (!anymatch) {
                    addtypes.push(t1);
                }
            }

            // replacing in tags.
            let tags = wasmModule.tags;
            if (tags) {
                let len = tags.length;
                for (let i = 0; i < len; i++) {
                    let tag = tags[i];
                    let idx = oldtypes.indexOf(tag.type);
                    if (idx !== -1) {
                        tag.type = newtypes[idx];
                    }
                }
            }

            // replacing in functions & opcode
            let functions = wasmModule.functions;
            if (functions) {
                let xlen = functions.length;
                for (let x = 0; x < xlen; x++) {
                    let func = functions[x];
                    let idx = oldtypes.indexOf(func.type);
                    if (idx !== -1) {
                        func.type = newtypes[idx];
                    }
                    if (func instanceof ImportedFunction)
                        continue;

                    let opcodes = func.opcodes;
                    let ylen = opcodes.length;
                    for (let y = 0; y < ylen; y++) {
                        let inst = opcodes[y];
                        switch (inst.opcode) {
                            case 0x02:  // block bt
                            case 0x03:  // loop bt
                            case 0x04:  // if bt
                            case 0x06:  // try bt
                            case 0x11:  // call_indirect
                            {
                                let type = inst.type;
                                let idx = oldtypes.indexOf(type);
                                if (idx !== -1) {
                                    inst.type = newtypes[idx];
                                }
                                break;
                            }
                        }
                    }
                }
            }

            xlen = addtypes.length;
            for (let x = 0; x < xlen; x++) {
                let type = addtypes[x];
                stypes.push(type);
            }

            // leave wasmModule unusable (won't encode any longer anyhow)
            wasmModule.types = null;
            

            // find in opcode:
            // - block
            // - loop
            // - if
            // - try
            // - call_indirect
            // 
            // replace in:
            // - WasmFunction | ImportedFunction
            // - WasmTag | ImportedTag
            // types
        }
        
        for (const [object, replacement] of replacementMap) {
            console.log(`${key} = ${value}`);

            // esnure not equal
            if (object === replacement) {
                throw new ReferenceError("replacement cannot be equal original");
            }

            if (typeof object != "object" || object === null || typeof replacement != "object" || object === null) {
                throw new TypeError("not an object");
            }

            if ((object instanceof ImportedFunction) || (object instanceof WasmFunction)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedFunction) || (replacement instanceof WasmFunction))) {
                    throw new TypeError("wrong type");
                }

                if (!WasmType.isEqual(object.type, replacement.type)) {
                    throw new TypeError("singature mismatch");
                }

                let target;
                if (this.functions.indexOf(object) !== -1) {
                    target = this;
                } else if (wasmModule && wasmModule.functions.indexOf(object) !== -1) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                funcmap.set(object, replacement);

                // find opcode:
                // - call       0x10
                // - ref.func   0xd2
                // replace in:
                // functions
                // element-segments
            }

            if ((object instanceof ImportedMemory) || (object instanceof WasmMemory)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedMemory) || (replacement instanceof WasmMemory))) {
                    throw new TypeError("wrong type");
                }

                let target;
                if (this.memory.contains(object)) {
                    target = this;
                } else if (wasmModule.memory.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                memmap.set(object, replacement);

                // find in opcode: 
                // memory.size  0x3f
                // memory.grow  0x40
                // memory.copy  (0xfc << 8) | 10
                // memory.fill  (0xfc << 8) | 11 
                // memory.init  (0xfc << 8) | 8
                // 
                // replace in:
                // memory
            }

            if ((object instanceof ImportedTable) || (object instanceof WasmTable)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedTable) || (replacement instanceof WasmTable))) {
                    throw new TypeError("wrong type");
                }

                if (object.reftype != replacement.reftype) {
                    throw new TypeError("reftype mismatch");
                }

                let target;
                if (this.tables.contains(object)) {
                    target = this;
                } else if (wasmModule.tables.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                tblmap.set(object, replacement);

                // find in opcode:
                // - call_indirect  0x11
                // - table.set      0x26
                // - table.get      0x25
                // - table.size     (0xfc << 8) | 16
                // - table.grow     (0xfc << 8) | 15
                // - table.init     (0xfc << 8) | 12
                // - table.copy     (0xfc << 8) | 14
                // - table.fill     (0xfc << 8) | 17
                //
                // replace in:
                // tables
            }

            if ((object instanceof ImportedGlobal) || (object instanceof WasmGlobal)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedGlobal) || (replacement instanceof WasmGlobal))) {
                    throw new TypeError("wrong type");
                }

                let target;
                if (this.globals.contains(object)) {
                    target = this;
                } else if (wasmModule.globals.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                glbmap.set(object, replacement);

                // find:
                // - global.set     0x24
                // - global.get     0x23
                // 
                // (globals are also allowed in expr as in global.init, dataSegment.init)
                // 
                // replace in:
                // globals
            }

            if ((object instanceof ImportedTag) || (object instanceof WasmTag)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedTag) || (replacement instanceof WasmTag))) {
                    throw new TypeError("wrong type");
                }

                if (!WasmType.isEqual(object.type, replacement.type)) {
                    throw new TypeError("singature mismatch");
                }

                let target;
                if (this.tags.contains(object)) {
                    target = this;
                } else if (wasmModule.tags.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                tagmap.set(object, replacement);

                // find:
                // - throw      0x08
                // - catch      0x07
                // 
                // replace in:
                // tags
            }

        }

        if (funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // element-segments

            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (funcmap.has(func)) {
                                inst.func = funcmap.get(func);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.functions into this.functions
        if (wasmModule.functions && wasmModule.functions.length > 0) {

            let src = wasmModule.functions;
            let len = src.length;
            let dst = this.functions;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let func = dst[x];
                if (!(func instanceof ImportedFunction)) {
                    first = x;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let func = src[x];
                if (dst.indexOf(func) !== -1)
                    continue;
                
                if (func instanceof ImportedFunction) {
                    dst.splice(first, 0, func);
                    first++;
                } else {
                    dst.push(func);
                }
            }
        }

        if (memmap.size > 0) {
            
            // find in opcode: 
            // memory.size  0x3f
            // memory.grow  0x40
            // memory.copy  (0xfc << 8) | 10
            // memory.fill  (0xfc << 8) | 11 
            // memory.init  (0xfc << 8) | 8
            // 
            // replace in:
            // memory

            let xlen = this.functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = this.functions[x];
                let idx = oldtypes.indexOf(func.type);
                if (idx !== -1) {
                    func.type = newtypes[idx];
                }
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x3f:
                        case 0x40:
                        case 0xfc0b:
                        case 0xfc08:
                        {
                            let mem = inst.mem;
                            if (memmap.has(mem)) {
                                inst.mem = memmap.get(mem);
                            }
                            break;
                        }
                        case 0xfc0a:
                        {
                            let mem = inst.mem1;
                            if (memmap.has(mem)) {
                                inst.mem1 = memmap.get(mem);
                            }

                            mem = inst.mem2;
                            if (memmap.has(mem)) {
                                inst.mem2 = memmap.get(mem);
                            }
                            break;
                        }
                    }
                }
            }

            for (const [oldmem, newmem] of memmap) {

                /*let target;
                let same = false;
                if (this.memory.contains(oldmem)) {
                    target = this;
                } else if (wasmModule.memory.contains(oldmem)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("original not defined");
                }

                if (this.memory.contains(newmem)) {
                    same = (target === this);
                } else if (wasmModule.memory.contains(newmem)) {
                    same = (target === wasmModule);
                } else {
                    throw new ReferenceError("replacement not defined");
                }*/

                let memory = this.memory;
                let idx = memory.indexOf(newmem);

                if (idx == -1) {

                    if (newmem instanceof ImportedMemory) {
                        let len = memory.length;
                        let first = -1;
                        for (let i = 0; i < len; i++) {
                            let mem = memory[i];
                            if (!(mem instanceof ImportedMemory)) {
                                first = i;
                                break;
                            }
                        }

                        if (first === 0) {
                            memory.unshift(newmem);
                        } else {
                            memory.splice(first, 0, newmem);
                        }

                    } else {
                        memory.push(newmem);
                    }
                } else if (memory.indexOf(newmem, idx + 1) !== -1) {
                    throw new ReferenceError("mutiple references of memory"); // multiple references to same memory in same module, not allowed.
                }

                let target;
                idx = memory.indexOf(oldmem);
                if (idx !== -1) {
                    target = this;
                }

                if (!target) {
                    idx = wasmModule.memory.indexOf(oldmem);
                    if (idx !== -1)
                        target = wasmModule;
                }

                if (!target) {
                    throw new ReferenceError("original not defined");
                }

                target.memory.splice(idx, 1);
            }
        }

        // merge wasmModule.memory into this.memory
        if (wasmModule.memory && wasmModule.memory.length > 0) {

            let src = wasmModule.memory;
            let len = src.length;
            let dst = this.memory;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let mem = dst[x];
                if (!(mem instanceof ImportedMemory)) {
                    first = x;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let mem = src[x];
                if (dst.indexOf(mem) !== -1)
                    continue;
                
                if (mem instanceof ImportedMemory) {
                    dst.splice(first, 0, mem);
                    first++;
                } else {
                    dst.push(mem);
                }
            }
        }

        if (tblmap.size > 0) {

            // find in opcode:
            // - call_indirect  0x11
            // - table.set      0x26
            // - table.get      0x25
            // - table.size     (0xfc << 8) | 16
            // - table.grow     (0xfc << 8) | 15
            // - table.init     (0xfc << 8) | 12
            // - table.copy     (0xfc << 8) | 14
            // - table.fill     (0xfc << 8) | 17
            //
            // replace in:
            // tables
            
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x11:      // call_indirect
                        case 0x25:      // table.get
                        case 0x26:      // table.set
                        case 0xfc0c:    // table.init
                        case 0xfc0f:    // table.grow
                        case 0xfc10:    // table.size
                        case 0xfc11:    // table.fill
                        {
                            let tbl = inst.table;
                            if (tblmap.has(tbl)) {
                                inst.table = tblmap.get(tbl);
                            }
                            break;
                        }
                        case 0xfc0e:    // table.copy
                        {
                            let tbl1 = inst.table1;
                            if (tblmap.has(tbl1)) {
                                inst.table1 = tblmap.get(tbl1);
                            }
                            // TODO: ensure that we can copy if tbl1 === tbl2
                            let tbl2 = inst.table2;
                            if (tblmap.has(tbl2)) {
                                inst.table2 = tblmap.get(tbl2);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.tables into this.tables
        if (wasmModule.tables && wasmModule.tables.length > 0) {

            let src = wasmModule.tables;
            let len = src.length;
            let dst = this.tables;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let tbl = dst[x];
                if (!(tbl instanceof ImportedTable)) {
                    first = x;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let tbl = src[x];
                if (dst.indexOf(tbl) !== -1)
                    continue;
                
                if (tbl instanceof ImportedTable) {
                    dst.splice(first, 0, tbl);
                    first++;
                } else {
                    dst.push(tbl);
                }
            }
        }

        if (glbmap.size > 0) {

            // find:
            // - global.set     0x24
            // - global.get     0x23
            // 
            // (globals are also allowed in expr as in global.init, dataSegment.init)
            // 
            // replace in:
            // globals
            
            let xlen = this.functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = this.functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (glbmap.has(glb)) {
                                inst.global = glbmap.get(glb);
                            }
                            break;
                        }
                    }
                }
            }

            let globals = this.globals;
            let arr = [];
            xlen = globals.length;
            for (let x = 0; x < xlen; x++) {
                let glb = globals[x];
                if (glb instanceof ImportedGlobal) {
                    continue;
                }

                arr.push(glb.init);
            }

            let dataSegments = this.dataSegments;
            xlen = dataSegments.length;
            for (let x = 0; x < xlen; x++) {
                let seg = dataSegments[x];
                arr.push(seg.inst.opcodes);
            }

            let elementSegments = this.elementSegments;
            xlen = elementSegments.length;
            for (let x = 0; x < xlen; x++) {
                let seg = elementSegments[x];
                arr.push(seg.opcodes);
            }

            xlen = arr.length;
            for (let x = 0; x < xlen; x++) {
                let opcodes = arr[x];
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (glbmap.has(glb)) {
                                inst.global = glbmap.get(glb);
                            }
                            break;
                        }
                    }
                }
            }

        }

        // merge wasmModule.globals into this.globals
        if (wasmModule.globals && wasmModule.globals.length > 0) {

            let src = wasmModule.globals;
            let len = src.length;
            let dst = this.globals;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let glob = dst[x];
                if (!(glob instanceof ImportedGlobal)) {
                    first = x;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let glob = src[x];
                if (dst.indexOf(glob) !== -1)
                    continue;
                
                if (glob instanceof ImportedGlobal) {
                    dst.splice(first, 0, glob);
                    first++;
                } else {
                    dst.push(glob);
                }
            }
        }

        if (tagmap.size > 0) {
            
            // find:
            // - throw      0x08
            // - catch      0x07
            // 
            // replace in:
            // tags
            
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x07:  // catch
                        case 0x08:  // throw
                        {
                            let tag = inst.tag;
                            if (tagmap.has(tag)) {
                                inst.tag = tagmap.get(tag);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.tags into this.tags
        if (wasmModule.tags && wasmModule.tags.length > 0) {

            let src = wasmModule.tags;
            let len = src.length;
            let dst = this.tags;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let tag = dst[x];
                if (!(tag instanceof ImportedTag)) {
                    first = x;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let tag = src[x];
                if (dst.indexOf(tag) !== -1)
                    continue;
                
                if (tag instanceof ImportedTag) {
                    dst.splice(first, 0, tag);
                    first++;
                } else {
                    dst.push(tag);
                }
            }
        }

    }

    // types

    /**
     * Return type by the signature of what pull and push from/to the stack.
     * @param {integer|integer[]} pullv
     * @param {integer|integer[]} pushv
     * @return {WasmType}      The function type with the signature or null if no matching type was found.
     */
    typeByPullPush(pullv, pushv) {
        let types = this.types;
        let len = types.length;
        let argc = 0;
        let retc = 0;

        if (Array.isArray(pullv)) {

            if (pullv.length == 1) {
                pullv = pullv[0];
                argc = 1;
            } else if (pullv.length > 1) {
                argc = pullv.length;
            }

        } else if (Number.isInteger(pullv) && pullv != WA_TYPE_VOID) {
            argc = 1;
        }

        if (Array.isArray(pushv)) {

            if (pushv.length == 1) {
                pushv = pushv[0];
                retc = 1;
            } else if (pushv.length > 1) {
                retc = pushv.length;
            }

        } else if (Number.isInteger(pushv) && pushv != WA_TYPE_VOID) {
            retc = 1;
        }

        for (let i = 0; i < len; i++) {
            let type = types[i];
            if (argc != type.argc || retc != type.retc) {
                continue;
            }

            if (argc === 1) {

                if (pullv !== type.argv[0])
                    continue;

            } else if (argc != 0) {
                let match = true;
                for (let x = 0; x < argc; x++) {
                    if (pullv[x] != type.argv[x]) {
                        match = false;
                        break;
                    }
                }

                if (!match)
                    continue;
            }

            if (retc === 1) {

                if (pushv !== type.retv[0])
                    continue;

            } else if (retc != 0) {
                let match = true;
                for (let x = 0; x < retc; x++) {
                    if (pushv[x] != type.retv[x]) {
                        match = false;
                        break;
                    }
                }

                if (!match)
                    continue;
            }

            // if we reached here it matching.
            return type;
        }

        return null;
    }

    /**
     * @param {integer|integer[]} pullv
     * @param {integer|integer[]} pushv
     * @return {WasmType}
     */
    getOrCreateType(pullv, pushv) {

        if (pullv === null)
            pullv = WA_TYPE_VOID;

        if (pushv === null)
            pushv = WA_TYPE_VOID;
        
        let type = this.typeByPullPush(pullv, pushv);
        if (type)
            return type;

        let argc = 0;
        let argv = null;
        let retc = 0;
        let retv = null;

        if (Array.isArray(pullv) && pullv.length > 0) {

            argc = pullv.length;
            argv = pullv.slice(); // copy

        } else if (Number.isInteger(pullv) && pullv != WA_TYPE_VOID) {
            argc = 1;
            argv = [pullv];
        }

        if (Array.isArray(pushv) && pushv.length > 1) {

            retc = pushv.length;
            retv = pushv.slice(); // copy

        } else if (Number.isInteger(pushv) && pushv != WA_TYPE_VOID) {
            retc = 1;
            retv = [pushv];
        }

        type = new WasmType();
        type.argc = argc;
        type.argv = argv;
        type.retc = retc;
        type.retv = retv;
        type.typeidx = this.types.length; // TODO: remove me!
        type.count = 0;
        this.types.push(type);

        return type;
    }

    // imports

    /**
     * @returns {boolean}
     */
    hasImports() {

        let functions = this.functions;
        let ylen = functions.length;
        for (let i = 0; i < ylen; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction))
                break;
            return true;
        }

        let globals = this.globals;
        ylen = globals.length;
        for (let i = 0; i < ylen; i++) {
            let glob = globals[i];
            if (!(glob instanceof ImportedGlobal))
                break;
            return true;
        }

        let memory = this.memory;
        ylen = memory.length;
        for (let i = 0; i < ylen; i++) {
            let mem = memory[i];
            if (!(mem instanceof ImportedMemory))
                break;
            return true;
        }

        let tables = this.tables;
        ylen = tables.length;
        for (let i = 0; i < ylen; i++) {
            let tbl = tables[i];
            if (!(tbl instanceof ImportedTable))
                break;
            return true;
        }

        let tags = this.tags;
        ylen = tags.length;
        for (let i = 0; i < ylen; i++) {
            let tag = tags[i];
            if (!(tag instanceof ImportedTag))
                break;
            return true;
        }

        return false;
    }

    /**
     * 
     * @returns {Array.<ImportedFunction|ImportedGlobal|ImportedMemory|ImportedTable|ImportedTag>}
     */
    getImports() {

        let imports = [];
        let functions = this.functions;
        let globals = this.globals;
        let memory = this.memory;
        let tables = this.tables;
        let tags = this.tags;
        let ylen = globals.length;
        for (let i = 0; i < ylen; i++) {
            let glob = globals[i];
            if (!(glob instanceof ImportedGlobal))
                break;
            imports.push(glob);
        }

        ylen = memory.length;
        for (let i = 0; i < ylen; i++) {
            let mem = memory[i];
            if (!(mem instanceof ImportedMemory))
                break;
            imports.push(mem);
        }

        ylen = tables.length;
        for (let i = 0; i < ylen; i++) {
            let tbl = tables[i];
            if (!(tbl instanceof ImportedTable))
                break;
            imports.push(tbl);
        }

        ylen = tags.length;
        for (let i = 0; i < ylen; i++) {
            let tag = tags[i];
            if (!(tag instanceof ImportedTag))
                break;
            imports.push(tag);
        }

        ylen = functions.length;
        for (let i = 0; i < ylen; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction))
                break;
            imports.push(func);
        }

        return imports;
    }
    
    /**
     * 
     * @param {ImportedFunction|ImportedGlobal|ImportedMemory|ImportedTable|ImportedTag} imp 
     */
    appendImport(imp) {

        if (typeof imp.module != "string" || typeof imp.name != "string" || imp.module.length == 0 || imp.module.length == 0)
            throw new TypeError("invalid name");

        if (imp instanceof ImportedFunction) {

            let functions = this.functions;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let func = functions[i];
                if (func instanceof ImportedFunction)
                    continue;
                
                last = i;
                break;
            }

            if (last == 0) {
                functions.unshift(imp);
            } else {
                functions.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedGlobal) {

            let globals = this.globals;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let glob = globals[i];
                if (glob instanceof ImportedGlobal)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                globals.unshift(imp);
            } else {
                globals.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedMemory) {

            let memory = this.memory;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let mem = memory[i];
                if (mem instanceof ImportedTag)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                memory.unshift(imp);
            } else {
                memory.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedTag) {

            let tags = this.tags;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let tag = tags[i];
                if (tag instanceof ImportedTag)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                tags.unshift(imp);
            } else {
                tags.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedTable) {

            let tables = this.tables;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let tbl = tables[i];
                if (tbl instanceof ImportedTable)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                tables.unshift(imp);
            } else {
                tables.splice(last + 1, 0, imp);
            }

        } else {
            throw new TypeError("invalid type");
        }
    }

    // globals

    /**
     * 
     * @param {String} name
     * @param {String} module Optional. If specified the search is explicity done for a ImportedGlobal
     * @returns {WasmGlobal|ImportedGlobal?}
     */
    getGlobalByName(name, module) {
        /*if (!this.names || !this.names.globals)
            throw TypeError("module must export the custom name section");
        let names = this.names.globals;
        let globals = this.globals;*/

        if (typeof name != "string")
            throw new TypeError("name must be string");


        let globals = this.globals;

        if (typeof module == "string" && module.length > 0) {

            let len = globals.length;
            for (let i = 0; i < len; i++) {
                let glob = globals[i];
                if (!(glob instanceof ImportedGlobal))
                    break;
                if (glob.module == module && glob.name == name) {
                    return glob;
                }
            }

            return null;
        }

        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (glob[__nsym] == name) {
                return glob;
            }
        }

        len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (!(glob instanceof ImportedGlobal))
                break;
            if (glob.name == name) {
                return glob;
            }
        }
        
        let exported = this.exports;
        len = exported.length;
        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            if (exp._kind !== WA_EXPORT_KIND_GLOBAL) {
                continue;
            }
            if (exp.name == name) {
                return exp.value;
            }
        }

        // WebAssembly by itself has no internal need for globals if they are not imported/exported
        
        return null;
    }

    /**
     * 
     * @param {ImportedGlobal|WasmGlobal} oldGlobal 
     * @param {ImportedGlobal|WasmGlobal} newGlobal 
     * @param {boolean} byAddress A boolean value that determine if the boolean should also be replaced by address in for example i32.load and i32.store instruction.
     * @returns 
     */
    replaceGlobal(oldGlobal, newGlobal, byAddress) {

        byAddress = (byAddress === true);
        let gvalues = [];
        let oldIsImport = false;
        let isSameType = false;
        let firstInvalid = -1;
        let firstNonImport = 0;
        let newIndex = -1;
        let globals = this.globals;
        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (glob instanceof WasmGlobal) {
                firstNonImport = i;
                break;
            }
        }

        if (globals.indexOf(newGlobal) !== -1)
            throw new ReferenceError("merging globals not implemented");

        if (oldGlobal instanceof ImportedGlobal)
            byAddress = false;

        if ((oldGlobal instanceof ImportedGlobal && newGlobal instanceof ImportedGlobal) || (oldGlobal instanceof WasmGlobal && newGlobal instanceof WasmGlobal))
            isSameType = true;

        if (isSameType) {
            let idx = globals.indexOf(oldGlobal);
            globals[idx] = newGlobal;
        } else {
            
            let idx = globals.indexOf(oldGlobal);
            globals.splice(idx, 1);

            if (newGlobal instanceof ImportedGlobal) {
                let firstNonImport = 0;
                let len = globals.length;
                for (let i = 0; i < len; i++) {
                    let glob = globals[i];
                    if (!(glob instanceof ImportedGlobal)) {
                        firstNonImport = i;
                        break;
                    }
                }
                globals.splice(firstNonImport, 0, newGlobal);
            } else {
                globals.push(newGlobal);
            }
        }
        
        let rawValue;
        
        if (oldGlobal.init.length == 2 && oldGlobal.init[0].opcode == 0x41 && oldGlobal.init[1].opcode == 0x0B) {
            rawValue = oldGlobal.init[0].value;
        } else {
            throw new TypeError("globals initial value unsupported");
        }
        let functions = this.functions;
        let start = 0;
        let ylen = functions.length;
        for (let y = start; y < ylen; y++) {
            let func = functions[y];
            if (!(func instanceof ImportedFunction))
                break;
            
            start++;
        }

        ylen = functions.length;
        for (let y = start; y < ylen; y++) {
            let func = functions[y];
            let opcodes = func.opcodes;
            let xlen = opcodes.length;
            let xend = xlen - 1;
            let dirty = false;
            let last = null;
            for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
                let op = opcodes[x];
                if (op.opcode == 0x23 || op.opcode == 0x24) {

                    if (op.global == oldGlobal) {
                        op.global = newGlobal;
                        op.x = newIndex;
                        dirty = true;
                    }
                } else if (byAddress === true && op.opcode == 0x41) { // i32.const
                    let val = op.value;
                    let idx = gvalues.indexOf(val);
                    if (val == rawValue) {
                        let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
                        opcodes[x] = inst;
                        dirty = true;
                    } else if (val == 0 && x < xlen - 1) {
                        let peek = opcodes[x + 1];
                        if (peek.opcode == 0x28 && peek.offset == rawValue) {
                            let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
                            opcodes[x] = inst;
                            opcodes.splice(x + 1, 1);
                            xlen--;
                            dirty = true;
                        } else if (peek.opcode == 0x36 && peek.offset == rawValue) {
                            let inst = {opcode: 0x24, global: newGlobal, x: newIndex};
                            opcodes[x] = inst;
                            opcodes.splice(x + 1, 1);
                            xlen--;
                            dirty = true;
                        }
                    }
                }
            }

            if (dirty)
                func._opcodeDirty = true;
        }

        // as replacing globals basically might shift the index in which its arrange simply mark the whole
        // code section as dirty..
        this.findSection(SECTION_TYPE_CODE).markDirty();

        return true;

        // marks every function that uses a global defined after the replaced one as dirty to force update.
        if (firstInvalid !== -1) {
            let functions = this.functions;
            let ylen = functions.length;
            for (let y = start; y < ylen; y++) {
                let func = functions[y];
                if (func._opcodeDirty)
                    continue;
                let dirty = false;
                let opcodes = func.opcodes;
                let xlen = opcodes.length;
                for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
                    let op = opcodes[x];
                    if (op.opcode == 0x23 || op.opcode == 0x24) {
                        let idx = op.x;
                        if (op.x >= firstInvalid) {
                            dirty = true;
                            break;
                        }
                    }
                }

                if (dirty)
                    func._opcodeDirty = true;
            }
        }

        return true;
    }

    // exports

    /**
     * 
     * @param {string} name 
     * @param {WasmGlobal|WasmFunction|WasmMemory|WasmTable|WasmTag} value
     * @throws {ReferenceError|TypeError} If the name or value is already declared as a export.
     * @throws {TypeError} If the class of value is not a valid type to be exported.
     */
    appendExport(name, value) {

        if (!((value instanceof WasmGlobal) || (value instanceof WasmFunction) || (value instanceof WasmMemory) || (value instanceof WasmTable) || (value instanceof WasmTag))) {
            throw TypeError(ERR_EXPORT_INVL_TYPE);
        }

        let explicit = this._explicitExported;
        let exps = this.exports;
        let len = exps.length;
        for (let i = 0; i < len; i++) {
            let exp = exps[i];
            if (exp.name == name) {
                throw new ReferenceError("name already declared");
            } else if (exp.value == value) {
                throw new ReferenceError("value already exported");
            }
        }

        if (value instanceof WasmFunction) {

            let functions = this.functions;
            if (functions.indexOf(value) == -1) {
                functions.push(value);
            }

            let exp = new WasmExport(WA_EXPORT_KIND_FUNC, name, value);
            exps.push(exp);
            explicit.push(exp);

        } else if (value instanceof WasmGlobal) {

            let globals = this.globals;
            if (globals.indexOf(value) == -1) {
                globals.push(value);
            }

            let exp = new WasmExport(WA_EXPORT_KIND_GLOBAL, name, value);
            exps.push(exp);
            explicit.push(exp);

        } else if (value instanceof WasmMemory) {

            let memory = this.memory;
            if (memory.indexOf(value) == -1) {
                memory.push(value);
            }

            let exp = new WasmExport(WA_EXPORT_KIND_MEMORY, name, value);
            exps.push(exp);
            explicit.push(exp);

        } else if (value instanceof WasmTable) {

            let tables = this.tables;
            if (tables.indexOf(value) == -1) {
                tables.push(value);
            }

            let exp = new WasmExport(WA_EXPORT_KIND_TABLE, name, value);
            exps.push(exp);
            explicit.push(exp);

        } else if (value instanceof WasmTag) {

            let tags = this.tags;
            if (tags.indexOf(value) == -1) {
                tags.push(value);
            }

            let exp = new WasmExport(WA_EXPORT_KIND_TAG, name, value);
            exps.push(exp);
            explicit.push(exp);

        } 
    }

    removeExportByName(name) {

    }

    /**
     * 
     * @param {WasmFunction|WasmGlobal|WasmMemory|WasmTable|WasmTag} obj 
     * @returns {WasmExport?}
     */
    removeExportByRef(obj) {
        
        let matched;
        let exps = this.exports;
        let len = exps.length;
        for (let i = 0; i < len; i++) {
            let exp = exps[i];
            if (exp.value == obj) {
                exps.splice(i, 1);
                matched = exp;
                break;
            }
        }

        if (!matched)
            return null;

        // remove in explicit if present
        let explicit = this._explicitExported;
        let idx = explicit.indexOf(matched);

        if (idx !== -1) {
            explicit.splice(idx, 1);
        }

        return matched;
    }

    /**
     * 
     * @param {WasmFunction|WasmGlobal|WasmMemory|WasmTable} obj 
     * @returns {WasmExport?}
     */ 
    findExportDefByObject(obj) {
        let exps = this.exports;
        let len = exps.length;
        for (let i = 0; i < len; i++) {
            let exp = exps[i];
            if (exp.value == obj) {
                return exp;
            }
        }
    
        return null;
    }

    // Custom Sections

    // getCustomSectionsByName(name)

    /**
     * @param {string} name
     * @returns {WebAssemblyCustomSection[]}
     */
    customSections(name) {
        let results = [];
        const sections = this.sections;
        let len = sections.length;
        for (let i = 0; i < len; i++) {
            let section = sections[i];
            if (section.type == 0x00 && section.name == name) {
                results.push(section);
            }
        }
    }

    // getSectionByType(type)
    
    /**
     * 
     * @param {integer|string} search 
     * @returns {WebAssemblySection}
     */
    findSection(search) {

        if (typeof search == "string") {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && sec.name == search) {
                    return sec;
                }
            }

        } else if (Number.isInteger(search)){

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == search) {
                    return sec;
                }
            }

        }

        return null;
    }

    /**
     * 
     * @param {integer|string} search 
     * @returns {WebAssemblySection[]}
     */
    findAllSections(search) {

        let results = [];

        if (typeof search == "string") {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && sec.name == search) {
                    results.push(sec);
                }
            }

        } else if (search !== null && typeof search == "object" && search instanceof RegExp) {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && search.exec(sec.name)) {
                    results.push(sec);
                }
            }

        } else if (Number.isInteger(search)){

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == search) {
                    results.push(sec);
                }
            }

        } else {
            throw new TypeError("search argument is invalid");
        }

        return results;
    }

    // memory & data segments

    /**
     * @todo This would need relocation to be performed to work will all types of binaries, which would need alot of implementation..
     * Computes and constructs a ArrayBuffer which built up like the initial memory of the module. Which makes
     * access and mutation at addresses possible. If mutable is set to true, the data segments of the module is also
     * 
     * @todo add support for complex data-segment setup, where data-segments might have variable location and might be setup to different memory instances.
     * 
     * @param  {WasmMemory|ImportedMemory} memory The memory for which to compute the initial memory.
     * @param  {boolean} mutable
     * @return {Uint8Array}
     */
    computeInitialMemory(memory, mutable) {
        mutable = (mutable === true);

        if (mutable && this._mutableDataSegments) {
            return this._mutableDataSegments;
        }

        let segments = this.dataSegments
        let len = segments.length;
        let min = 0xFFFFFFFF;   // wasm-32 max
        let max = 0;
        for (let i = 0; i < len; i++) {
            let segment = segments[i];
            if (segment.memory !== memory)
                continue;
            let val = segment.inst.opcodes[0].value;
            let end = val + segment.size;
            if (end > max) {
                max = end;
            }
            if (val < min) {
                min = val;
            }
        }

        let mem = new Uint8Array(max);

        for (let i = 0; i < len; i++) {
            let segment = segments[i];
            let off = segment.inst.opcodes[0].value;
            let buf = segment._buffer;
            u8_memcpy(buf, 0, buf.byteLength, mem, off);
            if (mutable) {
                segment._mutableDataBuffer = mem;
                segment._mutableDataOffset = off;
            }
        }

        if (mutable) {
            this._mutableDataSegments = mem;
        }

        return mem;
    }

    computeInitialMemoryMaxAddress() {
        let segments = this.dataSegments
        let len = segments.length;
        let min = segments[0].inst.opcodes[0].value;
        let max = 0;
        for (let i = 0; i < len; i++) {
            let seg = segments[i];
            let val = seg.inst.opcodes[0].value;
            let end = val + seg.size;
            if (end > max) {
                max = end;
            }
            if (val < min) {
                min  = val;
            }
        }

        return max;
        //return {min: min: max: max};
    }

    getDataSegmentByName(name) {

        let dataSegments = this.dataSegments;
        let len = dataSegments.length;
        for (let i = 0; i < len; i++) {
            let segment = dataSegments[i];
            if (typeof segment[__nsym] != "string")
                continue
            if (segment[__nsym] === name) {
                return segment;
            }
        }

        return null;
    }
    
    /**
     * Replaces all uses of `oldMemory` with `newMemory`
     * 
     * @param  {WasmMemory|ImportedMemory} oldMemory
     * @param  {WasmMemory|ImportedMemory} newMemory
     * @return {void}
     */
    replaceMemory(oldMemory, newMemory) {

    }

    // Functions

    /**
     * 
     * @param {string} name 
     * @param {boolean} checkExports 
     * @returns {WasmFunction|ImportedFunction?}
     */
    getFunctionByName(name, checkExports) {

        checkExports = (checkExports === true);
        let functions = this.functions;
        let len = functions.length
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            if (typeof func[__nsym] == "string" && func[__nsym] == name) {
                return func;
            }
        }

        if (!checkExports)
            return null;

        let exported = this.exports;
        len = exported.length
        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            if (exp._kind != WA_EXPORT_KIND_FUNC) {
                continue;
            }
            if (exp.name == name) {
                return exp.value;
            }
        }

        return null;
    }

    /**
     * TODO: take a function instead of a name, this will be more flexible.
     * 
     * @param {string} name 
     * @returns {WasmFunction[]}
     */
    findFuncUses(name) {
        let match;
        let functions = this.functions;
        let ylen = functions.length;
        for (let y = 0; y < ylen; y++) {
            let func = functions[y];
            if (func instanceof ImportedFunction) {
                if (func.name == name) {
                    match = func;
                    break;
                }
            } else if (func[__nsym] == name) {
                match = func;
                break;
            }
        }
    
        let uses = [];
        ylen = functions.length;
        for (let y = 0; y < ylen; y++) {
            let func = functions[y];
            if (func instanceof ImportedFunction) {
                continue;
            }
            let opcodes = func.opcodes;
            let xlen = opcodes.length;
            for (let x = 0; x < xlen; x++) {
                let inst = opcodes[x];
                if (inst.opcode == 0x10 && inst.func == match) {
                    uses.push(func);
                    break;
                }
            }
        }

        return uses;
    }

    // Table utilities
    
    getTableByName(name) {

    }

    // Support for common custom sections

    /**
     * Adopts names from the exports if a name not already given to that value.
     */
    adoptNamesFromExports() {

    }

    // assemble binary

    /**
     * 
     * @param {object} options 
     * 
     * @returns {Uint8Array[]} 
     */
    encode(options) {
        let exported = [];
        let excludeSections = [];
        let sections = this.sections;
        let len = sections.length;
        let buffers = [];

        if (Array.isArray(options.exclude)) {
            let exclude = options.exclude;
            let ylen = sections.length;
            let xlen = exclude.length;

            for (let y = 0; y < ylen; y++) {
                let sec = sections[y];
                let match = false;
                for (let x = 0; x < xlen; x++) {
                    let p = exclude[x];
                    if (p.type != sec.type) {
                        continue;
                    } else {
                        if (p.type === 0x00) {

                            if (typeof p.name == "string" && p.name == sec.name) {
                                match = true;
                                break;
                            }

                        } else {
                            match = true;
                            break;
                        }
                    }
                }

                if (match) {
                    excludeSections.push(sec);
                }
            }
        }

        let finalizing_callbacks = [];
        let off = 0;
        let fcb = null;

        if (!(typeof options == "object" && options !== null)) {
            options = {};
        }

        options.add_finalizing_callback = function(cb) {
            if (fcb)
                throw new Error("add_callback already called!");
            let obj = {};
            obj.start = -1;
            obj.end = -1;
            obj.buf = null;
            obj.fn = cb;
            finalizing_callbacks.push(obj);
            fcb = obj;
        }

        let header, hbuf = new Uint8Array(8);
        buffers.push(hbuf.buffer);
        header = new DataView(hbuf.buffer);
        header.setUint32(0, 0x6D736100, true);
        header.setUint32(4, this._version, true);
        off = 8;

        prepareModuleEncode(this);

        for (let i = 0;i < len;i++) {
            let section = sections[i];
            let excluded = excludeSections.indexOf(section) !== -1;
            let isExported = exported[i];
            let type = section.type;
            if (excluded) {
                //
                if (type == SECTION_TYPE_DATA) {
                    let buf = new Uint8Array(3);
                    buf[0] = SECTION_TYPE_DATA;
                    buf[1] = 1;
                    buf[2] = 0;
                    buffers.push(buf.buffer);
                    off += 3;
                } else {
                    continue;
                }
            } else if (section instanceof WebAssemblySection) {
                let sec_cb, sub = section.encode(options);
                section._byteOffset = off;
                if (fcb) {
                    sec_cb = fcb;
                    fcb = null;
                    sec_cb.start = off;
                }
                if (Array.isArray(sub)) {
                    
                    if (sec_cb) {
                        let buf, boff = 0;
                        let blen = 0;
                        let xlen = sub.length;
                        for (let x = 0; x < xlen; x++) {
                            blen += sub[x].byteLength;
                        }
                        buf = new Uint8Array(blen);
                        for (let x = 0; x < xlen; x++) {
                            let sbuf = sub[x];
                            buf.set(sbuf, boff);
                            boff += sbuf.byteLength;
                        }
                        section._byteLength = blen;
                        off += blen;
                        sec_cb.buf = buf;
                        sec_cb.end = off;
                        buffers.push(buf);
                    } else {
                        let blen = 0;
                        let xlen = sub.length;
                        for (let x = 0; x < xlen; x++) {
                            let buf = sub[x];
                            buffers.push(buf);
                            blen += buf.byteLength;
                        }
                        section._byteLength = blen;
                        off += blen;
                    }
                    
                } else {
                    buffers.push(sub);
                    off += sub.byteLength;
                    section._byteLength = sub.byteLength;
                    if (sec_cb) {
                        sec_cb.buf = sub;
                        sec_cb.end = off;
                    }
                }
            } else {
                console.log("section %o not handled!", section);
                /*let end = section.dataOffset + section.size;
                let sub = moduleBuffer.slice(section.offset, end);
                buffers.push(sub);*/
            }
        }

        if (finalizing_callbacks.length > 0) {
            let len = finalizing_callbacks.length;
            for (let i = 0;i < len;i++) {
                let obj = finalizing_callbacks[i];
                let fn = obj.fn;
                fn(this, obj.buf);
            }
        }

        return buffers;
    }

    //

    static disassembleWebAssemblyBinary(buffer, options) {

    }
}

WebAssemblyModule.Name = __nsym;

// TODO: move into WebAssemblyModule.decode (static method)
// https://webassembly.github.io/spec/core/binary/modules.html#binary-version
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
/**
 * 
 * @param {Uint8Array|ArrayBuffer|DataView} buf 
 * @param {object} options
 * @returns {WebAssemblyModule}
 * @throws {TypeError} magic is not equal to '\\0asm'
 * @throws {RangeError} version is not 1.0
 */
export function parseWebAssemblyBinary(buf, options) {

    let data = new ByteArray(buf);
    let magic = data.readUint32();
    let version = data.readUint32();
    let customSectionFn, customSectionMap;

    data.offset = 0;
    if (magic != 0x6d736100) {
        throw new TypeError("magic is not equal to '\\0asm'");
    }

    if (version != 1) {
        throw new RangeError("version is not 1.0");
    }

    if (options && typeof options.customSections == "function") {
        customSectionFn = options.customSections;
    } else if (options && typeof options.customSections == "object" && options.customSections !== null) {
        customSectionMap = options.customSections;
    }

    //console.log("magic: %s version: %d", magic.toString(16), version);

    data.offset = 8;
    let end = buf.byteLength;

    let results = [];
    let chunks = [];

    while (data.offset < end) {
        let start = data.offset;
        let type = data.readUint8();
        let tmp = data.offset;
        let size = data.readULEB128();
        let name = undefined;
        tmp = data.offset - tmp;
        //console.log("type: %d (%s) size: %d offset: %d data-offset: %d", type, sectionnames[type], size, start, data.offset);
        let chunk = {type: type, name: undefined, size: size, offset: start, dataOffset: data.offset};
        chunks.push(chunk);
        if (type == 0x00) {
            if (size === 0) {
                console.warn("invalid trailing chunk at %d", data.offset);
                break;
            }
            let tmp = data.offset;
            let nlen = data.readULEB128();
            chunk.name = data.readUTF8Bytes(nlen);
            chunk.dataOffset = data.offset;
            chunk.size = chunk.size - (data.offset - tmp);
            data.offset = tmp;
        } else if (type > 0x0d) {
            console.warn("section type: %d not handled", type);
        }

        // wasm binaries sometimes have trailing non used bytes.
        data.offset += size;
    }

    // by handling the section in a certain order:
    // 1. type section
    // 2. func section
    // 3. global section
    // 3. export section
    // 4. import section
    // then we can actually lookup functions and globals in export/import
    
    let codesec, datasec;
    let filtered = [];
    let dwarfsec = [];
    let cnt = chunks.length;
    for (let i = 0; i < cnt; i++) {
        let sec = chunks[i];
        sec.index = i;
        if (sec.type == SECTION_TYPE_CODE) {
            codesec = sec;
            filtered.push(sec);
            continue;
        } else if (sec.type == SECTION_TYPE_DATA) {
            datasec = sec;
            filtered.push(sec);
            continue;
        } else if (sec.type != SECTION_TYPE_CUSTOM) {
            filtered.push(sec);
            continue;
        }

        let name = sec.name;
        if (name == ".debug_info" || name == ".debug_loc" || name == ".debug_ranges" || name == ".debug_abbrev" || name == ".debug_line" || name == ".debug_str") {
            dwarfsec.push(sec);
        } else {
            filtered.push(sec);
        }
    }

    // make sure that we process code section after data section.
    if (codesec && datasec) {
        let idx = filtered.indexOf(codesec);
        filtered.splice(idx, 1);
        idx = filtered.indexOf(datasec);
        filtered.splice(idx + 1, 0, codesec);
    }

    let mod = new WebAssemblyModule();
    mod._version = version;
    mod.dataSegments = [];
    mod.elementSegments = [];
    mod.exports = [];
    mod.functions = [];
    mod.globals = [];
    mod.memory = [];
    mod.tables = [];
    mod.types = [];
    mod.tags = [];
    cnt = filtered.length;

    // TODO: might want to set this even earlier.
    mod.sections = chunks;

    for (let i = 0; i < cnt; i++) {
        let chunk = filtered[i];
        let type = chunk.type;
        let size = chunk.size;
        data.offset = chunk.dataOffset;
        switch (type) {
            case 0x01:  // type
            {
                let sec = WebAssemblyFuncTypeSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x02:  // import
            {
                let sec = WebAssemblyImportSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x03:  // function
            {
                let sec = WebAssemblyFunctionSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x04:  // table
            {
                let sec = WebAssemblyTableSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x05:  // memory
            {
                let sec = WebAssemblyMemorySection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x06:  // global
            {
                let sec = WebAssemblyGlobalSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x07:  // export
            {
                let sec = WebAssemblyExportSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x08:  // start
            {
                let sec = WebAssemblyStartSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x09:  // element
            {
                let sec = WebAssemblyElementSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0A:  // code
            {
                let sec = WebAssemblyCodeSection.decode(mod, data, size, options);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0B:  // data
            {
                let sec = WebAssemblyDataSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0C:  // data-count
            {
                let sec = WebAssemblyDataCountSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0d:  // tag-section (exception/event handling)
            {
                let sec = WebAssemblyTagSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x00: // custom
            {
                let sec;
                /** @type {string} */
                let name = chunk.name;
                switch (name) {
                    case 'producers':
                        sec = WebAssemblyCustomSectionProducers.decode(mod, data, size, name);
                        chunks[chunk.index] = sec;
                        mod.producers = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'name':
                        sec = WebAssemblyCustomSectionName.decode(mod, data, size, name);
                        chunks[chunk.index] = sec;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'dylink.0':
                        sec = WebAssemblyCustomSectionDylink0.decode(mod, data, size, name);
                        chunks[chunk.index] = sec;
                        mod.dylink0 = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'target_features':
                        sec = WebAssemblyCustomSectionTargetFeatures.decode(mod, data, size, name);
                        chunks[chunk.index] = sec;
                        mod.features = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    // generated by clang and used by wasm-ld
                    case 'linking':
                        sec = WebAssemblyCustomSectionLinker.decode(mod, data, size, name, options);
                        chunks[chunk.index] = sec;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    // generated by clang and used by wasm-ld
                    case 'reloc.CODE':
                    case 'reloc.DATA':
                        sec = WebAssemblyCustomSectionReloc.decode(mod, data, size, name, options);
                        sec.name = name;
                        chunks[chunk.index] = sec;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    // other custom section are handled by providing options.customSections function
                    default:
                        if (customSectionFn) {
                            sec = customSectionFn(mod, data, size, name, options, chunk);
                            if (sec !== null && sec !== undefined) {
                                chunks[chunk.index] = sec;
                                chunk.data = sec.data;
                                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                            }
                        } else if (customSectionMap && customSectionMap.hasOwnProperty(name)) {
                            
                        }
                        break;  // do nothing;
                }
                break;
            }
            default:
                continue;
        }
    }

    if (dwarfsec.length > 0 && typeof options.decodeDWARFDebugSections == "function") {
        let ret = options.decodeDWARFDebugSections(mod, data, dwarfsec);
    }

    return mod;
}
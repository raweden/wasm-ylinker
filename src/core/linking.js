
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

import { WebAssemblyCustomSection } from "./types"
import { WasmFunction, WasmGlobal, WasmTable, WasmTag, ImportedFunction, ImportedTable, ImportedTag } from "./types";

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

export class LinkerSymbol {

    constructor () {
        this.kind = undefined;
        this.name = undefined;
        this.flags = 0;
    }
}

export class WebAssemblyCustomSectionLinker extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "linking");
        /** @type {llvm.SegmentInfo[]} */
        this._segments = undefined;
        /** @type {Array.<llvm.FuncSymbol|llvm.GlobSymbol|llvm.TagSymbol|llvm.TableSymbol|llvm.DataSymbol|llvm.SectionSymbol} */
        this._symtable = undefined;
        /** @type {llvm.InitFunction[]} */
        this._ctors = undefined;
        /** @type {llvm.ComdatInfo[]} */
        this._comdat = undefined;
    }

    encode(options) {

        throw new ReferenceError("encoding linker section not supported");
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionLinker}
     */
    static decode(module, data, size) {

        let segments;
        let ctors;
        let comdat;
        let symtable;

        let end = data.offset + size;
        let version = data.readULEB128();
        if (version != 2)
            throw new RangeError("UNSUPPORTED_VERSION");
        let subsections = [];
        while (data.offset < end) {
            let type = data.readUint8();
            let payload_len = data.readULEB128();
            let start = data.offset;
            if (type == 0x05) {
                // WASM_SEGMENT_INFO
                segments = [];
                let count = data.readULEB128();
                for (let i = 0; i < count; i++) {
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let alignment = data.readULEB128();
                    let flags = data.readULEB128();
                    segments.push({name: name, name_len: nlen, alignment: alignment, bitflags: flags});
                }

                //console.log("linker %d WASM_SEGMENT_INFO size: %d %o", type, payload_len, segments);
                
            } else if (type == 0x06) {
                // WASM_INIT_FUNCS
                ctors = [];
                let count = data.readULEB128();
                for (let i = 0; i < count; i++) {
                    let priority = data.readULEB128();
                    let symbol_index = data.readULEB128();
                    if (symbol_index >= symtable.length)
                        throw new RangeError("symbol_index is out of range");
                    let symbol = symtable[symbol_index];
                    ctors.push({priority: priority, symbol: symbol});
                }
                //console.log("linker %d WASM_INIT_FUNCS size: %d %o", type, payload_len, ctors);
            } else if (type == 0x07) {
                // WASM_COMDAT_INFO
                comdat = [];
                let xcnt = data.readULEB128();
                for (let x = 0; x < xcnt; x++) {
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let flags = data.readULEB128();
                    let ycnt = data.readULEB128();
                    let symtbl = new Map();
                    for (let y = 0; y < ycnt; y++) {
                        let kind = data.readUint8();
                        let index = data.readULEB128();
                        symtbl.set(index, kind);
                    }

                    comdat.push({name: name, name_len: nlen, flags: flags, symtbl: symtbl});
                }

                //console.log("linker %d WASM_COMDAT_INFO size: %d", type, payload_len, comdat);
            } else if (type == 0x08) {
                // WASM_SYMBOL_TABLE
                symtable = [];
                let count = data.readULEB128();
                for (let i = 0; i < count; i++) {
                    let sym = new LinkerSymbol();
                    let kind = data.readUint8();
                    let flags = data.readULEB128();
                    sym.kind = kind;
                    sym.flags = flags;
                    if (kind == 0x0) {              // func

                        let funcidx = data.readULEB128();
                        let func = module.functions[funcidx];
                        sym.value = func;

                        if (func instanceof WasmFunction || (func instanceof ImportedFunction && (flags & WASM_SYM_EXPLICIT_NAME) != 0)) {
                            let nlen = data.readULEB128();
                            let name = data.readUTF8Bytes(nlen);
                            sym.name = name;
                            sym.name_len = nlen;
                        }

                    } else if (kind == 0x2) {       // global

                        let globidx = data.readULEB128();
                        let glob = module.globals[globidx];
                        sym.value = glob;

                        if (glob instanceof WasmGlobal || (glob instanceof ImportedFunction && (flags & WASM_SYM_EXPLICIT_NAME) != 0)) {
                            let nlen = data.readULEB128();
                            let name = data.readUTF8Bytes(nlen);
                            sym.name = name;
                            sym.name_len = nlen;
                        }

                    } else if (kind == 0x04) {      // event (error-handling)

                        let tagidx = data.readULEB128();
                        let tag = module.tags[tagidx];
                        sym.value = tag;

                        if (tag instanceof WasmTag || (tag instanceof ImportedTag && (flags & WASM_SYM_EXPLICIT_NAME) != 0)) {
                            let nlen = data.readULEB128();
                            let name = data.readUTF8Bytes(nlen);
                            sym.name = name;
                            sym.name_len = nlen;
                        }

                    } else if (kind == 0x05) {      // table

                        let tblidx = data.readULEB128();
                        let table = module.tables[tblidx];
                        sym.value = table;

                        if (table instanceof WasmTable || (table instanceof ImportedTable && (flags & WASM_SYM_EXPLICIT_NAME) != 0)) {
                            let nlen = data.readULEB128();
                            let name = data.readUTF8Bytes(nlen);
                            sym.name = name;
                            sym.name_len = nlen;
                        }

                    } else if (kind == 0x1) {       // data

                        let nlen = data.readULEB128();
                        let name = data.readUTF8Bytes(nlen);
                        sym.name = name;
                        sym.name_len = nlen;
                        if ((flags & WASM_SYM_UNDEFINED) == 0) {
                            sym.index = data.readULEB128();
                            sym.offset = data.readULEB128();
                            sym.size = data.readULEB128();
                            sym.value = module.dataSegments[sym.index];
                        }


                    } else if (kind == 0x3) {       // section
                        sym.section = data.readULEB128();
                    }
                    symtable.push(sym);
                }
                //console.log("linker %d WASM_SYMBOL_TABLE size: %d", type, payload_len, symtable);
            }
            data.offset = start + payload_len;
        }

        let section = new WebAssemblyCustomSectionLinker(module);
        section._segments = segments;
        section._symtable = symtable;
        section._ctors = ctors;
        section._comdat = comdat;

        return section;
    }
}
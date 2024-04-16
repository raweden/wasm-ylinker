
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

import * as fs from "node:fs"
import * as path from "node:path"

import { ByteArray, lengthBytesUTF8 } from "./core/ByteArray";
import { WA_TYPE_I32, SECTION_TYPE_CODE, SECTION_TYPE_FUNCTYPE, SECTION_TYPE_IMPORT, SECTION_TYPE_FUNC,
    SECTION_TYPE_TABLE, SECTION_TYPE_MEMORY, SECTION_TYPE_GLOBAL, SECTION_TYPE_EXPORT, SECTION_TYPE_START,
    SECTION_TYPE_ELEMENT, SECTION_TYPE_DATA, SECTION_TYPE_DATA_COUNT, SECTION_TYPE_TAG, SECTION_TYPE_CUSTOM, __nsym, WA_TYPE_FUNC_REF } from "./core/const"

import { WebAssemblyCustomSection, WebAssemblySection, WasmDataSegment, WasmElementSegment, WasmFunction, 
    WasmGlobal, WasmLocal, WasmMemory, WasmTable, WasmType, WasmTag,
    ImportedFunction, ImportedGlobal, ImportedMemory, ImportedTable, ImportedTag, 
    ExportedFunction, ExportedGlobal, ExportedMemory, ExportedTable  } from "./core/types"
import { WebAssemblyModule, WebAssemblyImportSection, WebAssemblyCodeSection, WebAssemblyDataSection, 
    WebAssemblyDataCountSection, WebAssemblyStartSection, WebAssemblyExportSection, WebAssemblyGlobalSection, 
    WebAssemblyMemorySection, WebAssemblyElementSection, WebAssemblyFuncTypeSection, WebAssemblyFunctionSection,
    WebAssemblyTableSection, WebAssemblyTagSection } from "./core/WebAssembly";
import { WebAssemblyCustomSectionName } from "./core/name";
import { WebAssemblyCustomSectionProducers } from "./core/producers";
import { validateWasmModule } from "./core/validate";
import { builtin_op_replace_map, replaceCallInstructions, fixup_builtins} from "./fixup-builtin"
import { WebAssemblyCustomSectionNetBSDExecHeader } from "./ylinker/rtld.exechdr";
import { WebAssemblyCustomSectionNetBSDDylinkV2 } from "./ylinker/rtld.dylink0";
import { fixup_objc_gnustep2 } from "./ylinker/objc_msgSend";
import { ARLinker } from "./ar-loader";
import { LinkerSymbol, WASM_SYM_UNDEFINED, WASM_SYM_LINKTIME_CONSTRUCT, WASM_SYM_BINDING_LOCAL, WASM_SYM_BINDING_WEAK, WASM_SYM_EXPORTED,
    WASM_SYM_EXTERNAL, WASM_SYM_VISIBILITY_HIDDEN, WASM_SYM_EXTERNAL_DLSYM, WASM_SYM_INTERNAL } from "./core/linking"
import { R_WASM_MEMORY_ADDR_LEB, R_WASM_MEMORY_ADDR_SLEB, R_WASM_TABLE_INDEX_SLEB, R_WASM_TABLE_INDEX_I32, R_WASM_MEMORY_ADDR_I32 } from "./core/reloc"
import { validateWasmModuleDataSegments } from "./core/validate"
import { u8_memcpy } from "./core/utils"
import { RuntimeLinkingSymbol, DataSegmentStartSymbol, DataSegmentEndSymbol } from "./ylinker/core"

function readSelectorType(buf) {
    let str = "";
    let len = buf.byteLength;
    for (let i = 0; i < len; i++) {
        let c = buf[i];
        str += String.fromCharCode(c);
    }

    return str;
}

/**
 * @typedef DataSection
 * @type {Object}
 * @property {string} name
 * @property {WasmDataSegment} dataSegment
 * @property {WasmDataSegment[]} dataSegments
 * @property {integer} max_align
 * @property {integer} _dataSize
 * @property {integer} _size
 * @property {integer} _packedSize
 * @property {integer} _paddingTotal
 * @property {integer} _reloc_start
 * @property {integer} _reloc_stop
 */

/**
 * 
 * @param {string} name 
 * @returns {string}
 */
function generateRelocImportGlobalName(name) {
    let glob_name = name.replace(/[\.\-\s]/gm, '_');
    if (glob_name[0] != '_')
        glob_name = '_' + glob_name;
    if (glob_name[0] != '_' && glob_name[1] != '_')
        glob_name = '_' + glob_name;

    return glob_name;
}

function _replaceRelocByRef(code_relocs, data_relocs, oldsym, newsym) {

    let len = code_relocs.length;
    for (let i = 0; i < len; i++) {
        let reloc = code_relocs[i];
        if (reloc.ref == oldsym) {
            reloc.ref = newsym;
        }
    }

    len = data_relocs.length;
    for (let i = 0; i < len; i++) {
        let reloc = data_relocs[i];
        if (reloc.ref == oldsym) {
            reloc.ref = newsym;
        }
    }
}

function _replaceInCtorAndDtor(obj, oldsym, newsym) {
    if (!obj)
        return;

    if (obj._ctors && Array.isArray(obj._ctors)) {
        let ctors = obj._ctors;
        let len = ctors.length;
        for (let i = 0; i < len; i++) {
            let ctor = ctors[i];
            if (ctor.symbol == oldsym) {
                ctor.symbol = newsym;
            }
        }
    }

    if (obj._dtors && Array.isArray(obj._dtors)) {
        let dtors = obj._dtors;
        let len = dtors.length;
        for (let i = 0; i < len; i++) {
            let dtor = dtors[i];
            if (dtor.symbol == oldsym) {
                dtor.symbol = newsym;
            }
        }
    }
}

/**
 * 
 * @param {DataSection} dataSection 
 */
function packDataSegments(dataSection) {
    let dataSegments = dataSection.dataSegments;
    let alignmap = new Map();
    let alignidx = [];          // index of all alignments [32, 16, 8, 4, 0];
    let ylen = dataSegments.length;
    let unaligned = [];
    let zlen = 0;
    for (let y = 0; y < ylen; y++) {
        let dataSegment = dataSegments[y];
        let name = dataSegment[__nsym];
        let align = dataSegment._alignment !== 0 ? Math.pow(2, dataSegment._alignment) : 0;
        if (align === 0) {
            unaligned.push(dataSegment);
        } else if (alignmap.has(align)) {
            let arr = alignmap.get(align);
            arr.push(dataSegment);
            zlen++;
        } else {
            let arr = [];
            arr.push(dataSegment);
            alignmap.set(align, arr);
            alignidx.push(align);
            zlen++;
        }
    }

    // .rodata..L.str.2

    alignidx.sort(function(a, b) {
        if (a > b) {
            return -1;
        } else if (a < b) {
            return 1;
        }

        return 0;
    });

    let padt = 0;
    let offset = 0;
    for (let y = 0; y < zlen; y++) {
        let dataSegment;
        let rem, align, match = -1;
        let xlen = alignidx.length;
        for (let x = 0; x < xlen; x++) {
            align = alignidx[x];
            rem = align !== 0 ? offset % align : 0;
            if (rem == 0) {
                match = x;
                break;
            }
        }

        let arr = alignmap.get(align);
        dataSegment = arr.shift();
        if (arr.length == 0) {
            let idx = alignidx.indexOf(align);
            alignidx.splice(idx, 1);
            alignmap.delete(align);
        }


        if (match == -1) {
            let pad = (align - rem);
            offset += pad;
            padt += pad;
        }

        let size = dataSegment.size;
        dataSegment._reloc = offset;
        dataSegment._rloc = offset;
        offset += size;
        dataSegments[y] = dataSegment;
        if (!Number.isInteger(offset))
            throw new TypeError("NOT_INTEGER");
    }

    let z = zlen;
    ylen = unaligned.length;
    for (let y = 0; y < ylen; y++) {
        let dataSegment = unaligned[y];
        dataSegment._reloc = offset;
        dataSegment._rloc = offset;
        dataSegments[z] = dataSegment;
        offset += dataSegment.size;
        z++;
    }
    

    dataSection._packedSize = offset;
    dataSection._size = offset;
    dataSection._paddingTotal = padt;
}

export class ByteCodeLinker {

	constructor() {
		this.funcmap = {};
		this.datamap = {};
        // symbol data.
        this._datasym = {};
        this._funcsym = {};
        this._globsym = [];
        this._tagsym = [];
        this._tblsym = [];
        this.datasubmap = {};
        // standard wasm data.
        /** @type {WasmDataSegment[]} */
	    this.dataSegments = [];
        /** @type {WasmElementSegment[]} */
	    this.elementSegments = [];
        /** @type {Array.<ExportedFunction, ExportedGlobal, ExportedMemory, ExportedTable>} */
	    this.exports = [];
	    /** @type {Array.<WasmFunction|ImportedFunction>} */
        this.functions = [];
        /** @type {Array.<WasmGlobal|ImportedGlobal>} */
	    this.globals = [];
        /** @type {Array.<WasmMemory|ImportedMemory>} */
	    this.memory = [];
        /** @type {Array.<WasmTable|ImportedTable>} */
	    this.tables = [];
        /** @type {WasmType[]} */
	    this.types = [];
        /** @type {Array.<WasmTag|ImportedTag>} */
        this.tags = [];
        /** @type {Array.<WebAssemblySection|Object>} */
        this.sections = [];
        this.producers = {};
        this.objc_constant_strings = [];
        this._code_relocs = [];
        this._data_relocs = [];
        /** @type {Array.<ARLinker|DylibSymbolLinker>} */
        this._loaders = [];
        this._symtable = [];
        /** @type {string[]} */
        this.__segmentkeys = [".rodata", ".data", ".bss"];
        this.__segments = {
            '.rodata': {
                name: ".rodata",
            },
            '.data': {
                name: ".data",
            },
            '.bss': {
                name: ".bss",
            },
        };
        // a placeholder module which allows linker flow to insert custom sections at a specific location.
        let mod;
        /** @type {WebAssemblyModule} */
        this._wasmModule = new WebAssemblyModule();
        mod = this._wasmModule;
        mod._version = 1;
        this._wasmModuleSections = [
            new WebAssemblyFuncTypeSection(this._wasmModule),
            new WebAssemblyImportSection(this._wasmModule),
            new WebAssemblyFunctionSection(this._wasmModule),
            new WebAssemblyTableSection(this._wasmModule),
            new WebAssemblyMemorySection(this._wasmModule),
            new WebAssemblyTagSection(this._wasmModule),
            new WebAssemblyGlobalSection(this._wasmModule),
            new WebAssemblyExportSection(this._wasmModule),
            new WebAssemblyStartSection(this._wasmModule),
            new WebAssemblyElementSection(this._wasmModule),
            // WebAssemblyDataCountSection when used should be placed here.
            new WebAssemblyCodeSection(this._wasmModule),
            new WebAssemblyDataSection(this._wasmModule),
            new WebAssemblyCustomSectionName(this._wasmModule),
            new WebAssemblyCustomSectionProducers(this._wasmModule, this.producers),
        ];

        mod.dataSegments = this.dataSegments;
        mod.elementSegments = this.elementSegments;
        mod.types = this.types;
        mod.functions = this.functions;
        mod.tables = this.tables;
        mod.memory = this.memory;
        mod.globals = this.globals;
        mod.tags = this.tags;
        mod.exports = this.exports;
        mod.sections = this._wasmModuleSections;
        mod.producers = this.producers;
	}

    prepareModule(wasmModule) {

    }

    getDataSegmentSubMap(name) {
        let map;
        if (this.datasubmap.hasOwnProperty(name)) {
            map = this.datasubmap[name];
        } else {
            map = {};
            this.datasubmap[name] = map;
        }

        return map;
    }

    appendImport(imp) {
        
        if (imp instanceof ImportedFunction) {
            let functions = this.functions;
            let zlen = functions.length;
            let zidx = -1;
            for (let z = 0; z < zlen; z++) {
                let func = functions[z];
                if (!(func instanceof ImportedFunction)) {
                    zidx = z - 1;
                    break;
                }
            }

            if (zidx == -1) {
                functions.unshift(imp);
            } else {
                functions.splice(zidx, 0, imp);
            }
            
        } else if (imp instanceof ImportedGlobal) {
            let globals = this.globals;
            let zlen = globals.length;
            let zidx = -1;
            for (let z = 0; z < zlen; z++) {
                let glob = globals[z];
                if (!(glob instanceof ImportedGlobal)) {
                    zidx = z - 1;
                    break;
                }
            }

            if (zidx == -1) {
                globals.unshift(imp);
            } else {
                globals.splice(zidx, 0, imp);
            }

        } else if (imp instanceof ImportedMemory) {
            let memory = this.memory;
            let zlen = memory.length;
            let zidx = -1;
            for (let z = 0; z < zlen; z++) {
                let mem = memory[z];
                if (!(mem instanceof ImportedMemory)) {
                    zidx = z - 1;
                    break;
                }
            }

            if (zidx == -1) {
                memory.unshift(imp);
            } else {
                memory.splice(zidx, 0, imp);
            }

        } else if (imp instanceof ImportedTable) {
            let tables = this.tables;
            let zlen = tables.length;
            let zidx = -1;
            for (let z = 0; z < zlen; z++) {
                let table = tables[z];
                if (!(table instanceof ImportedTable)) {
                    zidx = z - 1;
                    break;
                }
            }

            if (zidx == -1) {
                tables.unshift(imp);
            } else {
                tables.splice(zidx, 0, imp);
            }

        } else if (imp instanceof ImportedTag) {
            let tags = this.tags;
            let zlen = tags.length;
            let zidx = -1;
            for (let z = 0; z < zlen; z++) {
                let tag = tags[z];
                if (!(tag instanceof ImportedTag)) {
                    zidx = z - 1;
                    break;
                }
            }

            if (zidx == -1) {
                tags.unshift(imp);
            } else {
                tags.splice(zidx, 0, imp);
            }
        }
    }

    _findOrCreateDataSectionEarly(name) {

        let __segmentkeys = this.__segmentkeys;
        let __segments = this.__segments;

        if (name.startsWith(".rodata.")) {
            return __segments[".rodata"];
        } else if (name.startsWith(".data.")) {
            return __segments[".data"];
        } else if (name.startsWith(".bss.")) {
            return __segments[".bss"];
        } else {
            let segref;
            if (__segments.hasOwnProperty(name)) {
                return __segments[name];
            } else {
                if (name.startsWith("__objc_") == false)
                    debugger;
                segref = {};
                segref.name = name;
                __segments[name] = segref;
                __segmentkeys.push(name);

                return segref;
            }
        }
    }

    /**
     * 
     * @param {WebAssemblyModule} wasmModule 
     * @returns 
     */
	mergeWithModule(wasmModule) {

        // TODO: must respect WASM_SYM_BINDING_LOCAL

        let dst_symtable = this._symtable;
        let dst_datasym = this._datasym;
        let dst_funcsym = this._funcsym;
        let dst_globsym = this._globsym;
        let dst_tagsym = this._tagsym;
        let dst_tblsym = this._tblsym;

	    let dst_dataSegments = this.dataSegments;
	    let dst_functions = this.functions;
	    let dst_globals = this.globals;
	    let dst_memory = this.memory;
	    let dst_tables = this.tables;
	    let dst_types = this.types;
        let dst_tags = this.tags;
        let _code_relocs = this._code_relocs;
        let _data_relocs = this._data_relocs;
        let dst_code_reloc = _code_relocs;
        let dst_data_reloc = _data_relocs;

        let src_types = wasmModule.types;

	    // key = value in wasmModule
	    // val = value in combined module
        let src_typemap = new Map(); // key = type in src, value = type in dst (bc linker on which this method is called)
	    let src_globmap = new Map();
        let src_funcmap = new Map();
        let src_datamap = new Map();
        let src_tblmap = new Map();
        let src_memmap = new Map();
        let src_tagmap = new Map();

        let dst_funcmap = new Map();
        let dst_datamap = new Map();

        let relocCodeSection = wasmModule.findSection("reloc.CODE");
        let relocDataSection = wasmModule.findSection("reloc.DATA");

        let code_relocs = relocCodeSection ? relocCodeSection.relocs : [];
        let data_relocs = relocDataSection ? relocDataSection.relocs : [];
        let src_code_reloc = code_relocs;
        let src_data_reloc = data_relocs;
        let linking = wasmModule.findSection("linking");
        let src_symtable = linking._symtable;

        let new_func = [];
        let new_data = [];
        let new_globals = [];
        let new_tables = [];
        let new_tags = [];

        function findSymbolFor(segment) {
            let len = src_symtable.length;
            for (let i = 0; i < len; i++) {
                let symbol = src_symtable[i];
                if (symbol.kind == 1 && symbol.value == segment) {
                    return symbol;
                }
            }

            return null;
        }

        function findDataReloc(segment) {
            let len = data_relocs.length;
            let arr = [];
            for (let i = 0; i < len; i++) {
                let reloc = data_relocs[i];
                if (reloc.dst == segment) {
                    arr.push(reloc);
                }
            }

            return arr;
        }

        function findCodeReloc(func, inst) {
            let len = code_relocs.length;
            if (inst == null || inst == undefined) {
                let relocs = [];
                for (let i = 0; i < len; i++) {
                    let reloc = code_relocs[i];
                    if (reloc.func == func) {
                        relocs.push(reloc);
                    }
                }

                return relocs;

            } else {
                // 
                for (let i = 0; i < len; i++) {
                    let reloc = code_relocs[i];
                    if (reloc.func == func && reloc.inst == inst) {
                        return reloc;
                    }
                }

                return null;
            }
        }

        function findAllCodeReloc(segment) {
            let len = code_relocs.length;
            let arr = [];
            for (let i = 0; i < len; i++) {
                let reloc = code_relocs[i];
                if (reloc.dst == segment) {
                    arr.push(reloc);
                }
            }

            return arr;
        }

        function replaceRelocByRef(oldsym, newsym) {

            let len = dst_code_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = dst_code_reloc[i];
                if (reloc.ref == oldsym) {
                    reloc.ref = newsym;
                }
            }

            len = dst_data_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = dst_data_reloc[i];
                if (reloc.ref == oldsym) {
                    reloc.ref = newsym;
                }
            }
        }

        function replaceModuleRelocByRef(oldsym, newsym) {

            let len = code_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = code_relocs[i];
                if (reloc.ref == oldsym) {
                    reloc.ref = newsym;
                }
            }

            len = data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = data_relocs[i];
                if (reloc.ref == oldsym) {
                    reloc.ref = newsym;
                }
            }
        }

        function replacesOldSymbol(oldsym, newsym) {
            if ((oldsym.flags & WASM_SYM_UNDEFINED) != 0 && (newsym.flags & WASM_SYM_UNDEFINED) == 0) {
                return true;
            }

            if ((oldsym.flags & WASM_SYM_BINDING_WEAK) != 0 && ((newsym.flags & WASM_SYM_UNDEFINED) == 0 && (newsym.flags & WASM_SYM_BINDING_WEAK) == 0)) {
                return true;
            }

            return false;
        }

        function mergeWithRelocForFunc(func) {
            let len = src_code_reloc.length;
            for (let i = 0; i < len; i++) {
                let type, reloc = src_code_reloc[i];
                type = reloc.type;
                if (type != R_WASM_MEMORY_ADDR_LEB && type != R_WASM_MEMORY_ADDR_SLEB && type != R_WASM_TABLE_INDEX_SLEB)
                    continue;
                if (reloc.func == func) {
                    dst_code_reloc.push(reloc);
                }
            }

            len = src_data_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = src_data_reloc[i];
                if (reloc.ref.value == func) {
                    dst_data_reloc.push(reloc);
                }
            }
        }

        function mergeWithRelocForData(dataSegment) {
            let len = src_code_reloc.length;
            for (let i = 0; i < len; i++) {
                let type, reloc = src_code_reloc[i];
                type = reloc.type;
                if (type != R_WASM_MEMORY_ADDR_LEB && type != R_WASM_MEMORY_ADDR_SLEB && type != R_WASM_TABLE_INDEX_SLEB)
                    continue;
                if (reloc.ref.value == dataSegment) {
                    dst_code_reloc.push(reloc);
                }
            }

            len = src_data_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = src_data_reloc[i];
                if (reloc.dst == dataSegment) {
                    dst_data_reloc.push(reloc);
                }
            }
        }

        // symbol mapping
        if (src_symtable && src_symtable.length > 0) {

            let len = src_symtable.length;
            for (let i = 0; i < len; i++) {
                let kind, sym = src_symtable[i];
                kind = sym.kind;
                if (kind == 0x00) { // functions

                    // TODO: correct within llvm-project this is made LOCAL when using wasm target..
                    if (sym.name == ".objcv2_load_function") {
                        sym.flags &= ~WASM_SYM_BINDING_LOCAL;
                        sym.flags |= WASM_SYM_VISIBILITY_HIDDEN;
                    }

                    if (sym.name == "_c_NSCharacterSet___staticSet_length_number_")
                        debugger;

                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        if (sym.value && new_func.indexOf(sym.value) === -1) {
                            new_func.push(sym.value);
                        }
                        continue;
                    }

                    // Objective-C methods are declared as local, these does not appear here.
                    
                    let name = sym.name;
                    if (dst_funcsym.hasOwnProperty(name)) {
                        let dstsym = dst_funcsym[name];

                        if (((dstsym.flags & WASM_SYM_UNDEFINED) != 0) && ((sym.flags & WASM_SYM_UNDEFINED) == 0)) {
                            // if symbol within self is marked undefined, replace with extneral (linker arg)
                            dst_funcmap.set(dstsym.value, sym.value);
                            _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                            let idx = dst_symtable.indexOf(dstsym);
                            if (idx == -1)
                                throw new ReferenceError("symbol not in table");
                            dst_symtable[idx] = sym;
                            dst_funcsym[name] = sym;
                            mergeWithRelocForFunc(sym.value);
                        } else {
                            // if both symbols are weak, keep the one in self.
                            src_funcmap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        }

                    } else {
                        dst_symtable.push(sym);
                        dst_funcsym[name] = sym;
                        if (sym.value && new_func.indexOf(sym.value) === -1) {
                            new_func.push(sym.value);
                        }
                    }

                } else if (kind == 0x01) { // data

                    // 
                    if (sym.name == "._OBJC_REF_CLASS_NSDataStatic")
                        debugger;

                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        if (sym.value && new_data.indexOf(sym.value) === -1) {
                            new_data.push(sym.value);
                        }
                        continue;
                    }

                    let name = sym.name;
                    if (dst_datasym.hasOwnProperty(name)) {
                        let dstsym = dst_datasym[name];
                        if (sym == dstsym)
                            continue;

                        if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) == 0) {
                            // if internal symbol is undefined use external symbol.
                            if (sym.value && dstsym.value) {
                                throw ReferenceError("old data should never have reference");
                            }
                            _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                            _replaceInCtorAndDtor(this, dstsym, sym);
                            let idx = dst_symtable.indexOf(dstsym);
                            if (idx == -1)
                                throw new ReferenceError("symbol not in table");
                            dst_symtable[idx] = sym;
                            dst_datasym[name] = sym;
                            if (sym.value && new_data.indexOf(sym.value) === -1) {
                                new_data.push(sym.value);
                            }
                            mergeWithRelocForData(sym.value);
                        } else {
                            // if both symbols are weak, keep the one in self.
                            if (sym.value && dstsym.value)
                                src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                            _replaceInCtorAndDtor(linking, sym, dstsym);
                        }

                    } else {
                        dst_symtable.push(sym);
                        dst_datasym[name] = sym;
                        if (sym.value && new_data.indexOf(sym.value) === -1) {
                            new_data.push(sym.value);
                        }
                    }
                } else if (kind == 0x02) { // globals.
                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        continue;
                    }


                    let val1 = sym.value;
                    if (val1 instanceof ImportedGlobal) {
                        let xlen = dst_globsym.length;
                        let match = undefined;
                        for (let x = 0; x < xlen; x++) {
                            let dstsym = dst_globsym[x];
                            let val2 = dstsym.value;
                            if (val2 instanceof ImportedGlobal && val1.module == val2.module && val1.name == val2.name) {
                                match = val2;
                                break;
                            }
                        }

                        if (match) {
                            src_globmap.set(val1, match);
                        } else {
                            dst_symtable.push(sym);
                            dst_globsym.push(sym);
                            new_globals.push(val1);
                        }

                    } else {
                        throw new TypeError("expected wasm.global symbol to be ImportedGlobal");
                    }

                } else if (kind == 0x04) { // event (error-handling)
                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        continue;
                    }

                    let val1 = sym.value;
                    if (val1 instanceof ImportedTag) {

                        let xlen = dst_tagsym.length;
                        let match = undefined;
                        for (let x = 0; x < xlen; x++) {
                            let dstsym = dst_tagsym[x];
                            let val2 = dstsym.value;
                            if (val2 instanceof ImportedTag && val1.module == val2.module && val1.name == val2.name) {
                                match = val2;
                                break;
                            }
                        }

                        if (match) {
                            src_tagmap.set(val1, match);
                        } else {
                            dst_symtable.push(sym);
                            dst_tagsym.push(sym);
                            new_tags.push(val1);
                        }

                    } else {
                        throw new TypeError("expected wasm.tag symbol to be ImportedTag");
                    }

                } else if (kind == 0x05) { // table
                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        continue;
                    }

                    let val1 = sym.value;
                    if (val1 instanceof ImportedTable) {

                        let xlen = dst_tblsym.length;
                        let match = undefined;
                        for (let x = 0; x < xlen; x++) {
                            let dstsym = dst_tblsym[x];
                            let val2 = dstsym.value;
                            if (val2 instanceof ImportedTable && val1.module == val2.module && val1.name == val2.name) {
                                match = val2;
                                break;
                            }
                        }

                        if (match) {
                            src_tblmap.set(val1, match);
                        } else {
                            dst_symtable.push(sym);
                            dst_tblsym.push(sym);
                            new_tables.push(val1);
                        }

                    } else {
                        throw new TypeError("expected wasm.table symbol to be ImportedTable");
                    }

                } else {

                }
            }
        } 

	    // wasmModule.types
	    // merges the type table of the two modules.
        let xlen = src_types.length;
        let ylen = dst_types.length;
        for (let x = 0; x < xlen; x++) {
            let t1 = src_types[x];
            let anymatch = false;
            for (let y = 0; y < ylen; y++) {
                let t2 = dst_types[y];
                if (WasmType.isEqual(t1, t2)) {
                    src_typemap.set(t1, t2);
                    anymatch = true;
                    break;
                }
            }

            if (!anymatch) {
                dst_types.push(t1); // its safe to append here, we are just running the length it was before start of loop.
            }
        }

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

        // replacing in tags.
        let tags = wasmModule.tags;
        if (tags) {
            let len = tags.length;
            for (let i = 0; i < len; i++) {
                let tag = tags[i];
                if (src_typemap.has(tag.type)) {
                    tag.type = src_typemap.get(tag.type);
                }
            }
        }

        // matching memory instances (these does not get handled by symbols.)
        let src_mem = wasmModule.memory;
        if (src_mem && src_mem.length > 0) {
            let ylen = dst_memory.length;
            let xlen = src_mem.length;
            for (let x = 0; x < xlen; x++) {
                let smem = src_mem[x];
                let found = false;
                for (let y = 0; y < ylen; y++) {
                    let dmem = dst_memory[y];
                    if ((smem instanceof ImportedMemory) && (dmem instanceof ImportedMemory) && smem.module == dmem.module && smem.name == dmem.name) {
                        src_memmap.set(smem, dmem);
                        found = true;
                    } else if ((smem instanceof WasmMemory) && (dmem instanceof WasmMemory) && smem[__nsym] == dmem[__nsym]) {
                        src_memmap.set(smem, dmem);
                        found = true;
                    }
                }

                if (!found) {
                    dst_memory.push(smem);
                    // TODO: handle multiple memory instances of various kinds import vs. non-import
                }
            }
        }

        // matching table instances (these does not always get handle by symbols)
        let src_tables = wasmModule.tables;
        if (src_tables && src_tables.length > 0) {
            let ylen = dst_tables.length;
            let xlen = src_tables.length;
            for (let x = 0; x < xlen; x++) {
                let stbl = src_tables[x];
                if (src_tblmap.has(stbl) || new_tables.indexOf(stbl) !== -1)
                    continue;
                let found = false;
                for (let y = 0; y < ylen; y++) {
                    let dtbl = dst_tables[y];
                    if ((stbl instanceof ImportedTable) && (dtbl instanceof ImportedTable) && stbl.module == dtbl.module && stbl.name == dtbl.name) {
                        src_tblmap.set(stbl, dtbl);
                        found = true;
                    } else if ((stbl instanceof WasmTable) && (dtbl instanceof WasmTable) && stbl[__nsym] == dtbl[__nsym]) {
                        src_tblmap.set(stbl, dtbl);
                        found = true;
                    }
                }

                if (!found) {
                    new_tables.push(stbl);
                }
            }
        }

        // might be the same with .tags (which we have no case to test with ATM).

        // merge producers custom-section
        if (wasmModule.producers) {
            _mergeProducersData(wasmModule.producers, this.producers);
        }

        // replacing in linker

        // replacing in linker.functions & opcode
        let functions = wasmModule.functions;
        if (functions && functions.length > 0 && (src_typemap.size > 0 || src_funcmap.size > 0 || src_datamap.size > 0 || src_globmap.size > 0 || src_tblmap.size > 0 || src_memmap.size > 0)) {
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (src_typemap.has(func.type)) {
                    func.type = src_typemap.get(func.type);
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
                        {
                            let type = inst.type;
                            if (src_typemap.has(type)) {
                                inst.type = src_typemap.get(type);
                            }
                            break;
                        }
                        case 0x11:  // call_indirect
                        {
                            let tbl = inst.table;
                            let type = inst.type;
                            if (src_typemap.has(type)) {
                                inst.type = src_typemap.get(type);
                            }
                            if (src_tblmap.has(tbl)) {
                                inst.table = src_tblmap.get(tbl);
                                tbl._usage--;
                                inst.table._usage++;
                            }
                            break;
                        }
                        case 0xfc08:  // memory.init
                        {
                            if (src_memmap.has(inst.memory)) {
                                inst.dataSegment = src_memmap.get(inst.memory);
                            }
                            let dataSegment = inst.dataSegment;
                            if (src_datamap.has(dataSegment)) {
                                inst.dataSegment = src_datamap.get(dataSegment);
                            }
                            break;
                        }
                        case 0xfc09:  // data.drop
                        {
                            let dataSegment = inst.dataSegment;
                            if (src_datamap.has(dataSegment)) {
                                inst.dataSegment = src_datamap.get(dataSegment);
                            }
                            break;
                        }
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (src_funcmap.has(func)) {
                                inst.func = src_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                        case 0x25:      // table.get
                        case 0x26:      // table.set
                        case 0xfc0c:    // table.init
                        case 0xfc0f:    // table.grow
                        case 0xfc10:    // table.size
                        case 0xfc11:    // table.fill
                        {
                            let tbl = inst.table;
                            if (src_tblmap.has(tbl)) {
                                inst.table = src_tblmap.get(tbl);
                                tbl._usage--;
                                inst.table._usage++;
                            }
                            break;
                        }
                        case 0xfc0e:    // table.copy
                        {
                            let tbl1 = inst.table1;
                            if (src_tblmap.has(tbl1)) {
                                inst.table1 = src_tblmap.get(tbl1);
                                tbl1._usage--;
                                inst.table1._usage++;
                            }
                            // TODO: ensure that we can copy if tbl1 === tbl2
                            let tbl2 = inst.table2;
                            if (src_tblmap.has(tbl2)) {
                                inst.table2 = src_tblmap.get(tbl2);
                                tbl2._usage--;
                                inst.table2._usage++;
                            }
                            break;
                        }
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (src_globmap.has(glb)) {
                                inst.global = src_globmap.get(glb);
                            }
                            break;
                        }
                        case 0x07:  // catch
                        case 0x08:  // throw
                        {
                            let tag = inst.tag;
                            if (src_tagmap.has(tag)) {
                                inst.tag = src_tagmap.get(tag);
                            }
                            break;
                        }
                        // module.memory
                        case 0x3f:
                        case 0x40:
                        case 0xfc0b:
                        case 0xfc08:
                        {
                            let mem = inst.mem;
                            if (src_memmap.has(mem)) {
                                inst.mem = src_memmap.get(mem);
                            }
                            break;
                        }
                        case 0xfc0a:
                        {
                            let mem = inst.mem1;
                            if (src_memmap.has(mem)) {
                                inst.mem1 = src_memmap.get(mem);
                            }

                            mem = inst.mem2;
                            if (src_memmap.has(mem)) {
                                inst.mem2 = src_memmap.get(mem);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // replacing in self.
        
        if (dst_datamap.size > 0 || dst_funcmap.size > 0) {

            // find:
            // - memory.init  (0xfc << 8) | 8
            // - data.drop    (0xfc << 8) | 9
            // 
            // replace in:
            // dataSegments (handled by not merging data-segments found in dst_datamap)
            
            let xlen = dst_functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = dst_functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0xfc08:  // memory.init
                        case 0xfc09:  // data.drop
                        {
                            let dataSegment = inst.dataSegment;
                            if (dst_datamap.has(dataSegment)) {
                                inst.dataSegment = dst_datamap.get(dataSegment);
                            }
                            break;
                        }
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (dst_funcmap.has(func)) {
                                inst.func = dst_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }
        }

        if (dst_funcmap.size > 0) {
            for (const [oldfunc, newfunc] of dst_funcmap) {

                if (oldfunc instanceof ImportedFunction && newfunc instanceof ImportedFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    if (idx1 == -1 || dst_functions.indexOf(newfunc) != -1) {
                        throw new ReferenceError("INVALID_STATE")
                    }

                    dst_functions[idx1] = newfunc;

                } else if (oldfunc instanceof ImportedFunction && newfunc instanceof WasmFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    let idx2 = dst_functions.indexOf(newfunc);
                    if (idx1 === -1) {
                        throw new ReferenceError("INVALID_STATE")
                    }

                    dst_functions.splice(idx1, 1);

                    idx2 = dst_functions.indexOf(newfunc);
                    if (idx2 === -1)
                        dst_functions.push(newfunc);

                } else if (oldfunc instanceof WasmFunction && newfunc instanceof ImportedFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    if (idx1 == -1 || dst_functions.indexOf(newfunc) != -1) {
                        throw new ReferenceError("INVALID_STATE");
                    }

                    let impidx = -1;
                    let len = dst_functions.length;
                    for (let i = 0; i < len; i++) {
                        let func = dst_functions[i];
                        if (!(func instanceof ImportedFunction)) {
                            impidx = i - 1;
                            break;
                        }
                    }

                    dst_functions.splice(idx1, 1);
                    if (impidx == -1) {
                        dst_functions.unshift(newfunc);
                    } else {
                        dst_functions.splice(impidx, 0, newfunc);
                    }
                    
                } else if (oldfunc instanceof WasmFunction && newfunc instanceof WasmFunction) {
                    
                    let idx = dst_functions.indexOf(oldfunc);
                    if (idx == -1 || dst_functions.indexOf(newfunc) != -1) {
                        throw new ReferenceError("INVALID_STATE");
                    }

                    dst_functions[idx] = newfunc;

                }
            }
        }

        if (dst_datamap.size > 0) {
            for (const [oldseg, newseg] of dst_datamap) {

                let idx1 = dst_dataSegments.indexOf(oldseg);
                let idx2 = dst_dataSegments.indexOf(newseg);
                if (idx2 === -1) {
                    dst_dataSegments[idx1] = newseg;
                } else {
                    dst_dataSegments.splice(idx1, 1);
                }
                

                newseg.dataSection = this._findOrCreateDataSectionEarly(newseg[__nsym]);
            }
        }

        let impidx = -1;
        let len = dst_functions.length;
        for (let i = 0; i < len; i++) {
            let func = dst_functions[i];
            if (!(func instanceof ImportedFunction)) {
                impidx = i - 1;
                break;
            }
        }
        len = new_func.length;
        for (let i = 0; i < len; i++) {
            let func = new_func[i];
            if (func instanceof ImportedFunction) {
                let idx = dst_functions.indexOf(func); // might have been inserted trough dst_funcmap
                if (idx === -1) {
                    if (impidx == -1) {
                        dst_functions.unshift(func);
                        impidx++;
                    } else {
                        dst_functions.splice(impidx, 0, func);
                        impidx++;
                    }
                }
                
            } else {
                let idx = dst_functions.indexOf(func);
                if (idx === -1)
                    dst_functions.push(func);
            }
        }

        impidx = -1;
        len = dst_globals.length;
        for (let i = 0; i < len; i++) {
            let glob = dst_globals[i];
            if (!(glob instanceof ImportedGlobal)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_globals.length;
        for (let i = 0; i < len; i++) {
            let glob = new_globals[i];
            if (glob instanceof ImportedGlobal) {
                if (impidx == -1) {
                    dst_globals.unshift(glob);
                    impidx++;
                } else {
                    dst_globals.splice(impidx, 0, glob);
                    impidx++;
                }
                
            } else {
                dst_globals.push(glob);
            }
        }

        impidx = -1;
        len = dst_tags.length;
        for (let i = 0; i < len; i++) {
            let tag = dst_tags[i];
            if (!(tag instanceof ImportedTag)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_tags.length;
        for (let i = 0; i < len; i++) {
            let tag = new_tags[i];
            if (tag instanceof ImportedTag) {
                if (impidx == -1) {
                    dst_tags.unshift(tag);
                    impidx++;
                } else {
                    dst_tags.splice(impidx, 0, tag);
                    impidx++;
                }
                
            } else {
                dst_tags.push(tag);
            }
        }

        impidx = -1;
        len = dst_tables.length;
        for (let i = 0; i < len; i++) {
            let tbl = dst_tables[i];
            if (!(tbl instanceof ImportedTable)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_tables.length;
        for (let i = 0; i < len; i++) {
            let tbl = new_tables[i];
            if (tbl instanceof ImportedTable) {
                if (impidx == -1) {
                    dst_tables.unshift(tbl);
                    impidx++;
                } else {
                    dst_tables.splice(impidx, 0, tbl);
                    impidx++;
                }
                
            } else {
                dst_tables.push(tbl);
            }
        }

        len = new_data.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = new_data[i];
            if (dst_dataSegments.indexOf(dataSegment) !== -1)
                continue;
            dataSegment.dataSection = this._findOrCreateDataSectionEarly(dataSegment[__nsym]);
            dst_dataSegments.push(dataSegment);
        }


        len = src_code_reloc.length;
        for (let i = 0; i < len; i++) {
            let reloc = src_code_reloc[i];
            let type = reloc.type;

            // reloc.CODE contains relocation for some of the value ylinker have already mapped due to the objectification of the bytecode.
            if (type !== R_WASM_MEMORY_ADDR_LEB && type !== R_WASM_MEMORY_ADDR_SLEB && type != R_WASM_TABLE_INDEX_SLEB)
                continue;

            if (new_func.indexOf(reloc.func) !== -1) {
                dst_code_reloc.push(reloc);
            } else if (dst_funcmap.has(reloc.func)) {
                dst_code_reloc.push(reloc);
            }
        }

        len = src_data_reloc.length;
        for (let i = 0; i < len; i++) {
            let reloc = src_data_reloc[i];
            let needed = false;

            if (new_data.indexOf(reloc.dst) !== -1) {
                needed = true;
            } else if (dst_datamap.has(reloc.dst)) {
                needed = true;
            }

            if (needed && dst_data_reloc.indexOf(reloc) == -1) {
                dst_data_reloc.push(reloc);
            }
        }

        // merging ctors
        if (linking && linking._ctors) {
            if (!this._ctors) {
                this._ctors = [];
            }

            let dst_ctors = this._ctors;

            function hasCtorSymbol(symbol) {
                let len = dst_ctors.length;
                for (let i = 0; i < len; i++) {
                    let ctor = dst_ctors[i];
                    if (ctor.symbol == symbol) {
                        return true;
                    }
                }

                return false;
            }

            
            let src_ctors = linking._ctors;
            let len = src_ctors.length;
            for (let i = 0; i < len; i++) {
                let ctor = src_ctors[i];
                if (hasCtorSymbol(ctor.symbol) || dst_symtable.indexOf(ctor.symbol) == -1) {
                    continue;
                }

                dst_ctors.push(ctor);
            }
        }

        return null;
	}


    linkTo(loader, linkage) {
        loader.linkage = linkage;
        this._loaders.push(loader);
    }

    writeSymbolLog(fd) {
        let symtable = this._symtable;
        let lines = ["Memory symbols", ""];

        let len = symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = symtable[i];
            if (sym.kind != 1) {
                continue;
            }
            if (((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) || ((sym.flags & WASM_SYM_UNDEFINED) != 0)) {
                continue;
            }
            let segment = sym.value;
            let txt = segment._reloc_glob.name + "\x20+\x200x" + (segment._reloc).toString(16);
            txt += '\n' + sym.name + '\n';
            lines.push(txt);
        }

        fs.writeSync(fd, lines.join('\n'));
        lines = ["", '-'.repeat(40), "Undefiend memory symbols", ""];

        for (let i = 0; i < len; i++) {
            let sym = symtable[i];
            if (sym.kind != 1) {
                continue;
            }
            if (((sym.flags & WASM_SYM_UNDEFINED) != 0)) {
                lines.push(sym.name);
            }
        }

        fs.writeSync(fd, lines.join('\n'));

        // TODO: map aliases for them self.
        lines = ["", '-'.repeat(40), "Function symbols", ""];

        let expfunc = [];
        let maxexp = 0;
        let aliasmap = new Map();

        for (let i = 0; i < len; i++) {
            let sym = symtable[i];
            if (sym.kind != 0) {
                continue;
            }
            if (((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) || ((sym.flags & WASM_SYM_UNDEFINED) != 0)) {
                continue;
            }

            let func = sym.value;
            let name = func[__nsym];
            let idx = expfunc.indexOf(func);
            if (idx === -1) {
                expfunc.push(func);
                if (name.length > maxexp)
                    maxexp = name.length;
            }

            if (sym.name != name) {
                let aliases;
                if (aliasmap.has(func)) {
                    aliases = aliasmap.get(func);
                } else {
                    aliases = [];
                    aliasmap.set(func, aliases);
                }

                if (aliases.indexOf(sym.name) == -1) {
                    aliases.push(sym.name);
                }
            }
        }

        let start = Math.ceil((maxexp + 1) / 4) * 4;
        len = expfunc.length;
        for (let i = 0; i < len; i++) {
            let func = expfunc[i];
            let txt = func[__nsym];
            if (aliasmap.has(func)) {
                let aliases = aliasmap.get(func);
                let pad = start - txt.length;
                txt += '\x20'.repeat(pad) + "aliases: " +  aliases.join(', ');
            }

            lines.push(txt);
        }

        fs.writeSync(fd, lines.join('\n'));
        lines = ["", '-'.repeat(40), "Undefiend function symbols", ""];

        len = symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = symtable[i];
            if (sym.kind != 0) {
                continue;
            }
            if (((sym.flags & WASM_SYM_UNDEFINED) != 0)) {
                lines.push(sym.name);
            }
        }

        fs.writeSync(fd, lines.join('\n'));
    }

    readSymbolFile(fd) {

    }

    _findFuncSymbol(name, functype) {
        let loaders = this._loaders;
        let len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            let result = loader.resolveFuncSymbol(name, functype);
            if (result) {
                return result;
            }
        }

        return null;
    }

    _findDataSymbol(name) {
        let loaders = this._loaders;
        let len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            let result = loader.resolveDataSymbol(name);
            if (result) {
                return result;
            }
        }

        return null;
    }

    _findSOFuncSymbol(name, functype) {
        let loaders = this._loaders;
        let len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            if (loader.linkage != "dylink")
                continue;
            let result = loader.resolveFuncSymbol(name, functype);
            if (result) {
                return result;
            }
        }

        return null;
    }

    _findSODataSymbol(name) {
        let loaders = this._loaders;
        let len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            if (loader.linkage != "dylink")
                continue;
            let result = loader.resolveDataSymbol(name);
            if (result) {
                return result;
            }
        }

        return null;
    }

    _fixupBuiltin() {

    }

    _fixupGnu2ObjC() {

    }

    // Static Linking

    // invoked by the parent linker before symbols within linker against a AR
    // file is merged with the target.
    /**
     * Recursivly loads undefined symbols within a AR-loader.
     * @param  {ARLinker} loader
     * @return {void}      
     */
    _fixupARLinking(loader) {
        if (loader._wholeArchive) {
            return;
        }
        let loopcnt = 0;
        let prevfunc = [];
        let prevdata = [];
        let _symtable = this._symtable;
        while (true) {
            if (loopcnt > 10000) {
                throw new RangeError("LOOP_WATCHDOG");
            }
            loopcnt++;
            let newsym = [];
            let _symtable = this._symtable;
            let len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let name, sym = _symtable[i];
                if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                    continue;

                if (sym.kind == 0) {
                    let name = sym.name;
                    if (prevfunc.indexOf(name) !== -1) {
                        continue;
                    }
                    prevfunc.push(name);
                    newsym.push(sym);
                } else if (sym.kind == 1) {
                    let name = sym.name;
                    if (prevdata.indexOf(name) !== -1) {
                        continue;
                    }
                    prevdata.push(name);
                    newsym.push(sym);
                }
            }

            if (newsym.length == 0)
                break;

            len = newsym.length;
            for (let i = 0; i < len; i++) {
                let name, sym = newsym[i];
                name = sym.name;

                if (sym.kind == 0) {
                    loader.loadFuncSymbol(name);
                } else if (sym.kind == 1) {
                    loader.loadDataSymbol(name);
                }
            }
        }
    }

    mergeWithLinker(linker) {
        debugger;
        let src_symtable = linker._symtable;
        let dst_symtable = this._symtable;
        let dst_datasym = {};
        let dst_funcsym = {};
        let dst_globsym = [];
        let dst_tblsym = [];
        let dst_tagsym = [];

        let src_globmap = new Map();
        let src_funcmap = new Map();
        let src_datamap = new Map();
        let src_tblmap = new Map();
        let src_memmap = new Map();
        let src_tagmap = new Map();
        let src_code_reloc = linker._code_relocs;
        let src_data_reloc = linker._data_relocs;

        let dst_funcmap = new Map();
        let dst_datamap = new Map();
        let dst_code_reloc = this._code_relocs;
        let dst_data_reloc = this._data_relocs;
        let dst_functions = this.functions;
        let _dataSectionMap = this.__segments;
        let _dataSectionNames = this.__segmentkeys;

        let new_func = [];
        let new_data = [];
        let new_globals = [];
        let new_tags = [];
        let new_tables = [];

        function mapOrAdoptDataSection(dataSegment) {

            let dataSection = dataSegment.dataSection;
            let secname = dataSection.name;

            if (_dataSectionMap.hasOwnProperty(secname)) {
                let replacement = _dataSectionMap[secname];
                dataSegment.dataSection = replacement;
            } else {
                let cpy = Object.assign({}, dataSection);
                cpy.max_align = 0;
                cpy._dataSize = 0;
                cpy._packedSize = 0;
                cpy._size = 0;
                _dataSectionNames.push(secname);
                _dataSectionMap[secname] = cpy;
                dataSegment.dataSection = cpy;
            }
        }

        function mergeWithRelocForFunc(func) {
            let len = src_code_reloc.length;
            for (let i = 0; i < len; i++) {
                let type, reloc = src_code_reloc[i];
                type = reloc.type;
                if (type != R_WASM_MEMORY_ADDR_LEB && type != R_WASM_TABLE_INDEX_SLEB && type != R_WASM_MEMORY_ADDR_SLEB)
                    continue;
                if (reloc.func == func) {
                    dst_code_reloc.push(reloc);
                }
            }

            len = src_data_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = src_data_reloc[i];
                if (reloc.ref.value == func) {
                    dst_data_reloc.push(reloc);
                }
            }
        }

        function mergeWithRelocForData(dataSegment) {
            let len = src_code_reloc.length;
            for (let i = 0; i < len; i++) {
                let type, reloc = src_code_reloc[i];
                type = reloc.type;
                if (type != R_WASM_MEMORY_ADDR_LEB && type != R_WASM_MEMORY_ADDR_SLEB && type != R_WASM_TABLE_INDEX_SLEB)
                    continue;
                if (reloc.ref.value == dataSegment) {
                    dst_code_reloc.push(reloc);
                }
            }

            len = src_data_reloc.length;
            for (let i = 0; i < len; i++) {
                let reloc = src_data_reloc[i];
                if (reloc.dst == dataSegment) {
                    dst_data_reloc.push(reloc);
                }
            }
        }

        let len = dst_symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = dst_symtable[i];
            let name = sym.name;
            let flags = sym.flags;
            let islocal = (flags & WASM_SYM_BINDING_LOCAL) != 0;
            if (sym.kind == 0 && !islocal) {
                if (dst_funcsym.hasOwnProperty(name))
                    console.error("name '%s' already exists ", name);
                dst_funcsym[name] = sym;
            } else if (sym.kind == 1 && !islocal) {
                if (dst_funcsym.hasOwnProperty(name))
                    console.error("name '%s' already exists ", name);
                dst_datasym[name] = sym;
            } else if (sym.kind == 0x02 && !islocal) {
                if (dst_globsym.indexOf(sym) !== -1)
                    console.error("global symbol %o already exists ", sym);
                dst_globsym.push(sym);
            } else if (sym.kind == 0x04 && !islocal) {
                if (dst_tagsym.indexOf(sym) !== -1)
                    console.error("tag symbol %o already exists ", sym);
                dst_tagsym.push(sym);
            } else if (sym.kind == 0x05 && !islocal) {
                if (dst_tblsym.indexOf(sym) !== -1)
                    console.error("table symbol %o already exists ", sym);
                dst_tblsym.push(sym);
            }
        }

        
        len = src_symtable.length;
        for (let i = 0; i < len; i++) {
            let kind, sym = src_symtable[i];
            sym.flags |= WASM_SYM_EXTERNAL;
            kind = sym.kind;
            if (kind == 0x00) { // functions

                if (sym.name == "_tr_stored_block")
                    debugger;

                // just merge local symbols.
                if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                    dst_symtable.push(sym);
                    if (sym.value && dst_functions.indexOf(sym.value) === -1 && new_func.indexOf(sym.value) === -1) {
                        new_func.push(sym.value);
                    }
                    continue;
                }

                let name = sym.name;
                if (dst_funcsym.hasOwnProperty(name)) {
                    let dstsym = dst_funcsym[name];
                    if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) == 0) {
                        // if internal symbol is undefined but external symbol is not, use external.
                        dst_funcmap.set(dstsym.value, sym.value);
                        _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                        _replaceInCtorAndDtor(this, dstsym, sym);
                        let idx = dst_symtable.indexOf(dstsym);
                        if (idx == -1)
                            throw new ReferenceError("symbol not in table");
                        dst_symtable[idx] = sym;
                        mergeWithRelocForFunc(sym.value);
                    } else {
                        // keep self
                        src_funcmap.set(sym.value, dstsym.value);
                        _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        _replaceInCtorAndDtor(linker, sym, dstsym);
                    }

                } else {
                    dst_symtable.push(sym);
                    if (sym.value && dst_functions.indexOf(sym.value) === -1 && new_func.indexOf(sym.value) === -1) {
                        new_func.push(sym.value);
                    }
                }

            } else if (kind == 0x01) { // data

                // TODO: the issue with this symbol is likley caused by loading of static 
                // libraries are done at the same time as linking with dynamic libaries..
                // separate loading of static libraries to be step before this merge is done
                // 
                // REMARKS: Not totally sure that we can get away with just this, there might
                // be scenarios where we need to splice a data-segment which holds multiple
                // symbols?

                // just merge local symbols.
                if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                    dst_symtable.push(sym);
                    if (sym.value) {
                        new_data.push(sym.value);
                    }
                    continue;
                }

                let name = sym.name;
                if (dst_datasym.hasOwnProperty(name)) {
                    let dstsym = dst_datasym[name];
                    if (sym == dstsym)
                        continue;

                    if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) == 0) {
                        // if internal symbol is undefined, but external is not use external.
                        if (sym.value && dstsym.value)
                            dst_datamap.set(dstsym.value, sym.value);
                        _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                        let idx = dst_symtable.indexOf(dstsym);
                        if (idx == -1)
                            throw new ReferenceError("symbol not in table");
                        dst_symtable[idx] = sym;
                        if (sym.value) {
                            new_data.push(sym.value);
                        }
                        mergeWithRelocForData(sym.value);
                    } else {
                        // keep self
                        if (sym.value && dstsym.value)
                            src_datamap.set(sym.value, dstsym.value);
                        _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                    }

                } else {
                    dst_symtable.push(sym);
                    if (sym.value) {
                        new_data.push(sym.value);
                    }
                }
            } else if (kind == 0x02) { // globals.
                // just merge local symbols.
                if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                    dst_symtable.push(sym);
                    continue;
                }


                let val1 = sym.value;
                if (val1 instanceof ImportedGlobal) {
                    let xlen = dst_globsym.length;
                    let match = undefined;
                    for (let x = 0; x < xlen; x++) {
                        let dstsym = dst_globsym[x];
                        let val2 = dstsym.value;
                        if (val2 instanceof ImportedGlobal && val1.module == val2.module && val1.name == val2.name) {
                            match = val2;
                            break;
                        }
                    }

                    if (match) {
                        src_globmap.set(val1, match);
                    } else {
                        dst_symtable.push(sym);
                        new_globals.push(val1);
                    }

                } else {
                    throw new TypeError("expected wasm.global symbol to be ImportedGlobal");
                }

            } else if (kind == 0x04) { // event (error-handling)
                // just merge local symbols.
                if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                    dst_symtable.push(sym);
                    continue;
                }

                let val1 = sym.value;
                if (val1 instanceof ImportedTag) {

                    let xlen = dst_tagsym.length;
                    let match = undefined;
                    for (let x = 0; x < xlen; x++) {
                        let dstsym = dst_tagsym[x];
                        let val2 = dstsym.value;
                        if (val2 instanceof ImportedTag && val1.module == val2.module && val1.name == val2.name) {
                            match = val2;
                            break;
                        }
                    }

                    if (match) {
                        src_tagmap.set(val1, match);
                    } else {
                        dst_symtable.push(sym);
                        new_tags.push(val1);
                    }

                } else {
                    throw new TypeError("expected wasm.tag symbol to be ImportedTag");
                }

            } else if (kind == 0x05) { // table
                // just merge local symbols.
                if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                    dst_symtable.push(sym);
                    continue;
                }

                let val1 = sym.value;
                if (val1 instanceof ImportedTable) {

                    let xlen = dst_tblsym.length;
                    let match = undefined;
                    for (let x = 0; x < xlen; x++) {
                        let dstsym = dst_tblsym[x];
                        let val2 = dstsym.value;
                        if (val2 instanceof ImportedTable && val1.module == val2.module && val1.name == val2.name) {
                            match = val2;
                            break;
                        }
                    }

                    if (match) {
                        src_tblmap.set(val1, match);
                    } else {
                        dst_symtable.push(sym);
                        new_tables.push(val1);
                    }

                } else {
                    throw new TypeError("expected wasm.table symbol to be ImportedTable");
                }

            } else {

            }
        }

        // linker.types
        // merges the type table of the two modules.
        let src_typemap = new Map(); // key = type in src, value = type in dst (bc linker on which this method is called)

        let dst_types = this.types;
        let src_types = linker.types;
        let xlen = src_types.length;
        let ylen = dst_types.length;
        for (let x = 0; x < xlen; x++) {
            let t1 = src_types[x];
            let anymatch = false;
            for (let y = 0; y < ylen; y++) {
                let t2 = dst_types[y];
                if (WasmType.isEqual(t1, t2)) {
                    src_typemap.set(t1, t2);
                    anymatch = true;
                    break;
                }
            }

            if (!anymatch) {
                dst_types.push(t1); // its safe to append here, we are just running the length it was before start of loop.
            }
        }

        // matching memory instances
        let src_mem = linker.memory;
        if (src_mem && src_mem.length > 0) {
            let dst_mem = this.memory;
            let ylen = dst_mem.length;
            let xlen = src_mem.length;
            for (let x = 0; x < xlen; x++) {
                let smem = src_mem[x];
                for (let y = 0; y < ylen; y++) {
                    let dmem = dst_mem[y];
                    if ((smem instanceof ImportedMemory) && (dmem instanceof ImportedMemory) && smem.module == dmem.module && smem.name == dmem.name) {
                        src_memmap.set(smem, dmem);
                    } else if ((smem instanceof WasmMemory) && (dmem instanceof WasmMemory) && smem[__nsym] == dmem[__nsym]) {
                        src_memmap.set(smem, dmem);
                    }
                }
            }
        }

        // matching table instances (these does not always get handle by symbols)
        let src_tables = linker.tables;
        if (src_tables && src_tables.length > 0) {
            let dst_tables = this.tables;
            let ylen = dst_tables.length;
            let xlen = src_tables.length;
            for (let x = 0; x < xlen; x++) {
                let stbl = src_tables[x];
                if (src_tblmap.has(stbl) || new_tables.indexOf(stbl) !== -1)
                    continue;
                let found = false;
                for (let y = 0; y < ylen; y++) {
                    let dtbl = dst_tables[y];
                    if ((stbl instanceof ImportedTable) && (dtbl instanceof ImportedTable) && stbl.module == dtbl.module && stbl.name == dtbl.name) {
                        src_tblmap.set(stbl, dtbl);
                        found = true;
                    } else if ((stbl instanceof WasmTable) && (dtbl instanceof WasmTable) && stbl[__nsym] == dtbl[__nsym]) {
                        src_tblmap.set(stbl, dtbl);
                        found = true;
                    }
                }

                if (!found) {
                    new_tables.push(stbl);
                }
            }
        }

        // merge producers custom-section
        if (linker.producers) {
            _mergeProducersData(linker.producers, this.producers);
        }

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

        // replacing in linker.tags.
        let tags = linker.tags;
        if (tags && tags.length > 0) {
            let len = tags.length;
            for (let i = 0; i < len; i++) {
                let tag = tags[i];
                if (src_typemap.has(tag.type)) {
                    tag.type = src_typemap.get(tag.type);
                }
            }
        }

        // replacing in linker

        // replacing in linker.functions & opcode
        let functions = linker.functions;
        if (functions && functions.length > 0 && (src_typemap.size > 0 || src_funcmap.size > 0 || src_datamap.size > 0 || src_globmap.size > 0 || src_tblmap.size > 0 || src_memmap.size > 0)) {
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (src_typemap.has(func.type)) {
                    func.type = src_typemap.get(func.type);
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
                        {
                            let type = inst.type;
                            if (src_typemap.has(type)) {
                                inst.type = src_typemap.get(type);
                            }
                            break;
                        }
                        case 0x11:  // call_indirect
                        {
                            let tbl = inst.table;
                            let type = inst.type;
                            if (src_typemap.has(type)) {
                                inst.type = src_typemap.get(type);
                            }
                            if (src_tblmap.has(tbl)) {
                                inst.table = src_tblmap.get(tbl);
                                tbl._usage--;
                                inst.table._usage++;
                            }
                            break;
                        }

                        case 0xfc08:  // memory.init
                        {
                            let dataSegment = inst.dataSegment;
                            if (src_datamap.has(dataSegment)) {
                                inst.dataSegment = src_datamap.get(dataSegment);
                            }
                            if (src_memmap.has(inst.memory)) {
                                inst.memory = src_memmap.get(inst.memory);
                            }
                            break;
                        }
                        case 0xfc09:  // data.drop
                        {
                            let dataSegment = inst.dataSegment;
                            if (src_datamap.has(dataSegment)) {
                                inst.dataSegment = src_datamap.get(dataSegment);
                            }
                            break;
                        }
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (src_funcmap.has(func)) {
                                inst.func = src_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                        case 0x25:      // table.get
                        case 0x26:      // table.set
                        case 0xfc0c:    // table.init
                        case 0xfc0f:    // table.grow
                        case 0xfc10:    // table.size
                        case 0xfc11:    // table.fill
                        {
                            let tbl = inst.table;
                            if (src_tblmap.has(tbl)) {
                                inst.table = src_tblmap.get(tbl);
                                tbl._usage--;
                                inst.table._usage++;
                            }
                            break;
                        }
                        case 0xfc0e:    // table.copy
                        {
                            let tbl1 = inst.table1;
                            if (src_tblmap.has(tbl1)) {
                                inst.table1 = src_tblmap.get(tbl1);
                                tbl1._usage--;
                                inst.table1._usage++;
                            }
                            // TODO: ensure that we can copy if tbl1 === tbl2
                            let tbl2 = inst.table2;
                            if (src_tblmap.has(tbl2)) {
                                inst.table2 = src_tblmap.get(tbl2);
                                tbl2._usage--;
                                inst.table2._usage++;
                            }
                            break;
                        }
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (src_globmap.has(glb)) {
                                inst.global = src_globmap.get(glb);
                            }
                            break;
                        }
                        case 0x07:  // catch
                        case 0x08:  // throw
                        {
                            let tag = inst.tag;
                            if (src_tagmap.has(tag)) {
                                inst.tag = src_tagmap.get(tag);
                            }
                            break;
                        }
                        // module.memory
                        case 0x3f:
                        case 0x40:
                        case 0xfc0b:
                        case 0xfc08:
                        {
                            let mem = inst.mem;
                            if (src_memmap.has(mem)) {
                                inst.mem = src_memmap.get(mem);
                            }
                            break;
                        }
                        case 0xfc0a:
                        {
                            let mem = inst.mem1;
                            if (src_memmap.has(mem)) {
                                inst.mem1 = src_memmap.get(mem);
                            }

                            mem = inst.mem2;
                            if (src_memmap.has(mem)) {
                                inst.mem2 = src_memmap.get(mem);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // replacing in self.
        
        if (dst_datamap.size > 0 || dst_funcmap.size > 0) {

            // find:
            // - memory.init  (0xfc << 8) | 8
            // - data.drop    (0xfc << 8) | 9
            // 
            // replace in:
            // dataSegments (handled by not merging data-segments found in dst_datamap)
            
            let functions = this.functions;
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
                        case 0xfc08:  // memory.init
                        case 0xfc09:  // data.drop
                        {
                            let dataSegment = inst.dataSegment;
                            if (dst_datamap.has(dataSegment)) {
                                inst.dataSegment = dst_datamap.get(dataSegment);
                            }
                            break;
                        }
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (dst_funcmap.has(func)) {
                                inst.func = dst_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }
        }

        if (dst_funcmap.size > 0) {

            let dst_functions = this.functions;

            for (const [oldfunc, newfunc] of dst_funcmap) {

                if (oldfunc instanceof ImportedFunction && newfunc instanceof ImportedFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    if (idx1 == -1 || dst_functions.indexOf(newfunc) !== -1) {
                        throw new ReferenceError("INVALID_STATE")
                    }

                    dst_functions[idx1] = newfunc;

                } else if (oldfunc instanceof ImportedFunction && newfunc instanceof WasmFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    let idx2 = dst_functions.indexOf(newfunc);
                    if (idx1 === -1 || idx2 === undefined) {
                        throw new ReferenceError("INVALID_STATE")
                    }

                    dst_functions.splice(idx1, 1);

                    if (idx2 === -1)
                        dst_functions.push(newfunc);

                } else if (oldfunc instanceof WasmFunction && newfunc instanceof ImportedFunction) {

                    let idx1 = dst_functions.indexOf(oldfunc);
                    if (idx1 == -1 || dst_functions.indexOf(newfunc) != -1) {
                        throw new ReferenceError("INVALID_STATE");
                    }

                    let impidx = -1;
                    let len = dst_functions.length;
                    for (let i = 0; i < len; i++) {
                        let func = dst_functions[i];
                        if (!(func instanceof ImportedFunction)) {
                            impidx = i - 1;
                            break;
                        }
                    }

                    dst_functions.splice(idx1, 1);
                    if (impidx == -1) {
                        dst_functions.unshift(newfunc);
                    } else {
                        dst_functions.splice(impidx, 0, newfunc);
                    }
                    
                } else if (oldfunc instanceof WasmFunction && newfunc instanceof WasmFunction) {
                    
                    let idx = dst_functions.indexOf(oldfunc);
                    if (idx == -1 || dst_functions.indexOf(newfunc) != -1) {
                        throw new ReferenceError("INVALID_STATE");
                    }

                    dst_functions[idx] = newfunc;

                }
            }
        }

        let _dataSegments = this.dataSegments;
        if (dst_datamap.size > 0) {
            for (const [oldseg, newseg] of dst_datamap) {

                let idx = _dataSegments.indexOf(oldseg);
                mapOrAdoptDataSection(newseg);
                _dataSegments[idx] = newseg;
            }
        }

        let impidx = -1;
        let _functions = this.functions;
        len = _functions.length;
        for (let i = 0; i < len; i++) {
            let func = _functions[i];
            if (!(func instanceof ImportedFunction)) {
                impidx = i - 1;
                break;
            }
        }
        len = new_func.length;
        for (let i = 0; i < len; i++) {
            let func = new_func[i];
            if (_functions.indexOf(func) !== -1)
                continue;
            if (func instanceof ImportedFunction) {
                if (impidx == -1) {
                    _functions.unshift(func);
                    impidx++;
                } else {
                    _functions.splice(impidx, 0, func);
                    impidx++;
                }
            } else {
                _functions.push(func);
            }
        }

        impidx = -1;
        let _globals = this.globals;
        len = _globals.length;
        for (let i = 0; i < len; i++) {
            let glob = _globals[i];
            if (!(glob instanceof ImportedGlobal)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_globals.length;
        for (let i = 0; i < len; i++) {
            let glob = new_globals[i];
            if (glob instanceof ImportedGlobal) {
                if (impidx == -1) {
                    _globals.unshift(glob);
                    impidx++;
                } else {
                    _globals.splice(impidx, 0, glob);
                    impidx++;
                }
                
            } else {
                _globals.push(glob);
            }
        }

        let _tags = this.tags;
        len = _tags.length;
        for (let i = 0; i < len; i++) {
            let tag = _tags[i];
            if (!(tag instanceof ImportedTag)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_tags.length;
        for (let i = 0; i < len; i++) {
            let tag = new_tags[i];
            if (tag instanceof ImportedTag) {
                if (impidx == -1) {
                    _tags.unshift(tag);
                    impidx++;
                } else {
                    _tags.splice(impidx, 0, tag);
                    impidx++;
                }
                
            } else {
                _tags.push(tag);
            }
        }

        let _tables = this.tables;
        len = _tables.length;
        for (let i = 0; i < len; i++) {
            let tbl = _tables[i];
            if (!(tbl instanceof ImportedTable)) {
                impidx = i - 1;
                break;
            }
        }

        len = new_tables.length;
        for (let i = 0; i < len; i++) {
            let tbl = new_tables[i];
            if (tbl instanceof ImportedTable) {
                if (impidx == -1) {
                    _tables.unshift(tbl);
                    impidx++;
                } else {
                    _tables.splice(impidx, 0, tbl);
                    impidx++;
                }
                
            } else {
                _tables.push(tbl);
            }
        }

        len = new_data.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = new_data[i];
            if (dataSegment[__nsym] == ".rodata._ZTSN3icu7UMemoryE")
                debugger;
            mapOrAdoptDataSection(dataSegment);
            _dataSegments.push(dataSegment);
        }

        {
            let match;
            
            let len = dst_functions.length;
            for (let i = 0; i < len; i++) {
                let func = dst_functions[i];
                if (func[__nsym] == "posix_memalign") {
                    match = func;
                }
            }

            if (match) {
                let relocs = [];
                len = src_code_reloc.length;
                for (let i = 0; i < len; i++) {
                    let reloc = src_code_reloc[i];
                    if (reloc.func == match) {
                        relocs.push(reloc);
                    }
                }

                console.log("found %d relocs %o for posix_memalign()", relocs.length, relocs);
            }
        }

        len = src_code_reloc.length;
        for (let i = 0; i < len; i++) {
            let reloc = src_code_reloc[i];

            if (new_func.indexOf(reloc.func) !== -1) {
                dst_code_reloc.push(reloc);
            } else if (dst_funcmap.has(reloc.func)) {
                dst_code_reloc.push(reloc);
            }
        }

        len = src_data_reloc.length;
        for (let i = 0; i < len; i++) {
            let reloc = src_data_reloc[i];

            if (new_data.indexOf(reloc.dst) !== -1) {
                dst_data_reloc.push(reloc);
            } else if (dst_datamap.has(reloc.dst)) {
                dst_data_reloc.push(reloc);
            }
        }

        // merging ctors
        if (linker._ctors) {
            if (!this._ctors) {
                this._ctors = [];
            }

            let dst_ctors = this._ctors;

            function hasCtorSymbol(symbol) {
                let len = dst_ctors.length;
                for (let i = 0; i < len; i++) {
                    let ctor = dst_ctors[i];
                    if (ctor.symbol == symbol) {
                        return true;
                    }
                }

                return false;
            }

            
            let src_ctors = linker._ctors;
            let len = src_ctors.length;
            for (let i = 0; i < len; i++) {
                let ctor = src_ctors[i];
                if (hasCtorSymbol(ctor.symbol)) {
                    continue;
                }
                
                dst_ctors.push(ctor);
            }
        }

        return null;
    }

    checkImports() {

        let funcuse = new Map();
        let _functions = this.functions;

        let xlen = _functions.length;
        for (let x = 0; x < xlen; x++) {
            let func = _functions[x];
            if (!(func instanceof ImportedFunction))
                break;
            if (func.module != "env")
                continue;
            let arr = [];
            funcuse.set(func, arr);
        }

        for (let x = 0; x < xlen; x++) {
            let fn2 = _functions[x];
            if (fn2 instanceof ImportedFunction)
                continue;

            let used = false;
            let opcodes = fn2.opcodes;
            let ylen = opcodes.length;
            for (let y = 0; y < ylen; y++) {
                let inst = opcodes[y];
                switch (inst.opcode) {
                    case 0x10:  // call
                    case 0xd2:  // ref.func
                    {
                        let func = inst.func;
                        if (funcuse.has(func)) {
                            let arr = funcuse.get(func);
                            if (arr.indexOf(fn2) == -1)
                                arr.push(fn2);
                        }
                        break;
                    }
                }
            }
        }

        for (const [func, uses] of funcuse) {
            console.log("possible missing %s used in: ", func.name, uses.map(function(fn) {
                return fn[__nsym];
            }).join(', '));
        }

        //console.log(funcuse);

        return funcuse;
    }

    prepareLinking(wasmModule) {

        let linking = wasmModule.findSection("linking");
        let reloc_code = wasmModule.findSection("reloc.CODE");
        let reloc_data = wasmModule.findSection("reloc.DATA");
        let codeSection = wasmModule.findSection(10);
        let dataSection = wasmModule.findSection(11);

        let dataSegments = wasmModule.dataSegments;
        let functions = wasmModule.functions;
        let symtable = linking._symtable;
        let segments = linking._segments;
        let section, relocs;

        if (symtable) {
            let len = symtable.length;
            for (let i = 0; i < len; i++) {
                let symbol = symtable[i];
                if (symbol.kind == 0x00) {
                    let func = symbol.value;
                    if (func instanceof WasmFunction) {
                        // allow any symbol to give initial name, but only allow strong symbols in the same *.bc file to overwrite a name.
                        if (func[__nsym] === undefined) {
                            func[__nsym] = symbol.name;
                        } else if ((symbol.flags & WASM_SYM_BINDING_WEAK) == 0){
                            func[__nsym] = symbol.name;
                        }
                    }
                    if (typeof symbol.name != "string" && func instanceof ImportedFunction && func.module == "env") {
                        symbol.name = func.name;
                    }
                }
            }
        }

        if (segments) {
            let len = segments.length;
            for (let i = 0; i < len; i++) {
                let dataSegment = dataSegments[i];
                let metadata = segments[i];
                let name = metadata.name;
                dataSegment[__nsym] = name;
                dataSegment._alignment = metadata.alignment;
                dataSegment._bitflags = metadata.bitflags;
            }
        }


        const dataSecOff = dataSection ? dataSection._cache.dataOffset : 0;
        const codeSecOff = codeSection ? codeSection._cache.dataOffset : 0;

        function findDataSegmentForReloc(offset) {
            let len = dataSegments.length;
            for (let i = 0; i < len; i++) {
                let segment = dataSegments[i];
                let start = segment.offset - dataSecOff;
                let end = start + segment.size;
                if (offset >= start && offset < end) {
                    return segment;
                }
            }

            return null;
        }

        function findFunctionForReloc(offset) {
            let len = functions.length;
            for (let i = 0; i < len; i++) {
                let func = functions[i];
                let start = func.opcode_start - codeSecOff;
                let end = func.opcode_end - codeSecOff;
                if (offset >= start && offset < end) {
                    return func;
                }
            }

            return null;
        }

        relocs = reloc_data ? reloc_data.relocs : null;
        if (relocs) {
            let len = relocs.length;
            for (let i = 0; i < len; i++) {
                let offset, reloc = relocs[i];
                let segment = findDataSegmentForReloc(reloc.offset);
                reloc.dst = segment;
                offset = reloc.offset - (segment.offset - dataSecOff);
                reloc.off = offset;
                reloc.ref = symtable[reloc.index];
            }
        }

        // in code what's needed is: R_WASM_MEMORY_ADDR_SLEB, R_WASM_MEMORY_ADDR_LEB
        // since the other relocs is performed by reference.
        relocs = reloc_code ? reloc_code.relocs : null;
        if (relocs) {
            let len = relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = relocs[i];
                let off = reloc.offset;
                let func = findFunctionForReloc(off);
                if (!func) {
                    console.error("could not find function for reloc at index = %d reloc %o", i, reloc);
                    continue;
                }

                let inst, opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let opcode = opcodes[y];
                    if ((opcode._roff - codeSecOff) == off) {
                        inst = opcode;
                        break;
                    }
                }

                reloc.func = func;
                reloc.inst = inst;
                reloc.ref = symtable[reloc.index];
                if (inst) {
                    delete reloc.offset;
                }
            }
        }
    }

    performLinking(options) {

        let _funcmap = this.funcmap;
        let _datamap = this.datamap;
        let _dataSegments = this.dataSegments;
        let _functions = this.functions;
        let _symtable = this._symtable;
        let _code_relocs = this._code_relocs;
        let _data_relocs = this._data_relocs;
        let dst_tables = this.tables;
        let dst_funcmap = new Map();

        /**
         * 
         * @param {string} name 
         * @returns {object}
         */
        function findModuleFuncSymbol(name) {
            let len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let sym = _symtable[i];
                if (sym.kind != 0)
                    continue;
                if (sym.name == name) {
                    return sym;
                }
            }

            return null;
        }

         function findModuleDataSymbol(name) {
            let len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let sym = _symtable[i];
                if (sym.kind != 1)
                    continue;
                if (sym.name == name) {
                    return sym;
                }
            }

            return null;
        }

        let len = _functions.length;
        for (let i = 0; i < len; i++) {
            let func = _functions[i]
            if (!(func instanceof ImportedFunction))
                break;

            if (func.module != 'env')
                continue;


            let sym = findModuleFuncSymbol(func.name);
            if (sym && (sym.value && sym.value instanceof WasmFunction) && sym.value != func) {
                console.error("nothing should be mapped here! it for a while and remove this loop later");
                dst_funcmap.set(func, sym.value);
            }
        }

        // self.functions
        if (dst_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // element-segments
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

                let idx = _functions.indexOf(oldfunc);
                _functions.splice(idx, 1);
                
                if (newfunc instanceof ImportedFunction) {

                    idx = _functions.indexOf(newfunc);
                    if (idx == -1) {
                        let zidx = -1;
                        let zlen = _functions.length;
                        for (let z = 0; z < zlen; z++) {
                            let func = _functions[z];
                            if (!(func instanceof ImportedFunction)) {
                                zidx = z - 1;
                                break;
                            }
                        }

                        if (zidx == -1) {
                            _functions.unshift(newfunc);
                        } else {
                            _functions.splice(idx, 0, newfunc);
                        }
                    }
                    
                } else {
                    idx = _functions.indexOf(newfunc);
                    if (idx == -1)
                        _functions.push(newfunc);
                }
            }
            
            let xlen = _functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = _functions[x];
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
                            if (dst_funcmap.has(func)) {
                                inst.func = dst_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }

            let len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_I32) {
                    let func = reloc.ref.value;
                    if (dst_funcmap.has(func))
                        reloc.ref.value = dst_funcmap.has(func);

                }
            }
        }

        // Triggering loading of statically linked dependecies.
        // TODO: trigger loading of linking of static to static
        
        /** @type {ARLinker[]} */
        let arloaders = [];
        let loaders = this._loaders;
        len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            if (loader.linkage == "static") {
                arloaders.push(loader);
            }
        }

        let xlen = arloaders.length;
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                continue;

            let kind = sym.kind;
            if (kind == 0) {
                let func = sym.value;
                for (let x = 0; x < xlen; x++) {
                    let loader = arloaders[x];
                    let ret = loader.loadFuncSymbol(func.name, func.type);
                    if (ret) {
                        break;
                    }
                }
            } else if (kind == 1) {
                let name = sym.name;
                if (name.startsWith("__start_") || name.startsWith("__stop_")) {
                    continue;
                }
                for (let x = 0; x < xlen; x++) {
                    let loader = arloaders[x];
                    let ret = loader.loadDataSymbol(name);
                    if (ret) {
                        break;
                    }
                }
            }
        }

        // letting AR loaders try to load undefined symbols against other AR loaders.
        xlen = arloaders.length;
        for (let i = 0; i < xlen; i++) {
            let arloader = arloaders[i];
            if (!arloader._bclinker)
                continue;

            let symtable = arloader._bclinker._symtable;
            let ylen = symtable.length;
            for (let y = 0; y < ylen; y++) {
                let sym = symtable[y];
                if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                    continue;
            
                let kind = sym.kind;
                if (kind == 0) {
                    let func = sym.value;
                    for (let x = 0; x < xlen; x++) {
                        if (i == x || (func instanceof ImportedFunction && func.module != "env"))
                            continue;
                        let loader = arloaders[x];
                        let ret = loader.loadFuncSymbol(func.name, func.type);
                        if (ret) {
                            break;
                        }
                    }
                } else if (kind == 1) {
                    let name = sym.name;
                    if (name.startsWith("__start_") || name.startsWith("__stop_")) {
                        continue;
                    }
                    for (let x = 0; x < xlen; x++) {
                        if (i == x)
                            continue;
                        let loader = arloaders[x];
                        let ret = loader.loadDataSymbol(name);
                        if (ret) {
                            break;
                        }
                    }
                }
            }
        }

        for (let x = 0; x < xlen; x++) {
            let loader = arloaders[x];
            let bclinker = loader._bclinker;
            if (!bclinker)
                continue;
            bclinker._fixupARLinking(loader);
            this.mergeWithLinker(bclinker);
        }


        fixup_builtins(this);
        // TODO: good point to do extention based manipulation on functions.


        // insert linker provided symbols if used.
        let builtin_symbols = {
            'dlopen': {
                kind: 0,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                value: null,
                generator: generate_builtin_symbol,
            },
            'dlclose': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            'dlerror': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            'dlsym': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            'dladdr': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            'dlinfo': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            'dladdr1': {
                kind: 0, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
            '__dso_handle': {
                kind: 2, 
                value: null,
                flags: WASM_SYM_INTERNAL|WASM_SYM_LINKTIME_CONSTRUCT|WASM_SYM_VISIBILITY_HIDDEN,
                generator: generate_builtin_symbol,
            },
        };
        dst_funcmap.clear();
        // finding and replacing symbols that are defined by the linker (dlfcn functions are defined as wrappers)
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            let kind = sym.kind;
            let nflags = 0;

            if (kind == 0) {

                let func = sym.value;
                name = typeof sym.name == "string" ? sym.name : func.name;
                if (!builtin_symbols.hasOwnProperty(name)) {
                    continue;
                }

                debugger;

                let value, builtin = builtin_symbols[name];
                if (!builtin.value) {
                    value = builtin.generator(this, this._wasmModule, name);
                    builtin.value = value;
                }
                dst_funcmap.set(func, value);
                sym.value = value;
                sym.flags = builtin.flags;

            }
        }

        // replaces builtin function in self.functions
        if (dst_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // element-segments (not generated yet)
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

                if (oldfunc instanceof ImportedFunction || oldfunc instanceof WasmFunction) {
                    // newfunc must be WasmFunction
                    let idx1 = _functions.indexOf(oldfunc);
                    if (idx1 === -1)
                        throw new Error("SCENARIO NOT HANDLED");
                    _functions.splice(idx1, 1);

                } else {
                    throw new TypeError("How did we end up here?");
                }
            }
            
            let xlen = _functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = _functions[x];
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
                            if (dst_funcmap.has(func)) {
                                inst.func = dst_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }

            let len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_I32) {
                    let func = reloc.ref.value;
                    if (dst_funcmap.has(func))
                        reloc.ref.value = dst_funcmap.get(func);

                }
            }

            len = _code_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _code_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_SLEB) {
                    let func = reloc.ref.value;
                    if (dst_funcmap.has(func))
                        reloc.ref.value = dst_funcmap.get(func);

                }
            }
        }

        let dst_tblfuncmap = new Map();
        dst_funcmap.clear();
        // Finding missing func & data symbols
        // This can be done after __start_ and __stop_ symbols have been taken care of.
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            let kind = sym.kind;
            let nflags = 0;

            if (kind == 0) {
                if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                    continue;
                let func = sym.value;
                if (!(func instanceof ImportedFunction)) {
                    throw new TypeError("symbol marked as undefined but is not ImportedFunction");
                }

                // only imports of module = env should be linked (TODO: might want to have a merge of module-name == module-name earlier)
                if (func.module != "env") {
                    continue;
                }

                let func2 = this._findSOFuncSymbol(func.name, func.type);
                if (!func2) {
                    //console.error("function not found %s", func.name);
                    continue
                }

                if (func2 instanceof RuntimeLinkingSymbol) {
                    dst_tblfuncmap.set(func, func2);
                    nflags = (WASM_SYM_EXTERNAL|WASM_SYM_EXTERNAL_DLSYM);
                } else {
                    dst_funcmap.set(func, func2);
                    nflags = WASM_SYM_EXTERNAL;
                }
                sym.value = func2;
                sym.flags &= ~WASM_SYM_UNDEFINED;
                sym.flags |= nflags;

            } else if (kind == 1) {
                if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                    continue;

                name = sym.name;
                if (sym.value || sym._reloc || name.startsWith("__start_") || name.startsWith("__stop_")) {
                    continue;
                }

                let reloc = this._findSODataSymbol(name);
                if (!reloc) {
                    console.error("missing %s", name);
                    continue;
                }
                if (reloc instanceof LinkerSymbol) {
                    sym.value = reloc.value;
                } else if (reloc !== true) {
                    sym._reloc = reloc; // Is there still a use for this?
                }
                sym.flags &= ~WASM_SYM_UNDEFINED;
                sym.flags |= WASM_SYM_EXTERNAL;

            }
        }

        // self.functions
        if (dst_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // element-segments (not generated yet)
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

                if (newfunc instanceof ImportedFunction && newfunc.name == "__libc_cond_destroy_stub")
                    debugger;

                if (oldfunc instanceof ImportedFunction && newfunc instanceof ImportedFunction) {
                    let idx1 = _functions.indexOf(oldfunc);
                    let idx2 = _functions.indexOf(newfunc);
                    if (idx1 === -1)
                        throw new Error("SCENARIO NOT HANDLED");
                    if (idx2 === -1) {
                        _functions[idx1] = newfunc;
                    } else {
                        _functions.splice(idx1, 1);
                    }
                    
                } else if (oldfunc instanceof ImportedFunction) {
                    // newfunc must be WasmFunction
                    let idx1 = _functions.indexOf(oldfunc);
                    if (idx1 === -1)
                        throw new Error("SCENARIO NOT HANDLED");
                    _functions.splice(idx1, 1);

                    idx1 = _functions.indexOf(newfunc);
                    if (idx1 == -1) {
                        _functions.push(newfunc);
                    }

                } else {
                    throw new TypeError("How did we end up here?");
                }
            }
            
            let xlen = _functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = _functions[x];
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
                            if (dst_funcmap.has(func)) {
                                inst.func = dst_funcmap.get(func);
                                func._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }

            let len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_I32) {
                    let func = reloc.ref.value;
                    if (dst_funcmap.has(func))
                        reloc.ref.value = dst_funcmap.get(func);

                }
            }
        }

        // remap symbols that are found but indicated as table based only (might go this way with most later)
        if (dst_tblfuncmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // element-segments (not generated yet)
            
            for (const [oldfunc, newfunc] of dst_tblfuncmap) {

                if (newfunc instanceof ImportedFunction && newfunc.name == "__libc_cond_destroy_stub")
                    debugger;

                // old function should always be import, new function is a dylink.0 based dependancy
                if (oldfunc instanceof ImportedFunction) {
                    // newfunc must be WasmFunction
                    let idx = _functions.indexOf(oldfunc);
                    if (idx === -1)
                        throw new Error("SCENARIO NOT HANDLED");
                    _functions.splice(idx, 1);

                } else {
                    throw new TypeError("How did we end up here?");
                }
            }
            let xlen;
            let table0;

            table0 = this.tables.length > 0 ? this.tables[0] : undefined;

            if (!table0) {
                table0 = new ImportedTable();
                table0.module = "env";
                table0.name = "__indirect_function_table";
                table0.reftype = WA_TYPE_FUNC_REF;
                table0.min = 1;
                table0.max = undefined;

                this.tables.push(table0);
            }
            
            xlen = _functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = _functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x10:  // call -> i32.const + call_indirect
                        {
                            let cfunc = inst.func;
                            if (dst_tblfuncmap.has(cfunc)) {
                                let obj = dst_tblfuncmap.get(cfunc);
                                cfunc._usage--;
                                let i32c = {opcode: 0x41, reloc: true, value: 0};
                                let reloc = {type: 1, func: func, inst: i32c, ref: obj};
                                _code_relocs.push(reloc);
                                let cinst = {opcode: 0x11, table: table0, type: cfunc.type};
                                opcodes[y] = cinst;
                                opcodes.splice(y, 0, i32c);
                                ylen++;
                                y++;
                            }
                            break;
                        }
                        case 0xd2:  // ref.func -> i32.const + table.get
                        {
                            let cfunc = inst.func;
                            if (dst_tblfuncmap.has(cfunc)) {
                                inst.func = dst_tblfuncmap.get(cfunc);
                                cfunc._usage--;
                                inst.func._usage++;
                            }
                            break;
                        }
                    }
                }
            }

            let len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_I32) {
                    let func = reloc.ref.value;
                    if (dst_tblfuncmap.has(func))
                        reloc.ref.value = dst_tblfuncmap.get(func);

                }
            }
        }

        // TODO: find and merge duplicate .rodata..L.str.???
        {
            let rodata_strsym = [];
            let len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let sym = _symtable[i];
                if (sym.kind != 0x01 || (sym.flags & WASM_SYM_BINDING_LOCAL) == 0)
                    continue;
                let value = sym.value;
                if (value[__nsym].startsWith(".rodata..L.str")) {
                    rodata_strsym.push(sym);
                }
            }
            let dupcnt = 0;
            let dubbytes = 0;

            let dst_symmap = new Map();
            len = rodata_strsym.length;
            for (let x = 0; x < len; x++) {
                let sym1 = rodata_strsym[x];
                if (sym1 === null)
                    continue;

                let str1 = sym1.value._buffer;
                for (let y = x + 1; y < len; y++) {
                    let sym2 = rodata_strsym[y];
                    if (sym2 === null)
                        continue;

                    if (sym1.value == sym2.value) {
                        continue;
                    }

                    let str2 = sym2.value._buffer;
                    if (str1.byteLength != str2.byteLength)
                        continue;
                    let zlen = str1.byteLength;
                    let match = true;
                    for (let z = 0; z < zlen; z++) {
                        if (str1[z] !== str2[z]) {
                            match = false;
                            break;
                        }
                    }

                    if (match) {
                        dst_symmap.set(sym2, sym1);
                        dupcnt++;
                        dubbytes += zlen;
                        rodata_strsym[y] = null;
                    }
                }
            }

            for (const [oldsym, newsym] of dst_symmap) {
                let oldata = oldsym.value;
                _replaceRelocByRef(_code_relocs, _data_relocs, oldsym, newsym);
                let idx = _symtable.indexOf(oldsym);
                if (idx === -1)
                    throw new RangeError("INVALID_REF");
                _symtable.splice(idx, 1);
                idx = _dataSegments.indexOf(oldata);
                if (idx === -1)
                    throw new RangeError("INVALID_REF");
                _dataSegments.splice(idx, 1);
            }

            console.log("remove-duplicates-local-str.. found %d duplicates with %d bytes", dupcnt, dubbytes);
        }

        // Validate that the linking process has given correct results.
        try {
            validateWasmModuleDataSegments(_dataSegments);
        } catch (err) {
            console.error(err.errors);
            throw err;
        }

        // checking whats still undefined
        this.checkImports();

        // build data-segments
        let reloc_globals = [];
        let so_ident = this.so_ident;
        let so_data_reloc = [];
        let singleDataReloc = true;
        let customDataSections = [];
        let _segmentkeys = this.__segmentkeys
        let __segments = this.__segments;
        let _section_rodata = __segments[".rodata"];
        let _section_data = __segments[".data"];
        let _section_bss = __segments[".bss"];
        

        len = _segmentkeys.length;
        for (let i = 0; i < len; i++) {
            let secname = _segmentkeys[i];
            let dataSection = __segments[secname];
            dataSection.dataSegments = [];
            dataSection.max_align = 0;
            dataSection._size = 0;
            dataSection._dataSize = 0;      // total size excluding padding.
            dataSection._packedSize = 0;    // total actual size after packing

            if (dataSection != _section_rodata && dataSection != _section_data && dataSection != _section_bss) {
                dataSection.startSymbol = findModuleDataSymbol("__start_" + secname);
                dataSection.stopSymbol = findModuleDataSymbol("__stop_" + secname);
                customDataSections.push(dataSection);
            }
        }

        // collect all data-segments into the section where they belong..
        len = _dataSegments.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = _dataSegments[i];

            if (!dataSegment.dataSection) {
                console.error("%o missing data-section reference", dataSegment);
                continue;
            }

            let dataSection = dataSegment.dataSection;

            let align = dataSegment._alignment !== 0 ? Math.pow(2, dataSegment._alignment) : 0;
            if (align > dataSection.max_align)
                dataSection.max_align = align;

            dataSection._dataSize += dataSegment.size;
            dataSection.dataSegments.push(dataSegment);
            
        }

        // pack each data-section in the most efficient way.
        len = _segmentkeys.length;
        for (let i = 0; i < len; i++) {
            let secname = _segmentkeys[i];
            let dataSection = __segments[secname];
            packDataSegments(dataSection);
        }

        // add .rodata, .data and .bss at their respective placement.
        let outputSegments = customDataSections.slice();
        if (_section_data.dataSegments.length > 0)
            outputSegments.unshift(_section_data);      // pos #2
        if (_section_rodata.dataSegments.length > 0)
            outputSegments.unshift(_section_rodata);    // pos #1
        if (_section_bss.dataSegments.length > 0)
            outputSegments.push(_section_bss);          // last


        function findRelocByRef(ref) {
            let results = [];
            let len = _code_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _code_relocs[i];
                if (reloc.ref == ref) {
                    results.push(reloc);
                }
            }

            len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
                if (reloc.ref == ref) {
                    results.push(reloc);
                }
            }

            return results;
        }

        // data-section / data-segments reloc
        if (singleDataReloc) {
            so_data_reloc = [ImportedGlobal.create(so_ident, "__data_reloc", WA_TYPE_I32, false)];
        } else {
            so_data_reloc = [];
        }

        let off = 0;
        let padt = 0;
        let lastDataSection;
        let ylen = outputSegments.length;
        for (let y = 0; y < ylen; y++) {
            let dataSection = outputSegments[y];
            
            let reloc;
            if (singleDataReloc) {
                reloc = so_data_reloc[0];

                // ensure that we do not pad the first object.
                if (lastDataSection) {
                    let max_align = dataSection.max_align;
                    let rem = max_align != 0 ? (off % max_align) : 0;
                    if (rem !== 0) {
                        let pad = (max_align - rem);
                        padt += pad;
                        off += pad;
                        lastDataSection._size += pad;
                        lastDataSection._paddingTotal += pad;
                    }
                }
            } else {
                let reloc_glob_name = generateRelocImportGlobalName(dataSection.name);
                reloc = ImportedGlobal.create(so_ident, reloc_glob_name, WA_TYPE_I32, false);
                so_data_reloc.push(reloc);
                new_globals.push(reloc);
                off = 0;
            }

            let start = off;
            dataSection._reloc_glob = reloc;
            dataSection._reloc_start = off;
             let dataSegments = dataSection.dataSegments;
            let xlen = dataSegments.length;
            if (singleDataReloc) {
               
                for (let x = 0; x < xlen; x++) {
                    let dataSegment = dataSegments[x];
                    dataSegment._reloc += off;
                    dataSegment._reloc_glob = reloc;
                    if (!Number.isInteger(dataSegment._reloc)) {
                        debugger;
                    }
                }
            } else {
                for (let x = 0; x < xlen; x++) {
                    let dataSegment = dataSegments[x];
                    dataSegment._reloc_glob = reloc;
                    // _reloc is already set, starting at zero
                }
            }
            off += dataSection._packedSize;

            dataSection._reloc_stop = off;

            lastDataSection = dataSection;
        }

        // merge data-segments
        this._orgDataSegments = _dataSegments.slice();
        _dataSegments.length = outputSegments.length;
        ylen = outputSegments.length;
        for (let y = 0; y < ylen; y++) {
            let dataSection = outputSegments[y];
            let dataSegments = dataSection.dataSegments;
            let xlen = dataSegments.length;

            let u8 = new Uint8Array(dataSection._size);
            for (let x = 0; x < xlen; x++) {
                let dataSegment = dataSegments[x];
                let size = dataSegment.size;
                let off = dataSegment._rloc;
                u8_memcpy(dataSegment._buffer, 0, size, u8, off);
            }

            let newDataSegment = new WasmDataSegment();
            newDataSegment.kind = 0x01;
            newDataSegment.memory = undefined;
            newDataSegment.size = dataSection._size;
            newDataSegment._buffer = u8;
            newDataSegment[__nsym] = dataSection.name;
            newDataSegment.dataSection = dataSection;

            _dataSegments[y] = newDataSegment;
            dataSection.dataSegment = newDataSegment;

            if (dataSection.startSymbol) {
                let symbol = dataSection.startSymbol;
                symbol.value = new DataSegmentStartSymbol(newDataSegment)
            }

            if (dataSection.stopSymbol) {
                let symbol = dataSection.stopSymbol;
                symbol.value = new DataSegmentEndSymbol(newDataSegment);
            }
        }
        this._dataSections = outputSegments;

        // TODO: merge content from static loaders.
        //       before byte-code from static loaders can be merge, it must resolve within itself, since
        //       external loaded symbols might have dependecies within the static library.

        // TODO: function references in data-segments, collect and make a element-segment
        // TODO: reference to other memory segments in memory segments, collect and build array
        //       to be initilized on shared-object init/load
        //       
        
        // TODO: validating that we have correct reloc data...

        let so_tbl_reloc = ImportedGlobal.create(so_ident, "__tbl_reloc", WA_TYPE_I32, false);
        let so_tbl_objc_reloc = ImportedGlobal.create(so_ident, "__tbl_objc_reloc", WA_TYPE_I32, false);

        let indirect_tbl_objc;
        let indirect_tbl_objc_elem, indirect_tbl_objc_vec = [];
        let indirect_tbl;
        let indirect_tbl_elem, indirect_tbl_vec = [];

        {
            let len = dst_tables.length;
            for (let i = 0; i < len; i++) {
                let tbl = dst_tables[i];
                if (!(tbl instanceof ImportedTable))
                    break;
                if (tbl.module == "env" && tbl.name == "__indirect_function_table") {
                    indirect_tbl = tbl;
                } else if (tbl.module == "env" && tbl.name == "__objc_indirect_method_table") {
                    indirect_tbl_objc = tbl;
                }
            }
        }

        let dl_symbols = [];
        function getDLSymbol(module, name, type) {
            let len = dl_symbols.length;
            for (let i = 0; i < len; i++) {
                let sym = dl_symbols[i];
                if (sym.module == module && sym.name == name) {
                    return sym;
                }
            }

            let sym = new RuntimeLinkingSymbol(module, name, type);
            dl_symbols.push(sym);
            return sym;
        }

        // mapping indirect function references in code (for example used as callback arguments)
        len = _code_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _code_relocs[i];
            if (reloc.type != 1)
                continue;
            let ref = reloc.ref;
            if (ref instanceof RuntimeLinkingSymbol || ref.value instanceof RuntimeLinkingSymbol) {
                continue;
            }

            let func = ref.value;
            if (func instanceof ImportedFunction) {
                let mname = null;
                if (func.module != "env") {
                    mname = func.module;
                }
                let new_ref = getDLSymbol(mname, func.name, func.type);
                reloc.ref = new_ref;
                continue;
            }

            if (!func) {
                console.warn("missing function %s for code reloc", ref.name);
                continue;
            }

            if (func instanceof RuntimeLinkingSymbol)
                debugger;

            let idx = indirect_tbl_vec.indexOf(func);
            if (idx == -1) {
                indirect_tbl_vec.push(func);
                func._usage++;
            } else {

            }
        }

        // mapping indirect function references in memory
        len = _data_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _data_relocs[i];
            if (reloc.type != 2)
                continue;
            let ref = reloc.ref;
            
            let func = ref.value;
            if (func instanceof RuntimeLinkingSymbol) {
                continue;
            }

            if (func instanceof ImportedFunction) {
                let mname = null;
                if (func.module != "env") {
                    mname = func.module;
                }
                let new_ref = getDLSymbol(mname, func.name, func.type);
                reloc.ref = new_ref;
                continue;
            }

            if (!func) {
                console.warn("missing function %s for data reloc", ref.name);
                continue;
            }

            if (func instanceof RuntimeLinkingSymbol)
                debugger;

            let idx = indirect_tbl_vec.indexOf(func);
            if (idx == -1) {
                indirect_tbl_vec.push(func);
                func._usage++;
            }
        }

        // TODO: apply sorting to element-segment
        
        // setting up inst.reloc = true on symbols that should be encoded as relocatable
        len = _code_relocs.length;
        for (let i = 0; i < len; i++) {
            let inst, type, reloc = _code_relocs[i];
            type = reloc.type;
            if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_SLEB) {
                inst = reloc.inst;
                inst._roff = -1;
                inst.reloc = true;
            } else if (type == R_WASM_TABLE_INDEX_SLEB) {
                inst = reloc.inst;
                inst._roff = -1;
                inst.reloc = true;
            } else {
                continue;
            }
        }

        

        // TODO: data reloc commands..
        let reloc_groups = [];
        function findRelocGroup(type, src, dst) {
            if (src === undefined || dst === undefined)
                throw new TypeError("INVALID_RELOC_PARAM");

            let len = reloc_groups.length
            for(let i = 0;i < len;i++){
                let grp = reloc_groups[i];
                if (grp.type == type && grp.src == src && grp.dst == dst) {
                    return grp;
                }
            }

            let grp = {};
            grp.type = type;
            grp.src = src;
            grp.dst = dst;
            grp.vector = [];
            reloc_groups.push(grp);

            return grp;
        }


        // TODO: generate function exports

        // creating element segments
        if (indirect_tbl_vec.length > 0) {
            let elem = new WasmElementSegment();
            elem.kind = 0x01;       // passive
            elem.elemtype = 0x00;   // funcref
            elem.count = indirect_tbl_vec.length;
            elem.vector = indirect_tbl_vec;
            this.elementSegments.push(elem);
            indirect_tbl_elem = elem;
        }

        if (indirect_tbl_objc_vec.length > 0) {
            let elem = new WasmElementSegment();
            elem.kind = 0x01;     // passive
            elem.elemtype = 0x00; // funcref
            elem.count = indirect_tbl_objc_vec.length;
            elem.vector = indirect_tbl_objc_vec;
            this.elementSegments.push(elem);
            indirect_tbl_objc_elem = elem;
        }

        // export visiable symbols.
        let dst_exports = this.exports;
        if (options.noexport != true) {
            let export_list = [];

            len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let func, flags, sym = _symtable[i];
                if (sym.kind != 0)
                    continue;
                flags = sym.flags;
                if (((flags & WASM_SYM_BINDING_LOCAL) != 0) || ((flags & WASM_SYM_UNDEFINED) != 0)) {
                    continue;
                }
                
                if (((flags & WASM_SYM_EXTERNAL) != 0) && ((flags & WASM_SYM_EXPORTED) == 0))
                    continue;
                
                func = sym.value;
                if (func instanceof ImportedFunction)
                    continue;

                // Temporary hack (do not export the objc_msgSend_vii functions)
                let name = func[__nsym];
                if (name.startsWith("objc_msgSend_"))
                    continue;

                if (export_list.indexOf(func) === -1)
                    export_list.push(func);
            }

            len = export_list.length;
            for (let i = 0; i < len; i++) {
                let func = export_list[i];
                let exp = new ExportedFunction();
                exp.name = func[__nsym];
                exp.function = func;
                dst_exports.push(exp);
            }
        }



        {
            let secIdx, codeSec = this._wasmModule.findSection(SECTION_TYPE_CODE);
            if (!codeSec)
                throw ReferenceError("INVALID_STATE");
            secIdx = this._wasmModuleSections.indexOf(codeSec);
            let dataCntSec = new WebAssemblyDataCountSection(this._wasmModule);
            this._wasmModuleSections.splice(secIdx, 0, dataCntSec);
        }

        _producersAddProcessedBy(this.producers, "wasm-ylinker", "0.1 (https://github.com/raweden/wasm-ylinker)")

        // convert memory parameters if needed.
        {
            let mem = this.memory[0];
            mem.shared = true;
            mem.min = 10;
            mem.max = 4096;
        }

        // ensure that all env.__indirect_function_table are uniform. rtld handles resizing.
        {
            let indirect_table;
            let tables = this.tables;
            let len = tables.length;
            for (let i = 0; i < len; i++) {
                let tbl = tables[i];
                if (tbl.module == "env" && tbl.name == "__indirect_function_table") {
                    indirect_table = tbl;
                    break;
                }
            }

            if (indirect_table) {
                indirect_table.min = 1;
                indirect_table.max = undefined;
            }
        }

        // dylink data section 
        let dylinkData = {
            identifier: so_ident,
            dependencies: null,
            memory: null,
            tables: null,
        };

        let commonData = {};
        dl_setup_common_data(this, commonData);

        // fixup exports if present on *.dylink-profile
        if (this._wasmModule._dylink_profile && this._wasmModule._dylink_profile.exports) {
            dl_generate_exports(this, this._wasmModule, this._wasmModule._dylink_profile);
        }

        dl_create_init_array(this, this._wasmModule, commonData);


        // putting all _i_ClassName__selname _c_ClassName__selname into a separate element-segment
        // putting objective-c methods into their own element-segments allows for a simple range check
        // in debugging, since all objc element segments can be placed a sequential continious range.
        {
            let objc_indirect_tbl_elem;
            let objc_funcvec;
            let isCreating = false;
            let other_elems = [];
            let elementSegments = this._wasmModule.elementSegments
            let ylen = elementSegments.length;
            for (let y = 0; y < ylen; y++) {
                let elem = elementSegments[y];
                if (elem[__nsym] == "objc_indirect_functions") {
                    objc_indirect_tbl_elem = elem;
                    break;
                } else {
                    other_elems.push(elem);
                }
            }

            if (!objc_indirect_tbl_elem) {
                objc_indirect_tbl_elem = new WasmElementSegment();
                objc_indirect_tbl_elem.elemtype = 0;
                objc_indirect_tbl_elem.kind = 1;
                objc_indirect_tbl_elem[__nsym] = "objc_indirect_functions";
                objc_funcvec = [];
                objc_indirect_tbl_elem.vector = objc_funcvec;
                isCreating = true;
            } else {
                objc_funcvec = objc_indirect_tbl_elem.vector;
            }

            ylen = other_elems.length;
            for (let y = 0; y < ylen; y++) {
                let elem = other_elems[y];
                let moved = [];
                let funcvec = elem.vector;
                let xlen = funcvec.length;
                for (let x = 0; x < xlen; x++) {
                    let func = funcvec[x];
                    let name = func[__nsym];
                    if (name.startsWith("_i_") || name.startsWith("_c_")) {
                        objc_funcvec.push(func);
                        moved.push(x);
                    }
                }

                for (let x = moved.length - 1; x >= 0; x--) {
                    let idx = moved[x];
                    funcvec.splice(idx, 1);
                }
            }

            if (isCreating && objc_funcvec.length > 0) {
                elementSegments.push(objc_indirect_tbl_elem);
                indirect_tbl_objc_elem = objc_indirect_tbl_elem;
            }

            debugger;
        }


        if (indirect_tbl_elem || indirect_tbl_objc_elem) {

            let inst, wmod = this._wasmModule;
            let ftype = wmod.getOrCreateType(null, null);
            let ctor_dylib_tbl = new WasmFunction();
            ctor_dylib_tbl.type = ftype;
            ctor_dylib_tbl.narg = 0;
            ctor_dylib_tbl[__nsym] = "__wasm_ctor_dylib_tbl";
            //ctor_dylib_tbl.locals = [l1, l2];
            ctor_dylib_tbl.opcodes = [];
            let ops = ctor_dylib_tbl.opcodes;

            // since the first function in a element-segment is referenced at index (0) zero knowing 
            // where to place the element-segments is simply to put a SLEB reloc for the first function, 
            // but use for dst parameter in table.init rather than the usual i32 in a indirect-call. 
            if (indirect_tbl_elem) {
                inst = {opcode: 0x41, value: 0, _roff: -1, reloc: true};
                ops.push(inst);                                                                     // i32.const    (dst)
                ops.push({opcode: 0x41, value: 0});                                                 // i32.const    (src)
                ops.push({opcode: 0x41, value: indirect_tbl_elem.vector.length});                   // i32.const    (len)
                ops.push({opcode: 0xfc0c, table: indirect_tbl, elem: indirect_tbl_elem});           // table.init  
            
                let reloc = {type: R_WASM_TABLE_INDEX_SLEB, dst: ctor_dylib_tbl, inst: inst, elem: indirect_tbl_elem, ref: {kind: 0, offset: 0, value: indirect_tbl_elem.vector[0]}};
                _code_relocs.push(reloc);
                commonData.int_code_relocs.push(reloc);
            }

            if (indirect_tbl_objc_elem) {
                inst = {opcode: 0x41, value: 0, _roff: -1, reloc: true};
                ops.push(inst);                                                                     // i32.const    (dst)
                ops.push({opcode: 0x41, value: 0});                                                 // i32.const    (src)
                ops.push({opcode: 0x41, value: indirect_tbl_objc_elem.vector.length});              // i32.const    (len)
                ops.push({opcode: 0xfc0c, table: indirect_tbl, elem: indirect_tbl_objc_elem});      // table.init
            
                let reloc = {type: R_WASM_TABLE_INDEX_SLEB, dst: ctor_dylib_tbl, inst: inst, elem: indirect_tbl_objc_elem, ref: {kind: 0, offset: 0, value: indirect_tbl_objc_elem.vector[0]}};
                _code_relocs.push(reloc);
                commonData.int_code_relocs.push(reloc);
            }
            
            ops.push({opcode: 0x0b});   // end

            _functions.push(ctor_dylib_tbl);

            let texp = new ExportedFunction();
            texp.name = ctor_dylib_tbl[__nsym];
            texp.function = ctor_dylib_tbl;
            dst_exports.push(texp);
        }

        dl_setup_module_data(this, this._wasmModule, commonData);


        // TODO: add support for .fnit_array

        const WA_EXEC_FLAG_MEMPAD = 0x0001;
        const WA_EXEC_FLAG_RELOC = 0x0002;
        const WA_EXEC_FLAG_DLSYM = 0x0004;
        const WA_EXEC_FLAG_DYNLNK_MAIN = 0x0008;

        // 
        const WA_ET_STD_EXE = 0x01; // standard fixed positions executable
        const WA_ET_YL_PIE = 0x02;  // position indipendent executable (reloc for data & code + external module/func/data deps)
        const WA_ET_DYNLNK = 0x03;  // position indipendent shared library (reloc for data & code + external module/func/data dep)


        let execData = {
            exec_type: WA_ET_DYNLNK,
            exec_traits: WA_EXEC_FLAG_MEMPAD | WA_EXEC_FLAG_RELOC,
            stack_size_hint: 5 * 1024 * 1024, // 5mb
        };

        if (this.is_main_exec) {
            execData.exec_traits |= WA_EXEC_FLAG_DYNLNK_MAIN;
        }

        // finding __start symbol
        let start_func;
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = _symtable[i];
            if (sym.kind == 0 && sym.name == "__start") {
                start_func = sym.value;
                break;
            }
        }

        if (start_func && start_func instanceof WasmFunction) {
            let elemidx = -1;
            let funcidx = -1;
            let segment, segments = this._wasmModule.elementSegments;
            let len = segments.length;
            for (let i = 0; i < len; i++) {
                segment = segments[i];
                funcidx = segment.vector.indexOf(start_func);
                if (funcidx !== -1) {
                    elemidx = i;
                    break;
                }
            }

            execData.exec_start_elemidx = elemidx;
            execData.exec_start_funcidx = funcidx;
        }

        let execInfoSec = new WebAssemblyCustomSectionNetBSDExecHeader(this._wasmModule);
        execInfoSec._data = execData;
        this._wasmModuleSections.unshift(execInfoSec);

        {
            let dl_dylib_sec = new WebAssemblyCustomSectionNetBSDDylinkV2(this._wasmModule);
            dl_dylib_sec._data = commonData;
            this._wasmModuleSections.push(dl_dylib_sec);
        }

        try {
            validateWasmModule(this);
        } catch (err) {
            console.error(err.errors);
            throw err;
        }

        {
            // drop the .bss section
            let len = _dataSegments.length;
            for (let i = 0; i < len; i++) {
                let segment = _dataSegments[i];
                if (segment[__nsym] == ".bss") {
                    _dataSegments.splice(i, 1);
                    break;
                }
            }
        }

        if (typeof this.moduleName == "string") {
            this._wasmModule[__nsym] = this.moduleName;
        } else if (typeof this.so_ident == "string"){
            this._wasmModule[__nsym] = this.so_ident;
        }
    }

    writeModule(outfd) {
        // WebAssemblyFuncTypeSection
        // WebAssemblyImportSection
        // WebAssemblyFunctionSection
        // WebAssemblyElementSection
        // WebAssemblyDataCountSection
        // WebAssemblyCodeSection
        // WebAssemblyDataSection
        // WebAssemblyCustomSectionProducers


        this.garbageCollectType();

        let wasmModule = this._wasmModule;
        let hasNonImpFunc = false;
        let orgSections, sections = this._wasmModuleSections;
        orgSections = sections.slice();
        let len = orgSections.length;
        for (let i = 0; i < len; i++) {
            let section = orgSections[i];
            let type = section.type;
            if (type == SECTION_TYPE_FUNCTYPE) {

                if (this.types.length === 0) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }
            } else if (type == SECTION_TYPE_IMPORT) {

                if (wasmModule.hasImports() === false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }
            } else if (type == SECTION_TYPE_FUNC) {

                let foundNonImp = false;
                let functions = this.functions;
                let xlen = functions.length;
                for (let x = 0; x < xlen; x++) {
                    let func = functions[x];
                    if (func instanceof ImportedFunction) {
                        continue;
                    } else {
                        foundNonImp = true;
                        hasNonImpFunc = true;
                        break;
                    }
                }

                if (foundNonImp == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_TABLE) {

                let foundNonImp = false;
                let tables = this.tables;
                let xlen = tables.length;
                for (let x = 0; x < xlen; x++) {
                    let tbl = tables[x];
                    if (tbl instanceof ImportedTable) {
                        continue;
                    } else {
                        foundNonImp = true;
                        break;
                    }
                }

                if (foundNonImp == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_MEMORY) {

                let foundNonImp = false;
                let memory = this.memory;
                let xlen = memory.length;
                for (let x = 0; x < xlen; x++) {
                    let mem = memory[x];
                    if (mem instanceof ImportedMemory) {
                        continue;
                    } else {
                        foundNonImp = true;
                        break;
                    }
                }

                if (foundNonImp == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_GLOBAL) {

                let foundNonImp = false;
                let globals = this.globals;
                let xlen = globals.length;
                for (let x = 0; x < xlen; x++) {
                    let glb = globals[x];
                    if (glb instanceof ImportedGlobal) {
                        continue;
                    } else {
                        foundNonImp = true;
                        break;
                    }
                }

                if (foundNonImp == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_EXPORT) {

                let exported = this.exports;

                if (!Array.isArray(exported) || exported.length == 0) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_START) {

                let startfn = this.startfn;

                if (startfn && ((startfn instanceof WasmFunction) || (startfn instanceof ImportedFunction))) {
                    this._wasmModule.startfn = startfn;
                } else {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_ELEMENT) {

                let elementSegments = this.elementSegments;

                if (!Array.isArray(elementSegments) || elementSegments.length == 0) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_CODE) {

                if (hasNonImpFunc == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }
            } else if (type == SECTION_TYPE_DATA) {

                let dataSegments = this.dataSegments;

                if (!Array.isArray(dataSegments) || dataSegments.length == 0) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_DATA_COUNT) {

                let dataSegments = this.dataSegments;

                if (!Array.isArray(dataSegments) || dataSegments.length == 0) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_TAG) {

                let foundNonImp = false;
                let tags = this.tags;
                let xlen = tags.length;
                for (let x = 0; x < xlen; x++) {
                    let tag = tags[x];
                    if (tag instanceof ImportedTag) {
                        continue;
                    } else {
                        foundNonImp = true;
                        break;
                    }
                }

                if (foundNonImp == false) {
                    let idx = sections.indexOf(section);
                    sections.splice(idx, 1);
                }

            } else if (type == SECTION_TYPE_CUSTOM) {

                let name = section.name;
                if (name == "producers") {
                    let producers = this._wasmModule.producers;
                    if (!producers || Object.keys(producers).length == 0) {
                        let idx = sections.indexOf(section);
                        sections.splice(idx, 1);
                    } else {
                        section.data = producers;
                    }
                }

            } else {
                throw new TypeError("INVALID_WASM_SECTION")
            }
        }

        let wcb_called = false;

        function write_cb(buf, offset, length) {

            if (offset === undefined || offset === null)
                offset = 0;
            if (length === undefined || length === null)
                length = buf.byteLength;

            wcb_called = true;
            
            fs.writeSync(outfd, buf, offset, length);
        }
        
        let buffers = wasmModule.encode({write_callback: write_cb, 
            relocatable: true,  // preservs padding for relocatable values
            mempad: true        // adds padding for memory.min and memory.max so that these value can be rewritten before new WebAssembly.Module is invoked.
        });

        if (wcb_called)
            return;

        len = buffers.length;
        for (let i = 0; i < len; i++) {
            let buf = new Uint8Array(buffers[i]);
            fs.writeSync(outfd, buf, 0, buf.byteLength);
        }
    }


    // Garbage Collect (strip what's not needed)

    /**
     * Removes non needed types in wasmModule.types
     */
    garbageCollectType() {
        let usedTypes = [];
        let functions = this.functions;
        let xlen = functions.length;
        for (let x = 0; x < xlen; x++) {
            let func = functions[x];
            let type = func.type;
            if (!(type instanceof WasmType)) {
                throw new TypeError("INVALID_TYPE");
            }
            if (usedTypes.indexOf(type) == -1) {
                usedTypes.push(type);
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
                        if (type instanceof WasmType && usedTypes.indexOf(type) == -1) {
                            usedTypes.push(type);
                        }
                        break;
                    }
                }
            }
        }

        let tags = this.tags;
        if (tags) {
            let len = tags.length;
            for (let i = 0; i < len; i++) {
                let tag = tags[i];
                let type = tag.type;
                if (type instanceof WasmType && usedTypes.indexOf(type) == -1) {
                    usedTypes.push(type);
                }
            }
        }

        let strip = [];
        let types = this.types;
        xlen = types.length;
        for (let x = 0; x < xlen; x++) {
            let type = types[x];
            if (usedTypes.indexOf(type) == -1) {
                strip.push(type);
            }
        }

        xlen = strip.length;
        for (let x = 0; x < xlen; x++) {
            let type = strip[x];
            let idx = types.indexOf(type);
            types.splice(idx, 1);
        }

        return strip.length;
    }

    finilize_so() {
        // 
        // determine location / sorting of dataSegments.
        // 
        // prepend internal data references with global.get:
        // global.get $lib_name_data_rloc
        // i32.load offset=1234 ;; <-- existing data reference
        // 
        // or external data references with:
        // global.get $other_lib_data_rloc
        // i32.load offset=1234 ;; <-- existing data reference
        // 
        // internal function references can be left unchanged (if not objc which is a different story)..
        // 
        // external function references can be leaved as is (as imported function)
        // 
        // or replace: 
        // call $external_func
        // 
        // with:
        // global.get $other_lib_func_rloc
        // i32.const 123    ;; offset is given and linked by *.ylinker-data 
        // i32.add
        // call_indirect
        // 
        // Within the shared-object's init/load (generated by the linker):
        // 
        // data-setup use along with global.get + data-segment (needs to be optional for thread replication)
        // global.get $lib_name_data_rloc
        // memory.init                      ;; with (passive) data-segment (which dont automatically put itself into place)
        // 
        // use          (priortize to get it working using element-segment)
        // ref.func
        // table.set
        // 
        // or 
        // 
        // global.get $lib_name_func_rloc
        // table.init                       ;; with (passive) element-segment (which dont automatically put itself into place)
        // 
        // objc - linking IMP to class objects is done within shared-object's init/load implementation
        // which needs to be generated in this function call. After data-setup. THIS WILL BE THE SAME FOR REGULAR in struct
        // function references.
        // 
        // global.get $lib_name_func_rloc
        // i32.const 123                    ;; know location of method referenced.
        // i32.add
        // global.get $lib_name_data_rloc   ;; not sure that i given these in the correct order..
        // i32.store offset=12345
        // 
        // OBJC: There might be some optimization when orginizing data chunks if all data-segment (struct) for objc method IMP are 
        // arranged in sequence, stacking it in paralell in the wasm table would give the benefit of using a loop and increment
        // the values rather than declaring per reference in the init method.
        // 
    }
}

/**
 * 
 * @param {integer} opcode 
 * @returns {boolean}
 */
function isLoadOrStore(opcode) {

    if (opcode > 0x27 && opcode < 0x3f) { // i32, i64, f32, f64 load & store
        return true;
    } else if (opcode >= 0xFE00 && opcode < 0xfe4f && opcode != 0xfe03) { // atomic
        return true;
    }

    return false;
}

/**
 * 
 * @param {integer} opcode 
 * @returns {boolean}
 */
function isLoadInst(opcode) {

    if (opcode > 0x27 && opcode < 0x36) { // i32, i64, f32, f64 load 
        return true;
    } else if (opcode >= 0xfe09 && opcode < 0xfe17) { // atomic load
        return true;
    }

    return false;
}

/**
 * 
 * @param {integer} opcode 
 * @returns {boolean}
 */
function isStoreInst(opcode) {

    if (opcode > 0x35 && opcode < 0x3f) { // i32, i64, f32, f64 store
        return true;
    } else if (opcode > 0xfe16 && opcode < 0xfe1e) { // atomic store
        return true;
    }

    return false;
}

/**
 * 
 * @param {integer} opcode 
 * @returns {boolean}
 */
function isAtomicMemoryInst(opcode) {

    if (opcode >= 0xfe00 && opcode < 0xfe03) { // atomic store
        return true;
    } else if (opcode > 0xfe09 && opcode < 0xfe4f) {
        return true;
    }

    return false;
}

// generating exports

function dl_generate_exports(linker, module, profile) {

    // export visiable symbols.
    let functions = module.functions;
    let dst_exports = module.exports;
    let export_list = [];
    let _symtable = linker._symtable;
    let exports = profile.exports;

    if (typeof exports == "string" && exports == "no-export") {
        return;
    }

    function getFuncSymbolByName(name) {
        let len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let func, sym = _symtable[i];
            if (sym.kind != 0)
                continue;
            func = sym.value;
            if (func instanceof ImportedFunction)
                continue;

            if (func[__nsym] == name) {
                return func;
            }
        }

        return null;
    }

    function getFuncByName(name) {
        let len = functions.length;
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            if (func instanceof ImportedFunction)
                continue;

            if (func[__nsym] == name) {
                return func;
            }
        }

        return null;
    }

    if (typeof exports == "string" && exports == "export-all") {
        let len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let func, flags, sym = _symtable[i];
            if (sym.kind != 0)
                continue;
            flags = sym.flags;
            if (((flags & WASM_SYM_BINDING_LOCAL) != 0) || ((flags & WASM_SYM_UNDEFINED) != 0)) {
                continue;
            }
            
            if (((flags & WASM_SYM_EXTERNAL) != 0) && ((flags & WASM_SYM_EXPORTED) == 0))
                continue;
            
            func = sym.value;
            if (func instanceof ImportedFunction)
                continue;

            // Temporary hack (do not export the objc_msgSend_vii functions)
            let name = func[__nsym];
            if (name.startsWith("objc_msgSend_"))
                continue;

            if (export_list.indexOf(func) === -1)
                export_list.push(func);
        }
    } else if (Array.isArray(exports) && exports.length > 0) {

        let len = exports.length;
        for (let i = 0; i < len; i++) {
            let name = exports[i];
            if (typeof name != "string" || name.length == 0)
                continue;
            let func = getFuncSymbolByName(name);
            if (!func)
                func = getFuncByName(name);
            
            if (func && export_list.indexOf(func) === -1)
                export_list.push(func);

        }

    }

    let len = export_list.length;
    for (let i = 0; i < len; i++) {
        let func = export_list[i];
        let exp = new ExportedFunction();
        exp.name = func[__nsym];
        exp.function = func;
        dst_exports.push(exp);
    }
}

// Producers Section helpers.

function _mergeProducersData(sourceData, targetData) {
        
    function mergeFieldValueArray(src, dst) {
        let xlen = src.length;
        let ylen = dst.length;
        for (let x = 0; x < xlen; x++) {
            let value = src[x];
            let isstr = typeof value == "string";
            let found = false;
            for (let y = 0; y < ylen; y++) {
                let other = dst[y];
                if (isstr) {
                    if (typeof other == "string" && value == other) {
                        found = true;
                        break;
                    }
                } else {
                    if (typeof value == "object" && value !== null && typeof other == "object" && other !== null 
                        && value.value == other.value && value.version == other.version) {
                            found = true;
                            break;
                        }
                }
            }

            if (!found) {
                if (isstr) {
                    dst.push(value);
                } else {
                    let cpy = Object.assign({}, value);
                    dst.push(cpy);
                }
            }
        }
    }

    if (sourceData.language) {
        if (!targetData.hasOwnProperty("language")) {
            targetData.language = [];
        }
        mergeFieldValueArray(sourceData.language, targetData.language);
    }

    if (sourceData["processed-by"]) {
        if (!targetData.hasOwnProperty("processed-by")) {
            targetData["processed-by"] = [];
        }
        mergeFieldValueArray(sourceData["processed-by"], targetData["processed-by"]);
    }

    if (sourceData.sdk) {
        if (!targetData.hasOwnProperty("sdk")) {
            targetData.sdk = [];
        }
        mergeFieldValueArray(sourceData.sdk, targetData.sdk);
    }
}

function _producersAddLanguage(producersData, value, version) {
    let field;
    let hasver = false;
    if (typeof version == "string" && version.length > 0) {
        field = {value: value, version: version};
        hasver = true;
    } else {
        field = value;
    }
    if (!producersData.hasOwnProperty("language")) {
        producersData.language = [];
        producersData.language.push(field);
        return;
    }
    let arr = producersData.language;
    let found = false;
    let len = arr.length;
    for (let i = 0; i < len; i++) {
        let field = arr[i];
        if (hasver) {
            if (typeof field == "object" && field !== null && field.value == value && field.version == version) {
                found = true;
                break;
            }
        } else {
            if (typeof field == "string" && field == value) {
                found = true;
                break;
            }
        }
    }

    if (!found) {
        arr.push(field);
    }
}

function _producersAddProcessedBy(producersData, value, version) {
    let field;
    let hasver = false;
    if (typeof version == "string" && version.length > 0) {
        field = {value: value, version: version};
        hasver = true;
    } else {
        field = value;
    }
    if (!producersData.hasOwnProperty("processed-by")) {
        producersData["processed-by"] = [];
        producersData["processed-by"].push(field);
        return;
    }
    let arr = producersData["processed-by"];
    let found = false;
    let len = arr.length;
    for (let i = 0; i < len; i++) {
        let field = arr[i];
        if (hasver) {
            if (typeof field == "object" && field !== null && field.value == value && field.version == version) {
                found = true;
                break;
            }
        } else {
            if (typeof field == "string" && field == value) {
                found = true;
                break;
            }
        }
    }

    if (!found) {
        arr.push(field);
    }
}

function _producersAddSDK(producersData, value, version) {
    let field;
    let hasver = false;
    if (typeof version == "string" && version.length > 0) {
        field = {value: value, version: version};
        hasver = true;
    } else {
        field = value;
    }
    if (!producersData.hasOwnProperty("sdk")) {
        producersData.sdk = [];
        producersData.sdk.push(field);
        return;
    }
    let arr = producersData.sdk;
    let found = false;
    let len = arr.length;
    for (let i = 0; i < len; i++) {
        let field = arr[i];
        if (hasver) {
            if (typeof field == "object" && field !== null && field.value == value && field.version == version) {
                found = true;
                break;
            }
        } else {
            if (typeof field == "string" && field == value) {
                found = true;
                break;
            }
        }
    }

    if (!found) {
        arr.push(field);
    }   
}

// provides bindings for dlfcn functions

/**
 * 
 * @param {WebAssemblyModule} module 
 * @param {string} import_module 
 * @param {string} name 
 * @returns {!ImportedGlobal}
 */
function find_or_create_import_global(module, import_module, name) {
    let globs = module.globals;
    let len = globs.length;
    for (let i = 0; i < len; i++) {
        let glob = globs[i];
        if (!(glob instanceof ImportedGlobal))
            break;
        if (glob.module == import_module && glob.name == name) {
            return glob;
        }
    }

    let glob = new ImportedGlobal();
	glob.module = "sys";
	glob.name = "__dso_handle";
    module.appendImport(glob);
    return glob;
}

/**
 * 
 * @param {WebAssemblyModule} module 
 * @param {string} import_module 
 * @param {string} name 
 * @param {WasmType} type 
 * @returns {?ImportedFunction}
 */
function find_import_function(module, import_module, name, type) {
    let functions = module.functions;
    let len = functions.length;
    for (let i = 0; i < len; i++) {
        let func = functions[i];
        if (!(func instanceof ImportedFunction))
            break;
        if (func.module == import_module && func.name == name) {
            return func;
        }
    }

    return null;
}

const builtin_generators = {
    'dlopen': function(linker, module, symbol) {
        let ops, ftype, l1, l2, __dso_glob;
        let dlopen, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // void *dlopen(const char *filename, int flags)
        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        l2 = new WasmLocal(WA_TYPE_I32);   // i32
        dlopen = new WasmFunction();
        dlopen.type = ftype;
        dlopen.narg = 2;
        dlopen[__nsym] = "dlopen";
        dlopen.locals = [l1, l2];
        dlopen.opcodes = [];
        ops = dlopen.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlopen", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dlopen";
            imp.type = ftype;
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x20, local: l2});                                        // local.get
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(dlopen);
        
        return dlopen;
    },
    'dlclose': function(linker, module, symbol) {
        let ops, ftype, l1, __dso_glob;
        let dlclose, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // int dlclose(void *handle)
        ftype = module.getOrCreateType(WA_TYPE_I32, WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        dlclose = new WasmFunction();
        dlclose.type = ftype;
        dlclose.narg = 1;
        dlclose[__nsym] = "dlclose";
        dlclose.locals = [l1];
        dlclose.opcodes = [];
        ops = dlclose.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlclose", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dlclose";
            imp.type = ftype;
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(dlclose);

        return dlclose;
    },
    'dlerror': function(linker, module, symbol) {
        let ops, ftype, __dso_glob;
        let dlerror, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // i32 dlerror()
        ftype = module.getOrCreateType(null, WA_TYPE_I32);
        dlerror = new WasmFunction();
        dlerror.type = ftype;
        dlerror.narg = 0;
        dlerror[__nsym] = "dlerror";
        dlerror.opcodes = [];
        ops = dlerror.opcodes;

        ftype = module.getOrCreateType(WA_TYPE_I32, WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlerror", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dlerror";
            imp.type = ftype;
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(dlerror);

        return dlerror;
    },
    'dlsym': function(linker, module, symbol) {
        let ops, ftype, l1, l2, __dso_glob;
        let dlsym, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }
        
        // i32 dlsym(i32 i32)
        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        l2 = new WasmLocal(WA_TYPE_I32);   // i32
        dlsym = new WasmFunction();
        dlsym.type = ftype;
        dlsym.narg = 2;
        dlsym[__nsym] = "dlsym";
        dlsym.locals = [l1, l2];
        dlsym.opcodes = [];
        ops = dlsym.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlsym", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dlsym";
            imp.type = ftype;
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x20, local: l2});                                        // local.get
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(dlsym);

        return dlsym;
    },
    'dladdr': function(linker, module, symbol) {
        let ops, ftype, l1, l2, __dso_glob;
        let dladdr, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // int dladdr(const void *addr, Dl_info *info)
        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        l2 = new WasmLocal(WA_TYPE_I32);   // i32
        dladdr = new WasmFunction();
        dladdr.type = ftype;
        dladdr.narg = 2;
        dladdr[__nsym] = "dladdr";
        dladdr.locals = [l1, l2];
        dladdr.opcodes = [];
        ops = dladdr.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlopen", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dladdr";
            imp.type = ftype
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x20, local: l2});                                        // local.get 
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(dladdr);
        
        return dladdr;
    },
    'dlinfo': function(linker, module, symbol) {
        
        let ops, ftype, l1, l2, l3, __dso_glob;
        let func, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // int dlinfo(void *restrict handle, int request, void *restrict info);
        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        l2 = new WasmLocal(WA_TYPE_I32);   // i32
        l3 = new WasmLocal(WA_TYPE_I32);   // i32
        func = new WasmFunction();
        func.type = ftype;
        func.narg = 3;
        func[__nsym] = "dlinfo";
        func.locals = [l1, l2, l3];
        func.opcodes = [];
        ops = func.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dlinfo", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dlinfo";
            imp.type = ftype
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x20, local: l2});                                        // local.get 
        ops.push({opcode: 0x20, local: l3});                                        // local.get 
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(func);
        
        return func;
    },
    'dladdr1': function(linker, module, symbol) {
        
        let ops, ftype, l1, l2, l3, l4, __dso_glob;
        let func, imp;
        if (!linker.__dso_glob) {
            __dso_glob = find_or_create_import_global(module, "sys", "__dso_handle");
            __dso_glob.type = WA_TYPE_I32;
            __dso_glob.mutable = false;
            linker.__dso_glob;
        } else {
            __dso_glob = linker.__dso_glob;
        }

        // int dladdr1(const void *addr, Dl_info *info, void **extra_info, int flags);
        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        l1 = new WasmLocal(WA_TYPE_I32);   // i32
        l2 = new WasmLocal(WA_TYPE_I32);   // i32
        l3 = new WasmLocal(WA_TYPE_I32);   // i32
        l4 = new WasmLocal(WA_TYPE_I32);   // i32
        func = new WasmFunction();
        func.type = ftype;
        func.narg = 4;
        func[__nsym] = "dladdr1";
        func.locals = [l1, l2, l3, l4];
        func.opcodes = [];
        ops = func.opcodes;

        ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
        imp = find_import_function(module, "dlfcn", "__dladdr1", ftype);
        if (!imp) {
            imp = new ImportedFunction();
            imp.module = "dlfcn";
            imp.name = "__dladdr1";
            imp.type = ftype
            imp._usage = 1;
            module.appendImport(imp);
        }

        ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
        ops.push({opcode: 0x20, local: l1});                                        // local.get 
        ops.push({opcode: 0x20, local: l2});                                        // local.get
        ops.push({opcode: 0x20, local: l3});                                        // local.get
        ops.push({opcode: 0x20, local: l4});                                        // local.get 
        ops.push({opcode: 0x10, func: imp});                                        // call import
        ops.push({opcode: 0x0b});   // end
        module.functions.push(func);
        
        return func;
    }
}

function generate_builtin_symbol(linker, module, symbol) {

    if (builtin_generators.hasOwnProperty(symbol)) {
        return builtin_generators[symbol](linker, module, symbol);
    }

    console.error("symbol %s not defined as a linker builtin", symbol);

    throw new Error("called with undefined symbol!");
}

/**
 * Generates bindings/wrappers for dl.so (dynld.wasm) these are simply wrappers that calls a import
 * with a module prefix and also provides dl.so with the self handle, on which so it was invoked. The
 * handle of self is keept within sys.__dso_handle and points to a module structure provided by the dynamic-linker.
 * 
 * @param {WebAssemblyModule} module 
 */
function dlfcn_bindings(module) {

    let ops, ftype, l1, l2, __dso_glob;
    let dlopen, dlerror, dlsym, dlclose, dladdr, dladdr1;
    let imp, imp_dlopen, imp_dlerror, imp_dlsym, imp_dlclose;
    let _functions = module.functions;

    __dso_glob = new ImportedGlobal();
	__dso_glob.module = "sys";
	__dso_glob.name = "__dso_handle";
	__dso_glob.type = WA_TYPE_I32;
	__dso_glob.mutable = false;
    module.appendImport(__dso_glob);
    
    // void *dlopen(const char *filename, int flags)
    ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    l1 = new WasmLocal(WA_TYPE_I32);   // i32
    l2 = new WasmLocal(WA_TYPE_I32);   // i32
    dlopen = new WasmFunction();
    dlopen.type = ftype;
    dlopen.narg = 2;
    dlopen[__nsym] = "dlopen";
    dlopen.locals = [l1, l2];
    dlopen.opcodes = [];
    ops = dlopen.opcodes;

    imp = new ImportedFunction();
    imp.module = "dlfcn";
    imp.name = "__dlopen";
    imp.type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    imp._usage = 1;

    ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
    ops.push({opcode: 0x20, local: l1});                                        // local.get 
    ops.push({opcode: 0x20, local: l2});                                        // local.get
    ops.push({opcode: 0x10, func: imp});                                        // call import
    ops.push({opcode: 0x0b});   // end
    _functions.push(dlopen);
    module.appendImport(imp);

    // i32 dlerror()
    ftype = module.getOrCreateType(null, WA_TYPE_I32);
    dlerror = new WasmFunction();
    dlerror.type = ftype;
    dlerror.narg = 0;
    dlerror[__nsym] = "dlerror";
    dlerror.opcodes = [];
    ops = dlerror.opcodes;

    imp = new ImportedFunction();
    imp.module = "dlfcn";
    imp.name = "__dlerror";
    imp.type = module.getOrCreateType(WA_TYPE_I32, WA_TYPE_I32);
    imp._usage = 1;

    ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
    ops.push({opcode: 0x10, func: imp});                                        // call import
    ops.push({opcode: 0x0b});   // end
    _functions.push(dlerror);
    module.appendImport(imp);

    // i32 dlsym(i32 i32)
    ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    l1 = new WasmLocal(WA_TYPE_I32);   // i32
    l2 = new WasmLocal(WA_TYPE_I32);   // i32
    dlsym = new WasmFunction();
    dlsym.type = ftype;
    dlsym.narg = 2;
    dlsym[__nsym] = "dlsym";
    dlsym.locals = [l1, l2];
    dlsym.opcodes = [];
    ops = dlsym.opcodes;

    imp = new ImportedFunction();
    imp.module = "dlfcn";
    imp.name = "__dlsym";
    imp.type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    imp._usage = 1;

    ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
    ops.push({opcode: 0x20, local: l1});                                        // local.get 
    ops.push({opcode: 0x20, local: l2});                                        // local.get
    ops.push({opcode: 0x10, func: imp});                                        // call import
    ops.push({opcode: 0x0b});   // end
    _functions.push(dlsym);
    module.appendImport(imp);

    // int dlclose(void *handle)
    ftype = module.getOrCreateType(WA_TYPE_I32, WA_TYPE_I32);
    l1 = new WasmLocal(WA_TYPE_I32);   // i32
    dlclose = new WasmFunction();
    dlclose.type = ftype;
    dlclose.narg = 1;
    dlclose[__nsym] = "dlclose";
    dlclose.locals = [l1];
    dlclose.opcodes = [];
    ops = dlclose.opcodes;

    imp = new ImportedFunction();
    imp.module = "dlfcn";
    imp.name = "__dlclose";
    imp.type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    imp._usage = 1;

    ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
    ops.push({opcode: 0x20, local: l1});                                        // local.get 
    ops.push({opcode: 0x10, func: imp});                                        // call import
    ops.push({opcode: 0x0b});   // end
    _functions.push(dlclose);
    module.appendImport(imp);

    // int dladdr(const void *addr, Dl_info *info)
    ftype = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    l1 = new WasmLocal(WA_TYPE_I32);   // i32
    l2 = new WasmLocal(WA_TYPE_I32);   // i32
    dladdr = new WasmFunction();
    dladdr.type = ftype;
    dladdr.narg = 2;
    dladdr[__nsym] = "dladdr";
    dladdr.locals = [l1, l2];
    dladdr.opcodes = [];
    ops = dladdr.opcodes;

    imp = new ImportedFunction();
    imp.module = "dlfcn";
    imp.name = "__dladdr";
    imp.type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], WA_TYPE_I32);
    imp._usage = 1;

    ops.push({opcode: 0x23, global: __dso_glob});                               // global.get 
    ops.push({opcode: 0x20, local: l1});                                        // local.get 
    ops.push({opcode: 0x20, local: l2});                                        // local.get 
    ops.push({opcode: 0x10, func: imp});                                        // call import
    ops.push({opcode: 0x0b});   // end
    _functions.push(dladdr);
    module.appendImport(imp);
}

/**
 * 
 * @param {WebAssemblyModule} module 
 * @param {WasmFunction|ImportedFunction} func 
 * @returns {boolean}
 */
function hasFuncInElements(module, func) {
    let elementSegments = module.elementSegments;
    let len = elementSegments.length;
    for (let i = 0; i < len; i++) {
        let segment = elementSegments[i];
        if (segment.vector.indexOf(func) !== -1) {
            return true;
        }
    }

    return false;
}

/**
 * `.init_array` (unlike __wasm_call_ctors) is a special segment of
 * user-space memory which contains functions pointers that should be called after memory have been setup. 
 * 
 * @param {ByteCodeLinker} linker
 * @param {WebAssemblyModule} module
 * @param {object} commonData
 */
function dl_create_init_array(linker, module, commonData) {

    let ctors, funcs, len;
    let _data_relocs, int_data_relocs;

    if (!Array.isArray(linker._ctors)) {
        return;
    }

    _data_relocs = linker._data_relocs;
    int_data_relocs = commonData.int_data_relocs;
    ctors = linker._ctors.slice();
    ctors.sort(function(a, b ) {
        if (a.priority < b.priority) {
            return -1;
        } else if (a.priority > b.priority) {
            return 1;
        } else {
            return 0;
        }
    });

    funcs = [];
    len = ctors.length;
    for (let i = 0; i < len; i++) {
        let func, ctor = ctors[i];
        func = ctor.symbol.value;
        if (func instanceof WasmFunction && funcs.indexOf(func) === -1) {
            funcs.push(func);
            if (!hasFuncInElements(module, func)) {
                if (module.elementSegments.length == 0) {
                    throw new Error("CONDITION_NOT_HANDLED");
                }
                let elementSegment = module.elementSegments[0];
                if (elementSegment.hasOwnProperty(__nsym)) {
                    throw new Error("CONDITION_NOT_HANDLED");
                }

                elementSegment.vector.push(func);
            } 
        }
    }

    len = funcs.length;
    if (len == 0)
        return;
    
    let init_arr_buf = new Uint8Array(len * 4);
    let data = new ByteArray(init_arr_buf);
    let off = 0;

    let init_arr_seg = new WasmDataSegment();
    init_arr_seg.kind = 0x01; // passive
    init_arr_seg._buffer = init_arr_buf;
    init_arr_seg.size = init_arr_buf.byteLength;
    init_arr_seg[__nsym] = ".init_array";

    /** @type {DataSection} */
    let init_arr_dataSection = {
        name: init_arr_seg[__nsym],
        dataSegment: init_arr_seg,
        max_align: 4,
        _dataSize: init_arr_seg.size,
        _packedSize: init_arr_seg.size,
        _paddingTotal: 0,
        _reloc_start: 0,                // currently the reloc process, use this value to turn back a change that was done in the early days.
        _reloc_stop: init_arr_seg.size,
    };

    init_arr_seg.dataSection = init_arr_dataSection;

    len = funcs.length;
    for (let i = 0; i < len; i++) {
        let ptr, reloc, func = funcs[i];
        ptr = data.offset;
        data.writeUint32(0);
        reloc = {type: R_WASM_TABLE_INDEX_I32, dst: {dataSection: init_arr_dataSection, _rloc: ptr}, ref: {kind: 0, offset: 0, value: func}};
        _data_relocs.push(reloc);
        int_data_relocs.push(reloc);        
    }

    module.dataSegments.push(init_arr_seg);
    linker._dataSections.push(init_arr_dataSection);
}

// once this data is encoded in the wasm binary we could skip to produce the *.ylinker-data file

/**
 * 
 * @param {string} name 
 * @returns {boolean}
 */
function objc_skip_export_of_data_symbol(name) {
    if (name.startsWith(".objc_selector_") || name.startsWith(".objc_sel_name_") || name.startsWith(".objc_sel_types_")) {
        return true;
    }

    return false;
}

/**
 * 
 * @param {string} name 
 * @returns {boolean}
 */
function objc_skip_export_of_func_symbol(name) {
    if (name.startsWith("objc_msgSend_")) {
        return true;
    }

    return false;
}

// setup of dylink module data & functions
// ELF uses
// .dynsym 
// .dynstr
// .dynamic
// to make things like `dlsym()` work, the symbol table needs to be available to user-space runtime within the memory.
// 
// What is __dso_handle
// https://itanium-cxx-abi.github.io/cxx-abi/abi.html#dso-dtor-runtime-api
//
/**
 * 
 * @param {ByteCodeLinker} linker 
 * @param {WebAssemblyModule} wasmModule 
 * @param {object} dl_data 
 */
function dl_setup_module_data(linker, wasmModule, dl_data) {
    // https://stackoverflow.com/questions/38191776/how-does-the-dlsym-work



    // are these injected?
    // int dladdr(const void *addr, Dl_info *info)
    // int dlinfo(void *restrict handle, int request, void *restrict info);
    // char *dlerror(void);
    // void *dlopen(const char *filename, int flags)
    // void *dlsym(void *restrict handle, const char *restrict symbol);

    let _data_relocs = linker._data_relocs;
    let int_data_relocs = dl_data.int_data_relocs;
    let dlstr_off = 0;
    let dlsym_data = [];

    let exp_data_symbols = dl_data.exp_data_symbols;
    let len = exp_data_symbols.length;
    for (let i = 0; i < len; i++) {
        let exp = exp_data_symbols[i];
        dlsym_data.push(exp);
    }
    
    let elementSegments = wasmModule.elementSegments;
    let xlen = elementSegments.length;
    let exp_func_symbols = dl_data.exp_func_symbols;
    len = exp_func_symbols.length;
    for (let i = 0; i < len; i++) {
        let exp = exp_func_symbols[i];
        let name = exp.name;
        let func = exp.func;
        let obj = {};
        obj.func = func;
        obj.name = name;
        obj.nlen = lengthBytesUTF8(name);
        obj.symbol = exp.symbol;
        
        for (let x = 0; x < xlen; x++) {
            let elem = elementSegments[x];
            if (elem.vector.indexOf(func) !== -1) {
                obj.elem = elem
            }
        }
        dlsym_data.push(obj);
    }

    len = dlsym_data.length;
    for (let i = 0; i < len; i++) {
        let nlen, dlsym = dlsym_data[i];
        dlsym._dlstr_off = dlstr_off;
        nlen = dlsym.nlen;
        if (!Number.isInteger(nlen) || nlen == 0) {
            console.warn("namelen of symbol is = 0 %o", dlsym);
        }
        dlstr_off += (nlen + 1)
    }

    let dlsym_buf = new Uint8Array(12 * dlsym_data.length);
    let dlsym = new ByteArray(dlsym_buf);
    let dlstr_buf = new Uint8Array(dlstr_off);
    let dlstr = new ByteArray(dlstr_buf);
    let dlsym_off = 0;

    let dlstr_seg = new WasmDataSegment();
    dlstr_seg.kind = 0x01; // passive
    dlstr_seg._buffer = dlstr_buf;
    dlstr_seg.size = dlstr_buf.byteLength;
    dlstr_seg[__nsym] = ".dynstr";
    let dlsym_seg = new WasmDataSegment();
    dlsym_seg.kind = 0x01; // passive
    dlsym_seg._buffer = dlsym_buf;
    dlsym_seg.size = dlsym_buf.byteLength;
    dlsym_seg[__nsym] = ".dynsym";

    /** @type {DataSection} */
    let dlsym_dataSection = {
        name: dlsym_seg[__nsym],
        dataSegment: dlsym_seg,
        max_align: 4,
        _dataSize: dlsym_seg.size,
        _packedSize: dlsym_seg.size,
        _paddingTotal: 0,
        _reloc_start: 0,                // currently the reloc process, use this value to turn back a change that was done in the early days.
        _reloc_stop: dlsym_seg.size,
    };

    /** @type {DataSection} */
    let dlstr_dataSection = {
        name: dlstr_seg[__nsym],
        dataSegment: dlstr_seg,
        max_align: 4,
        _dataSize: dlstr_seg.size,
        _packedSize: dlstr_seg.size,
        _paddingTotal: 0,
        _reloc_start: 0,
        _reloc_stop: dlstr_seg.size,
    };

    dlsym_seg.dataSection = dlsym_dataSection;
    dlstr_seg.dataSection = dlstr_dataSection;

    len = dlsym_data.length;
    for (let i = 0; i < len; i++) {
        let type, nlen, ref = dlsym_data[i];
        nlen = ref.nlen;
        if (ref._dlstr_off != dlstr.offset) {
            throw new Error("not in sync?")
        }

        if (ref.func) {
            type = 1;
        } else {
            type = 2;
        }

        dlstr.writeUTF8Bytes(ref.name);
        dlstr.writeUint8(0);

        // reloc for dlstr.symbol
        // TODO: the current way we handle & store reloc values could be made better..
        // FIXME: the way relocs currently works the value must be a sub WasmDataSegment to indicate reloc of data-symbol
        let ptr = dlsym.offset;
        let fakeseg = new WasmDataSegment();
        fakeseg.dataSection = dlstr_dataSection
        fakeseg._rloc = ref._dlstr_off;
        fakeseg[__nsym] = ".dynstr." + ref.name;
        let reloc1 = {type: R_WASM_MEMORY_ADDR_I32, dst: {dataSection: dlsym_dataSection, _rloc: ptr}, off: 0, ref: {kind: 1, offset: 0, value: fakeseg}};
        _data_relocs.push(reloc1);
        int_data_relocs.push(reloc1);

        // reloc for symbol-refernce data-symbol or func-symbol
        ptr += 4;
        if (type == 1 || type == 2) {
            let reloc2 = {dst: {dataSection: dlsym_dataSection, _rloc: ptr}, ref: ref.symbol};
            _data_relocs.push(reloc2);
            int_data_relocs.push(reloc2);
            if (type == 1) {
                reloc2.type = R_WASM_TABLE_INDEX_I32;
            } else {
                reloc2.type = R_WASM_MEMORY_ADDR_I32;
            }
        } else {
            console.warn("other symbol type?", ref);
        }
        // as the symbol-name is always in the .dynstr section, we put the offset, so the the linker can interpet defined symbols with ease.
        dlsym.writeUint32(ref._dlstr_off);

        // writting small-parts after two primary points.
        dlsym.offset += 4;
        dlsym.writeUint16(nlen);
        dlsym.writeUint8(0);        // flags
        dlsym.writeUint8(type);
        
    }

    wasmModule.dataSegments.push(dlstr_seg);
    linker._dataSections.push(dlstr_dataSection);
    wasmModule.dataSegments.push(dlsym_seg);
    linker._dataSections.push(dlsym_dataSection);

}

/**
 * Loads a *.dylink-profile file.
 * 
 * The purpose of this file is to provide extended information into the wasm module.
 * Currently it provides the ylinker with version information about dylinked libraries,
 * but the idea is that it could be expanded since there is currently little control of
 * what is a visiable symbol.
 * 
 * @param {ByteCodeLinker} linker 
 * @param {WebAssemblyModule} wasmModule 
 */
function load_dylink_profile(linker, wasmModule) {
    let ident = linker.so_ident;
    let dirpaths = [];
    let opt_dirpath = linker.options.dylink_profiles_dirpath;
    let data;
    if (typeof opt_dirpath == "string") {
        dirpaths.push(opt_dirpath);
    }
    let filename = ident + ".dylink-profile";

    if (dirpaths.length > 0) {
        let len = dirpaths.length;
        for (let i = 0; i < len; i++) {
            let dirpath = dirpaths[i];
            let filepath = path.join(dirpath, filename);
            let found = false;
            console.log(filepath);
            try {
                fs.accessSync(filepath);
                found = true;
            } catch (err) {
                // do nothing
            }
    
            if (found) {
                let txt = fs.readFileSync(filepath, {encoding: 'utf8'});
                data = JSON.parse(txt);
                break;
            }
        }
    }

    if (!data) {
        let cwd = process.cwd();
        cwd = path.normalize(cwd);
        if (cwd.endsWith('/')) {
            cwd = cwd.substring(0, cwd.length - 1);
        }
        for (let i = 0; i < 4; i++) {
            let filepath = path.join(cwd, filename);
            let found = false;
            console.log(filepath);
            try {
                fs.accessSync(filepath);
                found = true;
            } catch (err) {
                // do nothing
            }

            if (found) {
                let txt = fs.readFileSync(filepath, {encoding: 'utf8'});
                data = JSON.parse(txt);
                break;
            } else {
                let parts = cwd.split("/");
                parts.pop();
                cwd = parts.join('/');
            }
        }
    }

    if (data) {
        linker._dylink_profile = data;
        wasmModule._dylink_profile = data;
        return true;
    }

    console.warn("no %s file found..", filename);

    return false;
}

/**
 * 
 * @param {ByteCodeLinker} linker 
 * @param {object} data 
 */
function dl_setup_common_data(linker, data) {
    // For now we simply use JSON, as the ABI for this are likley to change during development.
    // Later there would be a advantage of having this in a binary format that can be read easy in plain c.
    let module = linker._wasmModule;
    let _data_relocs = linker._data_relocs;
    let _code_relocs = linker._code_relocs;
    let _dataSections = linker._dataSections;
    let linked = linker._loaders;
    let symtable = linker._symtable;
    let ext_code_relocs = [];	// relocs which are external (eg. module depends on another module)
    let ext_data_relocs = [];
    let int_code_relocs = [];	// relocs which are internal (eg. module declares the reloc symbol)
    let int_data_relocs = [];
    let exp_data_symbols = [];	// externally visiable data symbols
    let exp_func_symbols = [];	// externally visiable func symbols
    let needed_data_symbols = [];
    let needed_func_symbols = [];
    let modules = [];
    let modmap = {};

    if (!module._dylink_profile) {
        load_dylink_profile(linker, module);
    }

    let len = _code_relocs.length;
    for (let i = 0; i < len; i++) {
        let type, reloc = _code_relocs[i];
        let value = reloc.ref.value;
        type = reloc.type;
        if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_SLEB) {
            if (value instanceof WasmDataSegment  || value instanceof DataSegmentStartSymbol || value instanceof DataSegmentEndSymbol) {
                int_code_relocs.push(reloc);
            } else {
                ext_code_relocs.push(reloc);
            }
        } else if (type == R_WASM_TABLE_INDEX_SLEB) {
            if (value instanceof WasmFunction) {
                int_code_relocs.push(reloc);
            } else {
                ext_code_relocs.push(reloc);
            }
        } else {
            continue;
        }
    }

    len = _data_relocs.length;
    for (let i = 0; i < len; i++) {
        let type, reloc = _data_relocs[i];
        let value = reloc.ref.value;
        type = reloc.type;
        if (type == R_WASM_MEMORY_ADDR_I32) {
            if (value instanceof WasmDataSegment || value instanceof DataSegmentStartSymbol || value instanceof DataSegmentEndSymbol) {
                int_data_relocs.push(reloc);
            } else {
                ext_data_relocs.push(reloc);
            }
        } else if (type == R_WASM_TABLE_INDEX_I32) {
            if (value instanceof WasmFunction) {
                int_data_relocs.push(reloc);
            } else {
                ext_data_relocs.push(reloc);
            }
        } else {
            continue;
        }
    }

    function find_versions_for(dylink_profile, module_name, module_vers) {
        return null;
    }

    len = linked.length;
    for (let i = 0; i < len; i++) {
        let obj = linked[i];
        if (obj.linkage != "dylink") {
            continue;
        }

        let pair = {};
        if (obj._dl_data) {
            let module_name;
            let module_vers;
            let version_arr;
            let dl_data = obj._dl_data;
            if (typeof dl_data.module_name == "string") {
                module_name = dl_data.module_name;
                pair.name = module_name;
            }
            if (typeof dl_data.module_vers == "string") {
                module_vers = dl_data.module_vers;
                pair.version = module_vers;
            }
            version_arr = find_versions_for(linker._dylink_profile, module_name, module_vers);
            if (version_arr) {
                pair.version = version_arr;
            }
        } else if (obj._dylib_info) {
            let dylib_info = obj._dylib_info;
            if (typeof dylib_info.moduleName == "string" && typeof dylib_info.moduleVersion == "string") {
                pair.name = dylib_info.moduleName;
                pair.version = dylib_info.moduleVersion;
            } else if (typeof dylib_info.sharedObjectIdent == "string") {
                pair.name = dylib_info.sharedObjectIdent;
                pair.version = null;
            }
        } else {

        }

        modmap[pair.name] = pair; 

        modules.push(pair);
    }

    function getDylinkFuncSymbolRef(module, symbol) {
        let len = needed_func_symbols.length;
        for (let i = 0; i < len; i++) {
            let sym = needed_func_symbols[i];
            if (sym.module == module && sym.name == symbol) {
                return sym;   
            }
        }

        let obj = {};
        obj.module = module;
        obj.name = symbol;
        obj._relocs = [];
        needed_func_symbols.push(obj);

        return obj;
    }

    function getDylinkDataSymbolRef(module, symbol) {
        let len = needed_data_symbols.length;
        for (let i = 0; i < len; i++) {
            let sym = needed_data_symbols[i];
            if (sym.module == module && sym.name == symbol) {
                return sym;   
            }
        }

        let obj = {};
        obj.module = module;
        obj.name = symbol;
        obj._relocs = [];
        needed_data_symbols.push(obj);

        return obj;
    }

    const SYMTAB_FUNCTION = 0x00;
    const SYMTAB_DATA = 0x01;

    len = ext_code_relocs.length;
    for (let i = 0; i < len; i++) {
        let reloc = ext_code_relocs[i];
        let ref = reloc.ref;
        if (ref.kind == SYMTAB_FUNCTION) {
            let mod = ref._reloc ? ref._reloc.reloc_global.module : null;
            let obj = getDylinkFuncSymbolRef(mod, ref.name);
            obj._relocs.push(reloc);
        } else if (ref.kind == SYMTAB_DATA) {
            let mod = ref._reloc ? ref._reloc.reloc_global.module : null;
            let obj = getDylinkDataSymbolRef(mod, ref.name);
            obj._relocs.push(reloc);
        }
    }

    len = ext_data_relocs.length;
    for (let i = 0; i < len; i++) {
        let reloc = ext_data_relocs[i];
        let ref = reloc.ref;
        if (ref.kind == SYMTAB_FUNCTION) {
            let mod = ref._reloc ? ref._reloc.reloc_global.module : null;
            let obj = getDylinkFuncSymbolRef(mod, ref.name);
            obj._relocs.push(reloc);
        } else if (ref.kind == SYMTAB_DATA) {
            let mod = ref._reloc ? ref._reloc.reloc_global.module : null;
            let obj = getDylinkDataSymbolRef(mod, ref.name);
            obj._relocs.push(reloc);
        }
    }

    // TODO: for internal symbols, group by data-segment and store each reloc offset
    // at the reloc offset we store the relative offset which once data-segment or table offset 
    // has been determined it is added by the dynamic-linker.

    // symbol mapping
    let dataSections = linker._dataSections;
    let data_section_map = new Map();
    let data_symbols_map = {};
    let data_symbols_tbl = [];
    let reloc_globs = [];

    let func_symbols_map = {};
    let func_symbols_tbl = [];

    // determine external visiable data-symbols
    
    len = symtable.length;
	for (let i = 0; i < len; i++) {
		let external, sym = symtable[i];
		if (sym.kind != 1) {
			continue;
		}
		if (((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) || ((sym.flags & WASM_SYM_UNDEFINED) != 0)) {
			continue;
		}
		external = ((sym.flags & WASM_SYM_EXTERNAL) != 0);
		if (external)
			continue;

        if (objc_skip_export_of_data_symbol(sym.name)) {
            continue;
        }

		let segment = sym.value;
		let obj = {};
		obj.name = sym.name;
		obj.nlen = lengthBytesUTF8(sym.name);
		let dataSection = segment.dataSection;
		if (!dataSection) {
			throw new ReferenceError("data-segment missing data-section");
		} else if (dataSections.indexOf(dataSection) == -1) {
			throw new ReferenceError("data-section not defined");
		}
		obj.segment = dataSection;
		obj.size = 0;
		obj.symbol = sym;
		data_symbols_tbl.push(obj);
        if (data_symbols_map.hasOwnProperty(sym.name)) {
            console.warn("%s is already declared in data_symbols_map", sym.name);
        }
        data_symbols_map[sym.name] = obj;
	}

    // external visiable func-symbols

	let functypes = [];
	let expfunc = [];
	let maxexp = 0;
	let aliasmap = new Map();
    let funcvec, isCreating = false;
    let elementSegments = module.elementSegments;
    if (elementSegments.length == 0) {
        isCreating = true;
        funcvec = [];
    } else {
        funcvec = module.elementSegments[0].vector
    }

	for (let i = 0; i < len; i++) {
		let external, flags, sym = symtable[i];
		if (sym.kind != 0) {
			continue;
		}
		flags = sym.flags;
		if (((flags & WASM_SYM_BINDING_LOCAL) != 0) || ((flags & WASM_SYM_UNDEFINED) != 0)) {
			continue;
		}
		external = ((flags & WASM_SYM_EXTERNAL) != 0);
		if (external && ((flags & WASM_SYM_EXPORTED) == 0))
			continue;

        if (objc_skip_export_of_func_symbol(sym.name))
            continue;

		let func = sym.value;
		let name = func[__nsym];
		let idx = expfunc.indexOf(func);
		if (idx === -1) {
			expfunc.push(func);
			//if (functypes.indexOf(func.type) == -1) {
			//	functypes.push(func.type);
			//}
		}

        if (func instanceof RuntimeLinkingSymbol) {
            debugger;
        }

        let obj = {};
        obj.name = sym.name;
        obj.func = func;
        obj.symbol = sym;

        if (func_symbols_map.hasOwnProperty(sym.name)) {
            console.warn("%s is already declared in func_symbols_map", sym.name);
        }
        func_symbols_map[sym.name] = obj;
        func_symbols_tbl.push(obj);

        if (funcvec.indexOf(func) == -1)
            funcvec.push(func);

	}

    if (isCreating) {
        let elem = new WasmElementSegment();
        elem.elemtype = 0;
        elem.kind = 1; // passive
        elem.vector = funcvec;
        elementSegments.unshift(elem);
    }

    data.int_code_relocs = int_code_relocs;
    data.int_data_relocs = int_data_relocs;
    data.ext_code_relocs = ext_code_relocs;
    data.ext_data_relocs = ext_data_relocs;
    data.exp_data_symbols = data_symbols_tbl;
    data.exp_func_symbols = func_symbols_tbl;
    data.needed_data_symbols = needed_data_symbols;
    data.needed_func_symbols = needed_func_symbols;
    data.dataSections = linker._dataSections;
    data.modules = modules;

    debugger;
}

// export

module.exports = ByteCodeLinker;

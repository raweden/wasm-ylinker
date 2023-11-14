

const fs = require("fs");
const encodeYLinkerData = require("./ylinker-data.js").encodeYLinkerData;
//const fixup_builtins = require("./fixup-builtin.js");
//const fixup_objc_gnustep2 = require("./fixup-objc.js");

function readSelectorType(buf) {
    let str = "";
    let len = buf.byteLength;
    for (let i = 0; i < len; i++) {
        let c = buf[i];
        str += String.fromCharCode(c);
    }

    return str;
}

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
        dataSegments[z] = dataSegment;
        offset += dataSegment.size;
        z++;
    }
    

    dataSection._packedSize = offset;
    dataSection._size = offset;
    dataSection._paddingTotal = padt;
}

class GnuStep2Linker {

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
	    this.dataSegments = [];
	    this.elementSegments = [];
	    this.exports = [];
	    this.functions = [];
	    this.globals = [];
	    this.memory = [];
	    this.tables = [];
	    this.types = [];
        this.tags = [];
        this.sections = [];
        this.producers = {};
        this.objc_constant_strings = [];
        this._code_relocs = [];
        this._data_relocs = [];
        this._loaders = [];
        this._symtable = [];
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
            new WebAssemblyCustomSectionProducers(this._wasmModule),
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
            for (let i = 0; i < len; i++) {
                let reloc = code_relocs[i];
                if (reloc.func == func && reloc.inst == inst) {
                    return reloc;
                }
            }

            return null;
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

        // symbol mapping
        if (src_symtable && src_symtable.length > 0) {

            let len = src_symtable.length;
            for (let i = 0; i < len; i++) {
                let kind, sym = src_symtable[i];
                kind = sym.kind;
                if (kind == 0x00) { // functions

                    //if (sym.value && (((sym.value instanceof WasmFunction) && sym.value[__nsym] == "__sysconf") || ((sym.value instanceof ImportedFunction) && sym.value.name == "__sysconf")))
                    //    debugger;

                    // just merge local symbols.
                    if ((sym.flags & WASM_SYM_BINDING_LOCAL) != 0) {
                        dst_symtable.push(sym);
                        if (sym.value && new_func.indexOf(sym.value) === -1) {
                            new_func.push(sym.value);
                        }
                        continue;
                    }

                    // Objective-C methods are declared as local, these does not appear here.
                    
                    if (sym.name == "__paritysi2")
                        debugger;

                    let name = sym.name;
                    if (dst_funcsym.hasOwnProperty(name)) {
                        let dstsym = dst_funcsym[name];
                        if ((dstsym.flags & WASM_SYM_BINDING_WEAK) != 0 && (dstsym.flags & WASM_SYM_BINDING_WEAK) != 0) {
                            // if both symbols are weak, keep the one in self.
                            src_funcmap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_VISIBILITY_HIDDEN) != 0 && (dstsym.flags & WASM_SYM_VISIBILITY_HIDDEN) != 0) {
                            // if both symbols are weak, keep the one in self.
                            src_funcmap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // if both are undefined; keep self
                            src_funcmap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // keep extneral (linker arg)
                            dst_funcmap.set(dstsym.value, sym.value);
                            _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                            let idx = dst_symtable.indexOf(dstsym);
                            if (idx == -1)
                                throw new ReferenceError("symbol not in table");
                            dst_symtable[idx] = sym;
                            dst_funcsym[name] = sym;
                        } else if ((sym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // external symbol is undefined; keep self
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
                    if (sym.value && sym.value[__nsym] == ".bss._NSBlock")
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

                        if ((dstsym.flags & WASM_SYM_BINDING_WEAK) != 0 && (dstsym.flags & WASM_SYM_BINDING_WEAK) != 0) {
                            // if both symbols are weak, keep the one in self.
                            src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_VISIBILITY_HIDDEN) != 0 && (dstsym.flags & WASM_SYM_VISIBILITY_HIDDEN) != 0) {
                            // if both symbols are weak, keep the one in self.
                            src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // if both are undefined; keep self
                            if (sym.value && dstsym.value)
                                src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // keep extneral (linker arg)
                            if (sym.value && dstsym.value) {
                                throw ReferenceError("old data should never have reference");
                            }
                            _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                            let idx = dst_symtable.indexOf(dstsym);
                            if (idx == -1)
                                throw new ReferenceError("symbol not in table");
                            dst_symtable[idx] = sym;
                            dst_datasym[name] = sym;
                            if (sym.value && new_data.indexOf(sym.value) === -1) {
                                new_data.push(sym.value);
                            }
                        } else if ((sym.flags & WASM_SYM_UNDEFINED) != 0) {
                            // external symbol is undefined; keep self
                            if (sym.value && dstsym.value)
                                src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                        } else {
                            // else re-map to symbol within self.
                            if (sym.value && dstsym.value)
                                src_datamap.set(sym.value, dstsym.value);
                            _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
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

            if (new_data.indexOf(reloc.dst) !== -1) {
                dst_data_reloc.push(reloc);
            } else if (dst_datamap.has(reloc.dst)) {
                dst_data_reloc.push(reloc);
            }
        }

        return null;
        /*
        dataSegments = wasmModule.dataSegments;
        if (dataSegments.length > 0) {

            if (src_datamap.size > 0) {
                
                // find:
                // - memory.init  (0xfc << 8) | 8
                // - data.drop    (0xfc << 8) | 9
                // 
                // replace in:
                // dataSegments (handled by not merging data-segments found in src_datamap)
                
                let functions = wasmModule.functions;
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
                                if (src_datamap.has(dataSegment)) {
                                    inst.dataSegment = src_datamap.get(dataSegment);
                                }
                                break;
                            }
                        }
                    }
                }

                let len = dataSegments.length;
                for (let i = 0; i < len; i++) {
                    let segment = dataSegments[i];
                    if (src_datamap.has(segment))
                        continue;

                    dst_dataSegments.push(segment);
                }

                len = data_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = data_relocs[i];
                    if (src_datamap.has(reloc.dst))
                        continue;
                    
                    dst_data_reloc.push(reloc);
                }

                len = code_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = code_relocs[i];
                    let type = reloc.type;
                    if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_LEB) {
                        let segment = reloc.ref.value;
                        if (src_datamap.has(segment))
                            reloc.ref.value = src_datamap.has(segment);

                    }
                }

            } else {
                // no replacement mapping
                let len = dataSegments.length;
                for (let i = 0; i < len; i++) {
                    let segment = dataSegments[i];
                    dst_dataSegments.push(segment);
                }
                len = data_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = data_relocs[i];
                    dst_data_reloc.push(reloc);
                }
            }
        }*/
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
     * @param  {ARLoader} loader
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
                    if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // if both are undefined; keep self
                        src_funcmap.set(sym.value, dstsym.value);
                        _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                    } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // keep extneral (linker arg)
                        dst_funcmap.set(dstsym.value, sym.value);
                        _replaceRelocByRef(dst_code_reloc, dst_data_reloc, dstsym, sym);
                        let idx = dst_symtable.indexOf(dstsym);
                        if (idx == -1)
                            throw new ReferenceError("symbol not in table");
                        dst_symtable[idx] = sym;
                    } else if ((sym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // external symbol is undefined; keep self
                        src_funcmap.set(sym.value, dstsym.value);
                        _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
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

                    if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0 && (sym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // if both are undefined; keep self
                        if (sym.value && dstsym.value)
                            src_datamap.set(sym.value, dstsym.value);
                        _replaceRelocByRef(src_code_reloc, src_data_reloc, sym, dstsym);
                    } else if ((dstsym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // keep extneral (linker arg)
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
                    } else if ((sym.flags & WASM_SYM_UNDEFINED) != 0) {
                        // external symbol is undefined; keep self
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

        let _dataSegments = this.dataSegments;
        len = new_data.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = new_data[i];
            if (dataSegment[__nsym] == ".rodata._ZTSN3icu7UMemoryE")
                debugger;
            mapOrAdoptDataSection(dataSegment);
            _dataSegments.push(dataSegment);
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

        console.log(funcuse);

        return funcuse;
    }

    prepareLinking(wasmModule) {

        

        console.log("prepareLinking called!");
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

        if (linking && linking._comdat) {
            console.log("has comdat");
        }

        if (symtable) {
            let len = symtable.length;
            for (let i = 0; i < len; i++) {
                let symbol = symtable[i];
                if (symbol.kind == 0x00) {
                    let func = symbol.value;
                    if (func instanceof WasmFunction) {
                        func[__nsym] = symbol.name;
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

        function findSymbol(index) {
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

        relocs = reloc_data ? reloc_data.relocs : null;
        if (relocs) {
            let len = relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = relocs[i];
                let segment = findDataSegmentForReloc(reloc.offset);
                reloc.dst = segment;
                reloc.off = reloc.offset - (segment.offset - dataSecOff);
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
                if (!func)
                    continue;

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
            }
        }

        /*
        let dataSections = {
            '.rodata': {
                dataSegments: [],
            },
            '.data': {
                dataSegments: [],
            },
            '.bss': {
                dataSegments: [],
            }
        };
        let rodata = dataSections[".rodata"];
        let data = dataSections[".data"];
        let bss = dataSections[".bss"];

        
        let segments = linking._segments;
        len = segments.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = dataSegments[i];
            let metadata = segments[i];
            let name = metadata.name;
            dataSegment[__nsym] = name;

            if (name.startsWith(".rodata")) {
                rodata.dataSegments.push(dataSegment);
            } else if (name.startsWith(".data")) {
                data.dataSegments.push(dataSegment);
            } else if (name.startsWith(".bss")) {
                bss.dataSegments.push(dataSegment);
            }
        }

        console.log(dataSections);
        */
    }

    performLinking() {

        let _funcmap = this.funcmap;
        let _datamap = this.datamap;
        let _dataSegments = this.dataSegments;
        let _functions = this.functions;
        let _symtable = this._symtable;
        let _code_relocs = this._code_relocs;
        let _data_relocs = this._data_relocs;
        let dst_tables = this.tables;
        let dst_funcmap = new Map();

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

        for (let x = 0; x < xlen; x++) {
            let loader = arloaders[x];
            let bclinker = loader._bclinker;
            if (!bclinker)
                continue;
            bclinker._fixupARLinking(loader);
            this.mergeWithLinker(bclinker);
        }


        fixup_builtins(this);
        fixup_objc_gnustep2(this);


        this.checkImports();


        dst_funcmap.clear();
        // Finding missing func & data symbols
        // This can be done after __start_ and __stop_ symbols have been taken care of.
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            let kind = sym.kind;

            if (kind == 0) {
                if ((sym.flags & WASM_SYM_UNDEFINED) == 0)
                    continue;
                let func = sym.value;
                if (!(func instanceof ImportedFunction)) {
                    throw new TypeError("symbol marked as undefined by is not ImportedFunction");
                }

                let func2 = this._findSOFuncSymbol(func.name, func.type);
                if (!func2) {
                    console.error("function not found %s", func.name);
                    continue
                }

                dst_funcmap.set(func, func2);
                sym.value = func2;
                sym.flags &= ~WASM_SYM_UNDEFINED;
                sym.flags |= WASM_SYM_EXTERNAL;

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
                } else {
                    sym._reloc = reloc;
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
                    if (idx == -1) {
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
        outputSegments.unshift(_section_data);      // secound
        outputSegments.unshift(_section_rodata);    // first
        outputSegments.push(_section_bss);          // last



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
                    let rem = (off % max_align);
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

            if (dataSection.startSymbol) {
                let symbol = dataSection.startSymbol;
                symbol._reloc = {reloc_global: reloc, reloc_offset: start};
            }

            if (dataSection.stopSymbol) {
                let symbol = dataSection.stopSymbol;
                symbol._reloc = {reloc_global: reloc, reloc_offset: off};
            }

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
            let reloc = dataSection._reloc_glob;
            let start = dataSection._reloc_start;

            let u8 = new Uint8Array(dataSection._size);
            for (let x = 0; x < xlen; x++) {
                let dataSegment = dataSegments[x];
                let size = dataSegment.size;
                let off = dataSegment._reloc - start;
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

        // mapping indirect function references in code (for example used as callback arguments)
        len = _code_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _code_relocs[i];
            if (reloc.type != 1)
                continue;
            let ref = reloc.ref;
            let func = ref.value;
            if (!func) {
                console.warn("missing function %s for code reloc", ref.name);
                continue;
            }

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
            if (!func) {
                console.warn("missing function %s for data reloc", ref.name);
                continue;
            }

            let idx = indirect_tbl_vec.indexOf(func);
            if (idx == -1) {
                indirect_tbl_vec.push(func);
                func._usage++;
            }
        }

        // TODO: apply sorting to element-segment
        

        // applying RELOC

        let dropped = [];

        len = _code_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _code_relocs[i];
            let type = reloc.type;
            if (type == R_WASM_TABLE_INDEX_SLEB) {
                // handling table index references within wasm code.
                let ref = reloc.ref;
                let funcref = ref.value;
                if (!funcref) {
                    console.warn("missing function %s for code reloc", ref.name);
                    continue;
                }

                let funcidx = indirect_tbl_vec.indexOf(funcref);

                let func = reloc.func;
                let inst = reloc.inst;

                let opcodes = func.opcodes;
                let instidx = opcodes.indexOf(inst);
                if (inst.opcode != 0x41 || instidx == -1) {
                    console.error(inst, instidx);
                    continue;
                }

                let before = {opcode: 0x23, global: so_tbl_reloc};
                let after = {opcode: 0x6a};
                opcodes.splice(instidx + 1, 0, after);   // i32.add
                opcodes.splice(instidx, 0, before);      // global.get
                inst.value = funcidx;
                so_tbl_reloc._usage++;
            } else if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_SLEB) {
                // handle memory index references within wasm code.
                let ref = reloc.ref;
                let reloc_global;
                let reloc_offset;
                if (ref.value) {
                    let dataSegment = ref.value;
                    reloc_global = dataSegment._reloc_glob;
                    reloc_offset = dataSegment._reloc;
                } else if (ref._reloc) {
                    let obj = ref._reloc;
                    reloc_global = obj.reloc_global;
                    reloc_offset = obj.reloc_offset;
                } else {
                    console.warn("missing data symbol %s for code reloc", ref.name);
                    continue;
                }

                if (!reloc_global || !Number.isInteger(reloc_offset))
                    throw new ReferenceError("missing reloc setup for code reloc");

                if (Number.isInteger(ref.offset) && ref.offset != 0) {
                    reloc_offset += ref.offset;
                }

                if (reloc_globals.indexOf(reloc_global) == -1) {
                    reloc_globals.push(reloc_global);
                }


                let func = reloc.func;
                let inst = reloc.inst;
                let opcode = inst.opcode;

                let opcodes = func.opcodes;
                let instidx = opcodes.indexOf(inst);
                if (instidx == -1) {
                    throw ReferenceError("inst-idx not found");
                }

                if (func[__nsym] == "_citrus_LC_CTYPE___setlocale50" && instidx == 196) {
                    debugger;
                }

                if (opcode == 0x41) { // i32.const
                    continue;
                } else if (isLoadInst(opcode)) {
                    // i32.const 0
                    // i32.load offset=$reloc_offset
                    // --to: 
                    // global.get __rodata_reloc
                    // i32.load offset=$reloc_offset
                    let prev = opcodes[instidx - 1];
                    if (prev.opcode != 0x41 || prev.value != 0) {
                        debugger;
                    }

                    opcodes[instidx - 1] = {opcode: 0x23, global: reloc_global}; // global.get   ;; before
                    inst.offset = reloc_offset;
                    dropped.push(prev);

                } else if (isStoreInst(opcode)) {
                    // i32.const 0
                    // i32.const value=12345        ;; the value to write at offset..
                    // i32.store offset=$reloc_offset
                    // --to: 
                    // global.get __rodata_reloc
                    // i32.const value=1234             
                    // i32.store offset=$reloc_offset

                    let addr_r = rangeAtPullIndex(func, opcodes, instidx - 1, 1);
                    if (addr_r.start != addr_r.end) {
                        debugger;
                    }

                    let addr_idx = addr_r.start;
                    let prev = opcodes[addr_idx];
                    if (prev.opcode != 0x41 || prev.value != 0) {
                        debugger;
                    }

                    opcodes[addr_idx] = {opcode: 0x23, global: reloc_global}; // global.get   ;; before
                    inst.offset = reloc_offset;
                    dropped.push(prev);

                } else if (isAtomicMemoryInst(opcode)){
                    debugger;
                } else {
                    debugger;
                }

            } else {
                debugger;
            }
        }

        // second pass; since there seams to be dual reloc for memory, one reloc for i32.const and one for load/store
        len = _code_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _code_relocs[i];
            let type = reloc.type;
            if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_SLEB) {
                // handle memory index references within wasm code.
                let ref = reloc.ref;
                let reloc_global;
                let reloc_offset;
                if (ref.value) {
                    let dataSegment = ref.value;
                    reloc_global = dataSegment._reloc_glob;
                    reloc_offset = dataSegment._reloc;
                } else if (ref._reloc) {
                    let obj = ref._reloc;
                    reloc_global = obj.reloc_global;
                    reloc_offset = obj.reloc_offset;
                } else {
                    console.warn("missing data symbol %s for code reloc", ref.name);
                    continue;
                }

                if (Number.isInteger(ref.offset) && ref.offset != 0) {
                    reloc_offset += ref.offset;
                }


                let func = reloc.func;
                let inst = reloc.inst;
                let opcode = inst.opcode;

                if (dropped.indexOf(inst) !== -1) {
                    console.error("dropped i32.const");
                }

                let opcodes = func.opcodes;
                let instidx = opcodes.indexOf(inst);
                if (instidx == -1 && dropped.indexOf(inst) == -1) {
                    throw ReferenceError("inst-idx not found");
                }

                if (opcode == 0x41) { // i32.const

                    // global.get __rodata_reloc
                    // i32.const $reloc_off
                    // i32.add

                    opcodes.splice(instidx + 1, 0, {opcode: 0x6a});                     // i32.add      ;; after
                    opcodes.splice(instidx, 0, {opcode: 0x23, global: reloc_global});   // global.get   ;; before
                    inst.value = reloc_offset;

                } else {
                    continue;
                }

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

        let reloc_cmds = [];
        len = _data_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = _data_relocs[i];
            let type = reloc.type;
            if (type == R_WASM_TABLE_INDEX_I32) {
                let ref = reloc.ref;
                let dataSegment = reloc.dst;
                let func = ref.value;
                let src_glob = so_tbl_reloc;
                let dst_glob = dataSegment._reloc_glob;
                let cmd = {};
                cmd.src_idx = indirect_tbl_vec.indexOf(func);
                cmd.dst_off = dataSegment._reloc + reloc.off;
                cmd._reloc = reloc;
                let grp = findRelocGroup(type, src_glob, dst_glob)
                grp.vector.push(cmd);
            } else if (type == R_WASM_MEMORY_ADDR_I32) {
                let ref = reloc.ref;
                if (!ref)
                    debugger;
                let src_reloc_global;
                let src_reloc_offset;
                if (ref.value) {
                    let dataSegment = ref.value;
                    src_reloc_global = dataSegment._reloc_glob;
                    src_reloc_offset = dataSegment._reloc;
                } else if (ref._reloc) {
                    let obj = ref._reloc;
                    src_reloc_global = obj.reloc_global;
                    src_reloc_offset = obj.reloc_offset;
                } else {
                    console.error("missing data symbol %s for code reloc", ref.name);
                    continue;
                }

                //if (!Number.isInteger(src_reloc_offset)) {
                //    throw ReferenceError("INVALID_RELOC");
                //}

                if (Number.isInteger(ref.offset) && ref.offset != 0) {
                    src_reloc_offset += ref.offset;
                }

                let dst = reloc.dst;
                let dst_glob = dst._reloc_glob;
                let cmd = {};
                cmd.src_off = src_reloc_offset;                
                cmd.dst_off = dst._reloc + reloc.off;
                cmd._reloc = reloc;
                let grp = findRelocGroup(type, src_reloc_global, dst_glob)
                grp.vector.push(cmd);
            } else {
                throw new TypeError("data.reloc not implemented for type");
            }
        }

        // reloc groups vector is sorted by dest-since that is a memory-write
        function reloc_dst_sort(r1, r2) {
            let d1 = r1.dst_off;
            let d2 = r2.dst_off;
            if (d1 < d2) {
                return -1;
            } else if (d1 > d2) {
                return 1;
            }

            return 0;
        }

        len = reloc_groups.length;
        for(let i = 0;i < len;i++){
            let grp = reloc_groups[i];
            grp.vector.sort(reloc_dst_sort);
        }

        let section = new WebAssemblyCustomRelocCMD(this._wasmModule);
        section._reloc_groups = reloc_groups;
        this._reloc_groups = reloc_groups;
        this._wasmModuleSections.unshift(section);


        if (so_tbl_objc_reloc._usage > 0) {
            this.globals.unshift(so_tbl_objc_reloc);
        }

        if (so_tbl_reloc._usage > 0) {
            this.globals.unshift(so_tbl_reloc);
        }

        if (so_data_reloc.length > 0) {

            for (let i = so_data_reloc.length - 1; i >= 0; i--) {
                let glob = so_data_reloc[i];
                this.globals.unshift(glob);
            }
        }

        if (reloc_globals.length > 0) {

            let impidx = -1;
            let notfound = true;
            let _globals = this.globals;
            let len = _globals.length;
            for (let i = 0; i < len; i++) {
                let glob = _globals[i];
                if (!(glob instanceof ImportedGlobal)) {
                    impidx = i - 1;
                    notfound = false;
                }
            }

            len = reloc_globals.length;
            for (let i = 0; i < len; i++) {
                let glob = reloc_globals[i];
                if (_globals.indexOf(glob) !== -1)
                    continue;
                
                if (notfound) {
                    _globals.push(glob);
                } else if (impidx == -1) {
                    _globals.unshift(glob);
                    impidx++;
                } else {
                    _globals.splice(impidx, 0, glob);
                }
            }
        }

        // TODO: generate function exports

        // creating element segments
        if (indirect_tbl_vec.length > 0) {
            let elem = new WasmElementSegment();
            elem.kind = 0x01;       // passive
            elem.elemtype = 0x00;   // funcref
            elem.count = indirect_tbl_vec.length;
            elem.vector = indirect_tbl_vec.slice();
            this.elementSegments.push(elem);
            indirect_tbl_elem = elem;
        }

        if (indirect_tbl_objc_vec.length > 0) {
            let elem = new WasmElementSegment();
            elem.kind = 0x01;     // passive
            elem.elemtype = 0x00; // funcref
            elem.count = indirect_tbl_objc_vec.length;
            elem.vector = indirect_tbl_objc_vec.slice();
            this.elementSegments.push(elem);
            indirect_tbl_objc_elem = elem;
        }

        // TODO: generate dylib ctor functions.
        let wmod = this._wasmModule;
        let voidt = wmod.getOrCreateType(null, null)
        let ops, ctor_dylib_mem = new WasmFunction();
        ctor_dylib_mem[__nsym] = "__wasm_ctor_dylib_mem";
        ctor_dylib_mem.type = voidt;
        ctor_dylib_mem.locals = undefined;
        ctor_dylib_mem.opcodes = [];
        ops = ctor_dylib_mem.opcodes;

        len = outputSegments.length;
        for (let i = 0; i < len; i++) {
            let dataSection = outputSegments[i];
            let dataSegment = dataSection.dataSegment;
            let relocOffset, relocGlobal = dataSection._reloc_glob;

            ops.push({opcode: 0x41, value: 0});                             // i32.const    (src)
            ops.push({opcode: 0x41, value: dataSegment.size});              // i32.const    (len)
            if (singleDataReloc) {
                ops.push({opcode: 0x23, global: relocGlobal});              // global.get
                ops.push({opcode: 0x41, value: dataSection._reloc_start});  // i32.const
                ops.push({opcode: 0x6a});                                   // i32.add      (dst)
            } else {
                ops.push({opcode: 0x23, global: relocGlobal});              // global.get   (dst)
            }
            ops.push({opcode: 0xfc08, dataSegment: dataSegment}); // memory.init

        }

        for (let i = 0; i < len; i++) {
            let dataSection = outputSegments[i];
            let dataSegment = dataSection.dataSegment;
            ops.push({opcode: 0xfc09, dataSegment: dataSegment});           // data.drop

        }

        ops.push({opcode: 0x0b});   // end

        _functions.push(ctor_dylib_mem);

        if (indirect_tbl_elem || indirect_tbl_objc_elem) {

            let ctor_dylib_tbl = new WasmFunction();
            ctor_dylib_tbl.type = voidt;
            ctor_dylib_tbl[__nsym] = "__wasm_ctor_dylib_tbl";
            ctor_dylib_tbl.opcodes = [];
            ops = ctor_dylib_tbl.opcodes;

            // TODO: this should be dynamic!
            if (indirect_tbl_elem) {
                ops.push({opcode: 0x41, value: 0});                                                 // i32.const    (src)
                ops.push({opcode: 0x41, value: indirect_tbl_vec.length});                           // i32.const    (len)
                ops.push({opcode: 0x23, global: so_tbl_reloc});                                     // global.get   (dst)
                ops.push({opcode: 0xfc12, table: indirect_tbl, elem: indirect_tbl_elem});           // table.init  
            }

            if (indirect_tbl_objc_elem) {
                ops.push({opcode: 0x41, value: 0});                                                 // i32.const    (src)
                ops.push({opcode: 0x41, value: indirect_tbl_objc_vec.length});                      // i32.const    (len)
                ops.push({opcode: 0x23, global: so_tbl_objc_reloc});                                // global.get   (dst)
                ops.push({opcode: 0xfc12, table: indirect_tbl_objc, elem: indirect_tbl_objc_elem}); // table.init
            }

            ops.push({opcode: 0x0b});   // end

            _functions.push(ctor_dylib_tbl);
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

        // export visiable symbols.
        let dst_exports = this.exports;
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

        // convert memory parameters if needed.
        {
            let mem = this.memory[0];
            mem.shared = true;
            mem.min = 10;
            mem.max = 4096;
        }

        // dylink data section 
        let dylinkData = {
            identifier: so_ident,
            dependencies: null,
            memory: null,
            tables: null,
        };

        if (singleDataReloc) {
            if (!dylinkData.memory)
                dylinkData.memory = [];
            let last = outputSegments[outputSegments.length - 1];
            let reloc_global = last._reloc_glob
            let obj = {};
            obj.global = {module: reloc_global.module, name: reloc_global.name};
            obj.max_align = last.max_align; // TODO: is this correct?
            obj.size = last._reloc_stop;
            dylinkData.memory.push(obj);
        } else {
            throw new Error("segmented memory initialization is not implemented; be my guest!");
        }

        // TODO: this should be dynamic!
        if (indirect_tbl_elem) {
            if (!dylinkData.tables)
                dylinkData.tables = [];

            let obj = {};
            obj.global = {module: so_tbl_reloc.module, name: so_tbl_reloc.name};
            obj.table = {module: indirect_tbl.module, name: indirect_tbl.name};
            obj.max_align = 0;
            obj.size = indirect_tbl_vec.length;
            dylinkData.tables.push(obj);
        }

        if (indirect_tbl_objc_elem) {
            if (!dylinkData.tables)
                dylinkData.tables = [];

            let obj = {};
            obj.global = {module: so_tbl_objc_reloc.module, name: so_tbl_objc_reloc.name};
            obj.table = {module: indirect_tbl_objc.module, name: indirect_tbl_objc.name};
            obj.max_align = 0;
            obj.size = indirect_tbl_objc_vec.length;
            dylinkData.tables.push(obj);
        }

        {
            if (!dylinkData.dependencies)
                dylinkData.dependencies = [];
            let dylinked = dylinkData.dependencies;
            let loaders = this._loaders;
            let len = loaders.length;
            for (let i = 0; i < len; i++) {
                let loader = loaders[i];
                if (loader.linkage != "dylink")
                    continue;
                let ident = loader._dylib_info.sharedObjectIdent;
                if (typeof ident !== "string")
                    throw new TypeError("expected string");
                dylinked.push(ident);
            }            
        }

        let dylinkSec = new WebAssemblyCustomSectionNetBSDDylink(this._wasmModule);
        dylinkSec.dylinkData = dylinkData;
        this._wasmModuleSections.unshift(dylinkSec);

        try {
            validateWasmModule(this);
        } catch (err) {
            console.error(err.errors);
            throw err;
        }

        debugger;
    }

    writeSymbolFile(fd) {
        
        let buffers = encodeYLinkerData(this, {});

        let len = buffers.length;
        for (let i = 0; i < len; i++) {
            let buf = buffers[i];
            fs.writeSync(outfd, buf, 0, buf.byteLength);
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

        /*
        let tmod = new WebAssemblyModule();
        tmod._version = 1;
        tmod.dataSegments = this.dataSegments;
        tmod.elementSegments = this.elementSegments;
        tmod.types = this.types;
        tmod.functions = this.functions;
        tmod.tables = this.tables;
        tmod.memory = this.memory;
        tmod.globals = this.globals;
        tmod.sections = [];
        tmod.sections.push(new WebAssemblyFuncTypeSection(tmod));   // 1
        tmod.sections.push(new WebAssemblyFunctionSection(tmod));   // 3
        tmod.sections.push(new WebAssemblyTableSection(tmod));      // 4
        tmod.sections.push(new WebAssemblyMemorySection(tmod));     // 5
        tmod.sections.push(new WebAssemblyGlobalSection(tmod));     // 6
        tmod.sections.push(new WebAssemblyDataSection(tmod));       // 0x0b
        tmod.sections.push(new WebAssemblyCustomSectionName(tmod)); // 0x00
        */

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
        
        let buffers = wasmModule.encode({write_callback: write_cb});

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

        let stip = [];
        let types = this.types;
        xlen = types.length;
        for (let x = 0; x < xlen; x++) {
            let type = types[x];
            if (usedTypes.indexOf(type) == -1) {
                stip.push(type);
            }
        }

        xlen = stip.length;
        for (let x = 0; x < xlen; x++) {
            let type = stip[x];
            let idx = types.indexOf(type);
            types.splice(idx, 1);
        }

        return stip.length;
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

function isLoadOrStore(opcode) {

    if (opcode > 0x27 && opcode < 0x3f) { // i32, i64, f32, f64 load & store
        return true;
    } else if (opcode >= 0xFE00 && opcode < 0xfe4f && opcode != 0xfe03) { // atomic
        return true;
    }

    return false;
}

function isLoadInst(opcode) {

    if (opcode > 0x27 && opcode < 0x36) { // i32, i64, f32, f64 load 
        return true;
    } else if (opcode >= 0xfe09 && opcode < 0xfe17) { // atomic load
        return true;
    }

    return false;
}

function isStoreInst(opcode) {

    if (opcode > 0x35 && opcode < 0x3f) { // i32, i64, f32, f64 store
        return true;
    } else if (opcode > 0xfe16 && opcode < 0xfe1e) { // atomic store
        return true;
    }

    return false;
}


function isAtomicMemoryInst(opcode) {

    if (opcode >= 0xfe00 && opcode < 0xfe03) { // atomic store
        return true;
    } else if (opcode > 0xfe09 && opcode < 0xfe4f) {
        return true;
    }

    return false;
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

// export

module.exports = GnuStep2Linker;

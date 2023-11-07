

const fs = require("fs");
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

class GnuStep2Linker {

	constructor() {
		this.funcmap = {};
		this.datamap = {};
        this.datasubmap = {};
	    this.dataSegments = [];
	    this.elementSegments = [];
	    this.exports = [];
	    this.functions = [];
	    this.globals = [];
	    this.imports = [];
	    this.memory = [];
	    this.tables = [];
	    this.types = [];
        this.tags = [];
        this.sections = [];
        this.objc_constant_strings = [];
        this._code_relocs = [];
        this._data_relocs = [];
        this._loaders = [];
        this._symtable = [];
        let mod = new WebAssemblyModule();
        mod._version = 1;
        this._module = mod;
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

	mergeWithModule(wasmModule) {

        // TODO: must respect WASM_SYM_BINDING_LOCAL

		let _funcmap = this.funcmap;
		let _datamap = this.datamap;
	    let _dataSegments = this.dataSegments;
	    let _elementSegments = this.elementSegments;
	    let _functions = this.functions;
	    let _globals = this.globals;
	    let _imports = this.imports;
	    let _memory = this.memory;
	    let _tables = this.tables;
	    let _types = this.types;
        let _tags = this.tags;
        let _objc_constant_strings = this.objc_constant_strings;
        let _code_relocs = this._code_relocs;
        let _data_relocs = this._data_relocs;
        let _symtable = this._symtable;

	    // key = value in wasmModule
	    // val = value in combined module
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
        let linking = wasmModule.findSection("linking");
        let symtable = linking._symtable;

        function findSymbolFor(segment) {
            let len = symtable.length;
            for (let i = 0; i < len; i++) {
                let symbol = symtable[i];
                if (symbol.kind == 1 && symbol.dataSegment == segment) {
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

        function find_objc_constant_string(strbuf) {
            let len = _objc_constant_strings.length;
            for (let i = 0; i < len; i++) {
                let obj = _objc_constant_strings[i];
                let buf = obj.dataSegment._buffer;
                if (buf.byteLength != strbuf.byteLength) {
                    continue;
                }

                let match = true;
                let xlen = buf.byteLength;
                for (let x = 0; x < xlen; x++) {
                    if (buf[x] != strbuf[x]) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    return obj;
                }
            }

            return null;
        }

        function replaceRelocByRef(oldsym, newsym) {

            let len = _code_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _code_relocs[i];
                if (reloc.ref == oldsym) {
                    reloc.ref = newsym;
                }
            }

            len = _data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = _data_relocs[i];
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
        if (symtable && symtable.length > 0) {
            let xlen = symtable.length;
            let ylen = _symtable.length;
            

            for (let x = 0; x < xlen; x++) {
                let oldsym, newsym = symtable[x];
                let found = false;
                let idx = -1;
                for (let y = 0; y < ylen; y++) {
                    oldsym = _symtable[y];
                    if (oldsym.kind == newsym.kind && oldsym.name == newsym.name) {
                        idx = y;
                        break;
                    }
                }

                if (idx !== -1) {
                    if (oldsym.name == "class_getInstanceMethod")
                        debugger;
                    let kind = newsym.kind;
                    let oldf = oldsym.flags;
                    let newf = newsym.flags;
                    if (replacesOldSymbol(oldsym, newsym)) {
                        _symtable[idx] = newsym;
                        if (kind == 0) {
                            dst_funcmap.set(oldsym.value, newsym.value);
                            replaceRelocByRef(oldsym, newsym);
                        } else if (kind == 1) {
                            if (oldsym.dataSegment && newsym.dataSegment) {
                                dst_datamap.set(oldsym.dataSegment, newsym.dataSegment);
                            }
                            replaceRelocByRef(oldsym, newsym);
                        }
                    } else {
                        replaceModuleRelocByRef(newsym, oldsym);
                    }
                } else {
                    _symtable.push(newsym);
                }
            }
        } 

        
        // data section mapping.
        let gs2sections = {
            '__objc_selectors': {
                null_selector: null,
                datamap: this.getDataSegmentSubMap("__objc_selectors"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;

                    if (relocs.length != 2 && name != ".objc_null_selector") {
                        console.warn("relocs.length is not 2 (%d) for %s", relocs.length, name);
                    }

                    /*
                    if (relocs[0].off !== 0) {
                        let a = relocs[0];
                        let b = relocs[1];
                        relocs[0] = b;
                        relocs[1] = a;
                    }
                    //console.log("segment: '%s'", name);
                    //console.log(relocs);
                    let reloc, sel, type, sym = "";
                    reloc = relocs[0];
                    sel = reloc.ref.name;
                    if (sel.startsWith(".objc_sel_name_")) {
                        sym = sel.substring(15);
                    }
                    reloc = relocs[1];
                    type = reloc.ref.name;
                    if (type.startsWith(".objc_sel_types_")) {
                        sym += '\x00' + readSelectorType(reloc.ref.dataSegment._buffer);
                    }

                    name = "__objc_selectors." + sym;
                    segment[__nsym] = name;*/

                    let datamap = this.datamap;

                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }

                }
            },
            '__objc_constant_string': {
                datamap: this.getDataSegmentSubMap("__objc_constant_string"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;

                    if (relocs.length != 2 && name != ".objc_null_constant_string") {
                        console.warn("relocs.length is not 2 (%d) for %s", relocs.length, name);
                        return;
                    }
                    if (relocs.length == 2 && relocs[1].ref.name.startsWith(".L__unnamed_") == false) {
                        console.warn("relocs[1] is not .L__unnamed_ (%s)", relocs[1].ref.name);
                        return;
                    }

                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }

                }
            },
            '__objc_class_refs': {
                datamap: this.getDataSegmentSubMap("__objc_class_refs"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            },
            '__objc_protocols': {

                datamap: this.getDataSegmentSubMap("__objc_protocols"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            },
            '__objc_protocol_refs': {

                datamap: this.getDataSegmentSubMap("__objc_protocol_refs"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            },
            '__objc_class_aliases': {

                datamap: this.getDataSegmentSubMap("__objc_class_aliases"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            },
            '__objc_cats': {

                datamap: this.getDataSegmentSubMap("__objc_cats"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            },
            '__objc_classes': {

                datamap: this.getDataSegmentSubMap("__objc_classes"),
                handler: function (segment) {
                    let relocs = findDataReloc(segment);
                    let symbol = findSymbolFor(segment);
                    let name = symbol.name;
                    
                    let datamap = this.datamap;
                    if (datamap.hasOwnProperty(name)) {
                        src_datamap.set(segment, datamap[name]);
                    } else {
                        datamap[name] = segment;
                    }
                }
            }
        };


        let dataSegments = wasmModule.dataSegments;
        let ylen, xlen = dataSegments.length;
        for (let x = 0; x < xlen; x++) {
            let segment = dataSegments[x];
            let name = segment[__nsym];
            if (gs2sections.hasOwnProperty(name)) {
                let sec = gs2sections[name];
                sec.handler(segment);
            } else if (name.startsWith("__objc_")) {
                console.log("name %s", name);
            } else if (name.startsWith(".rodata.") || name.startsWith(".data.") || name.startsWith(".bss.")) {

                if (name.startsWith(".rodata..L__unnamed_")) {
                    continue;
                }
                
                if (_datamap.hasOwnProperty(name)) {
                    src_datamap.set(segment, _datamap[name]);
                } else {
                    _datamap[name] = segment;
                }
            }
        }
        

        let newfuncs = {};

        // 
        let functions = wasmModule.functions;
        if (functions) {
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let name = func[__nsym];
                newfuncs[name] = func;
            }
        }

        let len = _functions.length;
        for (let i = 0; i < len; i++) {
            let func = _functions[i];
            if (!(func instanceof ImportedFunction))
            	break;

            if (func.module != 'env')
            	continue;

            if (newfuncs.hasOwnProperty(func.name)) {
            	let repl = newfuncs[func.name];
            	dst_funcmap.set(func, repl);
            }
        }

	    // wasmModule.types
	    // merges the type table of the two modules.
        let oldtypes = []; // types to be replaced in wasmModule
        let newtypes = []; // replacment for above, index mapped; oldtypes[i] = newtypes[i]

        let otypes = wasmModule.types;
        xlen = otypes.length;
        ylen = _types.length;
        for (let x = 0; x < xlen; x++) {
            let t1 = otypes[x];
            let anymatch = false;
            for (let y = 0; y < ylen; y++) {
                let t2 = _types[y];
                if (WasmType.isEqual(t1, t2)) {
                    oldtypes.push(t1);
                    newtypes.push(t2);
                    anymatch = true;
                    break;
                }
            }

            if (!anymatch) {
                _types.push(t1);
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
                let idx = oldtypes.indexOf(tag.type);
                if (idx !== -1) {
                    tag.type = newtypes[idx];
                }
            }
        }

        // replacing in functions & opcode
        functions = wasmModule.functions;
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

        // wasmModule.imports
       	let imports = wasmModule.imports;
        if (imports) {
            let xlen = imports.length;
            let ylen = _imports.length;
            for (let x = 0; x < xlen; x++) {
                let cls, imp1 = imports[x];
                if (imp1 instanceof ImportedFunction) {
                	cls = ImportedFunction;
                } else if (imp1 instanceof ImportedGlobal) {
                	cls = ImportedGlobal;
                } else if (imp1 instanceof ImportedMemory) {
                	cls = ImportedMemory;
                } else if (imp1 instanceof ImportedTable) {
                	cls = ImportedTable;
                } else if (imp1 instanceof ImportedTag) {
                	cls = ImportedTag;
                }

                let found = false;

                for (let y = 0; y < ylen; y++) {
                	let imp2 = _imports[y];
                	if (imp2 instanceof cls && imp2.module == imp1.module && imp2.name == imp1.name) {
                		if (cls == ImportedFunction) {
		                	src_funcmap.set(imp1, imp2);
		                } else if (cls == ImportedGlobal) {
		                	src_globmap.set(imp1, imp2);
		                } else if (cls == ImportedMemory) {
		                	src_memmap.set(imp1, imp2);
		                } else if (cls == ImportedTable) {
		                	src_tblmap.set(imp1, imp2);
		                } else if (cls == ImportedTag) {
		                	src_tagmap.set(imp1, imp2);
		                }
		                found = true;
                		break;
                	}
                }

                if (!found && imp1.module == "env") {
                	if (_funcmap.hasOwnProperty(imp1.name)) {
                        let func = _funcmap[imp1.name];
                        // TODO: check type
                        src_funcmap.set(imp1, func);
                        found = true;
                    }
                }

                if (!found) {
                	_imports.push(imp1);

                    this.appendImport(imp1);
                }
            }
        }


        // self.dataSegments
        if (dst_datamap.size > 0) {

            // find:
            // - memory.init  (0xfc << 8) | 8
            // - data.drop    (0xfc << 8) | 9
            // 
            // replace in:
            // dataSegments (handled by not merging data-segments found in dst_datamap)
            
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
                            if (dst_datamap.has(dataSegment)) {
                                inst.dataSegment = dst_datamap.get(dataSegment);
                            }
                            break;
                        }
                    }
                }
            }

            for (const [oldseg, newseg] of dst_datamap) {

                let idx = _functions.indexOf(oldseg);
                _dataSegments[idx] = newseg;
            }

            len = data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = data_relocs[i];
                if (dst_datamap.has(reloc.dst))
                    continue;
                
                _data_relocs.push(reloc);
            }

            len = code_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = code_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_LEB) {
                    let segment = reloc.ref.dataSegment;
                    if (dst_datamap.has(segment))
                        reloc.ref.dataSegment = dst_datamap.has(segment);

                }
            }
            

        }

        
        // self.functions
        if (dst_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // imports (replace/remove as needed)
            // element-segments
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

            	let idx = _functions.indexOf(oldfunc);
            	_functions.splice(idx, 1);
            	if (oldfunc instanceof ImportedFunction) {
            		idx = _imports.indexOf(oldfunc);
            		_imports.splice(idx, 1);
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

            // reloc in data should be replaced with a swap of ref in symbol handling
        }

        // wasmModule.functions
        if (src_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // imports (replace/remove as needed)
            // element-segments

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
                    }
                }
            }

            let len = data_relocs.length;
            for (let i = 0; i < len; i++) {
                let reloc = data_relocs[i];
                let type = reloc.type;
                if (type == R_WASM_TABLE_INDEX_I32) {
                    let func = reloc.ref.value;
                    if (src_funcmap.has(func))
                        reloc.ref.value = src_funcmap.has(func);

                }
            }
        }

        // wasmModule.tables
        if (src_tblmap.size > 0) {
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
            // imports (replace/remove as needed)
            
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
                        case 0x11:      // call_indirect
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
                    }
                }
            }
        }

        // wasmModule.globals
        if (src_globmap.size > 0) {
            // find:
            // - global.set     0x24
            // - global.get     0x23
            // 
            // (globals are also allowed in expr as in global.init, dataSegment.init)
            // 
            // replace in:
            // globals
            // imports (replace/remove as needed)
            
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
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (src_globmap.has(glb)) {
                                inst.global = src_globmap.get(glb);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // wasmModule.tags
        if (src_tagmap.size > 0) {
            
            // find:
            // - throw      0x08
            // - catch      0x07
            // 
            // replace in:
            // tags
            // imports (replace/remove as needed)
            
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
                        case 0x07:  // catch
                        case 0x08:  // throw
                        {
                            let tag = inst.tag;
                            if (src_tagmap.has(tag)) {
                                inst.tag = src_tagmap.get(tag);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // wasmModule.memory
        if (src_memmap.size > 0) {
            
        }

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

                    _dataSegments.push(segment);
                }

                len = data_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = data_relocs[i];
                    if (src_datamap.has(reloc.dst))
                        continue;
                    
                    _data_relocs.push(reloc);
                }

                len = code_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = code_relocs[i];
                    let type = reloc.type;
                    if (type == R_WASM_MEMORY_ADDR_LEB || type == R_WASM_MEMORY_ADDR_LEB) {
                        let segment = reloc.ref.dataSegment;
                        if (src_datamap.has(segment))
                            reloc.ref.dataSegment = src_datamap.has(segment);

                    }
                }

            } else {
                // no replacement mapping
                let len = dataSegments.length;
                for (let i = 0; i < len; i++) {
                    let segment = dataSegments[i];
                    _dataSegments.push(segment);
                }
                len = data_relocs.length;
                for (let i = 0; i < len; i++) {
                    let reloc = data_relocs[i];
                    _data_relocs.push(reloc);
                }
            }
        }


        for (let n in newfuncs) {
            let func = newfuncs[n];
            if (src_funcmap.has(func))
                continue;
            if (_funcmap.hasOwnProperty(n)) {
                console.warn("%s already defined", n);
            }
            _funcmap[n] = func;
            _functions.push(func);
            // TODO: read linking symbol-table
            // TODO: never include .objcv2_load_function more than once.
        }

        len = code_relocs.length;
        for (let i = 0; i < len; i++) {
            let reloc = code_relocs[i];
            let func = reloc.func;
            let type = reloc.type;
            if (type == R_WASM_FUNCTION_INDEX_LEB || type == R_WASM_TYPE_INDEX_LEB || type == R_WASM_GLOBAL_INDEX_LEB || src_funcmap.has(func))
                continue;
            if (_functions.indexOf(func) != -1)
                _code_relocs.push(reloc);
        }
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
            let segment = sym.dataSegment;
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

    _fixupBuiltin() {

    }

    _fixupGnu2ObjC() {

    }

    // Static Linking

    // invoked by the parent linker before symbols within linker against a AR
    // file is merged with the target.
    _fixupARLinking(loader) {
        let _symtable = this._symtable;
        let len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            if (sym.kind == 0) {
                let name = sym.name;
                let func = sym.value;
                if (!func) {
                    loader.resolveFuncSymbol(name)
                } else if (func instanceof ImportedFunction) {
                    loader.resolveFuncSymbol(name, func.type);
                }
            } else if (sym.kind == 1) {
                let segment = sym.dataSegment;
                if (!segment) {
                    loader.resolveDataSymbol(segment.name);
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
        let len = dst_symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = dst_symtable[i];
            let name = sym.name;
            let flags = sym.flags;
            let islocal = (flags & WASM_SYM_BINDING_LOCAL) == 0;
            if (sym.type == 0 && !islocal) {
                if (dst_funcsym.hasOwnProperty(name))
                    console.error("name '%s' already exists ", name);
                dst_funcsym[name] = sym;
            } else if (sym.type == 1 && !islocal) {
                if (dst_funcsym.hasOwnProperty(name))
                    console.error("name '%s' already exists ", name);
                dst_datasym[name] = sym;
            }
        }

        
        len = src_symtable.length;
        for (let i = 0; i < len; i++) {
            let sym = src_symtable[i];
            sym.flags |= WASM_SYM_EXTERNAL;
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
        let _imports = this.imports;
        let _symtable = this._symtable;
        let _code_relocs = this._code_relocs;
        let _data_relocs = this._data_relocs;
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
            // imports (replace/remove as needed)
            // element-segments
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

                let idx = _functions.indexOf(oldfunc);
                _functions.splice(idx, 1);
                if (oldfunc instanceof ImportedFunction) {
                    idx = _imports.indexOf(oldfunc);
                    _imports.splice(idx, 1);
                }
                
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

                    idx = _imports.indexOf(newfunc);
                    if (idx == -1)
                        _imports.push(newfunc);
                    
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

        fixup_builtins(this);
        fixup_objc_gnustep2(this);


        this.checkImports();

        dst_funcmap.clear();
        len = _functions.length;
        for (let i = 0; i < len; i++) {
            let func = _functions[i]
            if (!(func instanceof ImportedFunction))
                break;

            let func2 = this._findFuncSymbol(func.name, func.type);
            if (!func2) {
                console.error("function not found %s", func.name);
                continue
            }

            dst_funcmap.set(func, func2);
            let sym = findModuleFuncSymbol(func.name);
            if (!sym)
                throw new TypeError("NOT_FOUND");
            sym.value = func2;
            sym.flags |= WASM_SYM_EXTERNAL;
        }

        // self.functions
        if (dst_funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // imports (replace/remove as needed)
            // element-segments
            
            for (const [oldfunc, newfunc] of dst_funcmap) {

                let idx = _functions.indexOf(oldfunc);
                _functions.splice(idx, 1);
                if (oldfunc instanceof ImportedFunction) {
                    idx = _imports.indexOf(oldfunc);
                    _imports.splice(idx, 1);
                }
                
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

                    idx = _imports.indexOf(newfunc);
                    if (idx == -1)
                        _imports.push(newfunc);
                    
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
                        reloc.ref.value = dst_funcmap.get(func);

                }
            }
        }

        // Finding missing data symbols
        // This can be done after __start_ and __stop_ symbols have been taken care of.
        len = _symtable.length;
        for (let i = 0; i < len; i++) {
            let name, sym = _symtable[i];
            if (sym.kind != 1)
                continue;

            name = sym.name;
            if (sym.dataSegment || sym._reloc || name.startsWith("__start_") || name.startsWith("__stop_")) {
                continue;
            }

            let reloc = this._findDataSymbol(name);
            if (!reloc) {
                console.error("missing %s", name);
                continue;
            }
            if (reloc instanceof LinkerSymbol) {
                sym.dataSegment = reloc.dataSegment;
            } else {
                sym._reloc = reloc;
            }
            sym.flags |= WASM_SYM_EXTERNAL;
        }

        let loaders = this._loaders;
        len = loaders.length;
        for (let i = 0; i < len; i++) {
            let loader = loaders[i];
            if (loader.linkage == "static" && loader._bclinker) {
                let bclinker = loader._bclinker;
                bclinker._fixupARLinking(loader);
                this.mergeWithLinker(bclinker);
            }
        }

        // TODO: what about all the imports in libc? these seams to be weak aliases?
        // build data-segments

        let dataSections = {
            '.rodata': {
                name: '.rodata',
                dataSegments: [],
                max_align: 0,
                size: 0,
                reloc_glob_name: "__rodata_reloc"
            },
            '.data': {
                name: '.data',
                dataSegments: [],
                max_align: 0,
                size: 0,
                reloc_glob_name: "__data_reloc"
            },
            '.bss': {
                name: '.bss',
                dataSegments: [],
                max_align: 0,
                size: 0,
                reloc_glob_name: "__bss_reloc"
            }
        };

        let customSegments = [];
        let rodata = dataSections[".rodata"];
        let data = dataSections[".data"];
        let bss = dataSections[".bss"];

        let datasubmap = this.datasubmap;
        for (let secname in datasubmap) {
            let dataSegments = [];
            let max_align = 0;
            let tot_size = 0;
            let map = datasubmap[secname];
            let dsec = {};
            for (let p in map) {
                let segment = map[p];
                segment._dsec = dsec;
                let align = segment._alignment !== 0 ? Math.pow(segment._alignment, 2) : 0;
                dataSegments.push(segment);
                tot_size += segment.size;
                if (align > max_align)
                    max_align = align;
            }

            dsec.name = secname;
            dsec.dataSegments = dataSegments;
            dsec.max_align = max_align;
            dsec.size = tot_size;
            dsec.reloc_glob_name = secname + "_reloc";

            dsec.startSymbol = findModuleDataSymbol("__start_" + secname);
            dsec.stopSymbol = findModuleDataSymbol("__stop_" + secname);

            dataSections[secname] = dsec;
            customSegments.push(secname);
        }

        
        len = _dataSegments.length;
        for (let i = 0; i < len; i++) {
            let dataSegment = _dataSegments[i];

            let align = dataSegment._alignment !== 0 ? Math.pow(dataSegment._alignment, 2) : 0;
            let name = dataSegment[__nsym];

            if (name.startsWith(".rodata")) {
                rodata.dataSegments.push(dataSegment);
                rodata.size += dataSegment.size;
                if (align > rodata.max_align)
                    rodata.max_align = align;
            } else if (name.startsWith(".data")) {
                data.dataSegments.push(dataSegment);
                data.size += dataSegment.size;
                if (align > data.max_align)
                    data.max_align = align;
            } else if (name.startsWith(".bss")) {
                bss.dataSegments.push(dataSegment);
                bss.size += dataSegment.size;
                if (align > bss.max_align)
                    bss.max_align = align;
            } else {
                console.warn("unexpected data-segment %s", name)
            }
        }

        let uintptr = [];
        let strings = [];
        let pow2 = [];
        let misc = [];
        let sorted, segments = rodata.dataSegments;
        len = segments.length;
        for (let i = 0; i < len; i++) {
            let segment = segments[i];
            let name = segment[__nsym];
            let size = segment.size;
            if (name.startsWith(".rodata..L.str")) {
                strings.push(segment);
            } else if (size == 4) {
                uintptr.push(segment);
            } else if (size % 4 == 0) {
                pow2.push(segment);
            } else {
                misc.push(segment);
            }
        }

        function sort_segment(seg1, seg2) {
            let s1, n1 = seg1[__nsym];
            let s2, n2 = seg2[__nsym];
            if (n1 < n2) {
                return -1;
            } else if (n1 > n2) {
                return 1;
            }
            s1 = seg1.size;
            s2 = seg2.size;
            if (s1 < s2) {
                return -1;
            } else if (s1 > s2) {
                return 1;
            }

            return 0;
        }

        // TODO: orginize by alignment and check best fit on every insert..

        rodata.dataSegments.sort(sort_segment);
        data.dataSegments.sort(sort_segment);
        bss.dataSegments.sort(sort_segment);

        let single_data = true;
        let so_ident = this.so_ident;
        let so_data_reloc;
        let outputSegments = [rodata, data];

        len = customSegments.length;
        for (let i = 0; i < len; i++) {
            let name = customSegments[i];
            let datasec = dataSections[name];
            outputSegments.push(datasec);
        }

        outputSegments.push(bss);

        if (single_data) {
            so_data_reloc = [ImportedGlobal.create(so_ident, "__data_reloc", WA_TYPE_I32, false)];
        } else {
            so_data_reloc = [];
        }

        let off = 0;
        let padb = 0;
        let last;
        let ylen = outputSegments.length;
        for (let y = 0; y < ylen; y++) {
            let grp = outputSegments[y];
            let segments = grp.dataSegments;
            let xlen = segments.length;
            let reloc;
            if (single_data) {
                reloc = so_data_reloc[0];

                // ensure that we do not pad the first object.
                if (off !== 0) {
                    let first = segments[0];
                    let align = first && first._alignment !== 0 ? Math.pow(first._alignment, 2) : 0;
                    let rem = align !== 0 ? (off % align) : 0;
                    if (rem !== 0) {
                        let pad = (align - rem);
                        padb += pad;
                        off += pad;
                    }
                }
            } else {
                reloc = ImportedGlobal.create(so_ident, grp.reloc_glob_name, WA_TYPE_I32, false);
                so_data_reloc.push(reloc);
                off = 0;
            }

            let start = off;
            let padbs = padb;
            grp._reloc_glob = reloc;
            grp._reloc_start = off;
            for (let x = 0; x < xlen; x++) {
                let segment = segments[x];
                let size = segment.size;
                let align = segment._alignment !== 0 ? Math.pow(segment._alignment, 2) : 0;
                let rem = align !== 0 ? (off % align) : 0;
                if (rem == 0) {
                    segment._reloc = off;
                    off += size;
                } else {
                    let pad = (align - rem);
                    padb += pad;
                    off += pad;
                    segment._reloc = off;
                    off += size;
                }
                segment._reloc_glob = reloc;
                segment._dsec = grp;
            }
            grp._reloc_stop = off;
            grp._bytesize = off - start;
            grp._padtot = padb - padbs;

            if (grp.startSymbol) {
                let symbol = grp.startSymbol;
                symbol._reloc = {reloc_global: reloc, reloc_offset: start};
            }

            if (grp.stopSymbol) {
                let symbol = grp.stopSymbol;
                symbol._reloc = {reloc_global: reloc, reloc_offset: off};
            }
        }

        // TODO: merge data-segments
        let new_dataSegments = [];
        ylen = outputSegments.length;
        for (let y = 0; y < ylen; y++) {
            let grp = outputSegments[y];
            let segments = grp.dataSegments;
            let xlen = segments.length;
            let reloc = grp._reloc_glob;
            let start = grp._reloc_start;

            let u8 = new Uint8Array(grp._bytesize);
            for (let x = 0; x < xlen; x++) {
                let segment = segments[x];
                let size = segment.size;
                let off = segment._reloc - start;
                u8_memcpy(segment._buffer, 0, size, u8, off);
            }

            let segment = new WasmDataSegment();
            segment._buffer = u8;

            new_dataSegments.push(segment);
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

        let indirect_tbl_objc = [];
        let indirect_tbl = [];

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

            let idx = indirect_tbl.indexOf(func);
            if (idx == -1) {
                indirect_tbl.push(func);
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

            let idx = indirect_tbl.indexOf(func);
            if (idx == -1) {
                indirect_tbl.push(func);
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

                let funcidx = indirect_tbl.indexOf(funcref);

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
                if (ref.dataSegment) {
                    let dataSegment = ref.dataSegment;
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

                    if (func[__nsym] == "_i_NSBundle__executablePath") {
                        debugger;
                        // from inst at 123, the expected location is 114, but rangeAtPullIndex()
                        // returns 115 to 116
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

                    if (func[__nsym] == "_i_NSBundle__executablePath" && instidx == 123) {
                        debugger;
                        // from inst at 123, the expected location is 114, but rangeAtPullIndex()
                        // returns 115 to 116
                    }

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
                if (ref.dataSegment) {
                    let dataSegment = ref.dataSegment;
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
                    reloc_global += ref.offset;
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
                cmd.src_idx = indirect_tbl.indexOf(func);
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
                if (ref.dataSegment) {
                    let dataSegment = ref.dataSegment;
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
                    debugger;
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

        let section = new WebAssemblyCustomRelocCMD(this._module);
        section._reloc_groups = reloc_groups;
        this._reloc_groups = reloc_groups;
        this.sections.push(section);


        if (so_tbl_objc_reloc._usage > 0) {
            this.imports.unshift(so_tbl_objc_reloc);
            this.globals.unshift(so_tbl_objc_reloc);
        }

        if (so_tbl_reloc._usage > 0) {
            this.imports.unshift(so_tbl_reloc);
            this.globals.unshift(so_tbl_reloc);
        }

        if (so_data_reloc.length > 0) {

            for (let i = so_data_reloc.length - 1; i >= 0; i--) {
                let glob = so_data_reloc[i];
                this.imports.unshift(glob);
                this.globals.unshift(glob);
            }
        }

        // creating element segments
        if (indirect_tbl.length > 0) {
            let elem = new WasmElementSegment();
            elem.count = indirect_tbl.length;
            elem.vector = indirect_tbl.slice();
            // TODO: should be passive
            this.elementSegments.push(elem);
        }

        if (indirect_tbl_objc.length > 0) {
            let elem = new WasmElementSegment();
            elem.count = indirect_tbl_objc.length;
            elem.vector = indirect_tbl_objc.slice();
            // TODO: should be passive
            this.elementSegments.push(elem);
        }
        

        debugger;
    }

    writeSymbolFile(fd) {
        // table of memory symbols and their relative location
        // table of visible function symbols
        // - each function can be exports by
        //   - export declartion and/or:
        //     exported to a imported/exported table
        // 
        // table of function symbol aliases.
        // 
        // if table is used as means of exports.
        // - one section must be declared which indicates which table it's exported to.
        // 
        // Rather than re-linking the entire share-object if not required, this file is 
        // read into the linker and linked against.
        // 
        // Structure
        // !YLNKR_D + i32 version
        // - reloc-globals (vector of module + name)
        // - data-segment table (info about .rodata, .data .bss)
        //   - name
        //   - size
        //   - reloc global
        //   - reloc offset
        //   - alignment
        // - data-symbols table
        //   - name
        //   - segment index
        //   - size
        //   - reloc global
        //   - reloc offset
        // - func-tables (tables which func are exported to module + name)
        // - func-types  (same as module.types but only holds the exported/declared funcs)
        // - func-symbols
        //   - name
        //   - wasm-type
        //   - flags
        //   - table-export-count
        //      - table
        //      - reloc global
        //      - reloc index
        //   - alias-count
        //      - name
        // 
        // or nest table-export outeside of func-symbols
        // - func-aliases (array of alternative names)
        //   - index of symbol
        //   - name
        let _dataSections = this._dataSections;
        let dataSegments = this.dataSegments;
        let symtable = this._symtable;

        let hdrbuf = new Uint8Array(12);
        let data = new DataView(hdrbuf.buffer);
        data.setUint32(0, 0x4E4C5921, true);
        data.setUint32(4, 0x445F524B, true);
        data.setUint32(8, 0x01, true);          // version
        fs.writeSync(fd, hdrbuf, 0, hdrbuf.byteLength);

        const YLNK_DATA_NAME = "ylinker.linking_data";
        const YLNK_DATA_VER = 1;

        const LDAT_DYLIB_INFO_TYPE = 0x15;
        const LDAT_RLOC_GLB_TYPE = 0x16;
        const LDAT_DATA_SEG_TYPE = 0x17;
        const LDAT_DATA_SYM_TYPE = 0x18;
        const LDAT_FUNC_TBL_TYPE = 0x19;
        const LDAT_FUNC_TYP_TYPE = 0x20;
        const LDAT_FUNC_SYM_TYPE = 0x21;

        let sechdrsz = 0;
        let buffers = [];
        let reloc_globs = [];
        let data_section_tbl = [];
        let data_section_map = new Map();
        let data_symbols_tbl = [];
        let func_tbl = [];
        let type_tbl = [];

        let len = _dataSections.length;
        for(let i = 0;i < len;i++){
            let segment = _dataSections[i];
            let glob = segment._reloc_glob;
            if (reloc_globs.indexOf(glob) == -1)
                reloc_globs.push(glob);

            let obj = {};
            obj.name = segment.name;
            obj.size = segment._bytesize;
            obj.reloc_global = segment._reloc_glob;
            obj.reloc_offset = segment._reloc_start;
            obj.alignment = segment.max_align;

            data_section_map.set(segment, obj);
            data_section_tbl.push(obj);
        }

        len = dataSegments.length;
        for(let i = 0;i < len;i++){
            let segment = dataSegments[i];
            let glob = segment._reloc_glob;
            if (reloc_globs.indexOf(glob) == -1)
                reloc_globs.push(glob);

            let dsec = segment._dsec;
            if (!data_section_map.has(dsec)) {
                let obj = {};
                obj.name = dsec.name;
                obj.size = dsec._bytesize;
                obj.reloc_global = dsec._reloc_glob;
                obj.reloc_offset = dsec._reloc_start;
                obj.alignment = dsec.max_align;

                data_section_map.set(dsec, obj);
                data_section_tbl.push(obj);
            }
        }

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
            let segment = sym.dataSegment;
            let obj = {};
            obj.name = sym.name;
            obj.nlen = lengthBytesUTF8(sym.name);
            let dsec;
            if (!segment._dsec) {
                throw new ReferenceError("data-segment missing data-section");
            } else if (!data_section_map.has(segment._dsec)) {
                throw new ReferenceError("data-section not defined");
            } else {
                dsec = data_section_map.get(segment._dsec)
            }
            obj.segment = dsec;
            obj.size = 0;
            obj.reloc_global = segment._reloc_glob;
            obj.reloc_offset = segment._reloc;
            data_symbols_tbl.push(obj);
        }

        let functypes = [];
        let expfunc = [];
        let maxexp = 0;
        let aliasmap = new Map();

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

            let func = sym.value;
            let name = func[__nsym];
            let idx = expfunc.indexOf(func);
            if (idx === -1) {
                expfunc.push(func);
                if (functypes.indexOf(func.type) == -1) {
                    functypes.push(func.type);
                }
            }

            idx = type_tbl.indexOf(func.type);
            if (idx === -1)
                type_tbl.push(func.type);

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

        len = expfunc.length;
        for (let i = 0; i < len; i++) {
            let func = expfunc[i];
            let obj = {};
            obj.func = func;
            obj.name = func[__nsym];
            obj.flags = 0;
            obj.nlen = lengthBytesUTF8(obj.name);
            expfunc[i] = obj;
            if (aliasmap.has(func)) {
                obj.aliases = aliasmap.get(func);
            }
        }

        // dylib info sub-section
        let totsz, secsz = 0;
        {
            // computing needed size
            let so_ident = this.so_ident;
            let nlen = lengthBytesUTF8(so_ident);
            secsz += lengthULEB128(nlen);
            secsz += nlen;

            totsz = secsz + 1;
            totsz += lengthULEB128(secsz);

            // encoding
            let buf = new Uint8Array(totsz);
            data = new ByteArray(buf);
            data.writeUint8(LDAT_DYLIB_INFO_TYPE);
            data.writeULEB128(secsz);

            nlen = lengthBytesUTF8(so_ident);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(so_ident);

            buffers.push(buf);
        }

        // reloc globals
        totsz = 0;
        secsz = 0;
        len = reloc_globs.length;
        for (let i = 0; i < len; i++) {
            let glob = reloc_globs[i];
            let nlen = lengthBytesUTF8(glob.module);
            secsz += lengthULEB128(nlen);
            secsz += nlen;
            nlen = lengthBytesUTF8(glob.name);
            secsz += lengthULEB128(nlen);
            secsz += nlen;
        }
        secsz += lengthULEB128(len);
        totsz = secsz + 1;
        totsz += lengthULEB128(secsz);

        let buf = new Uint8Array(totsz);
        data = new ByteArray(buf);
        data.writeUint8(LDAT_RLOC_GLB_TYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let glob = reloc_globs[i];
            let name = glob.module;
            let nlen = lengthBytesUTF8(name);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(name);
            name = glob.name;
            nlen = lengthBytesUTF8(name);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(name);
        }
        buffers.push(buf);

        // reloc data-segments
        totsz = 0;
        secsz = 0;
        len = data_section_tbl.length;
        for (let i = 0; i < len; i++) {
            let obj = data_section_tbl[i];
            let nlen = lengthBytesUTF8(obj.name);
            secsz += lengthULEB128(nlen);
            secsz += nlen;
            secsz += lengthULEB128(obj.size);

            let idx = reloc_globs.indexOf(obj.reloc_global);
            if (idx == -1)
                throw new ReferenceError("invalid data-structure");
            secsz += lengthULEB128(idx);
            secsz += lengthULEB128(obj.reloc_offset);
            secsz += lengthULEB128(obj.alignment);
        }
        secsz += lengthULEB128(len);
        totsz = secsz + 1;
        totsz += lengthULEB128(secsz);

        buf = new Uint8Array(totsz);
        data = new ByteArray(buf);
        data.writeUint8(LDAT_DATA_SEG_TYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let obj = data_section_tbl[i];
            let name = obj.name;
            let nlen = lengthBytesUTF8(name);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(name);
            data.writeULEB128(obj.size);
            let idx = reloc_globs.indexOf(obj.reloc_global);
            data.writeULEB128(idx);
            data.writeULEB128(obj.reloc_offset);
            data.writeULEB128(obj.alignment);
        }
        buffers.push(buf);

        // data-symbols
        totsz = 0;
        secsz = 0;
        len = data_symbols_tbl.length;
        for (let i = 0; i < len; i++) {
            let obj = data_symbols_tbl[i];
            let nlen = lengthBytesUTF8(obj.name);
            secsz += lengthULEB128(nlen);
            secsz += nlen;
            secsz += lengthULEB128(obj.reloc_offset);
            secsz += lengthULEB128(obj.size);

            let idx = data_section_tbl.indexOf(obj.segment);
            if (idx == -1)
                throw new ReferenceError("invalid data-structure");
            secsz += lengthULEB128(idx);

            idx = reloc_globs.indexOf(obj.reloc_global);
            if (idx == -1)
                throw new ReferenceError("invalid data-structure");
            secsz += lengthULEB128(idx);
        }
        secsz += lengthULEB128(len);
        totsz = secsz + 1;
        totsz += lengthULEB128(secsz);

        buf = new Uint8Array(totsz);
        data = new ByteArray(buf);
        data.writeUint8(LDAT_DATA_SYM_TYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let obj = data_symbols_tbl[i];
            let name = obj.name;
            let nlen = lengthBytesUTF8(name);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(name);
            data.writeULEB128(obj.reloc_offset);
            data.writeULEB128(obj.size);
            let idx = data_section_tbl.indexOf(obj.segment);
            data.writeULEB128(idx);
            idx = reloc_globs.indexOf(obj.reloc_global);
            data.writeULEB128(idx);
        }
        buffers.push(buf);

        // func-symbols's types (this is basically encoded exactly the same as wasm)
        totsz = 0;
        secsz = 0;
        len = functypes.length;
        for (let i = 0; i < len; i++) {
            let functype = functypes[i];
            let argc = functype.argc;
            let retc = functype.retc;
            secsz += lengthULEB128(argc);
            secsz += lengthULEB128(retc);
            secsz += (argc + retc + 1);
        }
        secsz += lengthULEB128(len);
        totsz = secsz + 1;
        totsz += lengthULEB128(secsz);

        buf = new Uint8Array(totsz);
        data = new ByteArray(buf);
        data.writeUint8(LDAT_FUNC_TYP_TYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let functype = functypes[i];
            let argc = functype.argc;
            let retc = functype.retc;
            data.writeUint8(0x60);
            data.writeULEB128(argc);
            let argv = functype.argv;
            for (let x = 0; x < argc; x++) {
                let type = argv[x];
                data.writeUint8(type);
            }

            data.writeULEB128(retc);
            let retv = functype.retv;
            for (let x = 0; x < retc; x++) {
                let type = retv[x];
                data.writeUint8(type);
            }
        }
        buffers.push(buf);

        // function symbols
        totsz = 0;
        secsz = 0;
        len = expfunc.length;
        for (let i = 0; i < len; i++) {
            let symbol = expfunc[i];
            let func = symbol.func;
            let symstart = secsz;
            let nlen = lengthBytesUTF8(symbol.name);
            secsz += lengthULEB128(nlen);
            secsz += nlen;
            let typeidx = functypes.indexOf(func.type);
            if (typeidx == -1)
                throw new ReferenceError("invalid data-structure");
            secsz += lengthULEB128(typeidx);

            secsz += lengthULEB128(symbol.flags);
        
            if (symbol.aliases && Array.isArray(symbol.aliases)) {
                let aliases = symbol.aliases;
                let xlen = aliases.length;
                for (let x = 0; x < xlen; x++) {
                    let name = aliases[x];
                    let nlen = lengthBytesUTF8(name);
                    secsz += lengthULEB128(nlen);
                    secsz += nlen;
                }
                secsz += lengthULEB128(xlen);
            } else {
                secsz += lengthULEB128(0);
            }

            if (symbol.element_exports && Array.isArray(symbol.element_exports)) {
                throw new ReferenceError("element_exports not supported yet");
            } else {
                secsz += lengthULEB128(0);
            }
            let symsz = secsz - symstart;
            symbol.symsz = symsz;
            secsz += lengthULEB128(symsz);
        }
        secsz += lengthULEB128(len);
        totsz = secsz + 1;
        totsz += lengthULEB128(secsz);

        buf = new Uint8Array(totsz);
        data = new ByteArray(buf);
        data.writeUint8(LDAT_FUNC_SYM_TYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let symbol = expfunc[i];
            let func = symbol.func;
            let name = symbol.name;
            let nlen = lengthBytesUTF8(name);
            data.writeULEB128(symbol.symsz);
            data.writeULEB128(nlen);
            data.writeUTF8Bytes(name);

            let typeidx = functypes.indexOf(func.type);
            data.writeULEB128(typeidx);
            data.writeULEB128(symbol.flags);
            
            // we put aliases here since it eaiser to skip.
            if (symbol.aliases && Array.isArray(symbol.aliases)) {
                let aliases = symbol.aliases;
                let xlen = aliases.length;

                data.writeULEB128(xlen);
                
                for (let x = 0; x < xlen; x++) {
                    let name = aliases[x];
                    let nlen = lengthBytesUTF8(name);
                    data.writeULEB128(nlen);
                    data.writeUTF8Bytes(name);
                }

            } else {
                data.writeULEB128(0);
            }

            // 
            if (symbol.element_exports && Array.isArray(symbol.element_exports)) {
                throw new ReferenceError("element_exports not supported yet");
            } else {
                data.writeULEB128(0);
            }
        }
        buffers.push(buf);

        totsz = 0;
        secsz = 0;
        len = buffers.length;
        for (let i = 0; i < len; i++) {
            let buf = buffers[i];
            secsz += buf.byteLength;
        }
        let hdrstart = secsz;
        secsz += lengthULEB128(YLNK_DATA_VER);
        totsz = secsz + 1;
        let nlen = lengthBytesUTF8(YLNK_DATA_NAME);
        totsz += lengthULEB128(nlen);
        totsz += nlen;
        totsz += lengthULEB128(secsz);
        let hdrsz = totsz - hdrstart;

        buf = new Uint8Array(hdrsz);
        data = new ByteArray(buf);
        data.writeUint8(0);           // encodes like a wasm custom section.
        data.writeULEB128(nlen);
        data.writeUTF8Bytes(YLNK_DATA_NAME);
        data.writeULEB128(secsz);
        data.writeULEB128(YLNK_DATA_VER);
        buffers.unshift(buf);

        len = buffers.length;
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

        let wcb_called = false;

        function write_cb(buf, offset, length) {

            if (offset === undefined || offset === null)
                offset = 0;
            if (length === undefined || length === null)
                length = buf.byteLength;

            wcb_called = true;
            
            fs.writeSync(outfd, buf, offset, length);
        }
        
        let buffers = tmod.encode({write_callback: write_cb});

        if (wcb_called)
            return;

        let len = buffers.length;
        for (let i = 0; i < len; i++) {
            let buf = buffers[i];
            fs.writeSync(outfd, buf, 0, buf.byteLength);
        }
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

module.exports = GnuStep2Linker;

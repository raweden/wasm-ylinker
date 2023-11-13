
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


/**
 * 
 * @param {GnuStep2Linker} linker
 * @param {Object} options
 * @returns {Array<Uint8Array>}
 */
function encodeYLinkerData(linker, options) {

	let _dataSections = linker._dataSections;
	let dataSegments = linker.dataSegments;
	let symtable = linker._symtable;
	let buffers = [];
	//let writefn = typeof options.write_callback == "function" ? options.write_callback : null;
	//if (!writefn) {
	//	buffers = [];
	//}

	let hdrbuf = new Uint8Array(12);
	let data = new DataView(hdrbuf.buffer);
	data.setUint32(0, 0x4E4C5921, true);
	data.setUint32(4, 0x445F524B, true);
	data.setUint32(8, 0x01, true);          // version
	buffers.push(hdrbuf);

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
	let reloc_globs = [];
	let data_section_tbl = [];
	let data_section_map = new Map();
	let data_symbols_tbl = [];
	let func_tbl = [];
	let type_tbl = [];

	let len = _dataSections.length;
	for(let i = 0;i < len;i++){
		let dataSection = _dataSections[i];
		let glob = dataSection._reloc_glob;
		if (reloc_globs.indexOf(glob) == -1)
			reloc_globs.push(glob);

		let obj = {};
		obj.name = dataSection.name;
		obj.size = dataSection._size;
		obj.reloc_global = dataSection._reloc_glob;
		obj.reloc_offset = dataSection._reloc_start;
		obj.alignment = dataSection.max_align;

		data_section_map.set(dataSection, obj);
		data_section_tbl.push(obj);
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
		let segment = sym.value;
		let obj = {};
		obj.name = sym.name;
		obj.nlen = lengthBytesUTF8(sym.name);
		let secobj;
		if (!segment.dataSection) {
			throw new ReferenceError("data-segment missing data-section");
		} else if (!data_section_map.has(segment.dataSection)) {
			throw new ReferenceError("data-section not defined");
		} else {
			secobj = data_section_map.get(segment.dataSection)
		}
		obj.segment = secobj;
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
		let so_ident = linker.so_ident;
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
	for (let i = 1; i < len; i++) {
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
	buffers.splice(1, 0, buf);

	return buffers;
}


function decodeYLinkerData(buffer) {

    let data = new ByteArray(buffer);

    const YLNK_DATA_NAME = "ylinker.linking_data";
    const YLNK_DATA_VER = 1;

    const LDAT_DYLIB_INFO_TYPE = 0x15;
    const LDAT_RLOC_GLB_TYPE = 0x16;
    const LDAT_DATA_SEG_TYPE = 0x17;
    const LDAT_DATA_SYM_TYPE = 0x18;
    const LDAT_FUNC_TBL_TYPE = 0x19;
    const LDAT_FUNC_TYP_TYPE = 0x20;
    const LDAT_FUNC_SYM_TYPE = 0x21;

    let data_section_tbl;
    let data_symbols_tbl;
    let func_symbols_tbl;
    let dylib_info;
    let reloc_globs;
    let functypes;

    if (data.readUint32() != 0x4E4C5921 || data.readUint32() != 0x445F524B || data.readUint32() != 0x01) {
    	throw TypeError("INVALID_SECTION");
    }

    let type = data.readUint8();           // encodes like a wasm custom section.
    if (type != 0) {
    	throw TypeError("INVALID_SECTION");
    }
    let nlen = data.readULEB128();
    let name = data.readUTF8Bytes(nlen);
    if (name != YLNK_DATA_NAME) {
    	throw TypeError("INVALID_SECTION");
    }
    let secsz = data.readULEB128();
    let end = data.offset + secsz;
    let version = data.readULEB128();
    if (version != YLNK_DATA_VER) {
    	throw TypeError("INVALID_SECTION");
    }

    while (data.offset < end) {
    	let payload_type = data.readUint8();
    	let payload_size = data.readULEB128();

    	if (payload_type == LDAT_DYLIB_INFO_TYPE) {

    		if (dylib_info)
    			throw TypeError("dylib_info defined twice");

    		dylib_info = {};
    		let nlen = data.readULEB128();
    		let name = data.readUTF8Bytes(nlen);
    		dylib_info.sharedObjectIdent = name;

    	} else if (payload_type == LDAT_RLOC_GLB_TYPE) {

    		if (reloc_globs)
    			throw TypeError("LDAT_RLOC_GLB_TYPE defined twice");

    		reloc_globs = [];
		    let cnt = data.readULEB128();
		    for (let i = 0; i < cnt; i++) {
		        let glob = new ImportedGlobal();
		        let nlen = data.readULEB128();
		        let name = data.readUTF8Bytes(nlen);
		        glob.module = name;
		        nlen = data.readULEB128();
		        name = data.readUTF8Bytes(nlen);
		        glob.name = name;
		        glob.type = 0x7F;
		        glob.mutable = false;
		        reloc_globs.push(glob);
		    }

    	} else if (payload_type == LDAT_DATA_SEG_TYPE) {

    		if (data_section_tbl)
    			throw TypeError("LDAT_DATA_SEG_TYPE defined twice");

    		data_section_tbl = [];
    		let cnt = data.readULEB128();
		    for (let i = 0; i < cnt; i++) {
		        let segment = {};
		        let nlen = data.readULEB128();
		        let name = data.readUTF8Bytes(nlen);
		        segment.name = name;
		        segment.size = data.readULEB128();
		        let rlocidx = data.readULEB128();
		        segment.reloc_global = reloc_globs[rlocidx];
		        segment.reloc_offset = data.readULEB128();
		        segment.alignment = data.readULEB128();
		        data_section_tbl.push(segment);
		    }

    	} else if (payload_type == LDAT_DATA_SYM_TYPE) {

    		if (data_symbols_tbl)
    			throw TypeError("LDAT_DATA_SYM_TYPE defined twice");

    		data_symbols_tbl = [];
    		let cnt = data.readULEB128();
		    for (let i = 0; i < cnt; i++) {
		        let symbol = {};
		        let nlen = data.readULEB128();
		        let name = data.readUTF8Bytes(nlen);
		        symbol.name = name;
		        symbol.reloc_global = null;
		        symbol.reloc_offset = data.readULEB128();
		        symbol.size = data.readULEB128();

		        let segmentidx = data.readULEB128();
		        symbol.segment = data_section_tbl[segmentidx];

		        let rlocidx = data.readULEB128();
		        symbol.reloc_global = reloc_globs[rlocidx];
		        data_symbols_tbl.push(symbol);
		    }

    	} else if (payload_type == LDAT_FUNC_TYP_TYPE) {

    		if (functypes)
    			throw TypeError("LDAT_FUNC_TYP_TYPE defined twice");

    		functypes = [];
    		let cnt = data.readULEB128();
		    for (let i = 0; i < cnt; i++) {

		    	let argc, retc;
		    	let argv = null;
		    	let retv = null;
		    	let prefix = data.readUint8();
		    	if (prefix != 0x60)
		    		throw TypeError("prefix not 0x60");
		        
		        argc = data.readULEB128();
		        if (argc !== 0) {
		        	argv = [];
		        }
		        for (let x = 0; x < argc; x++) {
		            let type = data.readUint8();
		            argv.push(type);
		        }

		        retc = data.readULEB128();
		        if (retc !== 0) {
		        	retv = [];
		        }
		        for (let x = 0; x < retc; x++) {
		            let type = data.readUint8();
		            retv.push(type);
		        }

		        let functype = WasmType.create(argv, retv);
		        functypes.push(functype);
		    }

    	} else if (payload_type == LDAT_FUNC_SYM_TYPE) {

    		if (func_symbols_tbl)
    			throw TypeError("LDAT_FUNC_TYP_TYPE defined twice");

    		func_symbols_tbl = [];
    		let cnt = data.readULEB128();
		    for (let i = 0; i < cnt; i++) {

		    	let symsz = data.readULEB128();
		    	let nlen = data.readULEB128();
		    	let name = data.readUTF8Bytes(nlen);
		    	let symbol = {};
		    	symbol.name = name;

		        let typeidx = data.readULEB128();
		        symbol.type = functypes[typeidx];
		        symbol.flags = data.readULEB128();

		        let zcnt = data.readULEB128();
		        if (zcnt !== 0) {
		        	let aliases = [];
		        	for (let z = 0; z < zcnt; z++) {
		        		let nlen = data.readULEB128();
		        		let name = data.readUTF8Bytes(nlen);
		        		aliases.push(name);
		        	}

		        	symbol.aliases = aliases;
		        } else {
		        	symbol.aliases = null;
		        }

		        zcnt = data.readULEB128();
		        if (zcnt !== 0) {
		        	throw new ReferenceError("element_exports not supported yet");
		        	let funcrefs = [];
		        	for (let z = 0; z < zcnt; z++) {
		        	}
		        } else {

		        }

		        func_symbols_tbl.push(symbol);
		    }

    	} else {
    		throw TypeError("unexpected payload_type");
    	} 
    }

    debugger;

    let info = {};
    info.dylib_info = dylib_info;
    info.reloc_globs =  reloc_globs;
    info.types = functypes;
   	info.data_sections = data_section_tbl;
   	info.data_symbols =  data_symbols_tbl;
   	info.func_symbols = func_symbols_tbl;
    return info;
}

module.exports.encodeYLinkerData = encodeYLinkerData;
module.exports.decodeYLinkerData = decodeYLinkerData;



function encodeYLinkerData(linker) {

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



class WebAssemblyCustomRelocCMD extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "reloc.CMD");
        this._reloc_groups = undefined;
    }

    encode(options) {

    	let reloc_groups = this._reloc_groups;
        let secsz, totsz = 0;
        let count = 0;
        let len = reloc_groups.length;
        for (let y = 0; y < len; y++) {
        	let reloc_grp = reloc_groups[y];
        	let src = reloc_grp.src;
        	let dst = reloc_grp.dst;
        	let nlen = lengthBytesUTF8(src.module);
        	totsz += lengthULEB128(nlen);
        	totsz += nlen;
        	nlen = lengthBytesUTF8(src.name);
        	totsz += lengthULEB128(nlen);
        	totsz += nlen;
        	nlen = lengthBytesUTF8(dst.module);
        	totsz += lengthULEB128(nlen);
        	totsz += nlen;
        	nlen = lengthBytesUTF8(dst.name);
        	totsz += lengthULEB128(nlen);
        	totsz += nlen;

        	if (reloc_grp.type == 0x02) {

        		let vector = reloc_grp.vector;
	          	let xlen = vector.length;
	            for (let x = 0; x < xlen; x++) {
	                let reloc = vector[x];
	                totsz += lengthULEB128(reloc.src_idx);
	                totsz += lengthULEB128(reloc.dst_off);
	            }

	            totsz += lengthULEB128(xlen);

        	} else if (reloc_grp.type == 0x05) {

        		let vector = reloc_grp.vector;
	          	let xlen = vector.length;
	            for (let x = 0; x < xlen; x++) {
	                let reloc = vector[x];
	                totsz += lengthULEB128(reloc.src_off);
	                totsz += lengthULEB128(reloc.dst_off);
	            }

	            totsz += lengthULEB128(xlen);

        	}

            totsz += 1; // reloc kind
        }

        const SECTION_NAME = this.name;

        totsz += lengthULEB128(len);
        let strlen = lengthBytesUTF8(SECTION_NAME);
        totsz += lengthULEB128(strlen);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
        data.writeULEB128(strlen);
        data.writeUTF8Bytes(SECTION_NAME);
        data.writeULEB128(len);

        for (let y = 0; y < len; y++) {
        	let nlen, reloc_grp = reloc_groups[y];
        	let src = reloc_grp.src;
        	let dst = reloc_grp.dst;
        	data.writeUint8(reloc_grp.type);

        	nlen = lengthBytesUTF8(src.module);
        	data.writeULEB128(nlen);
        	data.writeUTF8Bytes(src.module);

        	nlen = lengthBytesUTF8(src.name);
        	data.writeULEB128(nlen);
        	data.writeUTF8Bytes(src.name);

        	nlen = lengthBytesUTF8(dst.module);
        	data.writeULEB128(nlen);
        	data.writeUTF8Bytes(dst.module);

        	nlen = lengthBytesUTF8(dst.name);
        	data.writeULEB128(nlen);
        	data.writeUTF8Bytes(dst.name);

        	if (reloc_grp.type == 0x02) {

        		let vector = reloc_grp.vector;
	          	let xlen = vector.length;
	          	data.writeULEB128(xlen);
	            for (let x = 0; x < xlen; x++) {
	                let reloc = vector[x];
	                data.writeULEB128(reloc.src_idx);
	                data.writeULEB128(reloc.dst_off);
	            }

	            totsz += lengthULEB128(xlen);

        	} else if (reloc_grp.type == 0x05) {

        		let vector = reloc_grp.vector;
	          	let xlen = vector.length;
	          	data.writeULEB128(xlen);
	            for (let x = 0; x < xlen; x++) {
	                let reloc = vector[x];
	                data.writeULEB128(reloc.src_off);
	                data.writeULEB128(reloc.dst_off);
	            }

        	}
        }

        return buf;
    }
}

class WebAssemblyCustomSectionNetBSDDylink extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "netbsd.dylink.0");
        this.dylinkData = undefined;
    }

	static decode(module, data, size) {

        let dlen = data.readULEB128(dlen);
		let jsonData = data.readUTF8Bytes(dlen);
		jsonData = JSON.parse(jsonData);

		let sec = new WebAssemblyCustomSectionNetBSDDylink(module);
		sec.dylinkData = jsonData;

		return sec;
    }

    encode(options) {

		// For now we simply use JSON, as the ABI for this are likley to change during development.
		// Later there would be a advantage of having this in a binary format that can be read easy in plain c.
    	let dylinkData = this.dylinkData;
        let secsz, totsz = 0;
		let jsonData = JSON.stringify(dylinkData);

		let dlen = lengthBytesUTF8(jsonData);
        totsz += lengthULEB128(dlen);
		totsz += dlen;

        const SECTION_NAME = this.name;

        let strlen = lengthBytesUTF8(SECTION_NAME);
        totsz += lengthULEB128(strlen);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
        data.writeULEB128(strlen);
        data.writeUTF8Bytes(SECTION_NAME);
        data.writeULEB128(dlen);
		data.writeUTF8Bytes(jsonData);

        return buf;
    }
}



/**
 * Validates certain aspect of the module structure.
 * This is used during test phase and development to ensure that changes does output a valid module.
 * 
 * - That all imports also appear in .imports
 * - That a reference to a function only appear once in .functions
 * 
 * Upon invalid entry found this function throws.
 * 
 * @param {WebAssemblyModule|GnuStep2Linker} wasmModule
 * @returns {void}
 */
function validateWasmModule(wasmModule) {

	let dataSegments = wasmModule.dataSegments;
	let functions = wasmModule.functions;
	let globals = wasmModule.globals;
	let memory = wasmModule.memory;
	let tables = wasmModule.tables;
	let tags = wasmModule.tags;
	let imports = wasmModule.imports;
	let errors = [];
	let dupmap = new Map();

	let len = functions.length;
	for (let i = 0; i < len; i++) {
		let func = functions[i];
		if (func instanceof ImportedFunction) {
			let idx = imports.indexOf(func);
			if (idx === -1) {
				errors.push({text: "UNDECLARED_IMPORT", value: func, index: i});
			}
		}
		let next = functions.indexOf(func, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(func)) {
				err = dupmap.get(func);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_FUNC_REF", value: func};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(func, err);
			}
		}
	}

	dupmap.clear();
	len = globals.length;
	for (let i = 0; i < len; i++) {
		let glob = globals[i];
		if (glob instanceof ImportedGlobal) {
			let idx = imports.indexOf(glob);
			if (idx === -1) {
				errors.push({text: "UNDECLARED_IMPORT", value: glob, index: i});
			}
		}
		let next = globals.indexOf(glob, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(glob)) {
				err = dupmap.get(glob);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_GLOB_REF", value: glob};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(glob, err);
			}
		}
	}

	dupmap.clear();
	len = tables.length;
	for (let i = 0; i < len; i++) {
		let table = tables[i];
		if (table instanceof ImportedTable) {
			let idx = imports.indexOf(table);
			if (idx === -1) {
				errors.push({text: "UNDECLARED_IMPORT", value: table, index: i});
			}
		}
		let next = tables.indexOf(table, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(table)) {
				err = dupmap.get(table);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_TABLE_REF", value: table};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(table, err);
			}
		}
	}

	dupmap.clear();
	len = memory.length;
	for (let i = 0; i < len; i++) {
		let mem = memory[i];
		if (mem instanceof ImportedMemory) {
			let idx = imports.indexOf(mem);
			if (idx === -1) {
				errors.push({text: "UNDECLARED_IMPORT", value: mem, index: i});
			}
		}
		let next = memory.indexOf(mem, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(mem)) {
				err = dupmap.get(mem);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_MEMORY_REF", value: mem};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(mem, err);
			}
		}
	}

	dupmap.clear();
	len = tags.length;
	for (let i = 0; i < len; i++) {
		let tag = tags[i];
		if (tag instanceof ImportedTag) {
			let idx = imports.indexOf(tag);
			if (idx === -1) {
				errors.push({text: "UNDECLARED_IMPORT", value: tag, index: i});
			}
		}
		let next = tags.indexOf(tag, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(tag)) {
				err = dupmap.get(tag);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_TAG_REF", value: tag};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(tag, err);
			}
		}
	}

	dupmap.clear();
	len = dataSegments.length;
	for (let i = 0; i < len; i++) {
		let dataSegment = dataSegments[i];
		let next = dataSegments.indexOf(dataSegment, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(dataSegment)) {
				err = dupmap.get(dataSegment);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_DATA_REF", value: dataSegment};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(dataSegment, err);
			}
		}
	}

	if (errors.length > 0) {
		let err = {};
		err.message = "WASM_VALIDATION_ERROR";
		err.errors = errors;
		throw err;
	}

	return;
}

/**
 * Validates that there is no more than one reference of each WasmDataSegment within the .dataSegments array.
 * 
 * Upon invalid entry found this function throws.
 * 
 * @param {Array<WasmDataSegment>} dataSegments
 * @returns {void}
 */
function validateWasmModuleDataSegments(dataSegments) {

	let errors = [];
	let dupmap = new Map();

	let len = dataSegments.length;
	for (let i = 0; i < len; i++) {
		let dataSegment = dataSegments[i];
		let next = dataSegments.indexOf(dataSegment, i + 1);
		if (next !== -1) {
			let err;
			if (dupmap.has(dataSegment)) {
				err = dupmap.get(dataSegment);
				err.indexes.push(next);
			} else {
				err = {text: "DUPLICATE_DATA_REF", value: dataSegment};
				err.indexes = [i, next];
				errors.push(err);
				dupmap.set(dataSegment, err);
			}
		}
	}

	if (errors.length > 0) {
		let err = {};
		err.message = "WASM_VALIDATION_ERROR";
		err.errors = errors;
		throw err;
	}

	return;
}
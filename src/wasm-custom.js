
class DataSegmentStartSymbol {
    
    constructor(dataSegment) {
        this.dataSegment = dataSegment;
    }
}

class DataSegmentEndSymbol {
    
    constructor(dataSegment) {
        this.dataSegment = dataSegment;
    }
}

class RuntimeLinkingSymbol {

	constructor(module, name, type) {
		this.kind = 0x00;	// SYMTAB_FUNCTION
		this.module = module;
		this.name = name;
		this.type = type;
	}
}


const NB_SECTRAITS_REQUIRED = 0x01;
const NB_SECTRAITS_DYLINK = 0x02;
const NB_SECTRAITS_DEBUG = 0x03;
const NB_SECTRAITS_METADATA = 0x04;
const NB_SECTRAITS_OTHER = 0x05;


/**
 * exec_traits: String
 * exec_flags: i32
 * exec_end_offset: i32
 * wasm_features: vec<String> (vector of String)
 * 
 *   SectionSmall:
 *   u8 wasm section prefix
 *   u8 traits flag
 *   i32 offset into file
 *   i32 length of section
 * 
 * section_table: vec<SectionSmall>
 * 
 * each propery is encoded as:
 * uleb string-length | bytes string-data | uleb value-length
 */
class WebAssemblyCustomSectionNetBSDExecHeader extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "netbsd.exec-hdr");
        this._data = undefined;
    }

	static decode(module, data, size) {

		let vers;
		let ptr, len, namesz, secname;
		let execdata = {};
		let secinfo_arr = [];
		let hdroff, tmpoff, secinfo_off;

		// custom sections enters directly after custom-section name
		hdroff = data.offset;
		execdata._hdrsz = data.readUint32();
		vers = data.readUint32();					// version
		if (vers != 1)
			throw new TypeError("wrong header version");
		execdata.exec_type = data.readUint32();
		execdata.exec_traits = data.readUint32();
		execdata.stack_size_hint = data.readUint32();
		execdata.exec_start_elemidx = data.readInt32();
		execdata.exec_start_funcidx = data.readInt32();
		execdata.runtime_abi_traits = data.readUint16();
		namesz = data.readUint16();
		execdata.runtime_abisz = namesz;
		ptr = data.readUint32();
		if (namesz > 0 && ptr != 0) {
			tmpoff = data.offset;
			data.offset = ptr + hdroff;
			data.readUTF8Bytes(namesz);
			data.offset = tmpoff;
		} else {
			execdata.runtime_abi = undefined;
		}

		

		len = data.readUint32();
		secinfo_off = data.readUint32();
		if (len > 0 && secinfo_off != 0) {
			data.offset = secinfo_off + hdroff;
			for (let i = 0; i < len; i++) {
				let namesz, secinfo = {};
				secinfo._byteOffset = data.readUint32();
				secinfo._byteLength = data.readUint32();
				ptr = data.readUint32();
				namesz = data.readUint16();
				if (ptr != 0) {
					tmpoff = data.offset;
					data.offset = ptr + hdroff;
					secinfo.name = data.readUTF8Bytes(namesz);
					data.offset = tmpoff;
				}
				secinfo.type = data.readUint8();
				secinfo.traits = data.readUint8();
				secinfo_arr.push(secinfo);
			}
		}

		execdata.secinfo_arr = secinfo_arr;

		let sec = new WebAssemblyCustomSectionNetBSDExecHeader(module);
		sec.data = execdata;

		return sec;
    }

    encode(options) {

		// For now we simply use JSON, as the ABI for this are likley to change during development.
		// Later there would be a advantage of having this in a binary format that can be read easy in plain c.
		let module = this.module;
    	let execdata = this._data;
		let strlen, hdroff, hdrsz, valsz, secsz = 0;
		let secinfo_size;
		let secinfo_off;
		let strtbl_off;
		let strtbl_size;
        let totsz = 0;
		let wasm_features;
		let secinfo_arr;
		let tmpoff;
		// properties
		let exec_type;
		let exec_traits;
		let stack_size_hint;
		let runtime_abi_traits;
		let runtime_abisz;
		let runtime_abi;
		let exec_start_elemidx;
		let exec_start_funcidx;

		strtbl_size = 0;	// combined later
		secsz = 44; 		// size of struct wash_exechdr
		secinfo_off = secsz;

		runtime_abi = execdata.runtime_abi;
		if (typeof runtime_abi != "string" || runtime_abi.length == 0) {
			runtime_abi = undefined;
		} else {
			runtime_abi = execdata.runtime_abi;
			runtime_abisz = lengthBytesUTF8(runtime_abi);
			strtbl_size += runtime_abisz + 1; // NULL terminated
		}

		// 
		exec_type = Number.isInteger(execdata.exec_type) ? execdata.exec_type : 0;
		exec_traits = Number.isInteger(execdata.exec_traits) ? execdata.exec_traits	: 0;
		stack_size_hint = Number.isInteger(execdata.stack_size_hint) ? execdata.stack_size_hint : 0;
		runtime_abi_traits = Number.isInteger(execdata.runtime_abi_traits) ? execdata.runtime_abi_traits : 0;

		if (Number.isInteger(execdata.exec_start_elemidx)) {
			exec_start_elemidx = execdata.exec_start_elemidx;
		} else if (execdata.exec_start_elem instanceof WasmElementSegment) {
			exec_start_elemidx = module.elementSegments.indexOf(execdata.exec_start_elem);
			if (exec_start_elemidx == -1)
				throw new ReferenceError("ElementSegment not defined");
		} else {
			exec_start_elemidx = -1;
		}

		if (Number.isInteger(execdata.exec_start_funcidx)) {
			exec_start_funcidx = execdata.exec_start_funcidx;
		} else if (execdata.exec_start_func instanceof WasmFunction) {
			if (exec_start_elemidx == -1)
				throw new ReferenceError("elemidx not provided");
			let segment = module.elementSegments[exec_start_elemidx];
			exec_start_funcidx = segment.vector.indexOf(execdata.exec_start_func);
			if (exec_start_funcidx == -1)
				throw new ReferenceError("func not defined");
		} else {
			exec_start_funcidx = -1;
		}

		secinfo_arr = [];
		secinfo_size = 0;
		let sections = module.sections;
		let len = sections.length;

		for (let i = 0; i < len; i++) {
			let traits, type, sec = sections[i];
			let namesz, name;
			traits = undefined;
			namesz = 0;
			type = sec.type;
			if (type > 0 && type < 0x0E) {
				traits = NB_SECTRAITS_REQUIRED;
			} else if (type == 0) {
				name = sec.name;
				if (name == "netbsd.exec-hdr" || name == "netbsd.dylink.0") {
					traits = NB_SECTRAITS_DYLINK;
				} else if (name == "name") {
					traits = NB_SECTRAITS_DEBUG;
				} else if (name == "producers") {
					traits = NB_SECTRAITS_METADATA;
				}

				// TODO: truncate long names 
				namesz = lengthBytesUTF8(name);
				if (namesz > 64) { 		// ignore to large names..
					name = undefined;
					namesz = 0;
				} else {
					strtbl_size += namesz + 1;
				}
			}

			if (traits === undefined)
				continue;

			secinfo_size += 16;		// size of struct wasm_exechdr_secinfo
			
			secinfo_arr.push({type: sec.type, traits: traits, index: i, offset: -1, section: sec, namesz: namesz, name: name});
		}

		strtbl_off = secinfo_off + secinfo_size;
		secsz += secinfo_size;
		secsz += strtbl_size;
		hdrsz = secsz;

		const SECTION_NAME = this.name;
        strlen = lengthBytesUTF8(SECTION_NAME);
        secsz += strlen + lengthULEB128(strlen);
        totsz += secsz + lengthULEB128(secsz);

		// actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
		this._dylink0_hdroff = data.offset;
        data.writeULEB128(strlen);
        data.writeUTF8Bytes(SECTION_NAME);
		hdroff = data.offset;
		strtbl_off += hdroff;
		data.writeUint32(hdrsz);
		data.writeUint32(1);					// version
		data.writeUint32(exec_type);
		data.writeUint32(exec_traits);
		data.writeUint32(stack_size_hint);
		data.writeInt32(exec_start_elemidx);
		data.writeInt32(exec_start_funcidx);
		data.writeUint16(runtime_abi_traits);
		data.writeUint16(runtime_abisz);
		if (runtime_abi) {
			data.writeUint32(strtbl_off - hdroff);
			tmpoff = data.offset;
			data.offset = strtbl_off;
			data.writeUTF8Bytes(runtime_abi);
			strtbl_off = data.offset + 1;
			data.offset = tmpoff;
		} else {
			data.writeUint32(0);
		}

		

		len = secinfo_arr.length;
		data.writeUint32(len);
		data.writeUint32(secinfo_off);
		for (let i = 0; i < len; i++) {
			let secinfo = secinfo_arr[i];
			secinfo.offset = data.offset;
			data.offset += 8; // file_offset + sec_size
			if (secinfo.name) {
				data.writeUint32(strtbl_off - hdroff);
				tmpoff = data.offset;
				data.offset = strtbl_off;
				data.writeUTF8Bytes(secinfo.name);
				strtbl_off = data.offset + 1;
				data.offset = tmpoff;
			} else {
				data.writeUint32(0);
			}
			data.writeUint8(secinfo.namesz);
			data.writeUint8(0);
			data.writeUint8(secinfo.type);
			data.writeUint8(secinfo.traits);
		}

		
		options.add_finalizing_callback(function(module, buffer) {
			
			let data = new ByteArray(buffer);
			let len = secinfo_arr.length;
			for (let i = 0; i < len; i++) {
				let obj = secinfo_arr[i];
				let sec = obj.section;
				data.offset = obj.offset;
				data.writeUint32(sec._byteOffset);
				data.writeUint32(sec._byteLength);
				data.offset = obj.offset + 13; // file_offset + sec_size + name-ptr + namesz (u8)
				data.writeUint8(sec._dylink0_hdroff);
			}
		});

        return buf;
    }
}


const NBDL_SUBSEC_MODULES = 0x01;
const NBDL_SUBSEC_DATASEG = 0x02;	// not used
const NBDL_SUBSEC_DATAEXP = 0x03;	// not used (replaced by .dynsym)
const NBDL_SUBSEC_FUNCEXP = 0x04;	// not used (replaced by .dynsym)
const NBDL_SUBSEC_DATAREQ = 0x05;	// not used
const NBDL_SUBSEC_FUNCREQ = 0x06;	// not used
const NBDL_SUBSEC_RLOCEXT = 0x07;
const NBDL_SUBSEC_RLOCINT = 0x08;

const _RTLD_SEGMENT_ZERO_FILL = 1 << 3;

/**
 * declares visiable exports in tables and data-segments
 * 
 * @todo Consider to add fields like elf into sub-section #1 (support: search-path, )
 * @todo Consider to make NBDL_SUBSEC_MODULES fixed ontop header, and to implement a jump offset table at top.
 * @todo try to reference the data-segment of dylink.0 explicity, this might solve the issue plus we cannot use the native anyways when .bss is not written,
 */
class WebAssemblyCustomSectionNetBSDDylinkV2 extends WebAssemblyCustomSection {

	constructor(module) {
        super(module, "netbsd.dylink.0");
        this._dl_data = undefined;
    }

	static decode(module, data, size, name, options) {

		let decode_relocs = options && options.hasOwnProperty("decode_relocs") ? options.decode_relocs : true;
		let mdata = {
			module_name: null,
			module_vers: null,
		};

		let subcnt = data.readULEB128();
		for (let i = 0; i < subcnt; i++) {
			let type = data.readUint8();
			let size = data.readULEB128();
			let sec_start = data.offset;
			if (type == NBDL_SUBSEC_MODULES) {
				let namelen = data.readULEB128();
				if (namelen > 0) {
					mdata.module_name = data.readUTF8Bytes(namelen);
				}
				namelen = data.readULEB128();
				if (namelen > 0) {
					mdata.module_vers = data.readUTF8Bytes(namelen);
				}

				let arr = [];
				let xlen = data.readULEB128();
				for (let x = 0; x < xlen; x++) {
					let obj = {type: 0, name: null, version: null};
					obj.type = data.readUint8();
					namelen = data.readULEB128();
					obj.name = data.readUTF8Bytes(namelen);
					let varr = [];
					let ylen = data.readULEB128();
					for (let y = 0; y < ylen; y++) {
						let val, vtype = data.readUint8();
						if (vtype === 1) {
							namelen = data.readULEB128();
							val = data.readUTF8Bytes(namelen);
						} else if (vtype === 2) {
							val = {};
							namelen = data.readULEB128();
							val.min = data.readUTF8Bytes(namelen);
							namelen = data.readULEB128();
							val.max = data.readUTF8Bytes(namelen);
						} else {
							throw new TypeError("UNSUPPORTED_VERS_TYPE");
						}
						varr.push(val);
					}
					if (ylen == 1 && typeof varr[0] == "string") {
						obj.version = varr[0];
					} else if (ylen === 0) {
						obj.version = null;
					} else {
						obj.version = varr;
					}
					arr.push(obj);
				}

				mdata.dep_modules = arr;

				arr = [];
				xlen = data.readULEB128();
				for (let x = 0; x < xlen; x++) {
					let obj = {type: 0, name: null, segidx: 0, align: 0, size: 0};
					obj.type = data.readUint8();
					namelen = data.readULEB128();
					obj.name = data.readUTF8Bytes(namelen);
					obj.segidx = data.readULEB128();
					obj.align = data.readULEB128();
					obj.size = data.readULEB128();
					arr.push(obj);
				}

				mdata.func_segments = arr;

				arr = [];
				xlen = data.readULEB128();
				for (let y = 0; y < xlen; y++) {
					let obj = {};
					obj.segidx = data.readULEB128();
					obj.flags = data.readULEB128();
					obj.max_align = data.readULEB128();
					obj.size = data.readULEB128();
					let namesz = data.readULEB128();
					obj.name = data.readUTF8Bytes(namesz);
					arr.push(obj);
				}

				mdata.data_segments = arr;

				// ensure we reached the end.
				data.offset = sec_start + size;

			} else if (type == NBDL_SUBSEC_DATASEG) {

				

				// ensure we reached the end.
				data.offset = sec_start + size;

			} else if (type == NBDL_SUBSEC_DATAEXP) {

				let arr = [];
				let ylen = data.readULEB128();
				for (let y = 0; y < ylen; y++) {
					let obj = {};
					let namesz = data.readULEB128();
					obj.name = data.readUTF8Bytes(namesz);
					obj.segidx = data.readULEB128();
					obj.reloc = data.readULEB128();
					
					arr.push(obj);
				}

				mdata.data_symbols = arr;

				// ensure we reached the end.
				data.offset = sec_start + size;

			} else if (type == NBDL_SUBSEC_FUNCEXP) {

				let types = module.types;
				let typemax = types.length;
				let arr = [];
				let ylen = data.readULEB128();
				for (let y = 0; y < ylen; y++) {
					let obj = {};
					let namesz = data.readULEB128();
					obj.name = data.readUTF8Bytes(namesz);
					obj.funcidx = data.readULEB128();
					let typeidx = data.readULEB128();
					obj.elemidx = data.readULEB128();
					if (typeidx < 0 || typeidx >= typemax)
						throw RangeError("typeidx out of range");
					obj.type = types[typeidx];
					
					arr.push(obj);
				}

				mdata.func_symbols = arr;

				// ensure we reached the end.
				data.offset = sec_start + size;

			} else if (type == NBDL_SUBSEC_RLOCEXT) {

				let arr = [];
				let ylen = data.readULEB128();
				for (let y = 0; y < ylen; y++) {
					let jmpoff, jmpsz, namesz;
					let obj = {};
					obj.type = data.readUint8();
					jmpsz = data.readULEB128();
					jmpoff = data.offset; // TODO: add options to read relocs
					namesz = data.readULEB128();
					obj.name = data.readUTF8Bytes(namesz);
					arr.push(obj);
					
					if (decode_relocs) {
					
						let relocs = [];
						let xlen = data.readULEB128();
						for (let x = 0; x < xlen; x++) {
							let dst_off = data.readULEB128();
							let src_off = data.readULEB128();
							relocs.push(dst_off, src_off);
						}

						obj.uleb_relocs = relocs;

						relocs = [];
						xlen = data.readULEB128();
						for (let x = 0; x < xlen; x++) {
							let dst_off = data.readULEB128();
							let src_off = data.readULEB128();
							relocs.push(dst_off, src_off);
						}

						obj.sleb_relocs = relocs;

						relocs = [];
						xlen = data.readULEB128();
						for (let x = 0; x < xlen; x++) {
							let dst_idx = data.readULEB128();
							let dst_off = data.readULEB128();
							let src_off = data.readULEB128();
							relocs.push(dst_idx, dst_off, src_off);
						}

						obj.data_relocs = relocs;
					} else {
						data.offset = jmpoff + jmpsz;
					}
				}

				mdata.needed_symbols = arr;

				// ensure we reached the end.
				data.offset = sec_start + size;

			} else if (type == 0x000) {

			} else if (type == 0x000) {

			} else {
				data.offset += size;
			}
		}
        

		let sec = new WebAssemblyCustomSectionNetBSDDylinkV2(module);
		sec.data = mdata;

		return sec;
    }

    encode(options) {

		// Later there would be a advantage of having this in a binary format that can be read easy in plain c.
		let module = this.module;
    	let mdata = this._data;
		let buf, data;
        let secsz = 0;
		let totsz = 0;
		let subsections = [];
		let subtotsz, subsecsz = 0;

		let dataSections = mdata.dataSections;
		let modules = mdata.modules;
		let exp_data_symbols = mdata.exp_data_symbols;
		let exp_func_symbols = mdata.exp_func_symbols;
		let ext_code_relocs = mdata.ext_code_relocs;
		let ext_data_relocs = mdata.ext_data_relocs;
		let int_code_relocs = mdata.int_code_relocs;
		let int_data_relocs = mdata.int_data_relocs;

		// encoding modules
		let strlen;
		let mod_namesz, mod_verssz;
		let mod_name = "";
		let mod_vers = "";
		if (module._dylink_profile && typeof module._dylink_profile.module_name == "string") {
			mod_name = module._dylink_profile.module_name;
		}
		if (module._dylink_profile && typeof module._dylink_profile.module_vers == "string") {
			mod_vers = module._dylink_profile.module_vers;
		}
		// sub-section header
		strlen = lengthBytesUTF8(mod_name);
		subsecsz += strlen + lengthULEB128(strlen);
		mod_namesz = strlen;
		strlen = lengthBytesUTF8(mod_vers);
		subsecsz += strlen + lengthULEB128(strlen);
		mod_verssz = strlen;

		let len = modules.length;
		for (let i = 0; i < len; i++) {
			let mod = modules[i];
			let type = 0x01;
			let strlen = lengthBytesUTF8(mod.name);
			subsecsz += 1;
			subsecsz += lengthULEB128(strlen);
			subsecsz += strlen;
			if (mod.version == null) {
				subsecsz += lengthULEB128(0);
			} else if (typeof mod.version == "string") {
				subsecsz += 1; // vers-type
				strlen = lengthBytesUTF8(mod.version);
				subsecsz += strlen + lengthULEB128(strlen) + 1;
			} else if (Array.isArray(mod.version)) {
				let arr = mod.version;
				let xlen = arr.length;
				subsecsz += lengthULEB128(xlen);
				for (let x = 0; x < xlen; x++) {
					let vers = arr[x];
					if (typeof mod.version == "string") {
						strlen = lengthBytesUTF8(vers);
						subsecsz += strlen + lengthULEB128(strlen) + 1;
					} else if (typeof vers == "object" && vers !== null && typeof vers.min == "string" && typeof vers.max == "string") {
						let min = vers.min;
						let max = vers.max;
						subsecsz += 1; // vers-type
						strlen = lengthBytesUTF8(min);
						subsecsz += strlen + lengthULEB128(strlen);
						strlen = lengthBytesUTF8(max);
						subsecsz += strlen + lengthULEB128(strlen);
					} else {
						throw new TypeError("Invalid module.version[x] data");
					}
				}
			}
		}

		subsecsz += lengthULEB128(len);

		let elementSegments = module.elementSegments;
		len = elementSegments.length;
		for (let i = 0; i < len; i++) {
			let elem = elementSegments[i];
			let type = 0;
			let align = 0;
			let name = elem[__nsym];
			let namesz = typeof name == "string" ? lengthBytesUTF8(name) : 0;
			subsecsz += 1;	// type
			subsecsz += lengthULEB128(namesz) + namesz;
			subsecsz += lengthULEB128(i); // segidx
			subsecsz += lengthULEB128(align);
			subsecsz += lengthULEB128(elem.vector.length);
		}

		subsecsz += lengthULEB128(len);

		let _dataSegments = module.dataSegments;
		len = dataSections.length;
		for (let i = 0; i < len; i++) {
			let section = dataSections[i];
			let dataSegment = section.dataSegment;
			let strlen, name = section.name;
			// TODO: .bss should not be in _dataSegments
			let segidx = _dataSegments.indexOf(dataSegment);
			if (segidx === -1) {
				console.error("data-segment %s not defined in module", name);
				throw new ReferenceError("DataSegment not defined on module");
			}
			if (segidx != i) {
				throw new Error("found the reloc bug!");
			}
			let loc = dataSegment._dylink0_loc;
			let flags = 0;
			if (name == ".bss") {
				flags |= _RTLD_SEGMENT_ZERO_FILL;
			}
			dataSegment._dylink0_flags = flags;
			strlen = lengthBytesUTF8(name);
			subsecsz += strlen + lengthULEB128(strlen);
			subsecsz += lengthULEB128(loc);
			subsecsz += lengthULEB128(flags);		// flags
			subsecsz += lengthULEB128(section.max_align);
			subsecsz += lengthULEB128(dataSegment.size);
		}

		subsecsz += lengthULEB128(len);

		// field count
		subsecsz += lengthULEB128(0);

		// TODO: could move data-segments & element-segments into module(s) as well..

		
		subtotsz = subsecsz + 1 + lengthULEB128(subsecsz);

		buf = new Uint8Array(subtotsz);
		data = new ByteArray(buf);
		data.writeUint8(NBDL_SUBSEC_MODULES);
		data.writeULEB128(subsecsz);
		data.writeULEB128(mod_namesz);
		data.writeUTF8Bytes(mod_name);
		data.writeULEB128(mod_verssz);
		data.writeUTF8Bytes(mod_vers);

		// dependent on modules length
		len = modules.length;
		data.writeULEB128(len);
		for (let i = 0; i < len; i++) {
			let mod = modules[i];
			let type = 0x01;
			let name = mod.name;
			let strlen = lengthBytesUTF8(name);
			data.writeUint8(1);	// module-type
			data.writeULEB128(strlen);
			data.writeUTF8Bytes(name);
			if (mod.version == null) {
				data.writeULEB128(0); // vector-count
			} else if (typeof mod.version == "string") {
				let vers = mod.version;
				data.writeULEB128(1); // vector-count
				data.writeUint8(1); // vers-type
				strlen = lengthBytesUTF8(vers);
				data.writeULEB128(strlen);
				data.writeUTF8Bytes(vers);
			} else if (Array.isArray(mod.version)) {
				let arr = mod.version;
				let xlen = arr.length;
				data.writeULEB128(xlen);
				for (let x = 0; x < xlen; x++) {
					let vers = arr[x];
					if (typeof mod.version == "string") {
						data.writeUint8(1); // vers-type
						strlen = lengthBytesUTF8(vers);
						data.writeULEB128(strlen);
						data.writeUTF8Bytes(vers);
					} else if (typeof vers == "object" && vers !== null && typeof vers.min == "string" && typeof vers.max == "string") {
						let min = vers.min;
						let max = vers.max;
						data.writeUint8(2); // vers-type
						strlen = lengthBytesUTF8(min);
						data.writeULEB128(strlen);
						data.writeUTF8Bytes(min);
						strlen = lengthBytesUTF8(max);
						data.writeULEB128(strlen);
						data.writeUTF8Bytes(max);
					}
				}
			}
		}

		// self module element-segments
		len = elementSegments.length;
		data.writeULEB128(len);
		for (let i = 0; i < len; i++) {
			let elem = elementSegments[i];
			let type = 0;
			let align = 0;
			let name = elem[__nsym];
			let namesz = typeof name == "string" ? lengthBytesUTF8(name) : 0;
			data.writeUint8(type);
			data.writeULEB128(namesz);
			if (namesz > 0) {
				data.writeUTF8Bytes(name);
			}
			data.writeULEB128(i); // segidx
			data.writeULEB128(align);
			data.writeULEB128(elem.vector.length);
			// TODO: add encoded-size so that it can be used to read elem section directly for related data..
			// missing are elemtype/reftype
		}

		// self module data-segments
		len = dataSections.length;
		data.writeULEB128(len);
		for (let i = 0; i < len; i++) {
			let section = dataSections[i];
			let dataSegment = section.dataSegment;
			let strlen, name = section.name;
			let loc = dataSegment._dylink0_loc;
			let flags = dataSegment._dylink0_flags;
			strlen = lengthBytesUTF8(name);
			data.writeULEB128(loc);
			data.writeULEB128(flags);
			data.writeULEB128(section.max_align);
			data.writeULEB128(dataSegment.size);
			data.writeULEB128(strlen);
			data.writeUTF8Bytes(name);

		}

		// field count
		data.writeULEB128(0);

		subsections.push(buf);
		secsz += buf.byteLength;

		function getElementForFunc(func) {
			let len = elementSegments.length;
			for (let i = 0; i < len; i++) {
				let elem = elementSegments[i];
				let funcidx = elem.vector.indexOf(func);
				if (funcidx != -1) {
					return {elem: elem, elemidx: i, funcidx: funcidx};
				}
			}

			return null;
		}

		// 
		let external_relocs = [];

		function findModule(name, version) {
			let len = modules.length;
			for (let i = 0; i < len; i++) {
				let m = modules[i];
				if (m.name == name && m.version == version) {
					return m;
				}
			}

			return null;
		}

		function findExternalReloc(module, type, name) {
			let len = external_relocs.length;
			for (let i = 0; i < len; i++) {
				let obj = external_relocs[i];
				if (obj.type == type && obj.name == name && obj.module == module) {
					return obj;
				}
			}

			let obj = {};
			obj.type = type;
			obj.module = module;
			obj.name = name;
			obj.sleb_relocs = [];
			obj.uleb_relocs = [];
			obj.data_relocs = [];

			external_relocs.push(obj);
			
			return obj;
		}

		// encoding data-relocs dependant on external symbols.
		len = ext_code_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = ext_code_relocs[i];
			let dst_off, src_off;
			if (rloc.ref.type == 1) {			// data

			} else if (rloc.ref.type == 0) {	// func
				
			}

			dst_off = rloc.inst._roff;
			if (dst_off == -1 || dst_off == 0)
				throw new TypeError("INVALID_DST_OFF");

			src_off = 0;

			let mod = rloc.ref._reloc  && rloc.ref._reloc.reloc_global.module ? findModule(rloc.ref._reloc.reloc_global.module, null) : null;
			let obj = findExternalReloc(mod, rloc.ref.kind, rloc.ref.name);

			if (rloc.type == R_WASM_MEMORY_ADDR_LEB) {
				obj.uleb_relocs.push({dst_off: dst_off, src_off: src_off});
			} else if (rloc.type == R_WASM_TABLE_INDEX_SLEB || rloc.type == R_WASM_MEMORY_ADDR_SLEB){
				obj.sleb_relocs.push({dst_off: dst_off, src_off: src_off});
			}
		}

		// encoding code-relocs dependant on external symbols.
		// group by symbol and use two sub-arrays .sleb and .uleb
		len = ext_data_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = ext_data_relocs[i];
			let dst_off, src_off, dst_idx;
			if (rloc.ref.type == 1) {			// data

			} else if (rloc.ref.type == 0) {	// func

			}

			let dst = rloc.dst.dataSection;
			dst_off = rloc.dst._rloc;
			if (rloc.off) {
				dst_off += rloc.off;
			}
			src_off = 0;
			if (rloc.addend) {
				src_off += rloc.addend;
			}

			if (dst_off >= dst.size) {
				console.warn("dst_off %d is outside of data-segment %o", dst_off, ext_data_relocs)
			}

			dst_idx = dataSections.indexOf(dst);
			if (dst_idx == -1)
				throw new TypeError("INVALID_DST_IDX");

			let mod = rloc.ref._reloc  && rloc.ref._reloc.reloc_global.module ? findModule(rloc.ref._reloc.reloc_global.module, null) : null;
			let obj = findExternalReloc(mod, rloc.ref.kind, rloc.ref.name);
			
			obj.data_relocs.push({dst_idx: dst_idx, dst_off: dst_off, src_off: src_off});
		}

		subtotsz = 0;
		subsecsz = 0;

		function sortByDstIdxOff(r1, r2) {
			if (r1.dst_idx < r2.dst_idx) {
				return -1;
			} else if (r1.dst_idx > r2.dst_idx) {
				return 1;
			} else {

				if (r1.dst_off < r2.dst_off) {
					return -1;
				} else if (r1.dst_off > r2.dst_off) {
					return 1;
				} else {
					return 0;
				}
			}
		}

		function sortByDstOff(r1, r2) {
			if (r1.dst_off < r2.dst_off) {
				return -1;
			} else if (r1.dst_off > r2.dst_off) {
				return 1;
			} else {
				return 0;
			}
		}

		external_relocs.sort(function(s1, s2) {
			if (s1.module == null && s2.module != null) {
				return 1;
			} else if (s1.module != null && s2.module == null) {
				return -1;
			} else if ((s1.module == null && s2.module == null) || (s1.module != null && s2.module != null)) {
				if (s1.name < s2.name) {
					return -1;
				} else if (s1.name > s2.name) {
					return 1;
				} else {
					return 0;
				}
			}

			return 0;
		});

		len = external_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = external_relocs[i];
			if (rloc.uleb_relocs.length > 0) {
				rloc.uleb_relocs.sort(sortByDstOff);
			}
			if (rloc.sleb_relocs.length > 0) {
				rloc.sleb_relocs.sort(sortByDstOff);
			}
			if (rloc.data_relocs.length > 0) {
				rloc.data_relocs.sort(sortByDstIdxOff);
			}
		}

		len = external_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = external_relocs[i];
			let symsz = 0;
			let strlen = lengthBytesUTF8(rloc.name);
			symsz += strlen + lengthULEB128(strlen);
			// TODO: module binding for symbol
			// TODO: func.type
			// src_off dont make sense for func-symbol types.

			let relocs = rloc.uleb_relocs;
			let xlen = relocs.length;
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				symsz += lengthULEB128(robj.dst_off);
				symsz += lengthULEB128(robj.src_off);
			}

			relocs = rloc.sleb_relocs;
			xlen = relocs.length;
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				symsz += lengthULEB128(robj.dst_off);
				symsz += lengthULEB128(robj.src_off);
			}

			relocs = rloc.data_relocs;
			xlen = relocs.length;
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				symsz += lengthULEB128(robj.dst_idx);
				symsz += lengthULEB128(robj.dst_off);
				symsz += lengthULEB128(robj.src_off);
			}

			symsz += lengthULEB128(rloc.uleb_relocs.length);
			symsz += lengthULEB128(rloc.sleb_relocs.length);
			symsz += lengthULEB128(rloc.data_relocs.length);
			rloc.symsz = symsz;
			subsecsz += lengthULEB128(symsz);
			subsecsz += 1 + symsz; 	// type | symbol-size | symbol data
		}

		subsecsz += lengthULEB128(len);
		subtotsz = subsecsz + 1 + lengthULEB128(subsecsz);

		buf = new Uint8Array(subtotsz);
		data = new ByteArray(buf);
		data.writeUint8(NBDL_SUBSEC_RLOCEXT);
		data.writeULEB128(subsecsz);
		data.writeULEB128(len);

		len = external_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = external_relocs[i];
			let strlen = lengthBytesUTF8(rloc.name);
			data.writeUint8(rloc.type);
			data.writeULEB128(rloc.symsz);
			data.writeULEB128(strlen);
			data.writeUTF8Bytes(rloc.name);

			if (rloc.uleb_relocs.length > 0) {
				let relocs = rloc.uleb_relocs;
				let xlen = relocs.length;
				data.writeULEB128(xlen);
				for (let x = 0; x < xlen; x++) {
					let robj = relocs[x];
					data.writeULEB128(robj.dst_off);
					data.writeULEB128(robj.src_off);
				}
			} else {
				data.writeULEB128(0);
			}

			if (rloc.sleb_relocs.length > 0) {
				let relocs = rloc.sleb_relocs;
				let xlen = relocs.length;
				data.writeULEB128(xlen);
				for (let x = 0; x < xlen; x++) {
					let robj = relocs[x];
					data.writeULEB128(robj.dst_off);
					data.writeULEB128(robj.src_off);
				}
			} else {
				data.writeULEB128(0);
			}

			if (rloc.data_relocs.length > 0) {
				let relocs = rloc.data_relocs;
				let xlen = relocs.length;
				data.writeULEB128(xlen);
				for (let x = 0; x < xlen; x++) {
					let robj = relocs[x];
					data.writeULEB128(robj.dst_idx);
					data.writeULEB128(robj.dst_off);
					data.writeULEB128(robj.src_off);
				}
			} else {
				data.writeULEB128(0);
			}
		}

		subsections.push(buf);
		secsz += buf.byteLength;
		
		// encoding internal data-relocs
		let int_crelocs = []; 
		let int_drelocs = [];
		function findIntDataReloc(dst, src) {
			let len = int_drelocs.length;
			for (let i = 0; i < len; i++) {
				let obj = int_drelocs[i];
				if (obj.dst == dst && obj.src == src) {
					return obj;
				}
			}

			let obj = {};
			obj.dst = dst;
			obj.src = src;
			obj._relocs = [];

			int_drelocs.push(obj);
			
			return obj;
		}

		function findIntCodeReloc(src, type) {
			let len = int_crelocs.length;
			for (let i = 0; i < len; i++) {
				let obj = int_crelocs[i];
				if (obj.src == src && obj.type == type) {
					return obj;
				}
			}

			let obj = {};
			obj.src = src;
			obj.type = type;
			obj._relocs = [];

			int_crelocs.push(obj);
			
			return obj;
		}

		// computing internal data relocs
		len = int_data_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_data_relocs[i];
			let dst = rloc.dst.dataSection;
			let src, src_off, dst_off;
			let ref = rloc.ref;
			if (ref.kind == 0x00) {
				if (rloc.elem && rloc.elem instanceof WasmElementSegment) {
					src = rloc.elem;
					src_off = src.vector.indexOf(ref.value);
					if (src_off == -1)
						throw new TypeError("INVALID_SRC_OFF");
				} else {
					let result = getElementForFunc(ref.value);
					if (result == null)
						throw new TypeError("NOT_ELEM_FUNC");
					src = result.elem;
					src_off = result.funcidx;
					if (src_off == -1)
						throw new TypeError("INVALID_SRC_OFF");
				}
			} else if (ref.value instanceof DataSegmentStartSymbol) {
				src = ref.value.dataSegment.dataSection;
				src_off = 0;
			} else if (ref.value instanceof DataSegmentEndSymbol) {
				src = ref.value.dataSegment.dataSection;
				src_off = ref.value.dataSegment.size;
			} else if (ref.kind == 0x01) {
				let sec = ref.value.dataSection;
				let reloc = ref.value._rloc;
				src = sec;
				src_off = reloc;
				if (ref.offset) {
					src_off += ref.offset;
				}
				if (rloc.addend) {
					src_off += rloc.addend;
				}
			} else {
				throw new TypeError("INVALID_SYMBOL_TYPE");
			}
			dst_off = rloc.dst._rloc;
			if (rloc.off) 
				dst_off += rloc.off;
			let obj = findIntDataReloc(dst, src);
			obj._relocs.push({src_off: src_off, dst_off: dst_off});
		}

		// computing internal code-relocs
		len = int_code_relocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_code_relocs[i];
			let src, src_off, dst_off;
			let ref = rloc.ref;
			if (ref.kind == 0x00) {
				if (rloc.elem && rloc.elem instanceof WasmElementSegment) {
					src = rloc.elem;
					src_off = src.vector.indexOf(ref.value);
					if (src_off == -1)
						throw new TypeError("INVALID_SRC_OFF");
				} else {
					let result = getElementForFunc(ref.value);
					if (result == null)
						throw new TypeError("NOT_ELEM_FUNC");
					src = result.elem;
					src_off = result.funcidx;
					if (src_off == -1)
						throw new TypeError("INVALID_SRC_OFF");
				}
			} else if (ref.value instanceof DataSegmentStartSymbol) {
				src = ref.value.dataSegment.dataSection;
				src_off = 0;
			} else if (ref.value instanceof DataSegmentEndSymbol) {
				src = ref.value.dataSegment.dataSection;
				src_off = ref.value.dataSegment.size;
			} else if (ref.kind == 0x01) {
				let sec = ref.value.dataSection;
				let reloc = ref.value._rloc;
				src = sec;
				src_off = reloc;
				if (ref.offset)
					src_off += ref.offset;
				if (rloc.addend)
					src_off += rloc.addend;
			} else {
				throw new TypeError("INVALID_SYMBOL_TYPE");
			}
			dst_off = rloc.inst._roff;
			if (dst_off == -1 || dst_off == 0)
				throw new TypeError("INVALID_DST_OFF");

			let obj = findIntCodeReloc(src, rloc.type);
			obj._relocs.push({src_off: src_off, dst_off: dst_off});
		}

		// encoding internal relocs
		subsecsz = 0;
		subtotsz = 0;

		len = int_drelocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_drelocs[i];
			let src_type, src_idx, dst_idx = dataSections.indexOf(rloc.dst);
			let symsz = 0;
			if (dst_idx == -1)
				throw new TypeError("INVALID_DST_IDX");

			if (rloc.src instanceof WasmElementSegment) {
				src_type = 2;
				src_idx = module.elementSegments.indexOf(rloc.src);
			} else {
				src_type = 1;
				src_idx = dataSections.indexOf(rloc.src);
			}

			if (src_idx == -1)
				throw new TypeError("INVALID_SRC_IDX");

			rloc.dst_idx = dst_idx;
			rloc.src_type = src_type;
			rloc.src_idx = src_idx;

			symsz += 1; // src-type 
			symsz += lengthULEB128(dst_idx);
			symsz += lengthULEB128(src_idx);

			let relocs = rloc._relocs;
			let xlen = relocs.length;
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				symsz += lengthULEB128(robj.dst_off);
				symsz += lengthULEB128(robj.src_off);
			}

			symsz += lengthULEB128(relocs.length);
			rloc.symsz = symsz;
			subsecsz += lengthULEB128(symsz);
			subsecsz += 1 + symsz; 	// type | symbol-size | symbol data
		}

		len = int_crelocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_crelocs[i];
			let src_type, src_idx;
			let symsz = 0;

			if (rloc.src instanceof WasmElementSegment) {
				src_type = 2;
				src_idx = module.elementSegments.indexOf(rloc.src);
			} else {
				src_type = 1;
				src_idx = dataSections.indexOf(rloc.src);
			}

			if (src_idx == -1)
				throw new TypeError("INVALID_SRC_IDX");

			symsz += 1; // src-type
			symsz += lengthULEB128(src_idx);

			rloc.src_type = src_type;
			rloc.src_idx = src_idx;

			let relocs = rloc._relocs;
			let xlen = relocs.length;
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				symsz += lengthULEB128(robj.dst_off);
				symsz += lengthULEB128(robj.src_off);
			}

			symsz += lengthULEB128(relocs.length);
			rloc.symsz = symsz;
			subsecsz += lengthULEB128(symsz);
			subsecsz += 1 + symsz; 	// type | symbol-size | symbol data
		}

		subsecsz += lengthULEB128(int_crelocs.length + int_drelocs.length);
		subtotsz = subsecsz + 1 + lengthULEB128(subsecsz);

		buf = new Uint8Array(subtotsz);
		data = new ByteArray(buf);
		data.writeUint8(NBDL_SUBSEC_RLOCINT);
		data.writeULEB128(subsecsz);
		data.writeULEB128(int_crelocs.length + int_drelocs.length);

		len = int_drelocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_drelocs[i];
			let src_type = rloc.src_type;
			let src_idx = rloc.src_idx; 
			let dst_idx = rloc.dst_idx;

			data.writeUint8(R_WASM_MEMORY_ADDR_I32);
			data.writeULEB128(rloc.symsz);

			let relocs = rloc._relocs;
			let xlen = relocs.length;

			data.writeULEB128(dst_idx);
			data.writeUint8(src_type);
			data.writeULEB128(src_idx);
			data.writeULEB128(xlen);
			
			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				data.writeULEB128(robj.dst_off);
				data.writeULEB128(robj.src_off);
			}
		}

		len = int_crelocs.length;
		for (let i = 0; i < len; i++) {
			let rloc = int_crelocs[i];
			let src_type = rloc.src_type;
			let src_idx = rloc.src_idx;

			data.writeUint8(rloc.type);
			data.writeULEB128(rloc.symsz);

			let relocs = rloc._relocs;
			let xlen = relocs.length;

			data.writeUint8(src_type);
			data.writeULEB128(src_idx);
			data.writeULEB128(xlen);

			for (let x = 0; x < xlen; x++) {
				let robj = relocs[x];
				data.writeULEB128(robj.dst_off);
				data.writeULEB128(robj.src_off);
			}
		}

		subsections.push(buf);
		secsz += buf.byteLength;

		// encoding internal code-relocs

		// encoding the top-level section header
        const SECTION_NAME = this.name;

		let hdrsz = 0;
        strlen = lengthBytesUTF8(SECTION_NAME);
        hdrsz += strlen + lengthULEB128(strlen);
		hdrsz += lengthULEB128(subsections.length);
		totsz = secsz + hdrsz;
		hdrsz += lengthULEB128(totsz);

        // actual encoding
        buf = new ArrayBuffer(hdrsz + 1);
        data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(totsz);
		this._dylink0_hdroff = data.offset;
        data.writeULEB128(strlen);
        data.writeUTF8Bytes(SECTION_NAME);
        data.writeULEB128(subsections.length);
		
		subsections.unshift(buf);

        return subsections;
    }
}


/**
 * Validates certain aspect of the module structure.
 * This is used during test phase and development to ensure that changes does output a valid module.
 * 
 * - That a reference to a function only appear once in .functions
 * @todo ensure and list imports that appear out of sequence.
 * 
 * Upon invalid entry found this function throws.
 * 
 * @param {WebAssemblyModule|ByteCodeLinker} wasmModule
 * @returns {void}
 */
function validateWasmModule(wasmModule) {

	let dataSegments = wasmModule.dataSegments;
	let functions = wasmModule.functions;
	let globals = wasmModule.globals;
	let memory = wasmModule.memory;
	let tables = wasmModule.tables;
	let tags = wasmModule.tags;
	let exports = wasmModule.exports;
	let errors = [];
	let dupmap = new Map();

	let len = functions.length;
	for (let i = 0; i < len; i++) {
		let func = functions[i];
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

	// checking exports 
	let namelist = [];
	len = exports.length;
	for (let i = 0; i < len; i++) {
		let exp = exports[i];
		let name = exp.name;
		if (namelist.indexOf(name) !== -1) {
			let err = {text: "DUPLICATE_EXPORT_NAME", name: name};
			errors.push(err);
		} else {
			namelist.push(name);
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

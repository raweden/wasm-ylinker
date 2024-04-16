
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

import { WebAssemblyCustomSection, WasmElementSegment, WasmFunction } from "../core/types"
import { ByteArray, lengthBytesUTF8, lengthULEB128, lengthSLEB128 } from "../core/ByteArray";
import { SECTION_TYPE_CUSTOM , __nsym} from "../core/const"
import { R_WASM_MEMORY_ADDR_I32, R_WASM_MEMORY_ADDR_SLEB, R_WASM_MEMORY_ADDR_LEB, R_WASM_TABLE_INDEX_SLEB } from "../core/reloc"
import { DataSegmentStartSymbol, DataSegmentEndSymbol } from "./core"


const NBDL_SUBSEC_MODULES = 0x01;
const NBDL_SUBSEC_DATASEG = 0x02;	// not used
const NBDL_SUBSEC_DATAEXP = 0x03;	// not used (replaced by .dynsym)
const NBDL_SUBSEC_FUNCEXP = 0x04;	// not used (replaced by .dynsym)
const NBDL_SUBSEC_DATAREQ = 0x05;	// not used
const NBDL_SUBSEC_FUNCREQ = 0x06;	// not used
const NBDL_SUBSEC_RLOCEXT = 0x07;
const NBDL_SUBSEC_RLOCINT = 0x08;

const _RTLD_SEGMENT_NOT_EXPORTED = 1 << 2;
const _RTLD_SEGMENT_ZERO_FILL = 1 << 3;

/**
 * declares visiable exports in tables and data-segments
 * 
 * @todo Consider to add fields like elf into sub-section #1 (support: search-path, )
 * @todo Consider to make NBDL_SUBSEC_MODULES fixed ontop header, and to implement a jump offset table at top.
 * @todo try to bundle the binary without actully exporting the .bss data-segment, this implementation should allow for it.
 * @todo add fast-track information about memory(s) (section-type, location relative to section, reloc-flag)
 */
export class WebAssemblyCustomSectionNetBSDDylinkV2 extends WebAssemblyCustomSection {

	constructor(module) {
        super(module, "rtld.dylink.0");
		this._data = undefined;
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
					obj.offset = data.readULEB128();
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
			
			
			let loc;
			let flags = 0;
			if (name == ".bss") {
				flags |= _RTLD_SEGMENT_ZERO_FILL|_RTLD_SEGMENT_NOT_EXPORTED;
				loc = 0;
			} else {
				let segidx = _dataSegments.indexOf(dataSegment);
				if (segidx === -1) {
					console.error("data-segment %s not defined in module", name);
					throw new ReferenceError("DataSegment not defined on module");
				}
				loc = dataSegment._dylink0_loc;
			}
			dataSegment._dylink0_flags = flags;
			strlen = lengthBytesUTF8(name);
			subsecsz += strlen + lengthULEB128(strlen);
			subsecsz += lengthULEB128(loc);			// TODO: use SLEB so loc can be -1 for .bss /non-exported
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


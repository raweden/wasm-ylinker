
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
export class WebAssemblyCustomSectionNetBSDExecHeader extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "rtld.exec-hdr");
        this._data = undefined;
    }

	/**
	 * 
	 * @param {WebAssemblyModule} module 
	 * @param {ByteArray} data 
	 * @param {integer} size 
	 * @returns {WebAssemblyCustomSectionNetBSDExecHeader}
	 */
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

	/**
	 * 
	 * @param {object} options 
	 * @returns {Uint8Array}
	 */
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
				if (name == "rtld.exec-hdr" || name == "rtld.dylink.0") {
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




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
export function validateWasmModule(wasmModule) {

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
 * @param {Array.<WasmDataSegment>} dataSegments
 * @returns {void}
 */
export function validateWasmModuleDataSegments(dataSegments) {

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
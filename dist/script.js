
// 1954 (1953.125) wasm-pages are about 128mb of memory
// 
// TODO:
// drag & drop
// - support for loading and saving to file system, reduces copying
// import name section from emscripten symbolmap
// reqognize objc method names.
// objc-abi inspector.
// headless workflows 

const SECTION_TYPE = {
    TYPE: 1,
    IMPORT: 2,
    FUNC: 3,
    TABLE: 4,
    MEMORY: 5,
    GLOBAL: 6,
    EXPORT: 7,
    START: 8,
    ELEMENT: 9,
    CODE: 0x0A,
    DATA: 0x0B,
    DATA_COUNT: 0x0C,
    CUSTOM: 0x00
};

function u8_memcpy(src, sidx, slen, dst, didx) {
    // TODO: remove this assert at later time. (should be a debug)
    if (!(src instanceof Uint8Array) && (dst instanceof Uint8Array)) {
        throw TypeError("src and dst Must be Uint8Array");
    }
    //console.log(src, dst);
    let idx = sidx;
    let end = idx + slen;
    /*if (slen > 512) {
        let subarr = src.subarray(idx, end);
        dst.set(subarr, didx);
        return;
    }*/

    while(idx < end) {
        dst[didx++] = src[idx++];
    }
}

function saveAsFile(buffer, filename, filetype) {
	let resolveFn, rejectFn;
    let promise = new Promise(function(resolve, reject){
        resolveFn = resolve;
        rejectFn = reject;
    });

    let blob;
    if (buffer instanceof Blob) {
    	blob = buffer;
    } else {
    	blob = new Blob([buffer], { type: filetype });
    }

    if (navigator.msSaveBlob) {
     	navigator.msSaveBlob(blob, filename);
      	return resolve();
    } else if (/iPhone|fxios/i.test(navigator.userAgent)) {
      	// This method is much slower but createObjectURL is buggy on iOS
      	const reader = new FileReader();
      	reader.addEventListener('loadend', function () {
	        if (reader.error) {
	          	return reject(reader.error);
	        }
	        if (reader.result) {
	          	const a = document.createElement('a');
	          	// @ts-ignore
	          	a.href = reader.result;
	          	a.download = filename;
	          	document.body.appendChild(a);
	          	a.click();
	        }
        	resolveFn();
      	});
      	reader.readAsDataURL(blob);
    } else {
      	const downloadUrl = URL.createObjectURL(blob);
      	const a = document.createElement('a');
      	a.href = downloadUrl;
      	a.download = filename;
      	document.body.appendChild(a);
      	a.click();
      	URL.revokeObjectURL(downloadUrl);
      	setTimeout(resolveFn, 100);
    }
}

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
function humanFileSize(bytes, si, dp) {
	if (typeof si == "undefined") {
		si = false;
	}
	if (typeof dp == "undefined") {
		dp = 1;
	}
  	const threshold = si ? 1000 : 1024;

	if (Math.abs(bytes) < threshold) {
	    return bytes + ' bytes';
	}

	const units = si ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
	let u = -1;
	const r = 10 ** dp;

	do {
		bytes /= threshold;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= threshold && u < units.length - 1);

  	return bytes.toFixed(dp) + ' ' + units[u];
}

function showWasmInfoStats(mod, sections) {
	let container = document.querySelector("div#wasm-info");

	let ul = document.createElement("ul");
	ul.classList.add("accordion-list");
	container.appendChild(ul);

	let len = sections.length;
	for (let i = 0;i < len;i++) {
		let section = sections[i];
		let typename = sectionnames[section.type];
		let li = document.createElement("li");
		li.classList.add("accordion-header")
		ul.appendChild(li);
		if (section.type == 0) {
			let span = document.createElement("code");
			span.textContent = typename;
			li.appendChild(span);
		} else if (section.type == SECTION_TYPE.EXPORT) {

			let span = document.createTextNode(typename + '\x20');
			li.appendChild(span);

			span = document.createElement("span");
			span.textContent = String(mod.exports.length) + "\x20item(s)"
			li.appendChild(span);
		} else {
			let span = document.createTextNode(typename);
			li.appendChild(span);
		}

		let tn = document.createTextNode("\x20" + humanFileSize(section.size, true));
		li.appendChild(tn);
	}
}

function findModuleByType(mod, type) {
	let sections = mod.sections;
	let len = sections.length;
	for (let i = 0; i < len; i++) {
		let sec = sections[i];
		if (sec.type == type) {
			return sec;
		}
	}

	return null;
}

function isZeroFill(dataSeg) {
	let idx = dataSeg.offset;
	let end = idx + dataSeg.size;
	let buf = new Uint8Array(moduleBuffer);

	while (idx < end) {
		if (buf[idx++] != 0x00) {
			return false;
		}
	}

	return true;
}

let importIsModified = false;
let moduleBuffer;
let targetModule;
let moduleWorkflows = [{
	name: "Export Selected (Save as)",
	onselect: function(container, action) {

		const mandatory = [];
		let checkboxes = [];
		let exported = [];


		function onCheckboxChange(evt) {
			let target = evt.currentTarget;
			let idx = checkboxes.indexOf(target);
			exported[idx] = target.checked;
			console.log(exported);
		}

		let ul = document.createElement("ul");
		ul.classList.add("accordion-list");
		container.appendChild(ul);
		let sections = targetModule.sections;
		let len = sections.length;
		for (let i = 0;i < len;i++) {
			let section = sections[i];
			let typename = sectionnames[section.type];
			let li = document.createElement("li");
			li.classList.add("accordion-header");
			let checkbox = document.createElement("input");
			checkbox.addEventListener("change", onCheckboxChange);
			checkbox.type = "checkbox";
			checkbox.checked = true;
			li.appendChild(checkbox)
			ul.appendChild(li);
			if (section.type == 0) {
				let span = document.createElement("code");
				span.textContent = typename + '\t';
				li.appendChild(span);
				span = document.createElement("code");
				span.textContent = section.name;
				li.appendChild(span);
			} else {
				let span = document.createTextNode(typename);
				li.appendChild(span);
			}

			exported.push(true);
			checkboxes.push(checkbox);

			let tn = document.createTextNode("\x20" + humanFileSize(section.size, true));
			li.appendChild(tn);
		}

		action.exported = exported;
	},
	onrun: function(container, action) {

		let exported = action.exported;
		let sections = targetModule.sections;
		let len = sections.length;
		let buffers = [];
		targetModule._buffer = moduleBuffer;

		let magic = moduleBuffer.slice(0, 8);
		buffers.push(magic);

		for (let i = 0;i < len;i++) {
			let section = sections[i];
			let isExported = exported[i];
			let type = section.type;
			if (!isExported) {
				//
				if (type == SECTION_TYPE.DATA) {
					let buf = new Uint8Array(3);
					buf[0] = SECTION_TYPE.DATA;
					buf[1] = 1;
					buf[2] = 0;
					buffers.push(buf.buffer);
				} else {
					continue;
				}
			} else if (type == SECTION_TYPE.IMPORT && section._isDirty === true) {
				let sub = encodeImportSection(targetModule.imports);
				buffers.push(sub);
			} else if (type == SECTION_TYPE.GLOBAL && section._isDirty === true) {
				let sub = encodeGlobalSection(targetModule);
				buffers.push(sub);
			} else if (type == SECTION_TYPE.EXPORT && section._isDirty === true) {
				let sub = encodeExportSection(targetModule);
				buffers.push(sub);
			} else if (type == SECTION_TYPE.CODE) {
				let sub = encodeCodeSection(targetModule, section, targetModule.functions);
				if (Array.isArray(sub)) {
					let xlen = sub.length;
					for (let x = 0; x < xlen; x++) {
						buffers.push(sub[x]);
					}
				} else {
					buffers.push(sub);
				}
			} else {
				let end = section.dataOffset + section.size;
				let sub = moduleBuffer.slice(section.offset, end);
				buffers.push(sub);
			}
		}

		let filename = url.split('/').pop();
		saveAsFile(new Blob(buffers, { type: "application/octet-stream"}), filename);
	},
}, {
	name: "Extract Data Section (Save as)",
	onselect: function(container, action) {
		const mandatory = [];
		let checkboxes = [];
		let exported = [];


		function onCheckboxChange(evt) {
			let target = evt.currentTarget;
			let idx = checkboxes.indexOf(target);
			exported[idx] = target.checked;
			console.log(exported);
		}

		let tbl = document.createElement("table");
		let thead = document.createElement("thead");
		let tr = document.createElement("tr");
		let th = document.createElement("th");
		th.textContent = "seg. no.";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "name";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "size";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "rle";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "uninitialized data";
		tr.appendChild(th);
		thead.appendChild(tr);
		tbl.appendChild(thead);
		container.appendChild(tbl);

		let tbody = document.createElement("tbody");
		tbl.appendChild(tbody);
		
		let dataSegments = targetModule.dataSegments;
		let names = targetModule.names && targetModule.names.data ? targetModule.names.data : null;
		let len = dataSegments.length;
		for (let i = 0;i < len;i++) {
			let dataSeg = dataSegments[i];
			let name, allzeros = false;
			
			let tr = document.createElement("tr");
			let td = document.createElement("td");
			td.textContent = i.toString();
			tr.appendChild(td);
			td = document.createElement("td");
			tr.appendChild(td);

			if (names && names.has(i)) {
				name = names.get(i);
			}

			if (name) {

				let node = document.createElement("code");
				node.textContent = names.get(i);
				td.appendChild(node);
			} else {
				let node = document.createTextNode("segment\x20");
				td.appendChild(node);

				node = document.createElement("code");
				node.textContent = "N/A";
				td.appendChild(node);
			}

			if (name === ".bss") {
				allzeros = isZeroFill(dataSeg);
			}

			td = document.createElement("td");
			td.textContent = humanFileSize(dataSeg.size, true);
			tr.appendChild(td);

			td = document.createElement("td");
			tr.appendChild(td);

			let checkbox = document.createElement("input");
			checkbox.addEventListener("change", onCheckboxChange);
			checkbox.type = "checkbox";
			checkbox.checked = false;
			td.appendChild(checkbox);

			td = document.createElement("td");
			td.textContent = allzeros ? "YES" : "NO";
			tr.appendChild(td);

			exported.push(true);
			checkboxes.push(checkbox);
			tbody.appendChild(tr);

			//let tn = document.createTextNode("\x20" + humanFileSize(section.size, true));
			//li.appendChild(tn);
		}

		action.exported = exported;
	},
	onrun: function(container, action) {
		let mod = targetModule;
		let segments = mod.dataSegments;
		if (!segments || segments.length == 0)
			return;
		// TODO: get names.
		let tot = 0;
		let len = segments.length;
		for (let i = 0; i < len; i++) {
			let seg = segments[i];
			tot += seg.size;
		}

		let src = new Uint8Array(moduleBuffer);
		let buffer = new Uint8Array(tot + (len * 8)); // {dst-offset, size}
		let data = new DataView(buffer.buffer);
		let off = 0;
		for (let i = 0; i < len; i++) {
			let seg = segments[i];
			let memdst;
			if (seg.inst.opcodes.length == 2 && seg.inst.opcodes[0].opcode == 65)
				memdst = seg.inst.opcodes[0].value;
			if (!memdst)
				throw TypeError("memdst must be set");
			data.setUint32(off, memdst, true);
			off += 4;
			data.setUint32(off, seg.size, true);
			off += 4;
			u8_memcpy(src, seg.offset, seg.size, buffer, off);
			off += seg.size;
		}

		saveAsFile(buffer, "data.seg", "application/octet-stream");

	},
}, {
	name: "Run optimization (freebsd binary)",
}, {
	name: "Run objc_msgSend optimization",
	// go trough every objc_msgSend and generate conditional call block for every objc defined method.
}, {
	name: "Run objc optimization",
	// 1. find function with name "__wasm_call_ctors"
	// 2. remove repeated calls to ".objcv2_load_function" which only needs to be called once.
}, {
	name: "Post optimize for objc dylib/NSBundle",
}, {
	name: "Post optimize for dylib",
}, {
	name: "Dump import functions",
	onselect: function(container, action) {

	},
	onrun: function(container, action) {
		let mod = targetModule;
		let types = mod.types;
		let imports = mod.imports;
		let len = imports.length;
		let lines = [];
		for (let i = 0; i < len; i++) {
			let imp = imports[i];
			if (!(imp instanceof ImportedFunction)) {
				continue;
			}
			let functype = types[imp.typeidx];
			let sign = functype_toString(functype);
			let idx = sign.indexOf('(');
			let str = sign.substring(0, idx) + imp.module + '.' + imp.name + sign.substring(idx);
			lines.push(str);

		}

		console.log(lines.join('\n'));
	},
}];

let _workflowActions = {
	postOptimizeWasm: postOptimizeWasm,
	postOptimizeAtomicInst: console.error,
	postOptimizeMemInst: console.error,
	convertToImportedGlobal: console.error,
	convertMemory: convertMemoryAction,
	extractDataSegments: extractDataSegmentsAction,
	output: outputAction,
};

let _freebsdWorkflow = [
	{
		action: "convertMemory",
		options: {
			type: "import", 	// no value leaves the type as is.
			memidx: 0,
			// min: 			// no value leaves the min as is.
			max: 1954,
			shared: true,
		}
	}, {
		action: "postOptimizeWasm",
		options: undefined,
	}, {
		action: "extractDataSegments",
		options: {
			format: "wasm",
			consume: true,
		}
	}, {
		action: "output",
		options: {
			exclude: [{type: 0x0B}, 
					  {type: 0x00, name: ".debug_info"},
					  {type: 0x00, name: ".debug_loc"},
					  {type: 0x00, name: ".debug_ranges"}, 
					  {type: 0x00, name: ".debug_abbrev"},
					  {type: 0x00, name: ".debug_line"},
					  {type: 0x00, name: ".debug_str"}]
		}
	}
];

function runWorkflowActions(mod, actions) {

	/*
	let len = actions.length;
	for (let i = 0; i < len; i++) {
		let ret, obj = actions[i];
		let name = obj.action;
		let fn = _workflowActions[name];
		let options = typeof obj.options == "object" && obj.options !== null ? obj.options : undefined;
		if (options) {
			ret = fn(mod, options);
		} else {
			ret = fn(mod);
		}
	}*/
	let resolveFn;
	let rejectFn;
	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});
	let returnValue;
	let index = 0;

	function next() {
		if (index >= actions.length) {
			resolveFn();
			return;
		}
		let actionData;
		let returnPromise;
		for (let i = index; i < actions.length; i++) {
			let ret;
			actionData = actions[i];
			let name = actionData.action;
			let fn = _workflowActions[name];
			let options = typeof actionData.options == "object" && actionData.options !== null ? actionData.options : undefined;
			if (options) {
				ret = fn(mod, options);
			} else {
				ret = fn(mod);
			}
			if (ret instanceof Promise) {
				returnPromise = ret;
				index = i;
				break;
			}
		}
		/*
		let obj = actions[index];
		let name = obj.action;
		let fn = _workflowActions[name];
		let options = typeof obj.options == "object" && obj.options !== null ? obj.options : undefined;
		if (options) {
			ret = fn(mod, options);
		} else {
			ret = fn(mod);
		}*/
		if (returnPromise) {
			returnPromise.then(function(val) {
				returnPromise = undefined;
				returnValue = val;
				index++;
				next();
			}, function(err) {
				console.error(err);
				returnPromise = undefined;
				index++;
				next();
			});
		} else {
			// if we exited the loop without returnPromise, then we have reached the end.
			resolveFn();
		}
	}

	next();

	return p;
}

function convertMemoryAction(mod, options) {

	let mem;
	let exp;
	let type;

	if (typeof options.memory_name == "string") {
		// check mod.exports
		// check mod.imports
		// check mod.names.memory
		mem = null;
	} else if (typeof options.memidx == "number" && Number.isInteger(options.memidx)) {
		let memidx = options.memidx;
		mem = mod.memory[memidx];
	}

	if (mem instanceof ImportedMemory) {
		type = "import";
	} else if (mem !== undefined) {
		exp = findExportDefByObject(mod, mem);
		if (exp) {
			type = "export";
		} else {
			type = "internal";
		}
	}

	if (typeof options.type == "string" && (options.type == "import" || options.type == "export" || options.type == "internal")) {

		if (type != options.type) {
			console.error("needs to convert memory type! not implemented!");
			if (type == "internal" && options.type == "import") {

				if (mod.memory.length > 1 && mod.memory.indexOf(mem) != 0) {
					// if not already the first memidx this will affect memidx in multi-memory support
				} else {

				}

			} else if (type == "internal" && options.type == "export") {
				
			} else if (type == "import" && options.type == "export") {
				
			} else if (type == "import" && options.type == "internal") {
				
			} else if (type == "export" && options.type == "import") {
				
			} else if (type == "export" && options.type == "internal") {
				// remove the export def.
			}
		}
	}

	if (typeof options.shared == "boolean" && options.shared !== mem.shared) {
		mem.shared = options.shared;
		findModuleByType(mod, SECTION_TYPE.IMPORT)._isDirty = true;
	}

	if ((typeof options.max == "number" && Number.isInteger(options.max)) && options.max !== mem.max) {
		mem.max = options.max;
		findModuleByType(mod, SECTION_TYPE.IMPORT)._isDirty = true;
	}

	if ((typeof options.min == "number" && Number.isInteger(options.min)) && options.min !== mem.min) {
		if (options.min > mem.min) {
			mem.min = options.min;
			findModuleByType(mod, SECTION_TYPE.IMPORT)._isDirty = true;
		} else {
			console.warn("options.min < mem.min");
		}
	}
}

function extractDataSegmentsAction(mod, options) {
	let segments = mod.dataSegments;
	if (!segments || segments.length == 0)
		return;

	if (options.format == "wasm") {
		// there might be more modules that are required at minimum.
		let buffers = [];
		let off = 0;
		let buf = new Uint8Array(4);
		let data = new DataView(buf.buffer);
		buffers.push(buf.buffer);
		data.setUint8(0, 0x00); // \0asm
		data.setUint8(1, 0x61);
		data.setUint8(2, 0x73);
		data.setUint8(3, 0x6D);
		buf = new Uint8Array(15);
		data = new DataView(buf.buffer);
		buffers.push(buf.buffer);
		// types 0x01 		(write empty)
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x00);
		// funcs 0x03 		(write empty)
		data.setUint8(off++, 0x03);
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x00);
		// tables 0x04 		(write empty)
		data.setUint8(off++, 0x04);
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x00);
		// mems 0x05 		(write empty)
		data.setUint8(off++, 0x05);
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x00);
		// globals 0x06 	(write empty)
		data.setUint8(off++, 0x06);
		data.setUint8(off++, 0x01);
		data.setUint8(off++, 0x00);
		
		// data 0x0B
		{
			let secsz;
			let tot = 0;
			let len = segments.length;
			for (let i = 0; i < len; i++) {
				let seg = segments[i];
				tot += lengthULEB128(0); // seg.kind (not implemented)
				tot += byteCodeComputeByteLength(seg.inst.opcodes);
				tot += lengthULEB128(seg.size);
				tot += seg.size;
			}
			tot += lengthULEB128(len); // vector-length
			secsz = tot;
			tot += lengthULEB128(tot); // section-size
			tot += 1;				   // section-signature

			let src = new Uint8Array(moduleBuffer);
			let buffer = new Uint8Array(tot); // {dst-offset, size}
			buffers.push(buffer.buffer);
			let data = new ByteArray(buffer);
			data.writeUint8(0x0B);
			data.writeULEB128(secsz);
			data.writeULEB128(len);
			for (let i = 0; i < len; i++) {
				let seg = segments[i];
				data.writeULEB128(0); // seg.kind (not implemented)
				encodeByteCode(data, seg.inst.opcodes);
				data.writeULEB128(seg.size);
				u8_memcpy(src, seg.offset, seg.size, buffer, data.offset);
				data.offset += seg.size;
			}
		}

		// custom:names 0x00
		// custom:producers 0x00
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		let name = targetFilename.split(".");
		name.pop();
		name = name.join(".");
		name += ".data.wasm";
		window.showSaveFilePicker({suggestedName: name, types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}).then(function(file) {

			file.createWritable().then(function(writable) {

				let blob = new Blob(buffers, { type: "application/wasm" });
    			writable.write(blob).then(function(val) {
    				writable.close().then(resolveFn, rejectFn);
    			}, rejectFn);

			}, rejectFn);
		}, rejectFn);
		
		return p;
	} else {

		// TODO: get names.
		let tot = 0;
		let len = segments.length;
		for (let i = 0; i < len; i++) {
			let seg = segments[i];
			tot += seg.size;
		}

		let src = new Uint8Array(moduleBuffer);
		let buffer = new Uint8Array(tot + (len * 8)); // {dst-offset, size}
		let data = new DataView(buffer.buffer);
		let off = 0;
		for (let i = 0; i < len; i++) {
			let seg = segments[i];
			let memdst;
			if (seg.inst.opcodes.length == 2 && seg.inst.opcodes[0].opcode == 65)
				memdst = seg.inst.opcodes[0].value;
			if (!memdst)
				throw TypeError("memdst must be set");
			data.setUint32(off, memdst, true);
			off += 4;
			data.setUint32(off, seg.size, true);
			off += 4;
			u8_memcpy(src, seg.offset, seg.size, buffer, off);
			off += seg.size;
		}

		return buffer;
	}

	//saveAsFile(buffer, "data.seg", "application/octet-stream");
}

function outputAction(mod, options) {

	let exported = [];
	let sections = targetModule.sections;
	let len = sections.length;
	let buffers = [];
	targetModule._buffer = moduleBuffer;

	if (Array.isArray(options.exclude)) {
		let exclude = options.exclude;
		let ylen = sections.length;
		let xlen = exclude.length;

		for (let y = 0; y < ylen; y++) {
			let sec = sections[y];
			let match = false;
			for (let x = 0; x < xlen; x++) {
				let p = exclude[x];
				if (p.type != sec.type) {
					continue;
				} else {
					if (p.type === 0x00) {

						if (typeof p.name == "string" && p.name == sec.name) {
							match = true;
							break;
						}

					} else {
						match = true;
						break;
					}
				}
			}

			exported[y] = !match;
		}
	}

	let magic = moduleBuffer.slice(0, 8);
	buffers.push(magic);

	for (let i = 0;i < len;i++) {
		let section = sections[i];
		let isExported = exported[i];
		let type = section.type;
		if (!isExported) {
			//
			if (type == SECTION_TYPE.DATA) {
				let buf = new Uint8Array(3);
				buf[0] = SECTION_TYPE.DATA;
				buf[1] = 1;
				buf[2] = 0;
				buffers.push(buf.buffer);
			} else {
				continue;
			}
		} else if (type == SECTION_TYPE.IMPORT && section._isDirty === true) {
			let sub = encodeImportSection(targetModule.imports);
			buffers.push(sub);
		} else if (type == SECTION_TYPE.GLOBAL && section._isDirty === true) {
			let sub = encodeGlobalSection(targetModule);
			buffers.push(sub);
		} else if (type == SECTION_TYPE.EXPORT && section._isDirty === true) {
			let sub = encodeExportSection(targetModule);
			buffers.push(sub);
		} else if (type == SECTION_TYPE.CODE) {
			let sub = encodeCodeSection(targetModule, section, targetModule.functions);
			if (Array.isArray(sub)) {
				let xlen = sub.length;
				for (let x = 0; x < xlen; x++) {
					buffers.push(sub[x]);
				}
			} else {
				buffers.push(sub);
			}
		} else {
			let end = section.dataOffset + section.size;
			let sub = moduleBuffer.slice(section.offset, end);
			buffers.push(sub);
		}
	}

	let resolveFn;
	let rejectFn;
	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});

	window.showSaveFilePicker({suggestedName: targetFilename, types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}).then(function(file) {

		file.createWritable().then(function(writable) {

			let blob = new Blob(buffers, { type: "application/wasm" });
			writable.write(blob).then(function(val) {
				writable.close(resolveFn, rejectFn);
			}, rejectFn);

		}, rejectFn);
	}, rejectFn);
	
	return p;

	//let filename = url.split('/').pop();
	//saveAsFile(new Blob(buffers, { type: "application/octet-stream"}), filename);
}

function removeExportFor(mod, obj) {

	if (obj instanceof WasmFunction) {

	} else if (obj instanceof WasmGlobal) {

		let idx = -1;
		let exported = mod.exports;
		let len = exported.length;
		for (let i = 0; i < len; i++) {
			let exp = exported[i];
			if (!(exp instanceof ExportedGlobal))
				continue;
			if (exp.global == obj) {
				idx = i;
				break;
			}
		}

		if (idx !== -1) {
			exported.splice(idx, 1);
		}
	}
}

let _namedGlobals;

function postOptimizeWasm(mod) {

	let opsopt = [];

	function memcpyReplaceHandler(inst, index, arr) {
		let peek = arr[index + 1];
		if (peek.opcode == 0x1A) { // drop
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			arr.splice(index + 1, 1);
			return true;
		} else {
			console.warn("call to memcpy does not drop return value");
		}
		return true;
	}
	// TODO: we are missing atomic_fence, but cannot find this in the actual wasm proposal.
	const inst_replace = [
		{ 	// atomic operations.
			name: "atomic_notify",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE00, 0, 0);
			}
		}, {
			name: "atomic_wait32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE01, 0, 0);
			}
		}, {
			name: "wasm_atomic_fence",
			handler: function(inst, index, arr) {
				return {opcode: 0xFE03, memidx: 0};
			}
		}, {
			name: "atomic_load32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE10, 0, 0);
			}
		}, {
			name: "atomic_store32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE17, 0, 0);
			}
		}, {
			name: "atomic_add32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE1E, 0, 0);
			}
		}, {
			name: "atomic_sub32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE25, 0, 0);
			}
		}, {
			name: "atomic_and32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE2C, 0, 0);
			}
		},{
			name: "atomic_or32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE33, 0, 0);
			}
		}, {
			name: "atomic_xor32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE3A, 0, 0);
			}
		}, {
			name: "atomic_xchg32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE41, 0, 0);
			}
		}, {
			name: "atomic_cmpxchg32",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE48, 0, 0);
			}
		}, {
			name: "atomic_wait64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE02, 0, 0);
			}
		}, {
			name: "atomic_load64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE11, 0, 0);
			}
		}, {
			name: "atomic_store64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE18, 0, 0);
			}
		}, {
			name: "atomic_add64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE1F, 0, 0);
			}
		}, {
			name: "atomic_sub64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE26, 0, 0);
			}
		}, {
			name: "atomic_and64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE2D, 0, 0);
			}
		}, {
			name: "atomic_or64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE34, 0, 0);
			}
		}, {
			name: "atomic_xor64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE3B, 0, 0);
			}
		}, {
			name: "atomic_xchg64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE42, 0, 0);
			}
		},{
			name: "atomic_cmpxchg64",
			handler: function(inst, index, arr) {
				return new AtomicInst(0xFE49, 0, 0);
			}
		}, { 							// memory operations.
			name: "memcpy",
			handler: memcpyReplaceHandler
		}, {
			name: "__memcpy",
			handler: memcpyReplaceHandler
		}, {
			name: "memcpy_early",
			handler: memcpyReplaceHandler
		}/*, {
			name: "memset",
			// replacing memset vs. memory.fill is where it gets complicated, memset returns which the 
			// memory.fill instruction does not. check for drop instruction but if not found we must fake
			// the return of memset 
			handler: function(inst, index, arr) {
				let peek = arr[index + 1];
				if (peek.opcode == 0x1A) { // drop
					arr[index] = {opcode: 0xfc0b, memidx: 0};
					arr.splice(index + 1, 1);
					return true;
				} else {
					console.warn("call to memcpy does not drop return value");
				}
				return true;
			}
		}*/
	];

	if (!mod.names) {
		console.warn("wasm module needs to define custom-section for names");
		return;
	}

	let indexes = [];
	let nmap = mod.names.functions;
	let len = inst_replace.length;
	for (let i = 0; i < len; i++) {
		let func = inst_replace[i];
		let name = func.name;
		let funcidx = undefined;

		for (const [key, value] of nmap) {
			if (value == name) {
				funcidx = key;
				break;
			}
		}

		if (funcidx !== undefined) {
			func.funcidx = funcidx;
			func.count = 0;
			opsopt.push(func);
			indexes.push(funcidx);
		}
	}

	// run trough all WebAssembly code to find call-sites where we call funcidx
	let start = 0;
	let imports = mod.imports;
	len = imports.length;
	for (let i = 0; i < len; i++) {
		let imp = imports[i];
		if (imp instanceof ImportedFunction) {
			start++;
		}
	}

	let functions = mod.functions;
	let ylen = functions.length;
	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		for (let x = 0; x < opcodes.length; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
			let op = opcodes[x];
			if (op.opcode == 0x10) {
				let idx = indexes.indexOf(op.funcidx);
				if (idx !== -1) {
					opsopt[idx].count++;
					let res = opsopt[idx].handler(op, x, opcodes);
					if (res === op) {
						// do nothing
					} else if (typeof res == "boolean") {

					} else if (typeof res == "number" && Number.isInteger(res)) {

					} else if (typeof res == "object" && res !== null) {
						opcodes[x] = res;
						func._opcodeDirty = true;
					}
				}
			}
		}
	}

	_namedGlobals = namedGlobalsMap(mod);
	{	
		let name = "__stack_pointer";
		let glob = _namedGlobals[name];
		console.log("%s = %d", name, glob.init[0].value);
		name = "thread0_st";
		glob = _namedGlobals[name];
		console.log("%s = %d", name, glob.init[0].value);
	}


	let name = "__stack_pointer";
	let g1 = _namedGlobals[name];
	let g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = name;
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	convertToImportedGlobal(mod, g1, g2);
	mod.imports.unshift(g2);
	removeExportFor(mod, g1);

	name = "__curthread"
	g1 = _namedGlobals[name];
	g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = name;
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	convertToImportedGlobal(mod, g1, g2);
	mod.imports.push(g2);
	removeExportFor(mod, g1);

	let sec = findModuleByType(targetModule, SECTION_TYPE.IMPORT);
	sec._isDirty = true;
	sec = findModuleByType(targetModule, SECTION_TYPE.EXPORT);
	sec._isDirty = true;
	sec = findModuleByType(targetModule, SECTION_TYPE.GLOBAL);
	sec._isDirty = true;

	console.log(opsopt);
}

function mapGlobalsUsage(mod) {

	let gvalues = [];
	let globals = mod.globals;
	let locations = [];
	let len = globals.length;
	let min = 0;
	let max = len - 1;
	for (let i = 0; i < len; i++) {
		let glob = globals[i];
		glob.usage = 0;
		if (glob instanceof WasmGlobal && glob.init.length == 2 && glob.init[0].opcode == 0x41 && glob.init[1].opcode == 0x0B) {
			gvalues.push(glob.init[0].value);
		} else {
			gvalues.push(undefined);
		}
		locations.push(0);
	}

	let start = 0;
	let imports = mod.imports;
	len = imports.length;
	for (let i = 0; i < len; i++) {
		let imp = imports[i];
		if (imp instanceof ImportedFunction) {
			start++;
		}
	}



	let functions = mod.functions;
	let ylen = functions.length;
	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
			let op = opcodes[x];
			if (op.opcode == 0x23 || op.opcode == 0x24) {
				let idx = op.x;
				if (idx < min || idx > max) {
					console.error("invalid globalidx at funcidx: %d inst-index: %d", y, x);
				} else {
					globals[idx].usage++;
				}
			}
		}
	}

	functions = mod.functions;
	ylen = functions.length;
	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		let last = null;
		for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
			let op = opcodes[x];
			if (op.opcode == 0x41) {
				let val = op.value;
				let idx = gvalues.indexOf(val);
				if (idx !== -1) {
					let inc = locations[idx];
					inc++;
					locations[idx] = inc;
				}
			} else if (op.opcode == 0x28 && last && last.opcode == 0x41 && last.value == 0) {
				let idx = gvalues.indexOf(op.offset);
				if (idx !== -1) {
					let inc = locations[idx];
					inc++;
					locations[idx] = inc;
				}
			} else if (op.opcode == 0x36 && last && last.opcode == 0x41 && last.value == 0) {
				let idx = gvalues.indexOf(op.offset);
				if (idx !== -1) {
					let inc = locations[idx];
					inc++;
					locations[idx] = inc;
				}
			}
			last = op;
		}
	}

	console.log(globals);
	console.log(gvalues);
	console.log(locations);
}

function convertToImportedGlobal(mod, oldGlobal, newGlobal) {

	let gvalues = [];
	let firstInvalid = -1;
	let firstNonImport = 0;
	let newIndex = -1;
	let globals = mod.globals;
	let len = globals.length;
	for (let i = 0; i < len; i++) {
		let glob = globals[i];
		if (glob instanceof WasmGlobal) {
			firstNonImport = i;
			break;
		}
	}

	let idx = globals.indexOf(oldGlobal);
	if (idx == -1) {
		throw TypeError("global is undefined");
	}

	if (idx == firstNonImport) {
		globals[idx] = newGlobal;
		newIndex = idx;
	} else {
		globals.splice(idx, 1);
		globals.splice(firstNonImport, 0, newGlobal);
		firstInvalid = idx;
		newIndex = firstNonImport;
	}

	// TODO: invalidate 

	let rawValue;
	
	if (oldGlobal.init.length == 2 && oldGlobal.init[0].opcode == 0x41 && oldGlobal.init[1].opcode == 0x0B) {
		rawValue = oldGlobal.init[0].value;
	} else {
		throw new TypeError("globals initial value unsupported");
	}

	let start = 0;
	let imports = mod.imports;
	len = imports.length;
	for (let i = 0; i < len; i++) {
		let imp = imports[i];
		if (imp instanceof ImportedFunction) {
			start++;
		}
	}

	functions = mod.functions;
	ylen = functions.length;
	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		let xend = xlen - 1;
		let dirty = false;
		let last = null;
		for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
			let op = opcodes[x];
			if (op.opcode == 0x23 || op.opcode == 0x24) {

				if (op.global == oldGlobal) {
					op.global = newGlobal;
					op.x = newIndex;
					dirty = true;
				}
			} else if (op.opcode == 0x41) { // i32.const
				let val = op.value;
				let idx = gvalues.indexOf(val);
				if (val == rawValue) {
					let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
					opcodes[x] = inst;
					dirty = true;
				} else if (val == 0 && x < xlen - 1) {
					let peek = opcodes[x + 1];
					if (peek.opcode == 0x28 && peek.offset == rawValue) {
						let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
						opcodes[x] = inst;
						opcodes.splice(x + 1, 1);
						xlen--;
						dirty = true;
					} else if (peek.opcode == 0x36 && peek.offset == rawValue) {
						let inst = {opcode: 0x24, global: newGlobal, x: newIndex};
						opcodes[x] = inst;
						opcodes.splice(x + 1, 1);
						xlen--;
						dirty = true;
					}
				}
			}
		}

		if (dirty)
			func._opcodeDirty = true;
	}

	// marks every function that uses a global defined after the replaced one as dirty to force update.
	if (firstInvalid !== -1) {
		let functions = mod.functions;
		let ylen = functions.length;
		for (let y = start; y < ylen; y++) {
			let func = functions[y];
			if (func._opcodeDirty)
				continue;
			let dirty = false;
			let opcodes = func.opcodes;
			let xlen = opcodes.length;
			for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
				let op = opcodes[x];
				if (op.opcode == 0x23 || op.opcode == 0x24) {
					let idx = op.x;
					if (op.x >= firstInvalid) {
						dirty = true;
						break;
					}
				}
			}

			if (dirty)
				func._opcodeDirty = true;
		}
	}

	return true;
}

let __uiInit = false;

function setupUI() {
	let container = document.querySelector("#wasm-memory");
	let minInput = container.querySelector("#memory-min");
	let minHint = container.querySelector("output[for=memory-min]")
	minInput.addEventListener("input", function(evt) {
		let value = parseInt(minInput.value);
		minHint.textContent = humanFileSize(value * 65536, true);
	});

	let maxInput = container.querySelector("#memory-max");
	let maxOutput = container.querySelector("output[for=memory-max]")
	maxInput.addEventListener("input", function(evt) {
		let value = parseInt(maxInput.value);
		maxOutput.textContent = humanFileSize(value * 65536, true);
	});

	let workflowSelect = document.querySelector("#workflow-select");
	let len = moduleWorkflows.length;
	for (let i = 0; i < len; i++) {
		let opt = document.createElement("option");
		opt.textContent = moduleWorkflows[i].name;
		workflowSelect.appendChild(opt);
	}

	let selectedAction = moduleWorkflows[0];
	let actionInfo = document.querySelector("#action-info");
	while (actionInfo.lastChild) {
		actionInfo.removeChild(actionInfo.lastChild);
	}
	if (typeof selectedAction.onselect == "function") {
		selectedAction.onselect(actionInfo, selectedAction);
	}

		
	let runWorkflowBtn = document.querySelector("#run-workflow");
	runWorkflowBtn.addEventListener("click", function(evt) {
		if (typeof selectedAction.onrun == "function") {
			selectedAction.onrun(actionInfo, selectedAction);
		}
	});

	workflowSelect.addEventListener("change", function(evt) {
		let idx = workflowSelect.selectedIndex;
		let action = moduleWorkflows[idx];
		while (actionInfo.lastChild) {
			actionInfo.removeChild(actionInfo.lastChild);
		}
		if (typeof action.onselect == "function") {
			action.onselect(actionInfo, action);
		}
		selectedAction = action;
	});

	let runWorkflowUIBtn = document.querySelector("#run-workflow-2");
	runWorkflowUIBtn.addEventListener("click", function(evt) {
		if (targetFilename == "kern.wasm") {
			runWorkflowActions(targetModule, _freebsdWorkflow);
		}
		populateWebAssemblyInfo(targetModule);
	});
}

function showMemoryParamEditor(container, memory) {

	let maxInput = container.querySelector("#memory-max");
	let minInput = container.querySelector("#memory-min");
	minInput.value = memory.min;
	let minOutput = container.querySelector("output[for=memory-min]");
	minOutput.textContent = humanFileSize(memory.min * 65536, true);
	if (memory.max !== null) {
		let maxOutput = container.querySelector("output[for=memory-max]");
		maxInput.value = memory.max;
		maxOutput.textContent = humanFileSize(memory.max * 65536, true);
	} else {
		let row = container.querySelector("#memory-max").parentElement;
		row.style.opacity = "0.5";
	}

	minInput.addEventListener("change", function(evt) {
		memory.min = parseInt(minInput.value);
		let sec = findModuleByType(targetModule, SECTION_TYPE.IMPORT);
		sec._isDirty = true;
	});

	maxInput.addEventListener("change", function(evt) {
		memory.max = parseInt(maxInput.value);
		let sec = findModuleByType(targetModule, SECTION_TYPE.IMPORT);
		sec._isDirty = true;
	});

	let input = container.querySelector("#memory-shared");
	input.checked = memory.shared;
	input.addEventListener("change", function(evt) {
		memory.shared = input.checked;
		let sec = findModuleByType(targetModule, SECTION_TYPE.IMPORT);
		sec._isDirty = true;
	});
}

function wasmStyleTypeString(functype) {
    let arg, ret;
    let argc = functype.argc;
    if (argc == 0) {
        arg = "[]";
    } else if (argc == 1){
    	arg = type_name(functype.argv[0]);
        arg = '[' + arg + ']';
    } else {
        let argv = functype.argv;
        arg = [];
        for (let x = 0; x < argc; x++) {
            arg.push(type_name(argv[x]));
        }
        arg = '[' + arg.join(" ") + ']';
    }

    let retc = functype.retc;
    if (retc == 0) {
        ret = "[]";
    } else if (retc == 1){
    	ret = type_name(functype.retv[0]);
        ret = '[' + ret + ']';
    } else {
        let retv = functype.retv;
        ret = [];
        for (let x = 0; x < retc; x++) {
            ret.push(type_name(retv[x]));
        }
        ret = '[' + ret.join(" ") + ']';
    }

    return arg + " -> " + ret;
}

const inspectorUI = {
	'globals': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let table = document.createElement("table");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>index</th><th>name</th><th>type</th><th>initial value</th><th>use count</th><th>import/export</th></tr>";
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);

		let gmap;
		let defaultCollection;
		let collection;
		let pageIndex = 0;
		let pageRowCount = 25;

		function doFreeTextSearch(value) {
			if (!gmap)
				gmap = namedGlobalsMap(targetModule);

			let val_lc = value.toLowerCase();
			let match = [];
			for (let p in gmap) {
				if (p.toLowerCase().indexOf(val_lc) !== -1) {
					match.push({name: p, global: gmap[p]});
				}
			}

			return match;
		}

		function listResults(value) {
			while (tbody.lastChild) {
				tbody.removeChild(tbody.lastChild);
			}

			let start = pageIndex * pageRowCount;

			let globals = targetModule.globals;
			let len = Math.min(collection.length, start + pageRowCount);
			for (let i = start; i < len; i++) {
				let item = collection[i];
				let glob = item.global;

				let tr = document.createElement("tr");
				let td = document.createElement("td");
				td.textContent = globals.indexOf(glob);
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = item.name;
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = type_name(glob.type);
				tr.appendChild(td);
				td = document.createElement("td");
				if (glob instanceof WasmGlobal) {
					let init = glob.init[0].value
					td.textContent = init;
				}
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = typeof glob.usage == "number" ? glob.usage : "";
				tr.appendChild(td);
				td = document.createElement("td"); // import/export
				tr.appendChild(td);
				tbody.appendChild(tr);
			}

			footer.textContent = "found " + collection.length + " matches";
		}

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				pageIndex = 0;
				curr.textContent = "1";
				listResults();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (pageIndex == 0)
					return;
				pageIndex--;
				curr.textContent = (pageIndex + 1)
				listResults();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				if (pageIndex == last)
					return;
				pageIndex++;
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				pageIndex = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			listResults(value);
		});

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		gmap = namedGlobalsMap(targetModule);

		defaultCollection = [];
		collection = defaultCollection;
		for (let p in gmap) {
			defaultCollection.push({name: p, global: gmap[p]});
		}

		listResults();
		
	},
	'functions': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findResults = document.createElement("ul");
		body.appendChild(findResults);

		let table = document.createElement("table");
		table.classList.add("data-table","wasm-functions");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>funcidx</th><th>name</th><th><code>in -> out</code></th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr>";
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);

		let defaultCollection;
		let collection;
		let pageIndex = 0;
		let pageRowCount = 25;

		function doFreeTextSearch(value) {
			let val_lc = value.toLowerCase();
			let match = [];
			let names = targetModule.names.functions;
			for (const [idx, name] of names) {
				if (name.toLowerCase().indexOf(val_lc) !== -1) {
					match.push({funcidx: idx, name: name});
				}
			}

			return match;
		}

		function listResults() {
			while (tbody.lastChild) {
				tbody.removeChild(tbody.lastChild);
			}

			let start = pageIndex * pageRowCount;

			let len = Math.min(collection.length, start + pageRowCount);
			for (let i = start; i < len; i++) {
				let item = collection[i];
				let funcidx = item.funcidx;
				let func = targetModule.functions[funcidx];

				let tr = document.createElement("tr");
				let td = document.createElement("td");
				td.classList.add("wasm-funcidx");
				//let span = document.createElement("span");
				//span.classList.add("index-badge")
				//span.textContent = item.funcidx;
				//td.appendChild(span);
				td.textContent = item.funcidx;
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = item.name;
				tr.appendChild(td);
				td = document.createElement("td");
				td.classList.add("wasm-stack-signature");
				td.textContent = wasmStyleTypeString(func.type);
				tr.appendChild(td);
				td = document.createElement("td");
				td.classList.add("wasm-typeidx");
				let typeidx = targetModule.types.indexOf(func.type);
				//span = document.createElement("span");
				//span.classList.add("index-badge")
				//span.textContent = typeidx;
				//td.appendChild(span);
				td.textContent = typeidx;
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = typeof func.usage == "number" ? func.usage : "";
				tr.appendChild(td);
				td = document.createElement("td"); // stack usage
				if (typeof func.stackUsage == "number")
					td.textContent = func.stackUsage;
				tr.appendChild(td);
				td = document.createElement("td"); // instruction count
				td.textContent = (func instanceof WasmFunction) ? func.opcodes.length : "";
				tr.appendChild(td);
				td = document.createElement("td"); // bytecode size
				td.textContent = (func instanceof WasmFunction) ? (func.opcode_end - func.codeStart) : "";
				tr.appendChild(td);
				tbody.appendChild(tr);
			}

			footer.textContent = "found " + collection.length + " matches";
		}

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				pageIndex = 0;
				curr.textContent = "1"
				listResults();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (pageIndex == 0)
					return;
				pageIndex--;
				curr.textContent = (pageIndex + 1)
				listResults();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				if (pageIndex == last)
					return;
				pageIndex++;
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				pageIndex = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		defaultCollection = [];
		collection = defaultCollection;
		if (targetModule.names && targetModule.names.functions) {
			let names = targetModule.names.functions;
			for (const [idx, name] of names) {
				defaultCollection.push({funcidx: idx, name: name});
			}
		}

		listResults();

		//let tbltest = document.createElement("table");
		//tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		//body.appendChild(tbltest);
	},
	'tables': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findResults = document.createElement("ul");
		body.appendChild(findResults);

		let table = document.createElement("table");
		table.classList.add("data-table","wasm-functions");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>index</th><th>funcidx</th><th>name</th><th><code>in -> out</code></th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr>";
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);

		let defaultCollection;
		let collection;
		let pageIndex = 0;
		let pageRowCount = 25;

		function doFreeTextSearch(value) {
			let val_lc = value.toLowerCase();
			let matches = [];
			let len = defaultCollection.length;
			for (let i = 0; i < len; i++) {
				let item = defaultCollection[i];
				let name = item.name;
				if (name.toLowerCase().indexOf(val_lc) !== -1) {
					matches.push(item);
				}
			}

			return matches;
		}

		function listResults() {
			while (tbody.lastChild) {
				tbody.removeChild(tbody.lastChild);
			}

			let start = pageIndex * pageRowCount;

			let len = Math.min(collection.length, start + pageRowCount);
			for (let i = start; i < len; i++) {
				let item = collection[i];
				let funcidx = item.funcidx;
				let func = targetModule.functions[funcidx];

				let tr = document.createElement("tr");
				let td = document.createElement("td");
				td.textContent = item.index;
				tr.appendChild(td);
				td = document.createElement("td");
				td.classList.add("wasm-funcidx");
				//let span = document.createElement("span");
				//span.classList.add("index-badge")
				//span.textContent = item.funcidx;
				//td.appendChild(span);
				td.textContent = item.funcidx;
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = item.name;
				tr.appendChild(td);
				td = document.createElement("td");
				td.classList.add("wasm-stack-signature");
				td.textContent = wasmStyleTypeString(func.type);
				tr.appendChild(td);
				td = document.createElement("td");
				td.classList.add("wasm-typeidx");
				let typeidx = targetModule.types.indexOf(func.type);
				//span = document.createElement("span");
				//span.classList.add("index-badge")
				//span.textContent = typeidx;
				//td.appendChild(span);
				td.textContent = typeidx;
				tr.appendChild(td);
				td = document.createElement("td");
				td.textContent = typeof func.usage == "number" ? func.usage : "";
				tr.appendChild(td);
				td = document.createElement("td"); // stack usage
				if (typeof func.stackUsage == "number")
					td.textContent = func.stackUsage;
				tr.appendChild(td);
				td = document.createElement("td"); // instruction count
				td.textContent = (func instanceof WasmFunction) ? func.opcodes.length : "";
				tr.appendChild(td);
				td = document.createElement("td"); // bytecode size
				td.textContent = (func instanceof WasmFunction) ? (func.opcode_end - func.codeStart) : "";
				tr.appendChild(td);
				tbody.appendChild(tr);
			}

			footer.textContent = "found " + collection.length + " matches";
		}

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				pageIndex = 0;
				curr.textContent = "1"
				listResults();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (pageIndex == 0)
					return;
				pageIndex--;
				curr.textContent = (pageIndex + 1)
				listResults();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				if (pageIndex == last)
					return;
				pageIndex++;
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				pageIndex = collection.length == 0 ? 0 : Math.floor(collection.length / pageRowCount);
				curr.textContent = (pageIndex + 1);
				listResults();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		defaultCollection = [];
		collection = defaultCollection;
		if (targetModule.names && targetModule.names.functions) {
			let names = targetModule.names.functions;
			let contents = targetModule.tables[0].contents;
			let len = contents.length;
			for (let i = 1; i < len; i++) {
				let funcidx = contents[i];
				let name = names.get(funcidx);
				defaultCollection.push({index: i, funcidx: funcidx, name: name});
			}
		}
		listResults();

		//let tbltest = document.createElement("table");
		//tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		//body.appendChild(tbltest);
	},
	'data_segments': function(header, body) {

	},
	'custom_sections': function(header, body) {

	},
};

function namedGlobalsMap(mod) {
	let arr1 = [];
	let arr2 = [];
	let unamedGlobals = [];
	let map = {};
	let globals = targetModule.globals;
	let exported = targetModule.exports;
	let len = exported.length;
	for (let i = 0; i < len; i++) {
		let exp = exported[i];
		if (exp.type != "global")
			continue;
		arr1.push(exp.name);
		arr2.push(exp.global);
		map[exp.name] = exp.global;
	}

	if (mod.names && mod.names.globals) {
		let nmap = mod.names.globals;
		for (const [idx, name] of nmap) {
			let glob = globals[idx];
			if (arr2.indexOf(glob) === -1) {
				arr2.push(glob);
				map[name] = glob;
			}
		}
	}

	len = globals.length;
	for (let i = 0; i < len; i++) {
		let glob = globals[i];
		if (arr2.indexOf(glob) === -1) {
			unamedGlobals.push(glob);
		}
	}

	console.log(map);
	console.log(unamedGlobals);

	return map;
}

/**
 * 
 * @param {*} mod 
 */
function populateWebAssemblyInfo(mod) {

	if (!__uiInit) {
		setupUI();
		__uiInit = true;
	}

	let container = document.querySelector("#wasm-memory");

	let memory = mod.memory;
	let len = memory.length;
	for (let i = 0; i < len; i++) {
		let mem = memory[i];
		showMemoryParamEditor(container, mem);
	}

	let con2 = document.querySelector("#test");
	let headers = con2.querySelectorAll("ul li.accordion-header");
	len = headers.length;
	for (let i = 0; i < len; i++) {
		let li = headers.item(i);
		if (li.textContent.trim() == "Memory")
			continue;
		li.classList.add("open");
		let body = document.createElement("li");
		body.classList.add("accordion-body", "open");
		li.parentElement.insertBefore(body, li.nextElementSibling);
		let txt = li.textContent.trim().toLowerCase();
		if (txt == "globals") {
			inspectorUI.globals(li, body);
		} else if (txt == "functions") {
			inspectorUI.functions(li, body);
		} else if (txt == "tables") {
			inspectorUI.tables(li, body);
		} else if (txt == "data") {
			inspectorUI.data_segments(li, body);
		} else if (txt == "custom sections") {
			inspectorUI.custom_sections(li, body);
		}
	}

	namedGlobalsMap(mod);

	console.log(headers);

}

// run-length-encoding


function encodeRLE(data, offset, length) {

}

function decodeRLE(data, offset, length) {

}

/*
// NOTE: the impl below (from the as3 era) don't works, its more of a unfinished mockup.
private static function encode_rle(bytes:ByteArray,channel:Vector.<uint>):void{
	var c:Vector.<uint> = channel;
	var len:int = c.length;
	var i:int;			// holds the position for the main loop.
	var m:Boolean;		// holds boolean for if the value is matched(true) or diffrent(false).
	var b:Vector.<uint>	// holds reference for the current run lenght block.
	var run:int;		// holds position for the sub loop.
	var v:uint;			// holds the current repeated or uniqe value.
	//
	for (i = 0; i < len; i++) {
		if (!m) {
			// Different type run.
			while (!m && run < 128) {
				// determent that the next 2 values isnt the same as the last, in that case m must be set to false.
				i++;
			}
			// writes the rle block to byte array.
			bytes.writeByte(uint(run + 125));
			bytes.writeByte(v);
			run = 0;
		} else {		
			// Same type run.
			while (m && run < 128) {
				// determent that the next value is the same as the current, as long as it is this loop will run.
				run++;
				i++;
			}
			// writes the rle block to byte array.
			bytes.writeByte(uint(run + 125));
			bytes.writeByte(v);
			run = 0;
		}
	}
}
private static function decode_rle(bytes:ByteArray,channel:Vector.<int>,len:int):void{
	var i:int;
	var n:int;
	var byte:int;
	var size:int;
	i = 0;
	while (i < len) {
		byte = bytes.readUnsignedByte();
		if (byte >= 128) {
			size = byte - 125;
			byte = bytes.readUnsignedByte();
			for (n = 0; n < size && (i + 1) < len; n++){
				channel.push(byte);
			}
			i += size;
		} else {
			size = byte + 1;
			for (n = 0; n < size && (i + 1) < len; n++){
				byte = bytes.readUnsignedByte();
				channel.push(byte);
			}
			i += size;
		}
	}
}		
*/

// UI
// TODO: 
// 
// links:
// binary summary like; https://css-tricks.com/html5-meter-element/

function filesFromDataTransfer(dataTransfer) {
	
	let files = [];
	if (dataTransfer.items) {
		let len = dataTransfer.items.length;
		for (let i = 0; i < len; i++) {
			let item = dataTransfer.items[i];
			if (item.kind == "file") {
				let file = item.getAsFile();
				files.push(file);
			}
		}
	}

	if (files.length == 0) {
		let len = dataTransfer.files.length;
		for (let i = 0; i < len; i++) {
			let file = dataTransfer.files[i];
			files.push(file);
		}
	}

	return files;
}

function setupTargetPanel(container) {

	let workflowUl = document.createElement("ul");
	workflowUl.classList.add("workflow-ui");
	container.appendChild(workflowUl);

	// input binary

	let inputPicker = document.createElement("li");
	inputPicker.classList.add("workflow-action", "workflow-input-file");
	let header = document.createElement("div");
	header.classList.add("action-header");
	header.textContent = "Input";
	inputPicker.appendChild(header);
	let body = document.createElement("div");
	body.classList.add("action-body");
	body.style.width = "100%";
	body.textContent = "body";
	inputPicker.appendChild(body);
	let options = document.createElement("div");
	options.classList.add("action-header");
	options.textContent = "chose";
	inputPicker.appendChild(options);
	workflowUl.appendChild(inputPicker);

	inputPicker.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	inputPicker.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});

	inputPicker.addEventListener("drop", function(evt) {

		let files = filesFromDataTransfer(evt.dataTransfer);
		if (files.length == 0) {
			event.preventDefault();
			return;
		}

		findInputFiles(files);

		let label = inputPicker.querySelector(".action-body");
		label.textContent = files[0].name;
		appendFiles(files);

		event.preventDefault();
	});

	// output data

	let outputPicker = document.createElement("li");
	outputPicker.classList.add("workflow-action");
	header = document.createElement("div");
	header.classList.add("action-header");
	header.textContent = "Output";
	outputPicker.appendChild(header);
	body = document.createElement("div");
	body.classList.add("action-body");
	body.style.width = "100%";
	body.textContent = "body";
	outputPicker.appendChild(body);
	options = document.createElement("div");
	options.classList.add("action-header");
	options.textContent = "chose";
	outputPicker.appendChild(options);
	workflowUl.appendChild(outputPicker);

	outputPicker.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	outputPicker.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});

	outputPicker.addEventListener("drop", function(evt) {

		let files = filesFromDataTransfer(evt.dataTransfer);
		if (files.length == 0) {
			event.preventDefault();
			return;
		}
		let label = outputPicker.querySelector(".action-body");
		label.textContent = files[0].name;
		appendFiles(files);

		event.preventDefault();
	});

	// output binary

	let outputDataPicker = document.createElement("li");
	outputDataPicker.classList.add("workflow-action");
	header = document.createElement("div");
	header.classList.add("action-header");
	header.textContent = "Output";
	outputDataPicker.appendChild(header);
	body = document.createElement("div");
	body.classList.add("action-body");
	body.style.width = "100%";
	body.textContent = "body";
	outputDataPicker.appendChild(body);
	options = document.createElement("div");
	options.classList.add("action-header");
	options.textContent = "chose";
	outputDataPicker.appendChild(options);
	workflowUl.appendChild(outputDataPicker);

	outputDataPicker.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	outputDataPicker.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});

	outputDataPicker.addEventListener("drop", function(evt) {

		let files = filesFromDataTransfer(evt.dataTransfer);
		if (files.length == 0) {
			event.preventDefault();
			return;
		}
		let label = outputDataPicker.querySelector(".action-body");
		label.textContent = files[0].name;
		appendFiles(files);

		event.preventDefault();
		return false;
	});
}

let fileUl;
let targetFilename;
let lastTabView = document.querySelector("div#workflow-ui-panel");
let mainTabItems = [{
	selector: "#tab-workflow-ui.tab-item",
	action: function(element) {
		let view = document.querySelector("div#workflow-ui-panel");
		if (lastTabView)
			lastTabView.style.display = "none";
		view.style.display = null;
		lastTabView = view;
	}
}, {
	selector: "#tab-files.tab-item",
	action: function(element) {

	}
}, {
	selector: "#tab-export.tab-item",
	action: function(element) {

	}
}, {
	selector: "#tab-inspect.tab-item",
	action: function(element) {
		let view = document.querySelector("div#test");
		if (lastTabView)
			lastTabView.style.display = "none";
		view.style.display = null;
		lastTabView = view;
	}
}, {
	selector: "#tab-readme.tab-item",
	action: function(element) {
		let view = document.querySelector("article#readme");
		if (lastTabView)
			lastTabView.style.display = "none";
		view.style.display = null;
		lastTabView = view;
	}
}, ]

function appendFiles(files) {
	let len = files.length;
	for (let i = 0; i < len; i++) {
		let file = files[i];
		let li = document.createElement("li");
		li.textContent = file.name;
		fileUl.appendChild(li);
	}
}

function findInputFiles(files) {

	let wasmFiles = [];
	let hasSymbolFile = false;

	let len = files.length;
	for (let i = 0; i < len; i++) {
		let file = files[i];
		if (file.type == "application/wasm") {
			wasmFiles.push({binary: file });
		} else if (file.name.endsWith(".symbols")) {
			hasSymbolFile = true;
		}
	}

	let ylen = files.length;
	for (let y = 0; y < ylen; y++) {
		let f1 = files[y];
		let n1 = f1.name;
		if (!n1.endsWith(".symbols")) {
			continue;
		}

		let xlen = wasmFiles.length;
		for (let x = 0; x < xlen; x++) {
			let f2 = wasmFiles[x].binary;
			let n2 = file.name;
			let prefix = n2.split(".");
			prefix.pop();
			prefix = prefix.join(".");
			if (n1.startsWith(prefix)) {
				wasmFiles[x].symbolMapFile = f1;
				break;
			}
		}
	}

	console.log(wasmFiles);

	if (wasmFiles.length == 1) {
		let file = wasmFiles[0].binary;
		targetFilename = file.name;
		//loadWebAssemblyBinary(buf);
		loadFilePairs(wasmFiles[0].binary, wasmFiles[0].symbolMapFile).then(function(res) {
			if (file.name == "kern.wasm") {
				inspectFreeBSDBinary(moduleBuffer, targetModule);
			}
		});
		/*file.arrayBuffer().then(function(buf) {
			loadWebAssemblyBinary(buf);
		}, console.error);*/
		let label = document.querySelector("li.workflow-input-file .action-body");
		label.textContent = file.name;
		
	}

}

async function loadFilePairs(binary, symbolMapFile) {
	let buf1 = await binary.arrayBuffer();
	let buf2;
	if (symbolMapFile)
		buf2 = await symbolMapFile.text();

	return loadWebAssemblyBinary(buf1, buf2) 
}

function setupMainUI() {

	let readmeContainer = document.querySelector("article#readme");
	let dropZoneDiv = document.querySelector("div#drop-zone");
	if (readmeContainer)
		readmeContainer.style.display = "none";

	dropZoneDiv.style.display = "none";

	/*document.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	document.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});*/



	let tabMap = [];
	let len = mainTabItems.length;
	for (let i = 0; i < len; i++) {
		let item = mainTabItems[i];
		let element = document.querySelector(item.selector);
		if (!element) {
			tabMap.push(null);
			continue;
		}
		tabMap.push(element);
		element.addEventListener("click", onMainTabClick);
	}

	function onMainTabClick(evt) {
		let target = evt.currentTarget;
		let index = tabMap.indexOf(target);
		if (index === -1) 
			return;
		let obj = mainTabItems[index];
		obj.action(target);
	}

	fileUl = document.createElement("ul");

	/*document.addEventListener("drop", function(evt) {

		console.log(evt.dataTransfer);

		let dataTransfer = evt.dataTransfer;
		let files = [];
		if (dataTransfer.items) {
			let len = dataTransfer.items.length;
			for (let i = 0; i < len; i++) {
				let item = dataTransfer.items[i];
				if (item.kind == "file") {
					let file = item.getAsFile();
					files.push(file);
					// item.webkitGetAsEntry() // non-standard API
					// item.getAsFileSystemHandle() // returns Promise
					// 
					// https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/getAsFileSystemHandle
				}
			}
		}

		if (files.length == 0) {
			let len = dataTransfer.files.length;
			for (let i = 0; i < len; i++) {
				let file = dataTransfer.files[i];
				files.push(file);
			}
		}

		console.log(files);
		dropZoneDiv.style.display = "none";
		appendFiles(files);

		findInputFiles(files);

		event.preventDefault();
	});*/

	let fileTab = document.querySelector("nav.topnav #tab-files.tab-item");
	fileTab.addEventListener("click", function (evt) {

		document.body.appendChild(fileUl);
		fileUl.style.position = "absolute";
		fileUl.style.left = "10px";
		fileUl.style.top = "10px";
		fileUl.style.background = "#fff";
	});

	let targetPanel = document.createElement("div");
	targetPanel.classList.add("target-panel");
	let workflowUIPanel = document.querySelector("div#workflow-ui-panel");
	if (workflowUIPanel) {
		workflowUIPanel.insertBefore(targetPanel, workflowUIPanel.firstElementChild);
		let actionInfo = document.querySelector("#action-info");
		if (actionInfo)
			workflowUIPanel.appendChild(actionInfo);
	} else {
		readmeContainer.parentElement.insertBefore(targetPanel, readmeContainer);
	}
	setupTargetPanel(targetPanel);

	let inspectorContainer = document.querySelector("div#test");
	inspectorContainer.style.display = "none";
	{
		let wasmInfo = document.querySelector("#wasm-info");
		if (wasmInfo)
			inspectorContainer.insertBefore(wasmInfo, inspectorContainer.firstElementChild);
	}
}

setupMainUI();

function processSymbolsMap(mod, txt) {

	let map = new Map();
	let len = txt.length;
	let idx = 0;
	while (idx < len) {
		let end = txt.indexOf(':', idx);
		if (idx == -1)
			break;
		let num = txt.substring(idx, end);
		num = parseInt(num);
		idx = end + 1;
		end = txt.indexOf('\n', idx);
		let name;
		if (end !== -1) {
			name = txt.substring(idx, end);
			idx = end + 1;
		} else {
			name = txt.substring(idx);
			idx = len;
		}
		map.set(num, name);
	}

	console.log(map);
	mod.names = {};
	mod.names.functions = map;
}

/**
 * Computes a new ArrayBuffer which represents the modules initial memory, placed as it would be at runtime.
 * 
 * @param {*} mod
 * @returns A copy of the memory content of the module such as it would be initialized by the Wasm Runtime.
 */
function computeInitialMemory(mod, buf) {
	let segments = mod.dataSegments
	let len = segments.length;
	let min = segments[0].inst.opcodes[0].value;
	let max = 0;
	for (let i = 0; i < len; i++) {
		let seg = segments[i];
		let val = seg.inst.opcodes[0].value;
		let end = val + seg.size;
		if (end > max) {
			max = end;
		}
	}

	let mem = new Uint8Array(max);
	let src = new Uint8Array(buf);

	for (let i = 0; i < len; i++) {
		let seg = segments[i];
		let off = seg.inst.opcodes[0].value;
		u8_memcpy(src, seg.offset, seg.size, mem, off);
	}

	return mem;
}

// FreeBSD inspect 

function sysinit_sub_id(val) {
	switch (val) {
		case 0x0000000: return "si_sub_dummy";
		case 0x0000001: return "si_sub_done";
		case 0x0700000: return "si_sub_tunables";
		case 0x0800001: return "si_sub_copyright";
		case 0x1000000: return "si_sub_vm";
		case 0x1100000: return "si_sub_counter";
		case 0x1800000: return "si_sub_kmem";
		case 0x1A40000: return "si_sub_hypervisor";
		case 0x1A80000: return "si_sub_witness";
		case 0x1AC0000: return "si_sub_mtx_pool_dynamic";
		case 0x1B00000: return "si_sub_lock";
		case 0x1C00000: return "si_sub_eventhandler";
		case 0x1E00000: return "si_sub_vnet_prelink";
		case 0x2000000: return "si_sub_kld";
		case 0x2080000: return "si_sub_khelp";
		case 0x2100000: return "si_sub_cpu";
		case 0x2110000: return "si_sub_racct";
		case 0x2140000: return "si_sub_kdtrace";
		case 0x2160000: return "si_sub_random";
		case 0x2180000: return "si_sub_mac";
		case 0x21C0000: return "si_sub_mac_policy";
		case 0x21D0000: return "si_sub_mac_late";
		case 0x21E0000: return "si_sub_vnet";
		case 0x2200000: return "si_sub_intrinsic";
		case 0x2300000: return "si_sub_vm_conf";
		case 0x2380000: return "si_sub_ddb_services";
		case 0x2400000: return "si_sub_run_queue";
		case 0x2480000: return "si_sub_ktrace";
		case 0x2490000: return "si_sub_opensolaris";
		case 0x24C0000: return "si_sub_audit";
		case 0x2500000: return "si_sub_create_init";
		case 0x2600000: return "si_sub_sched_idle";
		case 0x2700000: return "si_sub_mbuf";
		case 0x2800000: return "si_sub_intr";
		case 0x2880000: return "si_sub_taskq";
		case 0x2888000: return "si_sub_epoch";
		case 0x2900000: return "si_sub_smp";
		case 0x2A00000: return "si_sub_softintr";
		case 0x2F00000: return "si_sub_devfs";
		case 0x3000000: return "si_sub_init_if";
		case 0x3010000: return "si_sub_netgraph";
		case 0x3020000: return "si_sub_dtrace";
		case 0x3048000: return "si_sub_dtrace_provider";
		case 0x308C000: return "si_sub_dtrace_anon";
		case 0x3100000: return "si_sub_drivers";
		case 0x3800000: return "si_sub_configure";
		case 0x4000000: return "si_sub_vfs";
		case 0x4800000: return "si_sub_clocks";
		case 0x6400000: return "si_sub_sysv_shm";
		case 0x6800000: return "si_sub_sysv_sem";
		case 0x6C00000: return "si_sub_sysv_msg";
		case 0x6E00000: return "si_sub_p1003_1b";
		case 0x7000000: return "si_sub_pseudo";
		case 0x7400000: return "si_sub_exec";
		case 0x8000000: return "si_sub_proto_begin";
		case 0x8100000: return "si_sub_proto_pfil";
		case 0x8400000: return "si_sub_proto_if";
		case 0x8600000: return "si_sub_proto_domaininit";
		case 0x8700000: return "si_sub_proto_mc";
		case 0x8800000: return "si_sub_proto_domain";
		case 0x8806000: return "si_sub_proto_firewall";
		case 0x8808000: return "si_sub_proto_ifattachdomain";
		case 0x8ffffff: return "si_sub_proto_end";
		case 0x9000000: return "si_sub_kprof";
		case 0xa000000: return "si_sub_kick_scheduler";
		case 0xa800000: return "si_sub_int_config_hooks";
		case 0xb000000: return "si_sub_root_conf";
		case 0xd000000: return "si_sub_intrinsic_post";
		case 0xd800000: return "si_sub_syscalls";
		case 0xdc00000: return "si_sub_vnet_done";
		case 0xe000000: return "si_sub_kthread_init";
		case 0xe400000: return "si_sub_kthread_page";
		case 0xe800000: return "si_sub_kthread_vm";
		case 0xea00000: return "si_sub_kthread_buf";
		case 0xec00000: return "si_sub_kthread_update";
		case 0xee00000: return "si_sub_kthread_idle";
		case 0xf000000: return "si_sub_smp";
		case 0xf100000: return "si_sub_racctd";
		case 0xfffffff: return "si_sub_last";
		default:
			return val;
	}
}

function findExportNameByRef(mod, obj) {
	let exps = mod.exports;
	let len = exps.length;
	for (let i = 0; i < len; i++) {
		let exp = exps[i];
		if (exp instanceof ExportedFunction && exp.function === obj) {
			return exp.name;
		} else if (exp instanceof ExportedGlobal && exp.global === obj) {
			return exp.name;
		} else if (exp instanceof ExportedMemory && exp.memory === obj) {
			return exp.name;
		} else if (exp instanceof ExportedTable && exp.table === obj) {
			return exp.name;
		}
	}

	return null;
}

function findExportDefByObject(mod, obj) {
	let exps = mod.exports;
	let len = exps.length;
	for (let i = 0; i < len; i++) {
		let exp = exps[i];
		if (exp instanceof ExportedFunction && exp.function === obj) {
			return exp;
		} else if (exp instanceof ExportedGlobal && exp.global === obj) {
			return exp;
		} else if (exp instanceof ExportedMemory && exp.memory === obj) {
			return exp;
		} else if (exp instanceof ExportedTable && exp.table === obj) {
			return exp;
		}
	}

	return undefined;
}

function inspectFreeBSDBinary(buf, mod) {

	if (!_namedGlobals)
		_namedGlobals = namedGlobalsMap(mod);

	let start_sysinit = _namedGlobals["__start_set_sysinit_set"].init[0].value;
	let stop_sysinit = _namedGlobals["__stop_set_sysinit_set"].init[0].value;

	let segments = mod.dataSegments
	let len = segments.length;
	let min = segments[0].inst.opcodes[0].value;
	let max = 0;
	for (let i = 0; i < len; i++) {
		let seg = segments[i];
		let val = seg.inst.opcodes[0].value;
		let end = val + seg.size;
		if (end > max) {
			max = end;
		}
	}

	let mem = new Uint8Array(max);
	let data = new DataView(mem.buffer);
	let src = new Uint8Array(buf);

	for (let i = 0; i < len; i++) {
		let seg = segments[i];
		let val = seg.inst.opcodes[0].value;
		let end = val + seg.size;
		if (end > max) {
			max = end;
		}
		u8_memcpy(src, seg.offset, seg.size, mem, val);
	}

	console.log(mem);
	console.log("start_sysinit = %d", start_sysinit);
	console.log("stop_sysinit = %d", stop_sysinit);

	let idx = start_sysinit;
	let cnt = 0;
	let arr = [];
	while (idx < stop_sysinit) {
		let ptr = data.getUint32(idx, true);
		let sub_id = data.getUint32(ptr, true);
		let order = data.getUint32(ptr + 4, true);
		let funcidx = data.getUint32(ptr + 8, true);
		let udata = data.getUint32(ptr + 12, true);
		arr.push({
			index: cnt++,
			subsystem: sub_id,
			ssname: sysinit_sub_id(sub_id),
			order: order,
			funcidx: funcidx,
			udata: udata
		});
		idx += 4;
	}

	let old = arr.slice();
	console.log(old);

	// sorting that match what freebsd does in mi_startup()
	len = arr.length;
	for (let y = 0; y < len; y++) {
		let sipp = arr[y];
		for (let x = y + 1; x < len; x++) {
			let xipp = arr[x];
			if (sipp.subsystem < xipp.subsystem || (sipp.subsystem == xipp.subsystem && sipp.order <= xipp.order))
				continue; // skip
			arr[y] = xipp;
			arr[x] = sipp;
			sipp = xipp;
		}
	}

	
	old.sort(function(a, b) {
		if (a.subsystem < b.subsystem) {
			return -1;
		} else if (a.subsystem > b.subsystem) {
			return 1;
		} else if (a.subsystem == b.subsystem) {

			if (a.order < b.order) {
				return -1;
			} else if (a.order > b.order) {
				return 1;
			} else if (a.order == b.order) {
				if (a.index < b.index) {
					return -1;
				} else if (a.index > b.index) {
					return 1;
				}
			}
		}
	})

	console.log(old);

	let table = mod.tables[0];
	let oldtable = table.contents;
	let newtable = [undefined];
	let functions = mod.functions;
	len = oldtable.length;

	for (let i = 1; i < len; i++) {
		let funcidx = oldtable[i];
		let func = functions[funcidx];
		newtable.push(func);
	}

	let first;
	let types = [];
	len = old.length;
	max = table.max;
	for (let i = 0; i < len; i++) {
		let sysinit = old[i];
		if (sysinit.subsystem == 0)
			continue;
		if (sysinit.funcidx < 0 || sysinit.funcidx >= max) {
			console.error("invalid funcidx in %d", sysinit.index);
		}
		let funcidx = sysinit.funcidx;
		let func = newtable[funcidx];
		let type = func.type;
		if (types.indexOf(type) == -1) {
			if (!first)
				first = type; // we make a assumetion here that our first type is correct.
			let idx = mod.functions.indexOf(func);
			let fn = mod.names.functions.get(idx);
			console.log("sysinit index = %d (init %d) funcidx (table1) = %d fn: %s added type: %o", sysinit.index, i, sysinit.funcidx, fn, type);
			types.push(type);
		} else if (type != first) {
			let idx = mod.functions.indexOf(func);
			let fn = mod.names.functions.get(idx);
			console.log("fn %s of type", fn, type);
		}
	}

	console.log(types);
}

function generateCallCount(mod) {
	let functions = mod.functions;
	let len = functions.length;
	let start = 0;

	for (let i = 0; i < len; i++) {
		let func = functions[i];
		if (!(func instanceof ImportedFunction)) {
			start = i;
			break;
		}
	}

	// we need to reset the usage count.
	for (let i = 0; i < len; i++) {
		functions[i].usage = 0;
	}

	for (let y = start; y < len; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		for (let x = 0; x < xlen; x++) {
			let inst = opcodes[x];
			if (inst.opcode == 0x10) {
				let f2 = functions[inst.funcidx];
				f2.usage++;
			}
		}
	}
}

function generateStackUsage(mod) {

	let start = 0;
	let stackGlobal;

	let imports = mod.imports;
	let len = imports.length;
	for (let i = 0; i < len; i++) {
		let imp = imports[i];
		if (imp instanceof ImportedGlobal && imp.name == "__stack_pointer") {
			stackGlobal = imp;
			break;
		}
	}

	let functions = mod.functions;
	len = functions.length;
	for (let i = 0; i < len; i++) {
		let func = functions[i];
		if (!(func instanceof ImportedFunction)) {
			start = i;
			break;
		}
	}

	for (let y = start; y < len; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		let stackUsage = undefined;
		for (let x = 0; x < xlen; x++) {
			let inst = opcodes[x];
			if (inst.opcode == 0x24 && inst.global == stackGlobal) {

				if (stackUsage == undefined && x >= 4 &&
					opcodes[x - 1].opcode == 0x22 && // local.tee
					opcodes[x - 2].opcode == 0x6b && // i32.sub
					opcodes[x - 3].opcode == 0x41 && // i32.const
					opcodes[x - 4].opcode == 0x23 && opcodes[x - 4].global == stackGlobal) { // global.get
					stackUsage = opcodes[x - 3].value;
				} else if (typeof stackUsage == "number" &&
					opcodes[x - 1].opcode == 0x6a && 	// i32.add
					opcodes[x - 2].opcode == 0x41) { 	// i32.const
					//opcodes[x - 3].opcode == 0x20) {	// local.get
					if (opcodes[x - 2].value != stackUsage) {
						stackUsage = null;
					}
				} else if (typeof stackUsage == "number") {
					stackUsage = null;
				}
			}
			// 0: {opcode: 35, x: 0, global: ImportedGlobal} 	global.get
			// 1: {opcode: 65, value: 96}						i32.const
			// 2: {opcode: 107} 								i32.sub
			// 3: {opcode: 34, x: 1}							local.tee
			// 4: {opcode: 36, x: 0, global: ImportedGlobal}	global.set
		}

		if (typeof stackUsage == "number")
			func.stackUsage = stackUsage;
	}
}

// end of FreeBSD inspect

// start of Objective-C inspect

function inspectObjectiveC(mod, buf) {

	if (!mod.names || !mod.names.data)
		return;

	let objcSectionNames = ["__objc_selectors", "__objc_protocols", "__objc_class_refs", "__objc_classes", "__objc_constant_string", "__objc_protocol_refs", "__objc_cats", "__objc_class_aliases"];
	let segments = [];
	let map = {};

	let nmap = mod.names.data;

	for (const [idx, name] of nmap) {
		if (objcSectionNames.indexOf(name) == -1)
			continue;
		
		let obj = {};
		obj.index = idx;
		obj.name = name;
		segments.push(obj);
		map[name] = obj;
	}

	if (segments.length == 0)
		return;

	let dataSegments = mod.dataSegments;

	let len = segments.length;
	for (let i = 0; i < len; i++) {
		let obj = segments[i];
		let seg = dataSegments[obj.index];
		let opcodes = seg.inst.opcodes;
		let start = opcodes.length == 2 && opcodes[0].opcode == 0x41 && opcodes[1].opcode == 0x0B ? opcodes[0].value : undefined;
		obj.start = start;
		obj.segment = seg;
	}
	 
	let mem = computeInitialMemory(mod, buf);
	let data = new DataView(mem.buffer);

	let protocolMap = new Map();
	let selectorMap = new Map();

	let objc_selectors = [];
	let objc_protocols = [];
	let objc_class_refs = [];
	let objc_classes = [];
	let objc_constant_string;
	let objc_protocol_refs;
	let objc_cats = [];
	let objc_class_aliases;

	function decode_objc_method_list(ptr) {
		let cnt = data.getUint32(ptr + 4, true);
		let item_size = data.getInt32(ptr + 8, true);
		let off = ptr + 12;
		let methods = [];
		for (let i = 0; i < cnt; i++) {
			let imp = data.getUint32(off, true);
			let sel = data.getUint32(off + 4, true); // ptr to sel within __objc_selectors
			let type = data.getUint32(off + 8, true);
			//let strptr = data.getUint32(o2, true);
			//let name = UTF8ArrayToString(mem, strptr);
			//strptr = data.getUint32(o2 + 4, true);
			//let type = UTF8ArrayToString(mem, strptr);
			if (selectorMap.has(sel)) {
				sel = selectorMap.get(sel);
			} else {
				let tmp = decode_objc_selector(sel);
				selectorMap.set(sel, tmp);
				sel = tmp;
			}
			let method = {};
			method.imp = imp;
			method.selector = sel;
			method.type = UTF8ArrayToString(mem, type);
			methods.push(method);
			off += item_size;
		}

		return methods.length != 0 ? methods : null;
	}

	function decode_objc_protocol_list(ptr) {
		let cnt = data.getUint32(ptr + 4, true);
		let off = ptr + 8;
		let protocols = [];
		for (let i = 0; i < cnt; i++) {
			let ptr = data.getUint32(off, true);
			if (ptr == 0) {
				off += 4;
				continue;
			} else if (!protocolMap.has(ptr)) {
				console.warn("missing protocol at ptr %d", ptr);
			}
			let protocol = protocolMap.get(ptr);
			protocols.push(protocol);
			off += 4;
		}

		return protocols.length != 0 ? protocols : null;
	}

	function decode_objc_protocol_method_description_list(ptr) {
		let cnt = data.getInt32(ptr, true);
		let item_size = data.getInt32(ptr + 4, true);
		let off = ptr + 8;
		let methods = [];
		for (let i = 0; i < cnt; i++) {
			let sel = data.getUint32(off, true);; // ptr to sel within __objc_selectors
			let type = data.getUint32(off + 4, true);;
			//let strptr = data.getUint32(o2, true);
			//let name = UTF8ArrayToString(mem, strptr);
			//strptr = data.getUint32(o2 + 4, true);
			//let type = UTF8ArrayToString(mem, strptr);
			if (selectorMap.has(sel)) {
				sel = selectorMap.get(sel);
			} else {
				let tmp = decode_objc_selector(sel);
				selectorMap.set(sel, tmp);
				sel = tmp;
			}
			methods.push({ptr: off, selector: sel, type: type});
			off += item_size;
		}

		return methods;
	}

	function decode_objc_property_list(ptr) {
		let cnt = data.getUint32(ptr, true);
		let item_size = data.getUint32(ptr + 4, true);
		let off = ptr + 12;
		let properties = [];
		for (let i = 0; i < cnt; i++) {
			let prop = {};
			let strptr = data.getUint32(off, true);
			prop.name = UTF8ArrayToString(mem, strptr);
			strptr = data.getUint32(off + 4, true);
			prop.attributes = UTF8ArrayToString(mem, strptr);
			strptr = data.getUint32(off + 8, true);
			prop.type = UTF8ArrayToString(mem, strptr);
			prop.getter = data.getUint32(off + 12, true);
			prop.getter = data.getUint32(off + 16, true);
			properties.push(prop);
			off += item_size;
		}

		return properties;
	}

	function decode_objc_selector(ptr) {
		let strptr = data.getUint32(ptr, true);
		let sel = {};
		sel.name = UTF8ArrayToString(mem, strptr);
		strptr = data.getUint32(ptr + 4, true);
		sel.type = strptr !== 0 ? UTF8ArrayToString(mem, strptr) : null;

		return sel;
	}



	if (map.__objc_selectors) {

		let sec = map.__objc_selectors;
		let start = sec.start;
		let off = start;
		let end = start + sec.segment.size;

		while (off < end) {
			let sel = decode_objc_selector(off);
			objc_selectors.push(sel);
			selectorMap.set(off, sel)
			off += 8;
		}

		console.log(objc_selectors);
	}

	if (map.__objc_protocols) {

		let sec = map.__objc_protocols;
		let start = sec.start;
		let off = start;
		let end = start + sec.segment.size;

		while (off < end) {
			let isa = data.getUint32(off, true);
			let ptr = data.getUint32(off + 4, true);
			let protocol;
			if (protocolMap.has(off)) {
				protocol = protocolMap.get(off);
			} else {
				protocol = {};
				protocol._ptr = off;
				protocolMap.set(off, protocol);
			}
			protocol.isa = isa;
			protocol.name = UTF8ArrayToString(mem, ptr);

			ptr = data.getUint32(off + 8, true);
			if (ptr != 0) {
				let cnt = data.getUint32(ptr + 4, true);
				let inner = ptr + 8;
				let protocols = [];
				for (let i = 0; i < cnt; i++) {
					let ptr2 = data.getUint32(inner, true);
					if (ptr2 == 0) {
						inner += 4;
						continue;
					}
					let prot;
					if (protocolMap.has(ptr2)) {
						prot = protocolMap.get(ptr2);
					} else {
						prot = {};
						prot._ptr = ptr2;
						protocolMap.set(ptr2, prot);
					}
					protocols.push(prot);
					inner += 4;
				}
				protocol.protocol_list = protocols.length !== 0 ? protocols : null;
			} else {
				protocol.protocol_list = null;
			}

			ptr = data.getUint32(off + 12, true);
			if (ptr != 0) {
				protocol.instance_methods = decode_objc_protocol_method_description_list(ptr);
			} else {
				protocol.instance_methods = null;
			}

			ptr = data.getUint32(off + 16, true);
			if (ptr != 0) {
				protocol.class_methods = decode_objc_protocol_method_description_list(ptr);
			} else {
				protocol.class_methods = null;
			}

			ptr = data.getUint32(off + 20, true);
			if (ptr != 0) {
				protocol.optional_instance_methods = decode_objc_protocol_method_description_list(ptr);
			} else {
				protocol.optional_instance_methods = null;
			}

			ptr = data.getUint32(off + 24, true);
			if (ptr != 0) {
				protocol.optional_class_methods = decode_objc_protocol_method_description_list(ptr);
			} else {
				protocol.optional_class_methods = null;
			}

			ptr = data.getUint32(off + 28, true);
			if (ptr != 0) {
				protocol.properties = decode_objc_property_list(ptr);
			} else {
				protocol.properties = null;
			}

			ptr = data.getUint32(off + 32, true);
			if (ptr != 0) {
				protocol.optional_properties = decode_objc_property_list(ptr);
			} else {
				protocol.optional_properties = null;
			}

			ptr = data.getUint32(off + 36, true);
			if (ptr != 0) {
				protocol.class_properties = decode_objc_property_list(ptr);
			} else {
				protocol.class_properties = null;
			}

			ptr = data.getUint32(off + 40, true);
			if (ptr != 0) {
				protocol.optional_class_properties = decode_objc_property_list(ptr);
			} else {
				protocol.optional_class_properties = null;
			}

			objc_protocols.push(protocol);
			off += 44;
			// 8  protocol_list
			// 12 instance_methods
			// 16 class_methods
			// 20 optional_instance_methods
			// 24 optional_class_methods
			// 28 properties
			// 32 optional_properties
			// 36 class_properties
			// 40 optional_class_properties
			// size 44 bytes
		}

		console.log(objc_protocols);
	}

	if (map.__objc_class_refs) {

		let sec = map.__objc_class_refs;
		let start = sec.start;
		let off = start;
		let end = start + sec.segment.size;

		while (off < end) {
			let ptr = data.getUint32(off, true);
			objc_class_refs.push(ptr);
			off += 4;
		}

		console.log(objc_class_refs);
	}

	if (map.__objc_classes) {

		let sec = map.__objc_classes;
		let start = sec.start;
		let off = start;
		let end = start + sec.segment.size;

		let clsmap = new Map();

		while (off < end) {
			let ptr = data.getUint32(off, true);
			if (ptr == 0) {
				off += 4;
				continue;
			}
			let cls;
			if (clsmap.has(ptr)) {
				cls = clsmap.get(ptr);
			} else {
				cls = {};
				cls._ptr = ptr;
				clsmap.set(ptr, cls);
			}
			cls.isa = data.getUint32(ptr, true);
			let super_class = data.getUint32(ptr + 4, true);
			let supercls = null;
			if (clsmap.has(super_class)) {
				supercls = clsmap.get(super_class);
			} else if (super_class !== 0){
				supercls = {};
				supercls._ptr = super_class;
				clsmap.set(super_class, supercls);
			}
			cls.super_class = supercls;
			let strptr = data.getUint32(ptr + 8, true);
			cls.name = UTF8ArrayToString(mem, strptr);
			cls.verion = data.getInt32(ptr + 12, true);
			cls.info = data.getUint32(ptr + 16, true);
			cls.instance_size = data.getInt32(ptr + 20, true);
			let ivar_ptr = data.getUint32(ptr + 24, true);
			if (ivar_ptr != 0) {
				let cnt = data.getUint32(ivar_ptr, true);
				let item_size = data.getUint32(ivar_ptr + 4, true);
				let o2 = ivar_ptr + 8;
				let ivars = [];
				for (let i = 0; i < cnt; i++) {
					let strptr = data.getUint32(o2, true);
					let name = UTF8ArrayToString(mem, strptr);
					strptr = data.getUint32(o2 + 4, true);
					let type = UTF8ArrayToString(mem, strptr);
					let ivaroff = data.getInt32(o2 + 8, true);
					let ivarsz = data.getUint32(o2 + 12, true);
					let flags = data.getUint32(o2 + 16, true);
					ivars.push({name: name, type: type, offset: ivaroff, size: ivarsz, flags: flags});
					o2 += item_size;
				}
				cls.ivars = ivars;
			}
			let ptr2 = data.getUint32(ptr + 28, true);
			if (ptr2 != 0) {
				cls.methods = decode_objc_method_list(ptr2);
			} else {
				cls.methods = null;
			}

			ptr2 = data.getUint32(ptr + 52, true);
			if (ptr2 != 0) {
				cls.protocols = decode_objc_protocol_list(ptr2);
			} else {
				cls.protocols = null;
			}

			ptr2 = data.getUint32(ptr + 64, true);
			if (ptr2 != 0) {
				cls.properties = decode_objc_property_list(ptr2);
			} else {
				cls.properties = null;
			}
			// 0 isa
			// 4 super_class
			// 8 name
			// 12 version
			// 16 info
			// 20 instance_size
			// 24 ivars
			// 28 methods
			// 32 dtable
			// 36 subclass_list
			// 40 cxx_construct
			// 44 cxx_destruct
			// 48 sibling_class
			// 52 protocols
			// 56 extra_data
			// 60 abi_version
			// 64 properties
			// size 68 bytes

			objc_classes.push(cls);
			off += 4;
		}

		console.log(objc_classes);
	}

	if (map.__objc_cats) {

		let sec = map.__objc_cats;
		let start = sec.start;
		let off = start;
		let end = start + sec.segment.size;

		while (off < end) {
			let ptr = data.getUint32(off, true);
			if (ptr == 0) {
				off += 28;
				continue;
			}
			let cat = {};
			cat.name = UTF8ArrayToString(mem, ptr);
			ptr = data.getUint32(off + 4, true);
			cat.class_name = UTF8ArrayToString(mem, ptr);
			
			ptr = data.getUint32(off + 8, true);
			if (ptr != 0) {
				cat.instance_methods = decode_objc_method_list(ptr);
			} else {
				cat.instance_methods = null;
			}

			ptr = data.getUint32(off + 12, true);
			if (ptr != 0) {
				cat.class_methods = decode_objc_method_list(ptr);
			} else {
				cat.class_methods = null;
			}

			ptr = data.getUint32(off + 16, true);
			if (ptr != 0) {
				cat.protocols = decode_objc_protocol_list(ptr);
			} else {
				cat.protocols = null;
			}

			ptr = data.getUint32(off + 20, true);
			if (ptr != 0) {
				cat.properties = decode_objc_property_list(ptr);
			} else {
				cat.properties = null;
			}

			ptr = data.getUint32(off + 24, true);
			if (ptr != 0) {
				cat.class_properties = decode_objc_property_list(ptr);
			} else {
				cat.class_properties = null;
			}

			objc_cats.push(cat);
			off += 28;
		}

		console.log(objc_cats);
	}

	console.log(mem);

}

// end of Objective-C inspect

// TODO: custom-section: name from emscripten symbol-map

function loadWebAssemblyBinary(buf, symbolsTxt) {
	moduleBuffer = buf;
	let mod = parseWebAssemblyBinary(buf);
	showWasmInfoStats(mod, mod.sections);

	console.log(mod);

	targetModule = mod;

	if (symbolsTxt) {
		processSymbolsMap(mod, symbolsTxt);
	}
	//postOptimizeWasm(mod);
	mapGlobalsUsage(mod);
	generateCallCount(mod);
	generateStackUsage(mod);
	/*if (targetFilename == "kern.wasm") {
		runWorkflowActions(mod, _freebsdWorkflow);
	}*/
	populateWebAssemblyInfo(mod);
	try {
		inspectObjectiveC(mod, buf);
	} catch (err) {
		console.error(err);
	}
}

/*
fetch(url).then(function(res) {

	res.arrayBuffer().then(function(buf) {
		loadWebAssemblyBinary(buf);
	}, console.error);
}, console.error);*/

/*
function test () {
	let functions = targetModule.functions;
	for (let i = 0; i < functions.length; i++) {
		if (functions[i].opcodes && functions[i].opcodes.length == 240)
			console.log(i);
	}
}
test();
*/



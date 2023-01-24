

//let url = "../../lab/simple-kernel/vfs.wasm";
//let url = "../../lab/gdnc/gdnc.wasm";
let url = "./kern.wasm";
//let url = "./kern-mod4.wasm";
//let url = "./bulk-memory.wasm";
//let url = "./test-4.wasm";
//let url = "./gdnc.wasm";
//let url = "./factorial.wasm";
//let url = "./duktape.wasm";
//let url = "../../lab/simple-kernel/examples/fs-ops/fs-ops.wasm";
//url = "../../lab/simple-kernel/examples/zsh/zsh.wasm"
//let url = "../../lab/simple-kernel/examples/coreutils-test/coreutils.wasm"
//url = "../../dylibs/side.wasm"

// 1954 (1953.125) wasm-pages are about 128mb of memory
// 
// TODO:
// drag & drop
// import name section from emscripten symbolmap
// reqognize objc method names.
// objc-abi inspector.

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

	const units = si ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']  : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
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

	let indexes = [];

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

	let indexes = [];

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


	let locations = [];
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

const inspectorUI = {
	'globals': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findResults = document.createElement("ul");
		body.appendChild(findResults);

		function listResults(value) {
			while (findResults.lastChild) {
				findResults.removeChild(findResults.lastChild);
			}
			let val_lc = value.toLowerCase();
			let match = [];
			let collection = targetModule.exports;
			let len = collection.length;
			for (let i = 0; i < len; i++) {
				let item = collection[i];
				if (item.type != "global")
					continue;
				if (item.name.toLowerCase().indexOf(val_lc) !== -1) {
					match.push(item);
				}
			}

			let globals = targetModule.globals;
			len = Math.min(match.length, 25);
			for (let i = 0; i < len; i++) {
				let item = match[i];

				let globidx = globals.indexOf(item.global);
				let li = document.createElement("li");
				li.textContent = '[' + globidx + "]\x20" + item.name;
				findResults.appendChild(li);
			}
		}

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			listResults(value);
		});
		

		let tbltest = document.createElement("table");
		tbltest.innerHTML = "<thead></tr><th>index</th><th>name</th><th>type</th><th>initial value</th><th>use count</th><th>import/export</th></tr></thead><tbody><tbody>"
		
		body.appendChild(tbltest);
		
	},
	'functions': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findResults = document.createElement("ul");
		body.appendChild(findResults);

		function listResults(value) {
			while (findResults.lastChild) {
				findResults.removeChild(findResults.lastChild);
			}
			let val_lc = value.toLowerCase();
			let match = [];
			let names = targetModule.names.functions;
			for (const [idx, name] of names) {
				if (name.toLowerCase().indexOf(val_lc) !== -1) {
					match.push({funcidx: idx, name: name});
				}
			}

			len = Math.min(match.length, 25);
			for (let i = 0; i < len; i++) {
				let item = match[i];

				let li = document.createElement("li");
				li.textContent = '[' + item.funcidx + "]\x20" + item.name;
				findResults.appendChild(li);
			}
		}

		findInput.addEventListener("change", function(evt) {
			let value = findInput.value;
			listResults(value);
		});

		let tbltest = document.createElement("table");
		tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		
		body.appendChild(tbltest);
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

function setupMainUI() {

	let readmeContainer = document.querySelector("article#readme");
	if (readmeContainer)
		readmeContainer.style.display = "none";

	document.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	document.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});

	document.addEventListener("drop", function(evt) {

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

		event.preventDefault();
	});
}

setupMainUI();

function processSymbolsMap(mod) {

	fetch("gdnc.html.symbols").then(function(res) {
		res.text().then(function(txt) {

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
		});
	});
}

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
			let idx = mod.functions.indexOf(func);
			let fn = mod.names.functions.get(idx);
			console.log("sysinit index = %d (init %d) funcidx (table1) = %d fn: %s added type: %o", sysinit.index, i, sysinit.funcidx, fn, type);
			types.push(type);
		}
	}

	console.log(types);
}

// TODO: custom-section: name from emscripten symbol-map

fetch(url).then(function(res) {

	res.arrayBuffer().then(function(buf) {

		moduleBuffer = buf;
		let mod = parseWebAssemblyBinary(buf);
		showWasmInfoStats(mod, mod.sections);

		console.log(mod);

		targetModule = mod;
		populateWebAssemblyInfo(mod);

		//processSymbolsMap(mod);
		postOptimizeWasm(mod);
		mapGlobalsUsage(mod);

		if (url == "./kern.wasm") {
			inspectFreeBSDBinary(buf, mod);
		}

	}, console.error);
}, console.error);

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



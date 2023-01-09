

//let url = "../../lab/simple-kernel/vfs.wasm";
//let url = "../../lab/gdnc/gdnc.wasm";
let url = "./kern.wasm";
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

function showWasmInfoStats(sections) {
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
		} else {
			let span = document.createTextNode(typename);
			li.appendChild(span);
		}

		let tn = document.createTextNode("\x20" + humanFileSize(section.size, true));
		li.appendChild(tn);
	}
}

function lengthULEB128(value) {
    let cnt = 0;
    do {
        let byte = value & 0x7f;
        value >>= 7;
        if (value != 0) {
        	cnt++;
        } else {
        	cnt++;
            return cnt;
        }

    } while (value != 0);

    throw TypeError("should never get here!");
}

function encodeImportSection(imports) {

	let total = 0;
	let ylen = imports.length;
	let cnt = 0;
	for (let y = 0; y < ylen; y++) {
		let imp = imports[y];
		let len = lengthBytesUTF8(imp.module);
		total += len;
		len = lengthULEB128(len);
		total += len;
		len = lengthBytesUTF8(imp.name);
		total += len;
		len = lengthULEB128(len);
		total += len;

		if (imp instanceof ImportedFunction) {
			total += 1; // type
			total += lengthULEB128(imp.typeidx);
			cnt++;
		} else if (imp instanceof ImportedGlobal) {
			total += 3; // type, valuetype, mutable
			cnt++;
		} else if (imp instanceof ImportedMemory) {
			total += 2; // type, limits
			total += lengthULEB128(imp.min);
			if (imp.max !== null) {
				total += lengthULEB128(imp.max);
			} 
			cnt++;
		} else if (imp instanceof ImportedTable) {
			total += 3; // type, reftype, limits
			total += lengthULEB128(imp.min);
			if (imp.max !== null) {
				total += lengthULEB128(imp.max);
			}
			cnt++;
		} else {
			console.error("unsupported import type");
			continue;
		}
	}
	total += lengthULEB128(cnt);
	let sz = lengthULEB128(total);
	let buf = new ArrayBuffer(total + sz + 1);
	let data = new ByteArray(buf);
	data.writeUint8(SECTION_TYPE.IMPORT);
	data.writeULEB128(total);
	data.writeULEB128(cnt);
	ylen = imports.length;
	for (let y = 0; y < ylen; y++) {
		let imp = imports[y];
		let strlen = lengthBytesUTF8(imp.module);
		data.writeULEB128(strlen);
		data.writeUTF8Bytes(imp.module);

		strlen = lengthBytesUTF8(imp.name);
		data.writeULEB128(strlen);
		data.writeUTF8Bytes(imp.name);

		if (imp instanceof ImportedFunction) {
			data.writeUint8(0x00);
			data.writeULEB128(imp.typeidx);
		} else if (imp instanceof ImportedGlobal) {
			data.writeUint8(0x03);
			data.writeUint8(imp.valtype);
			data.writeUint8(imp.mutable ? 1 : 0);
		} else if (imp instanceof ImportedMemory) {
			data.writeUint8(0x02);
			if (imp.shared) {
				if (imp.max === null) {
					data.writeUint8(0x02);
					data.writeULEB128(imp.min);
				} else {
					data.writeUint8(0x03);
					data.writeULEB128(imp.min);
					data.writeULEB128(imp.max);
				}

			} else {
				if (imp.max === null) {
					data.writeUint8(0x00);
					data.writeULEB128(imp.min);
				} else {
					data.writeUint8(0x01);
					data.writeULEB128(imp.min);
					data.writeULEB128(imp.max);
				}

			}

		} else if (imp instanceof ImportedTable) {
			data.writeUint8(0x01);
			data.writeUint8(imp.reftype);
			data.writeULEB128(imp.min);
			if (imp.max !== null) {
				data.writeULEB128(imp.max);
			}
		} else {
			console.error("unsupported import type");
			continue;
		}
	}

	return buf;
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
			} else if (importIsModified && type == SECTION_TYPE.IMPORT) {
				let sub = encodeImportSection(targetModule.imports);
				buffers.push(sub);
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
			if (seg.inst.optcodes.length == 2 && seg.inst.optcodes[0].optcode == 65)
				memdst = seg.inst.optcodes[0].value;
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

function postOptimizeWasm(mod) {

	let opsopt = [];
	const inst_replace = [{ 		// atomic operations.
			name: "atomic_notify",
			inst: [0xFE, 0x00]
		}, {
			name: "atomic_fence",
			inst: [0xFE, 0x00]
		}, {
			name: "atomic_wait32",
			inst: [0xFE, 0x01]
		}, {
			name: "atomic_load32",
			inst: [0xFE, 0x10]
		}, {
			name: "atomic_store32",
			inst: [0xFE, 0x17]
		}, {
			name: "atomic_add32",
			inst: [0xFE, 0x1E]
		}, {
			name: "atomic_sub32",
			inst: [0xFE, 0x25]
		}, {
			name: "atomic_and32",
			inst: [0xFE, 0x2C]
		},{
			name: "atomic_or32",
			inst: [0xFE, 0x33]
		}, {
			name: "atomic_xor32",
			inst: [0xFE, 0x3A]
		}, {
			name: "atomic_xchg32",
			inst: [0xFE, 0x41]
		}, {
			name: "atomic_cmpxchg32",
			inst: [0xFE, 0x48]
		}, {
			name: "atomic_wait64",
			inst: [0xFE, 0x02]
		}, {
			name: "atomic_load64",
			inst: [0xFE, 0x11]
		}, {
			name: "atomic_store64",
			inst: [0xFE, 0x18]
		}, {
			name: "atomic_add64",
			inst: [0xFE, 0x1F]
		}, {
			name: "atomic_sub64",
			inst: [0xFE, 0x26]
		}, {
			name: "atomic_and64",
			inst: [0xFE, 0x2D]
		}, {
			name: "atomic_or64",
			inst: [0xFE, 0x34]
		}, {
			name: "atomic_xor64",
			inst: [0xFE, 0x3B]
		}, {
			name: "atomic_xchg64",
			inst: [0xFE, 0x42]
		},{
			name: "atomic_cmpxchg64",
			inst: [0xFE, 0x49]
		}, { 							// memory operations.
			name: "memcpy",
			inst: [0xfc, 10]
		}, {
			name: "__memcpy",
			inst: [0xfc, 10]
		}, {
			name: "memcpy_early",
			inst: [0xfc, 10]
		}, {
			name: "memset",
			inst: [0xfc, 11]
		}];

/*
            case 0xFE: // Atomic Memory Instructions
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case 0x00: // memory.atomic.notify      [i32 i32] -> [i32]
                    case 0x01: // memory.atomic.wait32      [i32 i32 i64] -> [i32]
                    case 0x02: // memory.atomic.wait64      [i32 i64 i64] -> [i32]

                    case 0x10: // i32.atomic.load           [i32] -> [i32]
                    case 0x11: // i64.atomic.load           [i32] -> [i64]
                    case 0x12: // i32.atomic.load8_u        [i32] -> [i32]
                    case 0x13: // i32.atomic.load16_u       [i32] -> [i32]
                    case 0x14: // i64.atomic.load8_u        [i32] -> [i64]
                    case 0x15: // i64.atomic.load16_u       [i32] -> [i64]
                    case 0x16: // i64.atomic.load32_u       [i32] -> [i64]
                    case 0x17: // i32.atomic.store          [i32 i32] -> []
                    case 0x18: // i64.atomic.store          [i32 i64] -> []
                    case 0x19: // i32.atomic.store8         [i32 i32] -> []
                    case 0x1A: // i32.atomic.store16        [i32 i32] -> []
                    case 0x1B: // i64.atomic.store8         [i32 i64] -> []
                    case 0x1C: // i64.atomic.store16        [i32 i64] -> []
                    case 0x1D: // i64.atomic.store32        [i32 i64] -> []

                    case 0x1E: // i32.atomic.rmw.add        [i32 i32] -> [i32]
                    case 0x1F: // i64.atomic.rmw.add        [i32 i64] -> [i64]
                    case 0x20: // i32.atomic.rmw8.add_u     [i32 i32] -> [i32]
                    case 0x21: // i32.atomic.rmw16.add_u    [i32 i32] -> [i32]
                    case 0x22: // i64.atomic.rmw8.add_u     [i32 i64] -> [i64]
                    case 0x23: // i64.atomic.rmw16.add_u    [i32 i64] -> [i64]
                    case 0x24: // i64.atomic.rmw32.add_u    [i32 i64] -> [i64]

                    case 0x25: // i32.atomic.rmw.sub        [i32 i32] -> [i32]
                    case 0x26: // i64.atomic.rmw.sub        [i32 i64] -> [i64]
                    case 0x27: // i32.atomic.rmw8.sub_u     [i32 i32] -> [i32]
                    case 0x28: // i32.atomic.rmw16.sub_u    [i32 i32] -> [i32]
                    case 0x29: // i64.atomic.rmw8.sub_u     [i32 i64] -> [i64]
                    case 0x2A: // i64.atomic.rmw16.sub_u    [i32 i64] -> [i64]
                    case 0x2B: // i64.atomic.rmw32.sub_u    [i32 i64] -> [i64]

                    case 0x2C: // i32.atomic.rmw.and
                    case 0x2D: // i64.atomic.rmw.and
                    case 0x2E: // i32.atomic.rmw8.and_u
                    case 0x2F: // i32.atomic.rmw16.and_u
                    case 0x30: // i64.atomic.rmw8.and_u
                    case 0x31: // i64.atomic.rmw16.and_u
                    case 0x32: // i64.atomic.rmw32.and_u

                    case 0x33: // i32.atomic.rmw.or
                    case 0x34: // i64.atomic.rmw.or
                    case 0x35: // i32.atomic.rmw8.or_u
                    case 0x36: // i32.atomic.rmw16.or_u
                    case 0x37: // i64.atomic.rmw8.or_u
                    case 0x38: // i64.atomic.rmw16.or_u
                    case 0x39: // i64.atomic.rmw32.or_u

                    case 0x3A: // i32.atomic.rmw.xor
                    case 0x3B: // i64.atomic.rmw.xor
                    case 0x3C: // i32.atomic.rmw8.xor_u
                    case 0x3D: // i32.atomic.rmw16.xor_u
                    case 0x3E: // i64.atomic.rmw8.xor_u
                    case 0x3F: // i64.atomic.rmw16.xor_u
                    case 0x40: // i64.atomic.rmw32.xor_u

                    case 0x41: // i32.atomic.rmw.xchg           [i32 i32] -> [i32]
                    case 0x42: // i64.atomic.rmw.xchg           [i32 i64] -> [i64]
                    case 0x43: // i32.atomic.rmw8.xchg_u        [i32 i32] -> [i32]
                    case 0x44: // i32.atomic.rmw16.xchg_u       [i32 i32] -> [i32]
                    case 0x45: // i64.atomic.rmw8.xchg_u        [i32 i64] -> [i64]
                    case 0x46: // i64.atomic.rmw16.xchg_u       [i32 i64] -> [i64]
                    case 0x47: // i64.atomic.rmw32.xchg_u       [i32 i64] -> [i64]

                    case 0x48: // i32.atomic.rmw.cmpxchg        [i32 i32 i32] -> [i32]
                    case 0x49: // i64.atomic.rmw.cmpxchg        [i32 i64 i64] -> [i64]
                    case 0x4A: // i32.atomic.rmw8.cmpxchg_u     [i32 i32 i32] -> [i32]
                    case 0x4B: // i32.atomic.rmw16.cmpxchg_u    [i32 i32 i32] -> [i32]
                    case 0x4C: // i64.atomic.rmw8.cmpxchg_u     [i32 i64 i64] -> [i64]
                    case 0x4D: // i64.atomic.rmw16.cmpxchg_u    [i32 i64 i64] -> [i64]
                    case 0x4E: // i64.atomic.rmw32.cmpxchg_u    [i32 i64 i64] -> [i64]
                    {
                        let o = data.readULEB128();
                        let a = data.readULEB128();
                        optcodes.push({optcode: (opt_code << 8) | sub, offset: o, align: a});
                        break;
                    }
                    default:
                        return null;
                }
            }
 */
	
	

	if (!mod.names) {
		console.warn("wasm module needs to define custom-section for names");
		return;
	}

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
			opsopt.push(func);
		}
	}

	console.log(opsopt);

	// run trough all WebAssembly code to find call-sites where we call funcidx

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
		memory.min = parseInt(minInput.value);;
		importIsModified = true;
	});

	maxInput.addEventListener("change", function(evt) {
		memory.max = parseInt(maxInput.value);
		importIsModified = true;
	});

	let input = container.querySelector("#memory-shared");
	input.checked = memory.shared;
	input.addEventListener("change", function(evt) {
		memory.shared = input.checked;
		importIsModified = true;
	});

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
}

// custom: name from emscripten symbol-map

fetch(url).then(function(res) {

	res.arrayBuffer().then(function(buf) {

		moduleBuffer = buf;
		let mod = parseWebAssemblyBinary(buf);
		showWasmInfoStats(mod.sections);

		console.log(mod);

		targetModule = mod;
		populateWebAssemblyInfo(mod);

		postOptimizeWasm(mod);

	}, console.error);
}, console.error);






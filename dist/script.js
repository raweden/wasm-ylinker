
// 1954 (1953.125) wasm-pages are about 128mb of memory
// 
// TODO:
// - drag & drop
//   - support for loading and saving to file system, reduces copying @done
// - import name section from emscripten symbolmap
// - reqognize objc method names.
// - objc-abi inspector.
// - headless workflows 
// - more expressive filterig of table based content, could use filter per column. This only requires some data-type notation per column.
// - Rebuild Inspect into reflect more of the section generic structure of a module..
// - Memory to be split into data-segments & memory (as this can be decoupled trough data.init instructions..)
// - merge with WAT module action
// - separate this script into; needs one for UI and one for shell and what would be common for both.
// - make the inspector like for freebsd a accept based invokation, like allowing each inspector letting the UI know whether it has
//   anything to display for the current binary, globalApp.registerInspector()
// - consider to support multiple drop of source wasms, 
// - add drop-down per file parameter (to chose from active files)
// 
// https://hacks.mozilla.org/2017/07/webassembly-table-imports-what-are-they/

const WASM_PAGE_SIZE = (1 << 16);

const moreIcon = `<svg aria-hidden="true" focusable="false" role="img" class="octicon octicon-kebab-horizontal" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; user-select: none; vertical-align: text-bottom; overflow: visible;"><path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path></svg>`;

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
	let container = document.querySelector("div#wasm-modules-stats");

	if (container.lastChild) {
		container.removeChild(container.lastChild);
	}

	let ul = document.createElement("ul");
	ul.classList.add("accordion-list");
	container.appendChild(ul);

	let table = document.createElement("table");
	table.classList.add("data-table");
	container.appendChild(table);
	let thead = document.createElement("thead");
	thead.innerHTML = "<tr><th>magic</th><th>name</th><th>count</th><th>size</th><th>weight</th></tr>";
	table.appendChild(thead);
	let tbody = document.createElement("tbody");
	table.appendChild(tbody);

	let customSectionCategories = {
		'.debug_info': {format: "DWARF5", category: "debug"},
		'.debug_loc': {format: "DWARF5", category: "debug"},
		'.debug_ranges': {format: "DWARF5", category: "debug"},
		'.debug_abbrev': {format: "DWARF5", category: "debug"},
		'.debug_line': {format: "DWARF5", category: "debug"},
		'.debug_str': {format: "DWARF5", category: "debug"},
	}

	let sizeSummary = {};
	let totalBytes = moduleBuffer.byteLength;

	let len = sections.length;
	for (let i = 0;i < len;i++) {
		let section = sections[i];
		let typename = sectionnames[section.type];
		let tr = document.createElement("tr");
		tbody.appendChild(tr);
		let sectionSize, sectionCount;
		let nameStr, countStr, sizeStr, weightStr, magic = section.type;

		if (section instanceof WebAssemblySection) {
			sectionSize = section._cache.size;
		} else {
			sectionSize = section.size;
		}

		if (section.type == SECTION_TYPE_CUSTOM) {

			nameStr = section.name;

			if (customSectionCategories.hasOwnProperty(section.name)) {
				let category = customSectionCategories[section.name].category;
				if (sizeSummary.hasOwnProperty(category)) {
					let sum = sizeSummary[category];
					sum += sectionSize;
					sizeSummary[category] = sum;
				} else {
					sizeSummary[category] = sectionSize;
				}
			}

		} else {
			nameStr = typename;

			switch (section.type) {
				case 0x01:
					sectionCount = mod.types.length;
					break;
				case 0x02:
					sectionCount = mod.imports.length;
					break;
				case 0x03:
					sectionCount = mod.functions.length;
					break;
				case 0x04:
					sectionCount = mod.tables.length;
					break;
				case 0x05:
					sectionCount = mod.memory.length;
					break;
				case 0x06:
					sectionCount = mod.globals.length;
					break;
				case 0x07:
					sectionCount = mod.exports.length;
					break;
				case 0x08:
					sectionCount = "";
					break;
				case 0x09:
					sectionCount = mod.elementSegments.length;
					break;
				case 0x0A:
					sectionCount = mod.imports.length;
					break;
				case 0x0B:
					sectionCount = mod.dataSegments.length;
					break;
			};
		}

		sizeStr = humanFileSize(sectionSize, true);
		if (!sizeStr.endsWith("bytes")) {
			sizeStr = sectionSize + "\x20bytes" + "\x20(" + sizeStr + ")";
		}

		let weight = sectionSize / totalBytes;
		weightStr = String((weight * 100).toFixed(2)) + "%";

		

		let td = document.createElement("td");
		td.textContent = "0x" + magic.toString(16).padStart(2, '0');
		tr.appendChild(td);
		td = document.createElement("td");
		td.textContent = nameStr;
		tr.appendChild(td);
		td = document.createElement("td");
		td.textContent = sectionCount;
		tr.appendChild(td);
		td = document.createElement("td");
		td.textContent = sizeStr;
		tr.appendChild(td);
		td = document.createElement("td");
		td.textContent = weightStr;
		tr.appendChild(td);

	}

	if (sizeSummary.debug) {
		let debugsz = sizeSummary.debug;
		sizeSummary["size excl. debug info"] = totalBytes - debugsz;
	}

	for (var cat in sizeSummary) {
		let size = sizeSummary[cat];
		let tr = document.createElement("tr");
		tr.classList.add("sum-row");
		let td = document.createElement("td"); // empty
		tr.appendChild(td);
		td = document.createElement("td");
		td.setAttribute("colspan", 2);
		td.textContent = cat;
		tr.appendChild(td);
		let sizeStr = humanFileSize(size, true);
		if (!sizeStr.endsWith("bytes")) {
			sizeStr = size + "\x20bytes" + "\x20(" + sizeStr + ")";
		}

		td = document.createElement("td");
		td.textContent = sizeStr;
		tr.appendChild(td);

		let weight = size / totalBytes;
		weightStr = String((weight * 100).toFixed(2)) + "%";

		td = document.createElement("td");
		td.textContent = weightStr;
		tr.appendChild(td);
		tbody.appendChild(tr);
	}

	let inst_stats = computeInstructionStatistics(mod);
	console.log(inst_stats);

	table = document.createElement("table");
	table.classList.add("data-table");
	container.appendChild(table);
	thead = document.createElement("thead");
	thead.innerHTML = "<tr><th>opcode</th><th>name</th><th>count</th><th>unaligned</th></tr>";
	table.appendChild(thead);
	tbody = document.createElement("tbody");
	table.appendChild(tbody);

	for (const [opcode, stat] of inst_stats) {

		let tr = document.createElement("tr");
		tbody.appendChild(tr);

		let td = document.createElement("td");
		td.textContent = opcode.toString(16);
		tr.appendChild(td);

		td = document.createElement("td");
		td.textContent = stat.inst.name;
		tr.appendChild(td);

		td = document.createElement("td");
		td.textContent = stat.usage;
		tr.appendChild(td);

		td = document.createElement("td");
		td.textContent = stat.unalignedCount;
		tr.appendChild(td);
	}
}

function generateClikeSignature(functype) {
    let arg, ret;
    let argc = functype.argc;
    if (argc == 0) {
        arg = "void";
    } else if (argc == 1){
        arg = type_name(functype.argv[0]);
    } else {
        let argv = functype.argv;
        arg = [];
        for (let x = 0; x < argc; x++) {
            arg.push(type_name(argv[x]));
        }
    }

    let retc = functype.retc;
    if (retc == 0) {
        ret = "void";
    } else if (retc == 1){
        ret = type_name(functype.retv[0]);
    } else {
        let retv = functype.retv;
        ret = [];
        for (let x = 0; x < retc; x++) {
            ret.push(type_name(retv[x]));
        }
    }

    let str = "";
    if (typeof ret == "string") {
        str += ret;
    } else {
        str += '{ ' + ret.join(', ') + ' }';
    }
    str += '\x20(';
    if (typeof arg == "string") {
        str += arg;
    } else {
        str += arg.join(', ');
    }
    str += ")";
    return str;
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

let _fileViews = new Map();
let _db, _appData, _openFiles;
let _workflowParameters;
let _workflowParamViews;
let _workflowParamValues;
let _workflowActive;
let _workflowSelectElement;
let importIsModified = false;
let moduleBuffer;
let targetModule;


let _workflowActions = {
	postOptimizeWasm: {
		handler: postOptimizeWasmAction
	},
	postOptimizeAtomicInst: {
		handler: postOptimizeAtomicInst
	},
	postOptimizeMemInst: {
		handler: postOptimizeMemInstAction
	},
	generateNetbsdWebAssembly: {
		handler: generateNetbsdWebAssembly
	},
	convertToImportedGlobal: {
		handler: convertToImportedGlobalAction
	},
	getGlobalInitialValue: {
		handler: getGlobalInitialValueAction
	},
	postOptimizeKernSide: {
		handler: postOptimizeKernSideAction
	},
	analyzeForkEntryPoint: {
		handler: analyzeForkEntryPoint
	},
	postOptimizeNetbsdUserBinary: {
		handler: postOptimizeNetbsdUserBinaryAction
	},
	convertMemory: {
		handler: convertMemoryAction
	},
	generateBindingsTemplate: {
		handler: console.error
	}, // TODO: generate step which alters the kthread.js
	extractDataSegments: {
		params: [{name: "initial-data", type: "file", role: "output", types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}],
		handler: extractDataSegmentsAction
	},
	filterModuleExports: {
		handler: filterModuleExports
	},
	output: {
		params: [{name: "wasm-binary", type: "file", role: "output", types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}],
		handler: outputAction
	},
	postOptimizeWasmDylib: {
		handler: postOptimizeWasmDylibAction
	},
	dumpImportedFn: {
		handler: dumpImportedFnAction
	},
	configureBindingTemplate: {
		params: [{name: "script", type: "file", role: "output", types: [{description: "JavaScript Files", accept: {"application/javascript": [".js"]}}]}],
		handler: configureBindingTemplateAction
	},
	configureBootParameters : {
		handler: configureBootParameters,
	},
	generateModinfo : {
		handler: generateKLDModuleInfo,
	},
	generateVirtualMemoryWrapper: {
		handler: generateVirtualMemoryWrapperAction,
	}
};

let _netbsdKernMainWorkflow = {
	name: "netbsd 10.99.4 Main Kernel Binary (workflow)",
	id: "netbsd_10.kern-main-binary",
	actions: [
		{
			action: "convertMemory",
			options: {
				type: "import", 	// no value leaves the type as is.
				memidx: 0,
				// min: 			// no value leaves the min as is.
				min: 1954,
				max: 1954,
				shared: true,
			}
		}/*, {
			action: "getGlobalInitialValue",
			options: {
				name: "__stack_pointer",
				variable: "__stack_pointer"
			}
		}, {
			action: "getGlobalInitialValue",
			options: {
				name: "thread0_st",
				variable: "thread0_st"
			}
		}, {
			action: "convertToImportedGlobal",
			options: {
				srcname: "__stack_pointer",
				dstname: {
					module: "kern",
					name: undefined,
				},
				mutable: undefined,
			}
		}, {
			action: "convertToImportedGlobal",
			options: {
				srcname: "__curthread",
				dstname: {
					module: "kern",
					name: undefined,
				},
				mutable: undefined,
			}
		}*/, {
			action: "generateModinfo",
			options: undefined,
		}, {
			action: "generateNetbsdWebAssembly",
			options: undefined,
		}, {
			action: "postOptimizeAtomicInst",
			options: undefined,
		}, /*{
			action: "postOptimizeMemInst",
			options: undefined,
		},*/ {
			action: "extractDataSegments",
			options: {
				format: "wasm",
				consume: true,
				exclude: [".bss"]
			}
		}, {
			action: "filterModuleExports",
			options: {
				names: ["__wasm_call_ctors", "__indirect_function_table", "global_start", "syscall", "syscall_trap"]
			}
		},/*{
			action: "configureBindingTemplate",
			options: {
				format: "javascript",
				handler: function (ctx, mod, text) {
					const threadExp = /__curlwp:\s*new\s*WebAssembly\.Global\(\{[^}]*}\s*,\s*(\d{1,10})\)/gm;
					const stackExp = /__stack_pointer:\s*new\s*WebAssembly\.Global\(\{[^}]*}\s*,\s*(\d{1,10})\)/gm;
					const kenvExp = /const\s*kenv_addr\s*=\s*(\d{1,10});/gm;
					const wabpExp = /const\s*wabp_addr\s*=\s*(\d{1,10});/gm;
					const opfs_ext4_exp = /const\s*OPFS_EXT4_HEAD_ADDR\s*=\s*(\d{1,10});/gm;

					let stack_pointer = ctx.__stack_pointer;
					let lwp0 = ctx.lwp0;
					let glob, kenv_addr, wabp_addr, opfs_ext4_head;
					
					glob = mod.getGlobalByName("static_kenv");
					if (glob)
						kenv_addr = glob.init[0].value;
					
					glob = mod.getGlobalByName("__static_wabp");
					if (glob)
						wabp_addr = glob.init[0].value;

					glob = mod.getGlobalByName("opfs_ext4_head");
					if (glob)
						opfs_ext4_head = glob.init[0].value;

					text = text.replace(threadExp, function(match, num, index) {
						console.log(arguments);
						let idx = match.lastIndexOf(num);
						let before = match.substring(0, idx);
						let after = match.substring(idx + num.length);
						console.log("'%s' '%s'", before, after);
						return before + lwp0.toString() + after;
					});

					text = text.replace(stackExp, function(match, num, index) {
						console.log(arguments);
						let idx = match.lastIndexOf(num);
						let before = match.substring(0, idx);
						let after = match.substring(idx + num.length);
						console.log("'%s' '%s'", before, after);
						return before + stack_pointer.toString() + after;
					});

					text = text.replace(kenvExp, function(match, num, index) {
						if (kenv_addr === undefined)
							return match;
						console.log(arguments);
						let idx = match.lastIndexOf(num);
						let before = match.substring(0, idx);
						let after = match.substring(idx + num.length);
						console.log("'%s' '%s'", before, after);
						return before + kenv_addr.toString() + after;
					});

					text = text.replace(wabpExp, function(match, num, index) {
						if (wabp_addr === undefined)
							return match;
						console.log(arguments);
						let idx = match.lastIndexOf(num);
						let before = match.substring(0, idx);
						let after = match.substring(idx + num.length);
						console.log("'%s' '%s'", before, after);
						return before + wabp_addr.toString() + after;
					});

					text = text.replace(opfs_ext4_exp, function(match, num, index) {
						if (opfs_ext4_head === undefined) {
							opfs_ext4_head = 0; // unset if driver head is not in our defined memory..
						}
						console.log(arguments);
						let idx = match.lastIndexOf(num);
						let before = match.substring(0, idx);
						let after = match.substring(idx + num.length);
						console.log("'%s' '%s'", before, after);
						return before + opfs_ext4_head.toString() + after;
					});

					return text;
				}
			}
		},*/ {
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
	]
};

let _netbsdKernModuleWorkflow = {
	name: "netbsd 10.99.4 Kernel Module Binary (workflow)",
	id: "netbsd_10.kern-module-binary",
	actions: []
};

let _netbsdUserBinaryForkWorkflow = {
	name: "netbsd 10.99.4 User Binary with emulated fork (workflow)",
	id: "netbsd_10.user-binary+emul-fork",
	actions: [
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
			action: "postOptimizeNetbsdUserBinary",
			options: undefined,
		}, {
			action: "analyzeForkEntryPoint",
			options: undefined,
		},/*{
			action: "addToExports",
			options: {exports: ["__stack_pointer"]},
		},*/ {
			action: "output",
			options: {
				exclude: [{type: 0x00, name: ".debug_info"},
						  {type: 0x00, name: ".debug_loc"},
						  {type: 0x00, name: ".debug_ranges"}, 
						  {type: 0x00, name: ".debug_abbrev"},
						  {type: 0x00, name: ".debug_line"},
						  {type: 0x00, name: ".debug_str"}]
			}
		}
	]
};



const _workflows = [_netbsdKernMainWorkflow, _netbsdUserBinaryForkWorkflow];


function getWorkflowParameterValues() {

	let obj = {};
	let files = [];
	let viewMap = _workflowParamViews;
	let params = _workflowParameters;
	let len = !Array.isArray(params) ? 0 : params.length;
	let values = {};
	for (let i = 0; i < len; i++) {
		let param = params[i];
		if (param.type == "file") {
			let file = viewMap[param.name].file;
			values[param.name] = file;
			files.push(file)
		}
		
	}

	obj.params = values;
	obj.files = files;

	return obj;
}

function runWorkflowActions(mod, actions, ctxmap, params) {

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

	//let params = getWorkflowParameterValues();

	let resolveFn;
	let rejectFn;
	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});
	let defaultContext = Object.assign({}, params);
	let returnValue;
	let index = 0;

	function next() {
		if (index >= actions.length) {
			resolveFn();
			return;
		}
		let ctx;
		let actionData;
		let returnPromise;
		for (let i = index; i < actions.length; i++) {
			let ret;
			actionData = actions[i];
			if (ctxmap && ctxmap.has(actionData)) {
				ctx = ctxmap.get(actionData);
			} else {
				ctx = null;
			}
			let name = actionData.action;
			let action = _workflowActions[name];
			let fn = action.handler;
			let options = typeof actionData.options == "object" && actionData.options !== null ? actionData.options : undefined;
			if (options) {
				ret = fn(defaultContext, mod, options);
			} else {
				ret = fn(defaultContext, mod);
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

function convertMemoryAction(ctx, mod, options) {

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
		exp = mod.findExportDefByObject(mem);
		if (exp) {
			type = "export";
		} else {
			type = "internal";
		}
	}

	if (typeof options.type == "string" && (options.type == "import" || options.type == "export" || options.type == "internal")) {

		if (type != options.type) {
			console.error("needs to convert memory type! not implemented!");

			if (options.type == "import") {

				if (!(mem instanceof ImportedMemory)) {

					let idx = mod.memory.indexOf(mem);
					if (mod.memory.length > 1 && idx != 0) {
						// if not already the first memidx this will affect memidx in multi-memory support
					} else {

					}

					let org = mem;
					mem = new ImportedMemory();
					mem.module = "env";
					mem.name = "memory";
					mem.min = org.min;
					mem.max = org.max;
					mem.shared = org.shared;
					mod.imports.push(mem);
					mod.memory[idx] = mem;

					let inexp = false;
					let exps = mod.exports;
					let len = exps.length;
					for (let i = 0; i < len; i++) {
						let exp = exps[i];
						if (!(exp instanceof ExportedMemory)) {
							continue;
						}
						if (exp.memory == org) {
							exps.splice(i, 1);
							inexp = true;
							break;
						}
					}

					if (inexp)
						mod.findSection(SECTION_TYPE_EXPORT)._isDirty = true;

					mod.findSection(SECTION_TYPE_MEMORY)._isDirty = true;
					mod.findSection(SECTION_TYPE_IMPORT)._isDirty = true;


				}
			}

			if (type == "internal" && options.type == "import") {

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
		mod.findSection(SECTION_TYPE_IMPORT)._isDirty = true;
	}

	if ((typeof options.max == "number" && Number.isInteger(options.max)) && options.max !== mem.max) {
		mem.max = options.max;
		mod.findSection(SECTION_TYPE_IMPORT)._isDirty = true;
	}

	if ((typeof options.min == "number" && Number.isInteger(options.min)) && options.min !== mem.min) {
		if (options.min > mem.min) {
			mem.min = options.min;
			mod.findSection(SECTION_TYPE_IMPORT)._isDirty = true;
		} else {
			console.warn("options.min < mem.min");
		}
	}

	console.log(mod);
}

function convertToImportedGlobalAction(ctx, mod, options) {

	let oldglob;
	let newglob;

	if (typeof options.srcname == "string") {
		oldglob = mod.getGlobalByName(options.srcname);
	} else if (typeof options.srcidx == "number") {
		oldglob = mod.globals[options.srcidx]; // TODO: cache original global-vector..
	}

	newglob = new ImportedGlobal();

	if (typeof options.dstname.module == "string") {
		newglob.module = options.dstname.module;
	}

	if (typeof options.dstname.name == "string") {
		newglob.name = options.dstname.name;
	} else {
		newglob.name = options.srcname;
	}

	if (typeof options.mutable == "boolean") {
		newglob.mutable = options.mutable;
	} else {
		newglob.name = oldglob.mutable;
	}

	newglob.type = oldglob.type;

	mod.replaceGlobal(oldglob, newglob, true);
	mod.imports.push(newglob);
	mod.removeExportFor(oldglob);

	let sec = mod.findSection(SECTION_TYPE_IMPORT);
	sec.markDirty();
	sec = mod.findSection(SECTION_TYPE_EXPORT);
	sec.markDirty();
	sec = mod.findSection(SECTION_TYPE_GLOBAL);
	sec.markDirty();

	return true;
}

function getGlobalInitialValueAction(ctx, mod, options) {

	if (!_namedGlobals)
		_namedGlobals = namedGlobalsMap(mod);
	let name = options.name;
	let glob = _namedGlobals[name];
	console.log("%s = %d", name, glob.init[0].value);
}

function extractDataSegmentsAction(ctx, mod, options) {
	let segments = mod.dataSegments;
	if (!Array.isArray(segments) || segments.length == 0)
		return;

	if (Array.isArray(options.exclude) && options.exclude.length > 0) {
		segments = segments.slice(); // copy the original

		let excludeSegments = [];
		let names = [];
		let exclude = options.exclude;
		let len = exclude.length;
		let has_names = false;
		for (let i = 0; i < len; i++) {
			let segment, val = exclude[i];
			if (typeof val == "string") {
				names.push(val);
			} else if (Number.isInteger(val)) {
				if (val < 0 || val >= segments.length)
					throw new RangeError("segment by index is out of range");
				segment = segments[val];
				if (excludeSegments.indexOf(segment) === -1)
					excludeSegments.push(segment);
			} else {
				throw new TypeError("invalid type for data-segment exclude");
			}
		}

		let nmap = {};
		len = segments.length;
		for (let i = 0; i < len; i++) {
			let segment = segments[i];
			if (typeof segment[__nsym] !== "string")
				continue;
			let name = segment[__nsym];
			nmap[name] = segment;
		}

		len = names.length;
		for (let i = 0; i < len; i++) {
			let name = names[i];
			if (!nmap.hasOwnProperty(name))
				continue;
			let segment = nmap[name];
			if (excludeSegments.indexOf(segment) === -1)
				excludeSegments.push(segment);
		}

		let results = [];
		len = segments.length;
		for (let i = 0; i < len; i++) {
			let segment = segments[i];
			if (excludeSegments.indexOf(segment) === -1)
				results.push(segment);
		}

		segments = results;
	}

	if (segments.length == 0) {
		console.warn("nothing to export");
		return;
	}

	if (options.format == "wasm") {
		// there might be more modules that are required at minimum.
		let buffers = [];
		let off = 0;
		let buf = new Uint8Array(8);
		let data = new DataView(buf.buffer);
		buffers.push(buf.buffer);
		data.setUint8(0, 0x00); // \0asm
		data.setUint8(1, 0x61);
		data.setUint8(2, 0x73);
		data.setUint8(3, 0x6D);
		data.setUint32(4, 0x1, true);
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

		let tmod = new WebAssemblyModule();
		tmod.types = [];
		tmod.functions = [];
		tmod.tables = [];
		tmod.memory = [];
		tmod.globals = [];
		tmod.dataSegments = segments;
		tmod._mutableDataSegments = mod._mutableDataSegments;
		tmod.sections = [];
		tmod.sections.push(new WebAssemblyFuncTypeSection(tmod)); // 1
		tmod.sections.push(new WebAssemblyFunctionSection(tmod)); // 3
		tmod.sections.push(new WebAssemblyTableSection(tmod));	// 4
		tmod.sections.push(new WebAssemblyMemorySection(tmod));	// 5
		tmod.sections.push(new WebAssemblyGlobalSection(tmod));	// 6
		tmod.sections.push(new WebAssemblyDataSection(tmod));		// 0x0b
		tmod.sections.push(new WebAssemblyCustomSectionName(tmod));	// 0x00
		
		buffers = tmod.encode({});

		console.log(buffers);

		// data 0x0B
		let tmp = new WebAssemblyDataSection(mod); // detached 
		buf = tmp.encode({dataSegments: segments});
		//buffers.push(buf.buffer);

		// custom:names 0x00
		// custom:producers 0x00
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		/*window.showSaveFilePicker({suggestedName: name, types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}).then(function(file) {

			let elements = document.querySelectorAll(".workflow-ui .workflow-output-file");
			if (elements.length > 0) {
				let element = elements.item(0);
				let label = element.querySelector(".action-body");
				label.textContent = file.name;
				let totsz = 0;
				let len = buffers.length;
				for (let i = 0; i < len; i++) {
					totsz += buffers[i].byteLength;
				}
				label.textContent += '\x20' + humanFileSize(totsz, true);
			}

			file.createWritable().then(function(writable) {

				let blob = new Blob(buffers, { type: "application/wasm" });
    			writable.write(blob).then(function(val) {
    				writable.close().then(resolveFn, rejectFn);
    			}, rejectFn);

			}, rejectFn);
		}, rejectFn);*/

		let file = ctx["initial-data"];

		if (file && file instanceof FileSystemFileHandle) {

			file.createWritable().then(function(writable) {

				let blob = new Blob(buffers, { type: "application/wasm" });
				writable.write(blob).then(function(val) {
					writable.close().then(function(val) {
						console.log("did close writable stream");
						resolveFn(true);
					}, rejectFn);
				}, rejectFn);

				updateFileSizeInUI(file, blob.size);

			}, rejectFn);

		} else {
			let name = targetFilename.split(".");
			name.pop();
			name = name.join(".");
			name += ".data.wasm";
			file = new File(buffers, name, { type: "application/wasm" });
			ctx["initial-data"] = file;
			resolveFn(file);
		}
		
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

function outputAction(ctx, mod, options) {

	let exported = [];
	let sections = mod.sections;
	let len = sections.length;
	let buffers = [];
	mod._buffer = moduleBuffer;

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

	prepareModuleEncode(mod);

	for (let i = 0;i < len;i++) {
		let section = sections[i];
		let isExported = exported[i];
		let type = section.type;
		if (!isExported) {
			//
			if (type == SECTION_TYPE_DATA) {
				let buf = new Uint8Array(3);
				buf[0] = SECTION_TYPE_DATA;
				buf[1] = 1;
				buf[2] = 0;
				buffers.push(buf.buffer);
			} else {
				continue;
			}
		} else if (section instanceof WebAssemblySection) {
			let sub = section.encode({});
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

	let file = ctx["wasm-binary"];

	if (file && file instanceof FileSystemFileHandle) {

		file.createWritable().then(function(writable) {

			let blob = new Blob(buffers, { type: "application/wasm" });
			writable.write(blob).then(function(val) {
				writable.close().then(resolveFn, rejectFn);
			}, rejectFn);

			updateFileSizeInUI(file, blob.size);

		}, rejectFn);

		

	} else {
		file = new File(buffers, targetFilename, { type: "application/wasm" });
		ctx["wasm-binary"] = file;
		resolveFn(file);
	}

	/*window.showSaveFilePicker({suggestedName: targetFilename, types: [{description: "WebAssembly Files", accept: {"application/wasm": [".wasm"]}}]}).then(function(file) {

		let elements = document.querySelectorAll(".workflow-ui .workflow-output-file");
		if (elements.length > 0) {
			let element = elements.item(1);
			let label = element.querySelector(".action-body");
			label.textContent = file.name;
			let totsz = 0;
			let len = buffers.length;
			for (let i = 0; i < len; i++) {
				totsz += buffers[i].byteLength;
			}
			label.textContent += '\x20' + humanFileSize(totsz, true);
		}

		file.createWritable().then(function(writable) {

			let blob = new Blob(buffers, { type: "application/wasm" });
			writable.write(blob).then(function(val) {
				writable.close().then(resolveFn, rejectFn);
			}, rejectFn);

		}, rejectFn);
	}, rejectFn);*/
	
	return p;

	//let filename = url.split('/').pop();
	//saveAsFile(new Blob(buffers, { type: "application/octet-stream"}), filename);
}

function configureBindingTemplateAction(ctx, mod, options) {

	let resolveFn;
	let rejectFn;
	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});

	let bindingsFile = null;

	let handle = ctx["script"];

	if (handle === undefined || !(handle instanceof FileSystemFileHandle)) {
		rejectFn(new TypeError("bindings file must be provided for configureBindingTemplateAction()"));
		return p;
	}

	handle.getFile().then(function(file) {

		file.text().then(function(text) {

			console.log("loaded file data");

			let ret = options.handler(ctx, mod, text);
			if (ret instanceof Promise) {
				ret.then(function(result) {

					if (typeof result != "string") {
						rejectFn(new TypeError("unexpected return"));
						console.error("unexpected return");
						return;
					}

					if (result === text) {
						resolveFn(true);
						return;
					}

					handle.createWritable().then(function(writable) {

						let blob = new Blob([result], { type: "text/plain" });
						writable.write(blob).then(function(val) {
							writable.close().then(resolveFn, rejectFn);
						}, rejectFn);

					}, rejectFn);

				}, rejectFn);
			} else if (typeof ret == "string") {

				if (ret === text) {
					resolveFn(true);
					return;
				}

				handle.createWritable().then(function(writable) {

					let blob = new Blob([ret], { type: "text/plain" });
					writable.write(blob).then(function(val) {
						writable.close().then(resolveFn, rejectFn);
					}, rejectFn);

				}, rejectFn);

			} else {
				console.error("unexpected return");
				rejectFn(new TypeError("unexpected return"));
			}
		}, rejectFn);
	}, rejectFn);

	/*window.showOpenFilePicker({multiple: false, types: [{description: "JavaScript Files", accept: {"application/javascript": [".js"]}}]}).then(function(files) {

		console.log(files);
		let handle = files[0];
		handle.getFile().then(function(file) {

			file.text().then(function(text) {

				console.log("loaded file data");

				let ret = options.handler(ctx, mod, text);
				if (ret instanceof Promise) {
					ret.then(function(result) {

						if (typeof result != "string") {
							rejectFn(new TypeError("unexpected return"));
							console.error("unexpected return");
							return;
						}

						if (result === text) {
							resolveFn(true);
							return;
						}

						handle.createWritable().then(function(writable) {

							let blob = new Blob([result], { type: "text/plain" });
							writable.write(blob).then(function(val) {
								writable.close().then(resolveFn, rejectFn);
							}, rejectFn);

						}, rejectFn);

					}, rejectFn);
				} else if (typeof ret == "string") {

					if (ret === text) {
						resolveFn(true);
						return;
					}

					handle.createWritable().then(function(writable) {

						let blob = new Blob([ret], { type: "text/plain" });
						writable.write(blob).then(function(val) {
							writable.close().then(resolveFn, rejectFn);
						}, rejectFn);

					}, rejectFn);

				} else {
					console.error("unexpected return");
					rejectFn(new TypeError("unexpected return"));
				}
			}, rejectFn);
		}, rejectFn);
	}, rejectFn);*/


	return p;
}

function postOptimizeWasmAction(ctx, mod, options) {
	return postOptimizeWasm(ctx, mod);
}

function postOptimizeNetbsdUserBinaryAction(ctx, mod, options) {
	
	replaceCallInstructions(ctx, mod, null, atomic_op_replace_map);
	replaceCallInstructions(ctx, mod, null, memory_op_replace_map);

	const c99_builtin_to_inst = [{
		name: 'alloca',
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			return false;
		}
	}, {
		name: 'floor',
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			return false;
		}
	}];

	replaceCallInstructions(ctx, mod, null, c99_builtin_to_inst);
}



function makeIndirectCallable(mod, tableidx, func) {
	let tbl = mod.tables[tableidx].contents;
	if (!tbl)
		throw TypeError("invalid tableidx");
	let idx = tbl.indexOf(func);
	if (idx !== -1) {
		return idx;
	}
	idx = tbl.length;
	tbl.push(func);
	return idx;
}

function indexOfFuncType(mod, argv, retv) {
	let types = mod.types;
	let len = types.length;
	let argc = Array.isArray(argv) ? argv.length : 0;
	let retc = Array.isArray(retv) ? retv.length : 0;
	for (let i = 0; i < len; i++) {
		let type = types[i];
		if (argc != type.argc || retc != type.retc) {
			continue;
		}

		if (argc != 0) {
			let match = true;
			for (let x = 0; x < argc; x++) {
				if (argv[x] != type.argv[x]) {
					match = false;
					break;
				}
			}

			if (!match)
				continue;
		}

		if (retc != 0) {
			let match = true;
			for (let x = 0; x < retc; x++) {
				if (retv[x] != type.retv[x]) {
					match = false;
					break;
				}
			}

			if (!match)
				continue;
		}

		// if we reached here it matching.
		return i;
	}

	return -1;
}

function generateVirtualMemoryWrapperAction(ctx, module, options) {
	generateVirtualMemoryWrapper(module);
}

function postOptimizeKernSideAction(ctx, module, options) {

}

function postOptimizeWasmDylibAction(ctx, module, options) {
	
}

function dumpImportedFnAction(ctx, module, options) {
	
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

// mapping of placeholder atomic operations to dedicated wasm instructions.
const atomic_op_replace_map = [
	{ 	// atomic operations.
		name: "atomic_notify",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE00, 2, 0);
			return true;
		}
	}, {
		name: "atomic_wait32",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE01, 2, 0);
			return true;
		}
	}, {
		name: ["wasm_atomic_fence", "wasm32_atomic_fence"],
		type: WasmType.create(null, null),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0xFE03, memidx: 0};
			return true;
		}
	}, {
		name: "atomic_load8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE12, 0, 0);
			return true;
		}
	}, {
		name: "atomic_store8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE19, 0, 0);
			return true;
		}
	}, {
		name: "atomic_add8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE20, 0, 0);
			return true;
		}
	}, {
		name: "atomic_sub8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE27, 0, 0);
			return true;
		}
	}, {
		name: "atomic_and8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2E, 0, 0);
			return true;
		}
	},{
		name: "atomic_or8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE35, 0, 0);
			return true;
		}
	}, {
		name: "atomic_xor8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3C, 0, 0);
			return true;
		}
	}, {
		name: "atomic_xchg8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE43, 0, 0);
			return true;
		}
	}, {
		name: "atomic_cmpxchg8",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE4A, 0, 0);
			return true;
		}
	},  {
		name: "atomic_load16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE13, 1, 0);
			return true;
		}
	}, {
		name: "atomic_store16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1A, 1, 0);
			return true;
		}
	}, {
		name: "atomic_add16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE21, 1, 0);
			return true;
		}
	}, {
		name: "atomic_sub16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE28, 1, 0);
			return true;
		}
	}, {
		name: "atomic_and16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2F, 1, 0);
			return true;
		}
	},{
		name: "atomic_or16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE36, 1, 0);
			return true;
		}
	}, {
		name: "atomic_xor16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3D, 1, 0);
			return true;
		}
	}, {
		name: "atomic_xchg16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE44, 1, 0);
			return true;
		}
	}, {
		name: "atomic_cmpxchg16",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE4B, 0, 0);
			return true;
		}
	}, {
		name: "atomic_load32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE10, 1, 0);
			return true;
		}
	}, {
		name: "atomic_store32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE17, 2, 0);
			return true;
		}
	}, {
		name: "atomic_add32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1E, 2, 0);
			return true;
		}
	}, {
		name: "atomic_sub32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE25, 2, 0);
			return true;
		}
	}, {
		name: "atomic_and32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2C, 2, 0);
			return true;
		}
	},{
		name: "atomic_or32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE33, 2, 0);
			return true;
		}
	}, {
		name: "atomic_xor32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3A, 2, 0);
			return true;
		}
	}, {
		name: "atomic_xchg32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE41, 2, 0);
			return true;
		}
	}, {
		name: "atomic_cmpxchg32",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE48, 2, 0);
			return true;
		}
	}, {
		name: "atomic_wait64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE02, 3, 0);
			return true;
		}
	}, {
		name: "atomic_load64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE11, 3, 0);
			return true;
		}
	}, {
		name: "atomic_store64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE18, 3, 0);
			return true;
		}
	}, {
		name: "atomic_add64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1F, 3, 0);
			return true;
		}
	}, {
		name: "atomic_sub64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE26, 3, 0);
			return true;
		}
	}, {
		name: "atomic_and64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2D, 3, 0);
			return true;
		}
	}, {
		name: "atomic_or64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE34, 3, 0);
			return true;
		}
	}, {
		name: "atomic_xor64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3B, 3, 0);
			return true;
		}
	}, {
		name: "atomic_xchg64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE42, 3, 0);
			return true;
		}
	},{
		name: "atomic_cmpxchg64",
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE49, 3, 0);
			return true;
		}
	}
];

// other common operations which could be replaced:
// popcount32 -> i32.popcnt

// mapping of memcpy/memset into dedicated wasm instructions.
const memory_op_replace_map = [{ 							// memory operations.
		name: "memcpy",
		replace: memcpyReplaceHandler
	}, {
		name: "__memcpy",
		replace: memcpyReplaceHandler
	}, {
		name: "memcpy_early",
		replace: memcpyReplaceHandler
	}, {
		name: "memset",
		// replacing memset vs. memory.fill is where it gets complicated, memset returns which the 
		// memory.fill instruction does not. check for drop instruction but if not found we must fake
		// the return of memset 
		replace: memset_to_inst_handler
}];

function localUsedInRange(instructions, local, start, end) {

	end = Math.min(instructions.length, end);

	for (let i = start; i < end; i++) {
		let inst  = instructions[i];
		if (inst.opcode == 0x20 || inst.opcode == 0x21 || inst.opcode == 0x22) {
			if (inst.local == local)
				return true;
		}
	}

	return false;
}

function memcpyReplaceHandler(inst, index, arr, func) {

	let after = index + 1 < arr.length ? arr[index + 1] : null;
	if (after) {
		let opcode = after.opcode;
		if (opcode == 0x1A) { 			// drop
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			arr.splice(index + 1, 1); // remove drop
			return index + 1 < arr.length ? arr[index + 1] : true;
		} else if (opcode == 0x22) { 	// local.tee
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			after.opcode = 0x20; // replace local.tee with local.get
			let tee, dstidx, dst = traverseStack(func, arr, index - 1, 2);
			dstidx = arr.indexOf(dst);
			tee = {opcode: 0x22, local: after.local}; // local.tee
			arr.splice(dstidx + 1, 0, tee);
			return after;
		} else if (opcode == 0x21) { 	// local.set
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			let tee, opidx, dst = traverseStack(func, arr, index - 1, 2);
			opidx = arr.indexOf(dst);
			tee = {opcode: 0x22, local: after.local}; // local.tee
			arr.splice(opidx + 1, 0, tee);
			opidx = arr.indexOf(after);
			arr.splice(opidx, 1);
			// TODO: assert that .local is not used prior to after memset instruction.
			return opidx < arr.length ? arr[opidx] : arr[arr.length - 1];
		} else {
			let local;
			if (!func.__memoplocal) {
				local = new WasmLocal(WA_TYPE_I32);
				func.__memoplocal = local;
				func.locals.push(local);
			} else {
				local = func.__memoplocal;
			}

			let tee, opidx, dst = traverseStack(func, arr, index - 1, 2);
			opidx = arr.indexOf(dst);
			if (localUsedInRange(arr, local, opidx, index)) {
				console.error("local is in use!");
				return false;
			}
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			let lget = {opcode: 0x20, local: local};
			arr.splice(index + 1, 0, lget);		// inserts a local.get for dest after memory.copy
			tee = {opcode: 0x22, local: local}; // local.tee for the dest of memory.copy
			arr.splice(opidx + 1, 0, tee);
			// TODO: assert that .local is not used prior to after memset instruction.
			return lget;
		}
	}
	
	return false;
}

function memset_to_inst_handler(inst, index, arr, func) {
	let after = index + 1 < arr.length ? arr[index + 1] : null;
	if (after) {
		let opcode = after.opcode;
		if (opcode == 0x1A) { 			// drop
			arr[index] = {opcode: 0xfc0b, memidx: 0};
			arr.splice(index + 1, 1); // remove drop
			return index + 1 < arr.length ? arr[index + 1] : true;
		} else if (opcode == 0x22) { 	// local.tee
			arr[index] = {opcode: 0xfc0b, memidx: 0};
			after.opcode = 0x20; // replace local.tee with local.get
			let tee, dstidx, dst = traverseStack(func, arr, index - 1, 2);
			dstidx = arr.indexOf(dst);
			tee = {opcode: 0x22, local: after.local}; // local.tee
			arr.splice(dstidx + 1, 0, tee);
			return after;
		} else if (opcode == 0x21) { 	// local.set
			arr[index] = {opcode: 0xfc0b, memidx: 0};
			let tee, opidx, dst = traverseStack(func, arr, index - 1, 2);
			opidx = arr.indexOf(dst);
			tee = {opcode: 0x22, local: after.local}; // local.tee
			arr.splice(opidx + 1, 0, tee);
			opidx = arr.indexOf(after);
			arr.splice(opidx, 1);
			// TODO: assert that .local is not used prior to after memset instruction.
			return opidx < arr.length ? arr[opidx] : arr[arr.length - 1];
		} else {
			let local;
			if (!func.__memoplocal) {
				local = new WasmLocal(WA_TYPE_I32);
				func.__memoplocal = local;
				func.locals.push(local);
			} else {
				local = func.__memoplocal;
			}

			let tee, opidx, dst = traverseStack(func, arr, index - 1, 2);
			opidx = arr.indexOf(dst);
			if (localUsedInRange(arr, local, opidx, index)) {
				console.error("local is in use!");
				return false;
			}
			arr[index] = {opcode: 0xfc0b, memidx: 0};
			let lget = {opcode: 0x20, local: local};
			arr.splice(index + 1, 0, lget);		// inserts a local.get for dest after memory.copy
			tee = {opcode: 0x22, local: local}; // local.tee for the dest of memory.copy
			arr.splice(opidx + 1, 0, tee);
			// TODO: assert that .local is not used prior to after memset instruction.
			return lget;
		}
	}
	
	return false;
}

let _namedGlobals;

function postOptimizeWasm(ctx, mod) {

	replaceCallInstructions(ctx, mod, null, atomic_op_replace_map);
	replaceCallInstructions(ctx, mod, null, memory_op_replace_map);	

	{	
		let glob = mod.getGlobalByName("__stack_pointer");
		console.log("%s = %d", glob.name, glob.init[0].value);
		ctx.__stack_pointer = glob.init[0].value; // store it for later use.
		glob = mod.getGlobalByName("thread0_st");
		console.log("%s = %d", glob.name, glob.init[0].value);
		ctx.thread0_st = glob.init[0].value; // store it for later use.
	}


	let g1 = mod.getGlobalByName("__stack_pointer");
	let g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__stack_pointer";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
	mod.imports.unshift(g2);
	removeExportFor(mod, g1);

	g1 = mod.getGlobalByName("__curthread");
	g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__curthread";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
	mod.imports.push(g2);
	removeExportFor(mod, g1);

	let sec = mod.findSection(SECTION_TYPE_IMPORT);
	if (sec)
		sec.markDirty();

	sec = mod.findSection(SECTION_TYPE_EXPORT);
	if (sec)
		sec.markDirty();

	sec = mod.findSection(SECTION_TYPE_GLOBAL);
	if (sec)
		sec.markDirty();

	console.log(funcmap);
}

function postOptimizeAtomicInst(ctx, mod) {

	replaceCallInstructions(ctx, mod, null, atomic_op_replace_map)
}

function postOptimizeMemInstAction(ctx, mod) {

	replaceCallInstructions(ctx, mod, null, memory_op_replace_map);

	/* Dont know is this is the version I want to keep?
	// TODO: we are missing atomic_fence, but cannot find this in the actual wasm proposal.
	const inst_replace = [];

	let funcmap = new Map();
	let functions = mod.functions;
	let ylen = functions.length;
	let len = inst_replace.length;
	for (let i = 0; i < len; i++) {
		let handler = inst_replace[i];
		let name = handler.name;
		let match;

		for (let y = 0; y < ylen; y++) {
			let func = functions[y];
			if (typeof func[__nsym] != "string" || func[__nsym] !== name)
				continue;

			match = func;
			break;
		}

		if (match) {
			handler.func = match;
			handler.count = 0;
			funcmap.set(match, handler);
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

	functions = mod.functions;
	ylen = functions.length;
	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		// NOTE: don't try to optimize the opcodes.length, handlers might alter instructions around them.
		for (let x = 0; x < opcodes.length; x++) {
			let op = opcodes[x];
			if (op.opcode == 0x10) {
				if (funcmap.has(op.func)) {
					let call = op.func;
					let handler = funcmap.get(call);
					handler.count++;
					let res = handler.replace(op, x, opcodes);
					if (res === op) {
						// do nothing
						if (op.func !== call) { // if the function referenced has been changed, decrement ref count.
							func._opcodeDirty = true;
							call.usage--;
						}
					} else if (typeof res == "boolean") {
						if (res === true) {
							call.usage--; // decrement ref count..
							func._opcodeDirty = true;
						}
					} else if (typeof res == "object" && res !== null) {
						let idx = opcodes.indexOf(res);
						if (idx !== -1) {
							y = idx;
						}
						call.usage--;
						func._opcodeDirty = true;
					}
				}
			}
		}
	}
	*/
}

/**
 * Each object in the `inst_replace` should have atleast the following properties:
 * name<String, String[]> specifies the name(s) of the function call to replace.
 * replace: <Boolean|Instruction> function(inst, index, opcodes)
 * 
 * If the replace callback returns a Boolean true the call is seen as replaced, and usage is decrement function call replaced.
 * A boolean false indicates that the opcode was not changed by replace callback.
 * The return of a Instruction which is referenced in the opcodes array indicates a jump to that instruction, which must be used if
 * the replace callback handler alters/removes more than one instruction or if the replace callback handler encapsules the original
 * instruction inside for example a conditional closure.
 *
 * TODO: we could actually return is a array of WasmFunction on which usage was altered.
 * 
 * @param  {Object} ctx         
 * @param  {WebAssemblyModule} mod          
 * @param  {Array} functions A optional selection of functions in which to replace the matching call-sites. If not specified the replace happens on all function in the specified module.
 * @param  {Array} inst_replace A array of objects in the format described above.
 * @return {void}              
 */
function replaceCallInstructions(ctx, mod, functions, inst_replace) {

	let opsopt = [];
	
	let namemap = new Map();
	let funcmap = new Map();
	let names = [];
	let ylen = inst_replace.length;
	for (let y = 0; y < ylen; y++) {
		let handler = inst_replace[y];
		let name = handler.name;
		if (typeof name == "string") {
			if (namemap.has(name)) {
				let tmp = namemap.get(name);
				if (!Array.isArray(tmp)) {
					tmp = [tmp];
					namemap.set(name, tmp);
				}
				tmp.push(handler);
			} else {
				namemap.set(name, handler);
			}
		} else if (Array.isArray(name)) {
			let names = name;
			let xlen = names.length;
			for (let x = 0; x < xlen; x++) {
				name = names[x];
				if (namemap.has(name)) {
					let tmp = namemap.get(name);
					if (!Array.isArray(tmp)) {
						tmp = [tmp];
						namemap.set(name, tmp);
					}
					tmp.push(handler);
				} else {
					namemap.set(name, handler);
				}
			}
		}
		
	}

	
	let fns = mod.functions;
	ylen = fns.length;
	for (let y = 0; y < ylen; y++) {
		let idx, name, func = fns[y];
		if (typeof func[__nsym] != "string")
			continue;
		name = func[__nsym];
		if (!namemap.has(name))
			continue;
		let handler = namemap.get(name);
		funcmap.set(func, handler);
	}

	fns = Array.isArray(functions) ? functions : mod.functions;
	ylen = fns.length;
	for (let y = 0; y < ylen; y++) {
		let opcodes, func = fns[y];
		if (func instanceof ImportedFunction) {
			continue;
		}

		opcodes = func.opcodes;
		// NOTE: don't try to optimize the opcodes.length, handlers might alter instructions around them.
		for (let x = 0; x < opcodes.length; x++) {
			let op = opcodes[x];
			if (op.opcode == 0x10) {
				if (funcmap.has(op.func)) {
					let call = op.func;
					let zlen = 1;
					let handler, handlers = funcmap.get(call);
					if (Array.isArray(handlers)) {
						handler = handlers[0];
						zlen = handlers.length;
					} else {
						handler = handlers;
					}
					//handler.count++;
					let res = handler.replace(op, x, opcodes, func);
					if (res === false && zlen > 1) {
						let z = 1;
						while (res === false && z < zlen) {
							handler = handlers[z++];
							res = handler.replace(op, x, opcodes, func);
						}
					}
					if (res === op) {
						// do nothing
						if (op.func !== call) { // if the function referenced has been changed, decrement ref count.
							func._opcodeDirty = true;
							call.usage--;
						}
					} else if (typeof res == "boolean") {
						if (res === true) {
							call.usage--; // decrement ref count..
							func._opcodeDirty = true;
						}
					} else if (typeof res == "object" && res !== null) {
						let idx = opcodes.indexOf(res);
						if (idx !== -1) {
							x = idx;
						}
						call.usage--;
						func._opcodeDirty = true;
					}
				}
			}
		}
	}

	//
}

// Handling exports on generated WebAssembly Module

/**
 * Updates the exports of a module based on a set of filter
 *
 * options.callback = <Boolean> function(export)
 * or
 * options.names = Array of strings.
 * 
 * @param  {[type]} ctx     [description]
 * @param  {[type]} mod     [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
function filterModuleExports(ctx, mod, options) {

	let callback, names, regexps;
	if (typeof options.callback == "function") {
		callback = options.callback;
	} else if (Array.isArray(options.names)) {
		names = options.names;
		let len = names.length;
		for (let i = 0; i < len; i++) {
			let val = names[i];
			if (val instanceof RegExp) {
				if (!regexps)
					regexps = [];
				regexps.push(val);
			}
		}
	} else {
		throw new TypeError("names or callback must be provided");
	}

	let exps = mod.exports;
	let len = exps.length;
	let idx = 0;
	while (idx < len) {
		let exp = exps[idx];
		let keep;
		if (callback) {
			keep = callback(exp);
		} else {
			let name = exp.name;
			keep = names.indexOf(exp.name) !== -1;
			if (keep === false && regexps) {
				let ylen = regexps.length;
				for(let i = 0;i < ylen;i++){
					let regexp = regexps[i];
					if (name.search(regexp) !== -1) {
						keep = true;
						break;
					}
				}
			}
		}

		if (!keep) {
			exps.splice(idx, 1);
			// dont increment idx..
			len--;
		} else {
			idx++;
		}

	}
}


/**
 * Generic Key-Value-Object container format for storing essential 
 *
 * The format is similar but not identical to the producers section (link below) but 
 * we cannot do whats needed with simply string values.
 *
 * u32  	root object index 
 * u32  	object table count
 * .... count x 32-bit pointers (relative to start if count address)
 * 
 * each object is composed of a 8-byte prefix, where the high 4-byte is the type and
 * the low 4-bytes is the count of the value it holds, a 4-byte value of 0x0 indicates
 * that a 4-byte unsigned integer value follows that tells the count or size of the object.
 * This type of encoding offers the best of two worlds.
 * - for array values this the number of contained object.
 * - for dictionary (kvo) object this is the sum of number of keys + values
 * - for signed/unsigned integer this is the power of value
 *   1 coresponds to a  8-bit value
 *   2 coresponds to a 16-bit value
 *   3 coresponds to a 32-bit value
 *   4 coresponds to a 64-bit value
 *   [other values for integers are reserved for future use]
 * - for string & binary-data values this is the number of bytes (not chars)
 *
 * Type 
 * NULL		0000  0000			nullptr/NULL/null
 * bool		0000  1000			false
 * bool		0000  1001			true
 * date		0000  0011			8-byte date value.
 * integer	0001  nnnn
 * float 	0010  nnnn
 * data		0100  nnnn			binary data chunk
 * array
 * 0x00
 * 
 * 0x10 	dictionary
 * 0x20 	array
 * 0x30 	ascii string value
 * 0x40 	utf-8 string value
 * 0x50		unsigned integer
 * 0x60		signed integerecho
 * 0x70 	binary data chunk
 * 
 * i32
 *
 *
 * [](https://github.com/WebAssembly/tool-conventions/blob/main/ProducersSection.md)
 */
class WasmNetbsdKVOContainer extends WebAssemblyCustomSection {

	constructor(module, name, kvo) {
		super(module, name);
		this.name = name;
		this.data = kvo;
	}

	encode() {
		// for now we simply use JSON in order to not spend to much time on a encoding when we should get 
		// kernel up and runnning..
		let kvo = this.data;
		let totsz, secsz = 0;
		let json = JSON.stringify(kvo, null, 2);
		let datasz = lengthBytesUTF8(json);
		let namesz = lengthBytesUTF8(this.name);
		secsz = datasz + namesz;
		secsz += lengthULEB128(namesz);
		totsz = secsz;
		totsz += lengthULEB128(totsz);

		let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
        data.writeULEB128(namesz);
        data.writeUTF8Bytes(this.name);
        data.writeUTF8Bytes(json);

        if (data.offset != totsz + 1)
        	console.error("expected length != actual length (%d vs. %d)", data.offset, totsz + 1);

        return buf;

		/*
		let count = data.readULEB128();
	    console.log("count: %d", count);
	    let fields = {};
	    for (let i = 0; i < count; i++) {
	        let namesz = data.readULEB128();
	        let fname = data.readUTF8Bytes(namesz);

	        let valcnt = data.readULEB128();
	        let values = [];
	        for (let x = 0; x < valcnt; x++) {
	            let verlen, valuesz = data.readULEB128();
	            let value = data.readUTF8Bytes(valuesz);
	            verlen = data.readULEB128(); // version string.
	            if (verlen > 0) {
	                let version = data.readUTF8Bytes(verlen);
	                values.push({value: value, version: version});
	            } else {
	                values.push(value);
	            }
	        }
	        fields[fname] = values;
	    }

	    console.log(fields);
	    return fields;
	    */
	}

	static decode(module, data, size) {

	}
} 

// does post mutation of netbsd kernel binaries for WebAssembly, also adds a custom section which holds essential information
// to initialize the kernel.
function generateNetbsdWebAssembly(ctx, mod) {

	let initmem = mod.computeInitialMemory(mod.memory[0], true);
	let data = new DataView(initmem.buffer);
	console.log(initmem);

	{	
		let glob = mod.getGlobalByName("__stack_pointer");
		console.log("__stack_pointer = %d", name, glob.init[0].value);
		ctx.__stack_pointer = glob.init[0].value; // store it for later use.
		glob = mod.getGlobalByName("lwp0");
		console.log("lwp0 = %d", name, glob.init[0].value);
		ctx.lwp0 = glob.init[0].value; // store it for later use.
	}

	function getValueByName(name) {

		let glob = mod.getGlobalByName(name);
		if (!glob) 
			return undefined;
		console.log("%s = %d", name, glob.init[0].value);
		return glob.init[0].value;
	}

	/*
	__start__init_memory = WASM_DEF_ADDR; // start of the initial memory, often .rodata section.
	__stop__init_memory = WASM_DEF_ADDR;  // end of the initial memory, indicates the end of .bss section
	__bss_start = WASM_DEF_ADDR;          // start of the ".bss" section
	__kernel_text = WASM_DEF_ADDR;
	_end = WASM_DEF_ADDR;
	__data_start = WASM_DEF_ADDR;
	__rodata_start = WASM_DEF_ADDR;
	physical_start = WASM_DEF_ADDR;
	physical_end = WASM_DEF_ADDR;
	bootstrap_pde = WASM_DEF_ADDR;
	l1_pte = WASM_DEF_ADDR;
	bootargs                // 1024 bytes of string value
	bootdevstr              // 64 bytes of string value
	boot_args 				// pointer to boot_arguments
	 */
	
	let netbsd_wakern_info = {};

	let __global_base = getValueByName("__global_base");

	let addr_start_mem = getValueByName("__start__init_memory");
	let addr_stop_mem = getValueByName("__stop__init_memory");
	let addr_bss_start = getValueByName("__bss_start");
	let addr_kernel_text = getValueByName("__kernel_text");			// ?
	let addr_kernel_end = getValueByName("_end");					// ?
	let addr_data_start = getValueByName("__data_start");
	let addr_rodata_start = getValueByName("__rodata_start");
	let addr_physical_start = getValueByName("physical_start");
	let addr_physical_end = getValueByName("physical_end");
	let addr_bootstrap_pde = getValueByName("bootstrap_pde");		// done by locore at boot.
	let addr_l1_pte = getValueByName("l1_pte");						// done by locore at boot.
	//let addr_bootargs = getValueByName("bootargs");
	//let addr_bootdevstr = getValueByName("bootdevstr");
	//let addr_boot_args = getValueByName("boot_args");
	let addr_fdt_base = getValueByName("__fdt_base");
	

	netbsd_wakern_info.physical_start = addr_physical_start;
	netbsd_wakern_info.physical_end = addr_physical_end;
	netbsd_wakern_info.bootstrap_pde = addr_bootstrap_pde;
	netbsd_wakern_info.l1_pte = addr_l1_pte;
	//netbsd_wakern_info.bootargsbuf = addr_bootargs;
	//netbsd_wakern_info.bootdevstr = addr_bootdevstr;
	//netbsd_wakern_info.bootargsp = addr_boot_args;
	netbsd_wakern_info.__start__init_memory = addr_start_mem;
	netbsd_wakern_info.__stop__init_memory = addr_stop_mem;
	netbsd_wakern_info.__start_kern = addr_kernel_text;
	netbsd_wakern_info.__stop_kern = addr_kernel_end;
	netbsd_wakern_info.fdt_base = addr_fdt_base;
	netbsd_wakern_info.lwp0 = getValueByName("lwp0");
	netbsd_wakern_info.lwp0_stackp = getValueByName("__stack_pointer");
	netbsd_wakern_info.__wasmkern_envp = getValueByName("__wasmkern_envp");
	netbsd_wakern_info.addresses = [
		{
			name: "__global_base",
			addr: __global_base
		}, {
			name: "__start__init_memory",
			addr: addr_start_mem
		}, {
			name: "__stop__init_memory",
			addr: addr_stop_mem
		}, {
			name: "__bss_start",
			addr: addr_bss_start
		}, {
			name: "__kernel_text",
			addr: addr_kernel_text
		}, {
			name: "_end",
			addr: addr_kernel_end
		}, {
			name: "__data_start",
			addr: addr_data_start
		}, {
			name: "__rodata_start",
			addr: addr_rodata_start
		}, {
			name: "physical_start",
			addr: addr_physical_start
		}, {
			name: "physical_end",
			addr: addr_physical_end
		}, {
			name: "bootstrap_pde",
			addr: addr_bootstrap_pde
		}, {
			name: "l1_pte",
			addr: addr_l1_pte
		},/*{
			name: "bootargs",
			addr: addr_bootargs
		}, {
			name: "bootdevstr",
			addr: addr_bootdevstr
		}, {
			name: "boot_args",
			addr: addr_boot_args
		},*/{
			name: "__fdt_base",
			addr: addr_fdt_base
		}
	];

	data.setUint32(addr_start_mem, __global_base, true);
	data.setUint32(addr_stop_mem, initmem.byteLength, true);
	netbsd_wakern_info.hint_min_stacksz = (netbsd_wakern_info.lwp0_stackp - initmem.byteLength); // clang always by default place the stack at the end of initmem, growing towards the end of initmem.

	function isConst(opcode) {
		return opcode == 0x41 || opcode == 0x42 || opcode == 0x43 || opcode == 0x44;
	}

	let rump_variant = {
		__wasmkern_envp: "__wasmkern_envp",
		__physmemlimit: "rump_physmemlimit",
		__curphysmem: "curphysmem",
		lwp0uarea: "lwp0uarea",
		opfs_ext4_head: "opfs_ext4_head",		// opfs+ext4 driver location
		opfs_blkdev_head: "opfs_blkdev_head",	// opfs-blkdev
		__first_avail: "__first_avail",
		avail_end: "avail_end",
		l2_addr: "PDPpaddr",
		bootinfo: "bootinfo",
		__wasm_meminfo: "__wasm_meminfo"
	};

	for (let p in rump_variant) {
		let glob, name = rump_variant[p];
		if (netbsd_wakern_info.hasOwnProperty(p))
			continue;
		glob = mod.getGlobalByName(name);
		if (glob === null)
			continue;
		if (glob.init.length != 2 || !(isConst(glob.init[0].opcode) && glob.init[1].opcode == 0x0b)) {
			throw new TypeError("global of unsupported value");
		}

		netbsd_wakern_info[p] = glob.init[0].value;
	}


	let memseg = mod.getDataSegmentByName(".bss");
	let memstart = memseg.inst.opcodes[0].value;
	data.setUint32(addr_bss_start, memstart, true);

	memseg = mod.getDataSegmentByName(".rodata");
	memstart = memseg.inst.opcodes[0].value;
	data.setUint32(addr_rodata_start, memstart, true);

	memseg = mod.getDataSegmentByName(".data");
	memstart = memseg.inst.opcodes[0].value;
	data.setUint32(addr_data_start, memstart, true);

	if (mod.memory.length != 1) {
		throw new Error("only implemented with one memory in mind");
	}

	data.setUint32(addr_physical_start, 0, true);
	let memmax = 0;
	if (mod.memory[0].max) {
		memmax = mod.memory[0].max * WASM_PAGE_SIZE;
	} else {
		memmax = 0xFFFFFFFF;
	}
	data.setUint32(addr_physical_end, memmax, true);

	if (netbsd_wakern_info.__curphysmem) {
		data.setUint32(netbsd_wakern_info.__curphysmem, initmem.byteLength, true);
		
	}

	console.log(netbsd_wakern_info);
	let section = new WasmNetbsdKVOContainer(mod, "com.netbsd.kernel-locore", netbsd_wakern_info);
	mod.sections.push(section);

	let g1 = mod.getGlobalByName("__stack_pointer");
	let g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__stack_pointer";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
	mod.imports.unshift(g2);
	mod.removeExportByRef(g1);

	g1 = mod.getGlobalByName("wasm_curlwp");
	g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__curlwp";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
	mod.imports.push(g2);
	mod.removeExportByRef(g1);

	function replace_x86curlwp(inst, index, arr) {
		let peek = index < arr.length ? arr[index + 1] : null;
		if (peek === null || peek.opcode != 0x1A) { // drop
			arr[index] = {opcode: 0x23, global: g2};
			inst.func.usage--;	// decrement reference count
			return true;
		} else {
			console.warn("call to x86curlwp does drop return value");
		}
		return true;
	}

	function replace_wasm_nop(inst, index, arr) {
		arr[index] = {opcode: 0x01};
		inst.func.usage--;	// decrement reference count
		return true;
	}

	

	replaceCallInstructions(ctx, mod, null, [{name: "x86_curlwp", replace: replace_x86curlwp},
		{name: "wasm_inst_nop", replace: replace_wasm_nop}]);

	let func = mod.getFunctionByName("x86_curlwp");
	console.log(func);

	let sec = mod.findSection(SECTION_TYPE_IMPORT);
	if (sec)
		sec.markDirty();

	sec = mod.findSection(SECTION_TYPE_EXPORT);
	if (sec)
		sec.markDirty();

	sec = mod.findSection(SECTION_TYPE_GLOBAL);
	if (sec)
		sec.markDirty();
}



// replaced with mod.replaceGlobal()
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

function configureBootParameters(ctx, module, options) {

	let wabp_addr;
	let glob = module.getGlobalByName("__static_wabp");
	if (glob)
		wabp_addr = glob.init[0].value;

}

function generateKLDModuleInfo(ctx, module, options) {
	
}

function computeCallHierarchyInternal(module, fn, calle, map) {

	let callers;
	if (!calle) {
		calle = {};
		calle.func = fn;
		calle.callers = [];
		callers = calle.callers;
		map.set(fn, calle);
	}

	let funcs = module.functions;
	let ylen = funcs.length;
	for (let y = 0; y < ylen; y++) {
		let func = funcs[y];
		if (func instanceof ImportedFunction) {
			continue;
		}
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		for (let x = 0; x < xlen; x++) {
			let inst = opcodes[x];
			if (inst.opcode != 0x10)
				continue;

			if (inst.func == fn) {
				let cs;
				if (map.has(func)) {
					cs = map.get(func);
				} else {
					cs = computeCallHierarchyInternal(module, func, undefined, map);
				}

				callers.push(cs);
			}
		}
	}

	return calle;
}

function computeCallHierarchy(module, fn) {

	let map = new Map();
	let results = computeCallHierarchyInternal(module, fn, undefined, map);
	console.log(results);
	return results;
}

function analyzeForkEntryPoint(ctx, module, options) {
	let forkFn = null;
	let nmap = {};

	forkFn = module.getFunctionByName("__sys_fork");

	if (!forkFn) {
		console.warn("no fork");
		return;
	}

	let callers, callsite = computeCallHierarchy(module, forkFn);
	console.log(callsite);
	callers = callsite.callers;

	len = callers.length
	for (let i = 0; i < len; i++) {
		let callsite = callers[i];
		let func = callsite.func;
		let name = func[__nsym];

		console.log("%s %o", name, callsite);
		nmap[name] = func;
	}

	let ylen = callers.length;
	for (let y = 0; y < ylen; y++) {
		let func = callers[y].func;
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		for (let x = 0; x < xlen; x++) {
			let inst = opcodes[x];
			if (inst.opcode != 0x10)
				continue;

			if (inst.func == forkFn) {
				console.log("func %d inst %d", y, x);
			}
		}
	}

	let inForkGlobal = new ImportedGlobal();
	inForkGlobal.module = "sys";
	inForkGlobal.name = "in_fork";
	inForkGlobal.type = 0x7F;
	inForkGlobal.mutable = true;
	// or
	inForkGlobal = WasmGlobal.createGlobalInt32(0, true);
	module.appendExport("in_fork", inForkGlobal);

	forkFromGlobal = WasmGlobal.createGlobalInt32(0, true);
	module.appendExport("fork_from", forkFromGlobal);

	forkArgGlobal = WasmGlobal.createGlobalInt32(0, true); // temporary used to hold one argument.
	module.appendExport("fork_arg", forkArgGlobal);

	// modify __sys_fork() to return 0 when in_fork is not 0, also unset in_fork before return
	let opcodes = [];
	let inst = new BlockInst(0x02);
	inst.type = 0x40;
	opcodes.push(inst);
	opcodes.push({opcode: 0x23, global: inForkGlobal},	// global.get
				 {opcode: 0x45}, 					    // i32.eqz
				 {opcode: 0x0d, labelidx: 0}, 			// br_if
				 {opcode: 0x41, value: 0},				// i32.const
				 {opcode: 0x24, global: inForkGlobal}, 	// global.set
				 {opcode: 0x41, value: 0},				// i32.const
				 new ReturnInst(0x0F),					// return
				 {opcode: 0x0b});						// end
	forkFn.opcodes.unshift.apply(forkFn.opcodes, opcodes); // prepend opcodes.
	forkFn._opcodeDirty = true;

	console.log(forkFn);
	console.log(nmap);

	let func = nmap["run_script"];
	if (func) {
		func._opcodeDirty = true;
		opcodes = func.opcodes;

		// TODO: we also need a way to restore the arguments..
		// 		 as arguments can be of variable length it might be best to push this to the
		// 		 stack as well, using a fork structure, in the example of run_script we take 
		// 		 a (const char *script) as our argument, which is used part of the function which
		// 		 is executed on the resulting fork thread.
		
		// after 
		opcodes.splice(7, 0, {opcode: 0x41, value: 1}, 				// i32.const  fork-location
							 {opcode: 0x24, global: forkFromGlobal},// global.set
							 {opcode: 0x20, x: 0},					// local.get
							 {opcode: 0x24, global: forkArgGlobal},	// global.set
							 {opcode: 0x0b});						// end
		// before
		inst = new IfInst(0x04);
		inst.type = 0x40;
		opcodes.splice(5, 0, {opcode: 0x23, global: inForkGlobal}, 	// global.get
							 {opcode: 0x45}, 					    // i32.eqz
							 inst);									// if
/*
		opcodes.splice(5, 0, {opcode: 0x23, global: inForkGlobal}, 	// global.get
							 {opcode: 0x41, value: 0},				// i32.const
							 {opcode: 0x47}, 						// i32.ne
							 inst);									// if
 */

		module.appendExport("run_script", func);
	}
	/*
	let callsites = [];

	let funcs = module.functions;
	let ylen = funcs.length;
	for (let y = 0; y < ylen; y++) {
		let func = funcs[y];
		if (func instanceof ImportedFunction || func == forkFn) {
			continue;
		}
		let opcodes = func.opcodes;
		let xlen = opcodes.length;
		for (let x = 0; x < xlen; x++) {
			let inst = opcodes[x];
			if (inst.opcode != 0x10)
				continue;

			if (inst.func == forkFn) {
				let idx = callsites.indexOf(func);
				if (idx !== -1) {

				} else {
					callsites.push(func);
				}
			}
		}
	}

	let len = callsites.length
	for (let i = 0; i < len; i++) {
		let callsite = callsites[i];
		let fn = names.get(callsite);
		let hierarchy = computeCallHierarchy(module, callsite);
		
		let ylen = hierarchy.length;
		for (let y = 0; y < ylen; y++) {
			let func = hierarchy[y];
			let name = names.get(func);
			console.log("%s", name);
		}
		console.log("%s %o", fn, hierarchy);
	}

	console.log(callsites);*/

	// TODO: analyze if a call to exit() within the branch of the new thread is garantied,
	// 	     in such case the rewind call stack is not needed and a dirty-cheat could be done.

}

// 

// Virtual Memory was here..

// Generate statistics of instructions

function computeInstructionStatistics(mod) {

	let map = new Map();
	let stats = new Map();
	let len = opcode_info.length;
	for (let i = 0; i < len; i++) {
		let inst = opcode_info[i];
		let op = inst.opcode;
		let kvo = {op: op, usage: 0, inst: inst};
		let type = inst.type & 0x0F;
		if (type == 0x03) {
			kvo.unalignedCount = 0; // number of aligned usage.
		}
		stats.set(op, kvo);
		map.set(op, inst);
	}

	let functions = mod.functions;
	let ylen = functions.length;
	for (let y = 0; y < ylen; y++) {
		let fn = functions[y];
		if (fn instanceof ImportedFunction)
			continue;
		let instructions = fn.opcodes;
		let xlen = instructions.length;
		for (let x = 0; x < xlen; x++) {
			let inst = instructions[x];
			let kvo = stats.get(inst.opcode);
			let info = kvo.inst;
			kvo.usage++;
			let align = (info.type >> 8) & 0xFF;
			if (align !== 0) {
				if (inst.align !== (align - 1)) {
					kvo.unalignedCount++;
				}
			}
		}
	}


	return stats;
}


let __uiInit = false;

function createMemidxInfo() {

	let section = document.createElement("section");
	section.id = "wasm-memory";

	let table = document.createElement("table");
	let tbody = document.createElement("tbody");
	let tr = document.createElement("tr");
	let td = document.createElement("td");
	td.textContent = "Minimum";
	tr.appendChild(td);
	td = document.createElement("td");
	let input = document.createElement("input");
	input.type = "number";
	input.classList.add("memory-min");
	td.appendChild(input);
	tr.appendChild(td);
	td = document.createElement("td");
	td.classList.add("output");
	tr.appendChild(td);
	tbody.appendChild(tr);

	tr = document.createElement("tr");
	td = document.createElement("td");
	td.textContent = "Maximum";
	tr.appendChild(td);
	td = document.createElement("td");
	input = document.createElement("input");
	input.type = "number";
	input.classList.add("memory-max");
	td.appendChild(input);
	tr.appendChild(td);
	td = document.createElement("td");
	td.classList.add("output");
	tr.appendChild(td);
	tbody.appendChild(tr);

	tr = document.createElement("tr");
	td = document.createElement("td");
	td.textContent = "Shared";
	tr.appendChild(td);
	td = document.createElement("td");
	input = document.createElement("input");
	input.type = "checkbox";
	input.classList.add("memory-shared");
	td.appendChild(input);
	tr.appendChild(td);
	td = document.createElement("td");
	td.classList.add("output");
	tr.appendChild(td);
	tbody.appendChild(tr);

	table.appendChild(tbody);
	section.appendChild(table);

	return section;
}

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

	// support for multi-memory
	let memContainers = document.createElement("div");
	container.parentElement.insertBefore(memContainers, container);
	let memContainer = document.createElement("div");
	memContainer.classList.add("wasm-memory-view");
	let memIndexLabel = document.createElement("div");
	memIndexLabel.classList.add("wasm-memory-index")
	memIndexLabel.textContent = "0";
	memContainer.appendChild(memIndexLabel);
	let memoryInfoContainer = document.createElement("div");
	memoryInfoContainer.classList.add("memory-info");
	memoryInfoContainer.appendChild(container);
	let memInitalTitle = document.createElement("div");
	memInitalTitle.textContent = "Initial Memory";
	memInitalTitle.classList.add("heading");
	memoryInfoContainer.appendChild(memInitalTitle);
	container.classList.add("memory-params");
	memContainer.appendChild(memoryInfoContainer);
	memContainers.appendChild(memContainer);
	memContainers.parentElement.classList.add("no-padding")


		
	let runWorkflowBtn = document.querySelector("#run-workflow");
	runWorkflowBtn.addEventListener("click", function(evt) {
		if (typeof selectedAction.onrun == "function") {
			selectedAction.onrun(actionInfo, selectedAction);
		}
	});

	let runWorkflowUIBtn = document.querySelector("#run-workflow-2");
	runWorkflowUIBtn.addEventListener("click", function(evt) {
		if (!_workflowActive) {
			console.warn("no active workflow");
			return;
		}

		let ctxmap = null;
		let options = getWorkflowParameterValues();

		//storeRecentWorkflowInDB(_workflowActive.id, options);
		runWorkflowActions(flow.module, _workflowActive.actions, ctxmap, options.params).then(function(res) {
			populateWebAssemblyInfo(flow.module);
			console.log("workflow did complete");
		}, function (err) {
			console.error(err);
		});
	});
}

function showMemoryParamEditor(container, memory) {

	let maxInput = container.querySelector("#memory-max");
	let minInput = container.querySelector("#memory-min");
	minInput.value = memory.min;
	let minOutput = minInput.parentElement.parentElement.querySelector(".output");
	minOutput.textContent = humanFileSize(memory.min * 65536, true);
	let maxOutput = maxInput.parentElement.parentElement.querySelector(".output");
	if (memory.max !== null) {
		maxInput.value = memory.max;
		maxOutput.textContent = humanFileSize(memory.max * 65536, true);
	} else {
		let row = maxInput.parentElement.parentElement;
		row.style.opacity = "0.5";
		maxOutput.textContent = "unlimited";
	}

	minInput.addEventListener("change", function(evt) {
		memory.min = parseInt(minInput.value);
		let sec = (memory instanceof ImportedMemory) ? findModuleByType(targetModule, SECTION_TYPE_IMPORT) : findModuleByType(targetModule, SECTION_TYPE_MEMORY);
		sec._isDirty = true;
	});

	maxInput.addEventListener("change", function(evt) {
		let value = maxInput.value.trim();
		if (value.length == 0) {
			memory.max = null;
			let row = maxInput.parentElement.parentElement;
			row.style.opacity = "0.5";
			maxOutput.textContent = "unlimited";
		} else {
			let row = maxInput.parentElement.parentElement;
			if (row.style.opacity == "0.5") {
				row.style.opacity = null;
			}
			memory.max = parseInt(maxInput.value);
		}
		
		let sec = (memory instanceof ImportedMemory) ? findModuleByType(targetModule, SECTION_TYPE_IMPORT) : findModuleByType(targetModule, SECTION_TYPE_MEMORY);
		sec._isDirty = true;
	});

	let input = container.querySelector("#memory-shared");
	input.checked = memory.shared;
	input.addEventListener("change", function(evt) {
		memory.shared = input.checked;
		let sec = (memory instanceof ImportedMemory) ? findModuleByType(targetModule, SECTION_TYPE_IMPORT) : findModuleByType(targetModule, SECTION_TYPE_MEMORY);
		sec._isDirty = true;
	});

	//showInitialMemory();
	let heading = container.parentElement.querySelector(".heading");
	let dataContainer = heading.parentElement.querySelector(".initial-memory-info");
	if (!dataContainer) {
		dataContainer = document.createElement("div");
		dataContainer.classList.add("initial-memory-info")
		heading.parentElement.appendChild(dataContainer);
	}
	showInitialMemory(dataContainer, memory)
}

function showInitialMemory(container, mem) {

	let tbl, tbody;

	tbl = container.querySelector("table.initial-memory-table");
	if (!tbl) {
		tbl = document.createElement("table");
		tbl.classList.add("data-table");
		tbl.classList.add("initial-memory-table")
		let thead = document.createElement("thead");
		let tr = document.createElement("tr");
		let th = document.createElement("th");
		th.textContent = "seg. no.";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "name";
		tr.appendChild(th);
		th = document.createElement("th");
		th.style.setProperty("min-width", "10ch");
		th.textContent = "offset";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "size";
		tr.appendChild(th);
		th = document.createElement("th");
		th.textContent = "uninitialized data";
		tr.appendChild(th);
		thead.appendChild(tr);
		tbl.appendChild(thead);
		container.appendChild(tbl);

		tbody = document.createElement("tbody");
		tbl.appendChild(tbody);
	} else {
		tbody = tbl.querySelector("tbody");
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}
	}

	let nsym = WebAssemblyModule.Name;
	
	let dataSegments = targetModule.dataSegments;
	let len = dataSegments.length;
	for (let i = 0;i < len;i++) {
		let dataSeg = dataSegments[i];
		let allzeros = false;
		let name = dataSeg[nsym];
		
		let tr = document.createElement("tr");
		let td = document.createElement("td");
		td.textContent = i.toString();
		tr.appendChild(td);
		td = document.createElement("td");
		tr.appendChild(td);

		if (name) {

			let node = document.createElement("code");
			node.textContent = name;
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

		let dataOffset = undefined;

		if (dataSeg.inst.opcodes[0].opcode == 0x41 && dataSeg.inst.opcodes[1].opcode == 0x0B) {
			dataOffset = dataSeg.inst.opcodes[0].value;
		}

		td = document.createElement("td");
		td.textContent = dataOffset === undefined ? "N/A" : dataOffset;
		tr.appendChild(td);

		td = document.createElement("td");
		let sztxt = humanFileSize(dataSeg.size, true);
		if (!sztxt.endsWith("bytes")) {
			sztxt = dataSeg.size + "\x20bytes\x20(" + sztxt + ")";
		}
		td.textContent = sztxt;
		tr.appendChild(td);

		td = document.createElement("td");
		td.textContent = allzeros ? "YES" : "NO";
		tr.appendChild(td);
		tbody.appendChild(tr);

		//let tn = document.createTextNode("\x20" + humanFileSize(section.size, true));
		//li.appendChild(tn);
	}
}

function emcc_type_name(type) {
    switch(type) {
        case 0x7F: 
            return 'i';
        case 0x7E:
            return 'j';
        case 0x7D:
            return 'f';
        case 0x7C:
            return 'd';
        case 0x00:
            return 'v';
        // wasm 2.0
        case 0x7b:
            return 'v128';
        case 0x70:
            return 'funcref';
        case 0x67:
            return 'externref';
        default:
            return undefined;
    }
}

function emccStyleTypeString(functype) {
    let arg, ret;
    let argc = functype.argc;
    if (argc == 0) {
        arg = "v";
    } else if (argc == 1){
    	arg = emcc_type_name(functype.argv[0]);
    } else {
        let argv = functype.argv;
        arg = "";
        for (let x = 0; x < argc; x++) {
            arg += emcc_type_name(argv[x]);
        }
    }

    let retc = functype.retc;
    if (retc == 0) {
        ret = "v";
    } else if (retc == 1){
    	ret = emcc_type_name(functype.retv[0]);
    } else {
        let retv = functype.retv;
        ret = "";
        for (let x = 0; x < retc; x++) {
            ret += emcc_type_name(retv[x]);
        }
    }

    return ret + '_' + arg;
}

// UI

const CAVET_ICON_SVG = `<svg aria-hidden="true" focusable="false" role="img" class="octicon octicon-triangle-down" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; user-select: none; vertical-align: text-bottom; overflow: visible;"><path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"></path></svg>`;
const SEARCH_ICON_SVG = `<svg aria-hidden="true" focusable="false" role="img" class="octicon octicon-search" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; user-select: none; vertical-align: text-bottom; overflow: visible;"><path fill-rule="evenodd" d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"></path></svg>`;
const SORT_ASC_ICON_SVG = `<svg aria-hidden="true" focusable="false" role="img" class="TableSortIcon TableSortIcon--ascending" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; user-select: none; vertical-align: text-bottom; overflow: visible;"><path d="m12.927 2.573 3 3A.25.25 0 0 1 15.75 6H13.5v6.75a.75.75 0 0 1-1.5 0V6H9.75a.25.25 0 0 1-.177-.427l3-3a.25.25 0 0 1 .354 0ZM0 12.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Zm0-4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0-4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Z"></path></svg>`;
const SORT_DES_ICON = `<svg aria-hidden="true" focusable="false" role="img" class="TableSortIcon TableSortIcon--descending" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display: inline-block; user-select: none; vertical-align: text-bottom; overflow: visible;"><path d="M0 4.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 4.25Zm0 4a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 8.25Zm0 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75ZM13.5 10h2.25a.25.25 0 0 1 .177.427l-3 3a.25.25 0 0 1-.354 0l-3-3A.25.25 0 0 1 9.75 10H12V3.75a.75.75 0 0 1 1.5 0V10Z"></path></svg>`;
const FILTER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M.75 3h14.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>`;

class EventEmitter {
    
    constructor() {
    	this._listeners = {};
    }

    addListener(type, callback){
        this.on(type, callback);
    }

    on(type, callback) {
        if((typeof type !== "string" && typeof type !== "symbol") || typeof callback != "function")
            throw new TypeError("on() unexpected arguments provided")

        if (!this._listeners.hasOwnProperty(type)) {
        	let arr = [];
        	this._listeners[type] = arr;
        	arr.push(callback);
        } else {
        	let arr = this._listeners[type];
        	let idx = arr.indexOf(callback);
        	if (arr.indexOf(callback) == -1)
        		arr.push(callback);
        }
    }

    once(type, callback) {
        if(typeof callback  !== 'function')
            throw new TypeError('only takes instances of Function');
        
        var self = this;
        function g() {
            self.removeListener(type, g);
            callback.apply(this, arguments);
        };

        g.callback = callback;
        self.on(type, g);
        
        return this;
    }

    removeListener(type, callback){
        if((typeof type !== "string" && typeof type !== "symbol") || typeof callback != "function")
            throw new Error(".removeListener() unexpected argument provided");

        if(!this._listeners.hasOwnProperty(type))
            delete this._listeners[event];

        // Removes the listener if it exists under reference of the event type.
        const listeners = this._listeners[type];
        const index = listeners.indexOf(callback);
        if(index != -1)
            listeners.splice(index,1);

        // Removes the listeners array for the type if empty.
        if(listeners.length === 0){
            delete listeners[type];
        }
    }

    removeAllListeners(type) {
        if(this._listeners.hasOwnProperty(event)){
            delete this._listeners[event];
        }
    }

    listeners(type){
        return this._listeners.hasOwnProperty(type) ? this._listeners[type].slice() : null;
    }

    emit(type) {
        if(typeof type !== "string" && typeof type !== "symbol")
            throw new TypeError("emit() unexpected arguments provided");

        if(!this._listeners.hasOwnProperty(type))
            return;
        
        // copying the arguments provided to this method.
        const args = Array.prototype.slice.call(arguments);
        const listeners = this._listeners[type];
        const len = listeners.length;
        
        // emits the event to all registerd listeners.
        for(let i = 0; i < len; i++){
            let callback = listeners[i];
            if(typeof callback !== "function")
                continue;
            
            // calls the listener.
            callback.apply(this, args);
        }
    }
    
    destroy() {
        this._listeners.length = 0;
    }
};

class FilteredSearchView extends EventEmitter {

	constructor() {
		super();
		let element = document.createElement("div");
		element.classList.add("filtered-search")
		let summary = document.createElement("summary");
		let titleSpan = document.createElement("span");
		titleSpan.classList.add("label");
		titleSpan.textContent = "Contains";
		summary.appendChild(titleSpan);
		let btnIcon = document.createElement("span");
		btnIcon.innerHTML = CAVET_ICON_SVG;
		summary.appendChild(btnIcon);
		element.appendChild(summary);

		let _modalElement;
		let _elements = [];
		let items = [{
			title: "Starts with",
			value: "starts-with"
		}, {
			title: "Ends with",
			value: "ends-with"
		}, {
			title: "Contains",
			value: "contains"
		}, {
			title: "Regexp",
			value: "regexp"
		}];

		function onActionItemClick(evt) {
			let target = evt.currentTarget;
			let index = _elements.indexOf(target);
			if (index == -1)
				return;

			let item = items[index];
			titleSpan.textContent = item.title;

			_modalElement.parentElement.removeChild(_modalElement);
			let len = _elements.length;
			for (let i = 0; i < items.length; i++) {
				let element = _elements[i];
				element.removeEventListener("click", onActionItemClick);
			}
			_modalElement = null;
			_elements = [];
		}

		summary.addEventListener("click", (evt) => {
			let modal = document.createElement("div");
			modal.classList.add("action-menu");
			let ul = document.createElement("ul");
			ul.classList.add("action-list");
			modal.appendChild(ul);
			for (let i = 0; i < items.length; i++) {
				let item = items[i];
				let li = document.createElement("li");
				li.classList.add("action-item");
				li.textContent = item.title;
				li.addEventListener("click", onActionItemClick);
				_elements.push(li);
				ul.appendChild(li);
			}

			let rect = summary.getBoundingClientRect();
			modal.style.top = (rect.bottom + window.scrollY + 5) + "px";
			modal.style.left = rect.left + "px";
			console.log(rect);
			_modalElement = modal;
			document.body.appendChild(modal);
		});

		let inputBox = document.createElement("span");
		inputBox.classList.add("text-input-wrapper")
		let inputIcon = document.createElement("span");
		inputIcon.classList.add("icon");
		inputIcon.innerHTML = SEARCH_ICON_SVG;
		inputBox.appendChild(inputIcon);
		let inputControl = document.createElement("input");
		inputControl.type = "text";
		inputControl.value = "";
		inputBox.appendChild(inputControl);
		element.appendChild(inputBox);

		this._element = element;
	}


	get element() {
		return this._element;
	}
}

class PaginatorView extends EventEmitter {

	constructor() {
		super();
		this._pageIndex = 0;
		this._pageCount = 1;

		let first, prev, curr, next, lastBtn, paginator = document.createElement("div");
		paginator.classList.add("pagination");
		first = document.createElement("span");
		first.textContent = "First";
		first.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex = 0;
			
			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = "1";
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(first);
		prev = document.createElement("span");
		prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
		prev.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex--;
			if (this._pageIndex < 0)
				this._pageIndex = 0; 

			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = (this._pageIndex + 1)
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(prev);
		curr = document.createElement("span");
		curr.classList.add("page-active");
		curr.textContent = "1";
		paginator.appendChild(curr);
		next = document.createElement("span");
		next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
		next.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex++;
			if (this._pageIndex >= this._pageCount) {
				this._pageIndex = this._pageCount - 1;
			}
			if (this._pageIndex == oldValue)
				return;

			curr.textContent = (this._pageIndex + 1);
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(next);
		lastBtn = document.createElement("span");
		lastBtn.textContent = "Last";
		lastBtn.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex = this._pageCount;

			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = (this._pageIndex + 1);
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(lastBtn);

		this._element = paginator;
	}

	get element() {
		return this._element;
	}

	get pageIndex() {
		return this._pageIndex;
	}

	set pageIndex(value) {
		if (!Number.isInteger(value))
			throw new TypeError("invalid type");
		if (value < 0 || value >= this._pageCount)
			throw new RangeError("invalid range");
		if (this._pageIndex === value)
			return;
		this._pageIndex = value;
	}

	get pageCount() {
		return this._pageCount;
	}

	set pageCount(value) {
		if (!Number.isInteger(value))
			throw new TypeError("invalid type");
		if (value <= 0)
			throw new RangeError("invalid range");
		if (this._pageCount === value)
			return;
		if (this._pageIndex >= this._pageCount)
			this._pageIndex = this._pageCount - 1;
		this._pageCount = value;
	}

}

class WasmGlobalsInspectorView {

	constructor (header, body) {
		let _self = this;
		this._heading = header;
		this._body = body;

		let test = new FilteredSearchView();
		body.appendChild(test.element);

		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

		let table = document.createElement("table");
		table.classList.add("data-table");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>index</th><th>name</th><th>type</th><th>initial value</th><th>use count</th><th>import/export</th></tr>";
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);
		this._footer = footer;
		this._tbody = tbody;

		this._defaultCollection;
		this._collection;
		this._pageRowCount = 25;

		let paginator = new PaginatorView();
		body.appendChild(paginator.element);
		paginator.on("change", (type, pageIndex) => {
			this.render();
		});

		findOptions.addEventListener("change", (evt) => {
			let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			this._collection = results;
			paginator.pageIndex = 0;
			paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
			this.render();
			this._footer.textContent = "found " + results.length + " matches";
		});

		findCS.addEventListener("change", (evt) => {
			let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			this._collection = results;
			paginator.pageIndex = 0;
			paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
			this.render();
			this._footer.textContent = "found " + results.length + " matches";
		});

		findInput.addEventListener("keyup", (evt) => {
			if (evt.key == "Enter") {
				let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				this._collection = results;
				paginator.pageIndex = 0;
				paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
				this.render();
				this._footer.textContent = "found " + results.length + " matches";
			}
		});

		this._paginator = paginator;
	}

	search(string, opts) {

		let items = this._defaultCollection;
		let len = items.length;
		let cis = opts.caseSensitive !== true;
		let matches = [];
		let searchType = opts.searchType;
		switch (searchType) {
			case "starts-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().startsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.startsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "ends-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().endsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.endsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "contains":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().includes(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.includes(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "regexp": {
				let regexp = new Regexp(string);
				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.name.search(regexp)) {
						matches.push(item);
					}
				}
				break;
			}
			default:
				break;
		}			

		return matches;
	}

	render() {
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}
		let paginator = this._paginator;
		let start = paginator.pageIndex * this._pageRowCount;
		let items = this._collection;

		let globals = targetModule.globals;
		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let item = items[i];
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
	}

	set model(value) {
		let items = [];
		this._defaultCollection = items;
		this._collection = items;
		for (let p in value) {
			items.push({name: p, global: value[p]});
		}
		let paginator = this._paginator;
		paginator.pageIndex = 0;
		paginator.pageCount = items.length == 0 ? 1 : Math.ceil(items.length / this._pageRowCount);
		this.render();
	}

	get model() {
		return this._defaultCollection;
	}
}

class WasmFunctionsInspectorView {

	constructor (header, body) {
		let _self = this;
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

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

		this._heading = header;
		this._body = body;
		this._tbody = tbody;
		this._footer = footer;
		this._defaultCollection = null;
		this._collection = null;
		this._pageIndex = 0;
		this._pageRowCount = 25;

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				_self._pageIndex = 0;
				curr.textContent = "1"
				_self.render();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (_self._pageIndex == 0)
					return;
				_self._pageIndex--;
				curr.textContent = (_self._pageIndex + 1)
				_self.render();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				if (_self._pageIndex == last)
					return;
				_self._pageIndex++;
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				_self._pageIndex = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findOptions.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			_self._collection = results;
			_self._pageIndex = 0;
			_self.render();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let value = findInput.value;
				let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				_self._collection = results;
				_self._pageIndex = 0;
				_self.render();
			}
		});

		//let tbltest = document.createElement("table");
		//tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		//body.appendChild(tbltest);
	}

	search(string, opts) {
		let mod = this._module;
		let items = this._defaultCollection;
		let len = items.length;
		let cis = opts.caseSensitive !== true;
		let matches = [];
		let searchType = opts.searchType;
		switch (searchType) {
			case "starts-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().startsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.startsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "ends-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().endsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.endsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "contains":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().includes(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.includes(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "regexp": {
				let regexp = new Regexp(string);
				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.name.search(regexp)) {
						matches.push(item);
					}
				}
				break;
			}
			default:
				break;
		}

		return matches;
	}

	render() {
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}

		let start = this._pageIndex * this._pageRowCount;
		let items = this._collection;
		let mod = this._module;

		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let item = items[i];
			let funcidx = item.funcidx;
			let func = item.func; //mod.functions[funcidx];

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
			let sign = func.type.toString();
			sign = sign.replace("->", "→");
			td.textContent = sign;
			tr.appendChild(td);
			td = document.createElement("td");
			td.classList.add("wasm-typeidx");
			let typeidx = mod.types.indexOf(func.type);
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

		this._footer.textContent = "found " + this._collection.length + " matches";	
	}

	set module(mod) {
		let items = [];
		this._defaultCollection = items;
		this._collection = items;
		this._module = mod;
		let functions = mod.functions;
		let len = functions.length;
		for (let i = 0; i < len; i++) {
			let func = functions[i];
			let name = typeof func[__nsym] == "string" ? func[__nsym] : null;
			let obj = {funcidx: i, func: func, name: name, exportedAS: null, importedAs: null};
			items.push(obj);
			if (func instanceof ImportedFunction) {
				obj.imported = true;
				obj.importedAs = {module: func.module, name: func.name};
			}
		}

		let exported = mod.exports;
		len = exported.length;
		for (let i = 0; i < len; i++) {
			let exp = exported[i];
			if (!(exp instanceof ImportedFunction)) {
				continue;
			}
			let func = exp.function;
			let idx = functions.indexOf(func);
			if (idx == -1)
				continue;
			let obj = items[idx];
			obj.exportedAS = exp.name;
		}

		this.render();
	}

	get module() {
		return this._module;
	}
}

class WasmTablesInspectorView {

	constructor (header, body) {
		
		let _self = this;
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option><option value=\"col-index\">Column index</option><option value=\"col-funcidx\">Column funcidx</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

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

		this._heading = header;
		this._body = body;
		this._footer = footer;
		this._tbody = tbody;
		this._defaultCollection = null;
		this._collection = null;
		this._pageIndex = 0;
		this._pageRowCount = 25;
		this._module = null;

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				_self._pageIndex = 0;
				curr.textContent = "1"
				_self.render();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (_self._pageIndex == 0)
					return;
				_self._pageIndex--;
				curr.textContent = (_self._pageIndex + 1)
				_self.render();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				if (_self._pageIndex == last)
					return;
				_self._pageIndex++;
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				_self._pageIndex = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findOptions.addEventListener("change", function(evt) {
			let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			_self._collection = results;
			_self._pageIndex = 0;
			_self.render();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				_self._collection = results;
				_self._pageIndex = 0;
				_self.render();
			}
		});

		//let tbltest = document.createElement("table");
		//tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		//body.appendChild(tbltest);
	}

	search(string, opts) {
		let items = this._defaultCollection;
		let len = items.length;
		let cis = opts.caseSensitive !== true;
		let matches = [];
		let searchType = opts.searchType;
		switch (searchType) {
			case "starts-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().startsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.startsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "ends-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().endsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.endsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "contains":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().includes(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.includes(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "regexp": {
				let regexp = new Regexp(string);
				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.name.search(regexp)) {
						matches.push(item);
					}
				}
				break;
			}
			case "col-index": {
				let val = parseInt(string);
				if (isNaN(val))
					return matches;

				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.index == val) {
						matches.push(item);
					}
				}
				break;
			}
			case "col-funcidx": {
				let val = parseInt(string);
				if (isNaN(val))
					return matches;

				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.funcidx == val) {
						matches.push(item);
					}
				}
				break;
			}
			default:
				break;
		}

		return matches;
	}

	render() {
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}

		let start = this._pageIndex * this._pageRowCount;
		let items = this._collection;
		let mod = this._module;
		let functions = mod.functions;
		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let item = items[i];
			let func = item.func; // mod.functions[funcidx];
			let funcidx = item.funcidx;

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
			let sign = func.type.toString();
			sign = sign.replace("->", "→");
			td.textContent = sign;
			tr.appendChild(td);
			td = document.createElement("td");
			td.classList.add("wasm-typeidx");
			let typeidx = mod.types.indexOf(func.type);
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

		this._footer.textContent = "found " + this._collection.length + " matches";	
	}

	set module(mod) {
		let items = [];
		this._defaultCollection = items;
		this._collection = items;
		this._module = mod;
		let tables = mod.tables;
		let functions = mod.functions;
		let ylen = tables.length;
		for (let y = 0; y < ylen; y++) {
			let table = tables[y];
			let vector = table.contents;
			let xlen = vector.length;
			for (let x = 0; x < xlen; x++) {
				let func = vector[x];
				if (func === undefined)
					continue;
				let name = typeof func[__nsym] == "string" ? func[__nsym] : null;
				let idx = functions.indexOf(func);
				let obj = {tblidx: y, index: x, funcidx: idx, func: func, name: name, exportedAS: null, importedAs: null};
				items.push(obj);
				if (func instanceof ImportedFunction) {
					obj.imported = true;
					obj.importedAs = {module: func.module, name: func.name};
				}
			}
		}

		let exported = mod.exports;
		let len = exported.length;
		for (let i = 0; i < len; i++) {
			let exp = exported[i];
			if (!(exp instanceof ImportedFunction)) {
				continue;
			}
			let func = exp.function;
			let idx = functions.indexOf(func);
			if (idx == -1)
				continue;
			let obj = items[idx];
			obj.exportedAS = exp.name;
		}

		this.render();
	}

	get module() {
		return this._module;
	}
}

const inspectorUI = {
	'globals': function(header, body) {
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

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

		findOptions.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let value = findInput.value;
				let results = doFreeTextSearch(value);
				collection = results;
				pageIndex = 0;
				listResults();
			}
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

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

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

			let names = targetModule.names.functions;
			let cis = findCS.value !== "off";
			let match = [];
			let searchType = findOptions.selectedOptions.item(0).value;
			switch (searchType) {
				case "starts-with":
					if (cis) {
						let lc = value.toLowerCase();
						for (const [idx, name] of names) {
							if (name.toLowerCase().startsWith(lc)) {
								match.push({funcidx: idx, name: name});
							}
						}
					} else {
						for (const [idx, name] of names) {
							if (name.startsWith(value)) {
								match.push({funcidx: idx, name: name});
							}
						}
					}
					break;
				case "ends-with":
					if (cis) {
						let lc = value.toLowerCase();
						for (const [idx, name] of names) {
							if (name.toLowerCase().endsWith(lc)) {
								match.push({funcidx: idx, name: name});
							}
						}
					} else {
						for (const [idx, name] of names) {
							if (name.endsWith(value)) {
								match.push({funcidx: idx, name: name});
							}
						}
					}
					break;
				case "contains":
					if (cis) {
						let lc = value.toLowerCase();
						for (const [idx, name] of names) {
							if (name.toLowerCase().includes(lc)) {
								match.push({funcidx: idx, name: name});
							}
						}
					} else {
						for (const [idx, name] of names) {
							if (name.includes(value)) {
								match.push({funcidx: idx, name: name});
							}
						}
					}
					break;
				case "regexp": {
					let regexp = new Regexp(value);
					for (const [idx, name] of names) {
						if (name.search(regexp)) {
							match.push({funcidx: idx, name: name});
						}
					}
					break;
				}
				default:
					break;
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
				td.textContent = func.type.toString();
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

		findOptions.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let value = findInput.value;
				let results = doFreeTextSearch(value);
				collection = results;
				pageIndex = 0;
				listResults();
			}
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

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

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

			let len = defaultCollection.length;
			let cis = findCS.value !== "off";
			let matches = [];
			let searchType = findOptions.selectedOptions.item(0).value;
			switch (searchType) {
				case "starts-with":
					if (cis) {
						let lc = value.toLowerCase();
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.toLowerCase().startsWith(lc)) {
								matches.push(item);
							}
						}
					} else {
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.startsWith(value)) {
								matches.push(item);
							}
						}
					}
					break;
				case "ends-with":
					if (cis) {
						let lc = value.toLowerCase();
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.toLowerCase().endsWith(lc)) {
								matches.push(item);
							}
						}
					} else {
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.endsWith(value)) {
								matches.push(item);
							}
						}
					}
					break;
				case "contains":
					if (cis) {
						let lc = value.toLowerCase();
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.toLowerCase().includes(lc)) {
								matches.push(item);
							}
						}
					} else {
						for (let i = 0; i < len; i++) {
							let item = defaultCollection[i];
							let name = item.name;
							if (name.includes(value)) {
								matches.push(item);
							}
						}
					}
					break;
				case "regexp": {
					let regexp = new Regexp(value);
					for (let i = 0; i < len; i++) {
						let item = defaultCollection[i];
						let name = item.name;
						if (name.search(regexp)) {
							matches.push(item);
						}
					}
					break;
				}
				default:
					break;
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
				td.textContent = func.type.toString();
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

		findOptions.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = doFreeTextSearch(value);
			collection = results;
			pageIndex = 0;
			listResults();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let value = findInput.value;
				let results = doFreeTextSearch(value);
				collection = results;
				pageIndex = 0;
				listResults();
			}
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

const _inspectorViews = {};

function namedGlobalsMap(mod) {

	if (!mod.globals)
		return;

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

	len = globals.length;
	for (let i = 0; i < len; i++) {
		let glob = globals[i];
		if (typeof glob[__nsym] == "string") {
			let name = glob[__nsym];
			map[name] = glob;
		} else if (arr2.indexOf(glob) === -1) {
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
	let headers = con2.querySelectorAll("#wasm-modules-inspect section.inspect-body > h3");
	len = headers.length;
	for (let i = 0; i < len; i++) {
		let h3 = headers.item(i);
		if (h3.textContent.trim() == "Memory")
			continue;
		let body = h3.parentElement;
		let txt = h3.textContent.trim().toLowerCase();
		if (txt == "globals") {
			let view;
			//inspectorUI.globals(h3, body);
			if (!_inspectorViews[txt]) {
				view = new WasmGlobalsInspectorView(h3, body);
				_inspectorViews[txt] = view;
			} else {
				view = _inspectorViews[txt];
			}
			if (!_namedGlobals)
				_namedGlobals = namedGlobalsMap(mod);
			view.model = _namedGlobals;

		} else if (txt == "functions") {
			//inspectorUI.functions(h3, body);
			let view;
			if (!_inspectorViews[txt]) {
				view = new WasmFunctionsInspectorView(h3, body);
				_inspectorViews[txt] = view;
			} else {
				view = _inspectorViews[txt];
			}
			view.module = mod;
		} else if (txt == "tables") {
			//inspectorUI.tables(h3, body);
			let view;
			if (!_inspectorViews[txt]) {
				view = new WasmTablesInspectorView(h3, body);
				_inspectorViews[txt] = view;
			} else {
				view = _inspectorViews[txt];
			}
			view.module = mod;
		} else if (txt == "data") {
			inspectorUI.data_segments(h3, body);
		} else if (txt == "custom sections") {
			inspectorUI.custom_sections(h3, body);
		}
	}

	let inspectContainer = document.querySelector("#wasm-modules-inspect");

	if (mod.producers) {
		let container = document.createElement("section");
		container.classList.add("inspect-body");
		container.style.setProperty("padding-bottom", "20px");
		inspectContainer.appendChild(container);

		let h3 = document.createElement("h3");
		h3.textContent = "Producers";
		container.appendChild(h3);

		let table = document.createElement("table");
		table.classList.add("data-table");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>Name</th><th>Value</th><th>Verion</th></tr>";
		table.appendChild(thead);
		container.appendChild(table);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);

		let producers = mod.producers;
		for (let p in producers) {
			let values = producers[p];
			let len = values.length;
			if (len == 0)
				continue;

			let tr = document.createElement("tr");
			tbody.appendChild(tr);
			let th = document.createElement("th");
			if (len !== 1) {
				th.setAttribute("rowspan", len);
			}
			th.textContent = p;
			tr.appendChild(th);
			for (let i = 0; i < len; i++) {
				let value = values[i];
				let td = document.createElement("td");
				tr.appendChild(td);
				if (typeof value == "string") {
					td.textContent = value;
					td = document.createElement("td");
					tr.appendChild(td);
				} else {
					td.textContent = value.value;
					td = document.createElement("td");
					td.textContent = value.version;
					tr.appendChild(td);
				}
			}
		}

	}

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

class WorkflowUIFilePicker {

	constructor() {

		let _self = this;
		let element = document.createElement("li");
		element.classList.add("workflow-action", "workflow-param-file");
		let header = document.createElement("div");
		header.classList.add("action-header", "file-label");
		header.textContent = "Input";
		element.appendChild(header);
		let body = document.createElement("div");
		body.classList.add("action-body");
		body.style.width = "100%";
		let nameText = document.createElement("span");
		nameText.classList.add("filename");
		body.appendChild(nameText);
		let sizeText = document.createElement("span");
		sizeText.classList.add("filesize");
		body.appendChild(sizeText);
		element.appendChild(body);
		let grant = document.createElement("div");
		grant.classList.add("action-header");
		let grantInner = document.createElement("span");
		grantInner.classList.add("grant-access");
		grantInner.textContent = "grant access";
		grant.appendChild(grantInner);
		grant.style.display = "none";
		element.appendChild(grant);
		let options = document.createElement("div");
		options.classList.add("action-header", "file-picker-button");
		options.textContent = "chose";
		element.appendChild(options);

		grant.addEventListener("click", (evt) => {

		 	let file = this._file;
		 	file.requestPermission({mode: 'readwrite'}).then((status) => {
		 		console.log(status);
		 		if (status == "granted") {
		 			grant.style.display = "none";
		 		}
		 	})
		});

		options.addEventListener("click", (evt) => {
			console.log("should pick file for param-file");

			let types = this._types;
			window.showOpenFilePicker({multiple: false, types: types}).then((files) => {

				let file = files[0];

				if (files.length > 1) {
					console.warn("should apply logics for sorting out multiple files");
				}

				_fileViews.set(file, _self);

				this._file = file;
				nameText.textContent = file.name;

				file.queryPermission({mode: 'readwrite'}).then((status) =>{
					console.log(status);
					if (status == "prompt") {
						grant.style.setProperty("display", null);
					}
				})

			}, console.error);
		});

		element.addEventListener("dragenter", (evt) => {
			event.preventDefault();
		});

		element.addEventListener("dragover", (evt) => {
			event.preventDefault();
		});

		element.addEventListener("drop", (evt) => {

			let files = filesFromDataTransfer(evt.dataTransfer);
			if (files.length == 0) {
				event.preventDefault();
				return;
			}
 
			findInputFiles(files);

			nameText.textContent = files[0].name;
			sizeText.textContent = humanFileSize(files[0].size, true);
			appendFiles(files);
			_fileViews.set(file, _self);
			this._file = files[0];

			event.preventDefault();
		});

		this._element = element;
		this._heading = header;
	}

	set paramName(value) {
		this._paramName = value;
		this._heading.textContent = value;
	}

	get paramName() {
		return this._paramName;
	}

	set mode(value) {
		this._mode = value;
	}

	get mode() {
		return this._mode;
	}

	set role(value) {
		this._role = value;
	}

	get role() {
		return this._role;
	}

	set types(value) {
		this._role = value;
	}

	get types() {
		return this._role;
	}

	set file(value) {
		this._file = value;
	}

	get file() {
		return this._file;
	}

	get element() {
		return this._element;
	}

}

// Until we get the workflow picker working this is how its determined which workflow to pick per filename.
let _userBinaries = ["init.wasm", "sh.wasm", "zsh.wasm", "awk.wasm", "ee.wasm", "cat.wasm", 
					 "chflags.wasm", "chmod.wasm", "cp.wasm", "kenv.wasm", "ln.wasm", "mkdir.wasm", 
					 "mv.wasm", "ps.wasm", "pwd.wasm", "realpath.wasm", "rm.wasm", "rmdir.wasm", "sleep.wasm",
					 "touch.wasm", "file.wasm", "ls.wasm", "syslogd.wasm"];
function isUserBinary(name) {
	return _userBinaries.indexOf(name) !== -1;
}

function autoSelectWorkflow(files) {

}


function tryMigrateWorkflowParams(oldWorkflow, newWorkflow) {

}

function setupWorkflowUIForTarget(newWorkflow, wasmBinary, wasmSymbolDump) {

	let container = document.querySelector("ul.workflow-ui");
	let workflow;

	if (!newWorkflow) {

		if (targetFilename == "kern.wasm") {
			workflow = _freebsdKernMainWorkflow;
		} else if (targetFilename == "netbsd-kern.wasm") {
			workflow = _netbsdKernMainWorkflow;
		} else if (isUserBinary(targetFilename)) {
			workflow = _netbsdUserBinaryForkWorkflow;
		}

	} else {

		if (_workflowActive) {
			tryMigrateWorkflowParams(_workflowActive, newWorkflow);
		}

		_workflowActive = newWorkflow;
	}

	while (container.lastChild) {
		container.removeChild(container.lastChild);
	}

	if (!workflow) {
		_workflowActive = null;
		return;
	}

	_workflowActive = workflow;
	_workflowParameters = [];
	_workflowParamValues = {};
	_workflowParamViews = {};

	let srcfileView = new WorkflowUIFilePicker();
	srcfileView.role = "Source";
	let label = srcfileView.element.querySelector(".action-body .filename");
	label.textContent = wasmBinary.name;
	label = srcfileView.element.querySelector(".action-body .filesize");
	label.textContent = humanFileSize(wasmBinary.size, true);
	container.appendChild(srcfileView.element);
	_fileViews.set(wasmBinary, srcfileView);

	let actions = workflow.actions;
	let ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_workflowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _workflowActions", actionName);
			continue;
		}
		let actionTemplate = _workflowActions[actionName];
		if (actionTemplate.params) {
			let params = actionTemplate.params;
			let xlen = params.length;
			for (let x = 0; x < xlen; x++) {
				let param = params[x];
				if (param.type == "file") {
					let view = new WorkflowUIFilePicker();
					view.paramName = param.name;
					view.types = param.types;
					container.appendChild(view.element);
					_workflowParamViews[param.name] = view;
					_workflowParameters.push(param);
				}
			}
		}
	}

	actions = workflow.actions;
	ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_workflowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _workflowActions", actionName);
			continue;
		}
		let actionTemplate = _workflowActions[actionName];
		let li = document.createElement("li");
		li.textContent = actionName;
		container.appendChild(li);
	}

	actions = workflow.actions;
	ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_workflowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _workflowActions", actionName);
			continue;
		}
		let actionTemplate = _workflowActions[actionName];
		let li = document.createElement("li");
		li.textContent = actionName;
		container.appendChild(li);
	}

	let found = false;
	let options = _workflowSelectElement.options;
	ylen = options.length;
	for (let y = 0; y < ylen; y++) {
		let opt = options.item(y);
		if (opt.value == _workflowActive.id) {
			_workflowSelectElement.selectedIndex = y;
			found = true;
			break;
		}
	}	 
}

function updateFileSizeInUI(file, filesize) {
	let view = _fileViews.get(file);
	if (!view)
		return;
	let label = view.element.querySelector(".action-body .filesize");
	label.textContent = humanFileSize(filesize, true);
}

function setupTargetPanel(container) {


	let workflowUl = document.createElement("ul");
	let workflowUIPanel = container.parentElement;
	workflowUl.classList.add("workflow-ui");
	container.appendChild(workflowUl);

	setupWorkflowUIForTarget();

	let workflowUIToolbar = container.parentElement.querySelector("#workflow-ui-toolbar");
	let selectElement = document.createElement("select");
	let len = _workflows.length;
	for (let i = 0; i < len; i++) {
		let workflow = _workflows[i];
		let opt = document.createElement("option");
		opt.textContent = workflow.name;
		opt.value = workflow.id;
		selectElement.appendChild(opt);
	}

	selectElement.addEventListener("change", function(evt) {
		let idx = selectElement.selectedIndex;
		let opt = selectElement.options.item(idx);
		let id = opt.value;
		let workflow;
		let len = _workflows.length;
		for (let i = 0; i < len; i++) {
			let item = _workflows[i];
			if (item.id == id) {
				workflow = item;
				break;
			}
		}
		setupWorkflowUIForTarget(workflow);
	});

	workflowUIToolbar.appendChild(selectElement);
	_workflowSelectElement = selectElement;

	// input binary

	let loadFileBtn = document.createElement("button");
	loadFileBtn.textContent = "chose";
	workflowUIToolbar.appendChild(loadFileBtn);

	loadFileBtn.addEventListener("click", function(evt) {
		console.log("should pick file for input-file");
	});

	workflowUIPanel.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	workflowUIPanel.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});

	workflowUIPanel.addEventListener("drop", function(evt) {

		let files = filesFromDataTransfer(evt.dataTransfer);
		if (files.length == 0) {
			event.preventDefault();
			return;
		}

		findInputFiles(files);
		appendFiles(files);

		event.preventDefault();
	});

	// output data
	/*
	let outputPicker = document.createElement("li");
	outputPicker.classList.add("workflow-action", "workflow-output-file");
	header = document.createElement("div");
	header.classList.add("action-header", "file-label");
	header.textContent = "Output";
	outputPicker.appendChild(header);
	body = document.createElement("div");
	body.classList.add("action-body");
	body.style.width = "100%";
	body.textContent = "body";
	outputPicker.appendChild(body);
	options = document.createElement("div");
	options.classList.add("action-header", "file-picker-button");
	options.textContent = "chose";
	outputPicker.appendChild(options);
	workflowUl.appendChild(outputPicker);

	options.addEventListener("click", function(evt) {
		console.log("should pick file for output-data");
	});

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
	outputDataPicker.classList.add("workflow-action", "workflow-output-file");
	header = document.createElement("div");
	header.classList.add("action-header", "file-label");
	header.textContent = "Output";
	outputDataPicker.appendChild(header);
	body = document.createElement("div");
	body.classList.add("action-body");
	body.style.width = "100%";
	body.textContent = "body";
	outputDataPicker.appendChild(body);
	options = document.createElement("div");
	options.classList.add("action-header", "file-picker-button");
	options.textContent = "chose";
	outputDataPicker.appendChild(options);
	workflowUl.appendChild(outputDataPicker);

	options.addEventListener("click", function(evt) {
		console.log("should pick file for output-wasm");
	});

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
	*/
}

let fileUl;
let targetFilename;
let lastTabView = document.querySelector("div#workflow-ui-panel");
let lastTabElement;
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
}, {
	selector: "#tab-stats.tab-item",
	action: function(element) {
		let view = document.querySelector("div#wasm-modules-stats");
		if (lastTabView)
			lastTabView.style.display = "none";
		view.style.display = null;
		lastTabView = view;
	}
}]



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
				//postOptimizeWasm(targetModule);
				//postOptimizeFreeBSDKernMainAction(null, targetModule, {});
				inspectFreeBSDBinary(moduleBuffer, targetModule);
			} else if (file.name == "netbsd-kern.wasm") {
				//postOptimizeWasm(targetModule);
				//postOptimizeFreeBSDKernMainAction(null, targetModule, {});
				inspectNetBSDBinary(moduleBuffer, targetModule);
			}
			setupWorkflowUIForTarget(null, wasmFiles[0].binary, wasmFiles[0].symbolMapFile);
		});
		_openFiles = [{role: "input", kind: "wasm-binary", file: wasmFiles[0].binary}];
		if (wasmFiles[0].symbolMapFile) {
			_openFiles.push({role: "input", kind: "symbol-map", file: wasmFiles[0].symbolMapFile})
		}
		/*file.arrayBuffer().then(function(buf) {
			loadWebAssemblyBinary(buf);
		}, console.error);*/		
	}

}

async function loadFilePairs(binary, symbolMapFile) {
	let buf1 = await binary.arrayBuffer();
	let buf2;
	if (symbolMapFile)
		buf2 = await symbolMapFile.text();

	return loadWebAssemblyBinary(buf1, buf2) 
}

const globalApp = {_extentions: []};

async function setupMainUI() {

	let readmeContainer = document.querySelector("article#readme");
	if (readmeContainer)
		readmeContainer.style.display = "none";

	/*document.addEventListener("dragenter", function(evt) {
		event.preventDefault();
	});

	document.addEventListener("dragover", function(evt) {
		event.preventDefault();
	});*/

	let _exts = ["./ext-objc.js", "./ext-netbsd.js", "./ext-freebsd.js"];
	for (let path of _exts) {
		let def = await import(path);
		console.log(def);
		globalApp._extentions.push(def);
	}


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
		if (element.classList.contains("selected")) {
			if (lastTabElement) {
				lastTabElement.classList.remove("selected");
			}
			lastTabElement = element;
		}
	}

	function onMainTabClick(evt) {
		let target = evt.currentTarget;
		let index = tabMap.indexOf(target);
		if (index === -1) 
			return;
		let obj = mainTabItems[index];
		obj.action(target);
		if (lastTabElement) {
			lastTabElement.classList.remove("selected");
		}
		lastTabElement = target;
		lastTabElement.classList.add("selected");
	}

	fileUl = document.createElement("ul");

	/*
	let fileTab = document.querySelector("nav.topnav #tab-files.tab-item");
	fileTab.addEventListener("click", function (evt) {

		document.body.appendChild(fileUl);
		fileUl.style.position = "absolute";
		fileUl.style.left = "10px";
		fileUl.style.top = "10px";
		fileUl.style.background = "#fff";
	});
	*/

	let targetPanel = document.createElement("div");
	targetPanel.classList.add("target-panel");
	let workflowUIPanel = document.querySelector("div#workflow-ui-panel");
	if (workflowUIPanel) {
		let workflowUIToolbar = document.querySelector("#workflow-ui-toolbar");
		workflowUIPanel.insertBefore(targetPanel, workflowUIToolbar.nextElementSibling);
		let actionInfo = document.querySelector("#action-info");
		if (actionInfo)
			workflowUIPanel.appendChild(actionInfo);
	} else {
		readmeContainer.parentElement.insertBefore(targetPanel, readmeContainer);
	}
	setupTargetPanel(targetPanel);

	let inspectorContainer = document.querySelector("div#test");
	inspectorContainer.style.display = "none";

	let statsContainer = document.querySelector("#wasm-modules-stats");
	statsContainer.style.display = "none";
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



// NetBSD

function inspectNetBSDBinary(buf, mod) {

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
				let fn = inst.func;
				fn.usage++;
			}
		}
	}
}

function generateStackUsage(mod) {

	if (!mod.imports)
		return

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




// managing persistent state

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function isEqualWorkflowData(data1, data2) {

	let k1 = Object.keys(data1);
	let k2 = Object.keys(data1);

	if (k1.length != k2.length) {
		return false;
	}

	let len = k1.length;
	for (let i = 0; i < len; i++) {
		let key = k1[i];
		if (k2.indexOf(key) == -1) {
			return false;
		}
	}

	len = k1.length;
	for (let i = 0; i < len; i++) {
		let key = k1[i];
		let v1 = data1[key];
		let v2 = data2[key];
		let type = typeof v1;
		if (typeof v2 !== type) {
			return false;
		}

		if (type == "string" || type == "boolean" || type == "number" || type == "bigint" || type == "undefined") {

			if (v1 !== v2) {
				return false;
			}
		} else if (type == "object") {

			if (v1 === null) {
				
				if (v2 !== null) {
					return false;
				}

			} else if (v2 === null) {
				
				if (v1 !== null) {
					return false;
				}

			} else if (Array.isArray(v1)) {
				
				if (!Array.isArray(v2)) {
					return false;
				}

				if (v1.length != v2.length) {
					return false;
				}

			} else if (v1.kind == "file") {

				if (v1.kind !== "file") {
					return false;
				}

				if (v1.id !== v2.id) {
					return false;
				}
			}
		}
	}

	return true;
}

// Web UI - Save settings to storage.

function generateAppData(appData, workflowData, workflowId) {

	let files;
	let recentWorkFlows;

	if (!appData) {
		let obj = {};
		obj.files = [];
		obj.recentWorkFlows = [];

		files = obj.files;
		recentWorkFlows = obj.recentWorkFlows;
		appData = obj;
	} else {
		files = appData.files;
		recentWorkFlows = appData.recentWorkFlows;
	}

	let fileIdMap = new Map();
	let workflowFiles = workflowData.files;
	let ylen = workflowFiles.length;
	for (let y = 0; y < ylen; y++) {

		let file1 = workflowFiles[y];
		let found = false;

		let xlen = files.length;
		for (let x = 0; x < xlen; x++) {
			let obj = files[x];
			let file2 = obj.file;
			if (file2.isSameEntry(file1)) {
				fileIdMap.set(file1, obj.id);
				found = true;
				break;
			}
		}

		if (!found) {
			let obj = {};
			obj.id = uuidv4();
			obj.file = file1;
			files.push(obj);
			fileIdMap.set(file1, obj.id);
		}
	}

	let cpy = Object.assign({}, workflowData);
	for (let key in cpy) {
		let val = cpy[key];
		if (workflowFiles.indexOf(val) !== -1) {
			let id = fileIdMap.get(val);
			cpy[key] = {kind: "file", id: id};
		}
	}

	cpy.workflowId = workflowId;

	let len = recentWorkFlows.length;
	for (let i = 0; i < len; i++) {
		let data2 = recentWorkFlows[i];
		let equal = isEqualWorkflowData(cpy, data2);
		if (equal) {
			return false;
		}
	}


	recentWorkFlows.push(cpy);

	return appData;
}

function storeRecentWorkflowInDB(workflowId, workflowData) {

	let transaction = _db.transaction("AppData", "readwrite");
	let appDataStore = transaction.objectStore("AppData");
	let req = appDataStore.get("default");
	req.onsuccess = function(evt) {
		console.log(evt);
		let appData = evt.target.result;

		let obj = generateAppData(appData, workflowData, workflowId);
		obj.id = "default";
		if (obj === false) {
			return;
		}
		let req2 = appDataStore.put(obj);
		req2.onsuccess = function(evt) {
			console.log("data added to IndexedDB");
		}

		req2.onerror = function(evt) {
			console.error(evt);
		}
	}

	req.onerror = function(evt) {
		console.error(evt);
	}
}

function openDatabase() {
	let req = window.indexedDB.open("wasn-info", 1);
	req.onerror = function(evt) {
		console.error("Error loading database. %o", evt);
	}

	req.onsuccess = function(evt) {
		console.log("Database initialized.");
		const db = evt.target.result;
		_db = db;

		let transaction = db.transaction("AppData", "readonly");
		let appDataStore = transaction.objectStore("AppData");
		let req = appDataStore.get("default");
		req.onsuccess = function(evt) {
			console.log(evt);
		}
	}

	req.onupgradeneeded = (evt) => {
		_db = evt.target.result;
	  	_db.onerror = (evt) => {
	    	console.error("Error loading database. %o", evt);
	  	};

	  	_db.createObjectStore("AppData", {
    		keyPath: "id",
  		});

	  	_db.createObjectStore("RecentWorkflow", {
    		keyPath: "id",
    		autoIncrement: true
  		});

		console.log("Object store created.");
	};
}

openDatabase();

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
	populateWebAssemblyInfo(mod);
	try {
		inspectObjectiveC(mod, buf);
	} catch (err) {
		console.error(err);
	}
}




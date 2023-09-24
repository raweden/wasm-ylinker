let _flowActions = {
	postOptimizeAtomicInst: {
		handler: postOptimizeAtomicInst
	},
	postOptimizeMemInst: {
		handler: postOptimizeMemInstAction
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
};


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
        tmod._version = mod._version;
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

		let file = ctx.getVariable("initial-data");

		if (file && file instanceof FileSystemFileHandle) {

            console.log("storing initial-data trough FileSystemFileHandle");

			file.createWritable().then(function(writable) {

				let blob = new Blob(buffers, { type: "application/wasm" });
				writable.write(blob).then(function(val) {
					writable.close().then(function(val) {
						console.log("did close writable stream");
						resolveFn(true);
					}, rejectFn);
				}, rejectFn);

                if (typeof updateFileSizeInUI == "function")
				    updateFileSizeInUI(file, blob.size);

			}, rejectFn);

		} else {
            
            console.log("storing initial-data trough File");

			let name = ctx.input.name.split(".");
			name.pop();
			name = name.join(".");
			name += ".data.wasm";
			file = new File(buffers, name, { type: "application/wasm" });
            ctx.setVariable("initial-data", file);
			resolveFn(file);
		}
		
		return p;
	} else {
        console.error("other format than wasm is no-longer supported..");
	}

	//saveAsFile(buffer, "data.seg", "application/octet-stream");
}

function outputAction(ctx, mod, options) {

	let exported = [];
	let sections = mod.sections;
	let len = sections.length;
	let buffers = [];

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

    let header = new Uint8Array(8);
    buffers.push(header.buffer);
    header = new DataView(header.buffer);
    header.setUint32(0, 0x6D736100, true);
    header.setUint32(4, mod._version, true);

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
            if (!section._buffer)
                throw Error("expected non WebAssemblySection to be have ._buffer property");
			buffers.push(section._buffer);
		}
	}

	let resolveFn;
	let rejectFn;
	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});

	let file = ctx.output;

	if (file && file instanceof FileSystemFileHandle) {

        console.log("storing to file trough FileSystemFileHandle");
		file.createWritable().then(function(writable) {

			let blob = new Blob(buffers, { type: "application/wasm" });
			writable.write(blob).then(function(val) {
				writable.close().then(resolveFn, rejectFn);
			}, rejectFn);

		}, rejectFn);

		

	} else {
        console.log("storing to file trough File");
		file = new File(buffers, input.name, { type: "application/wasm" });
		ctx.setVariable("wasm-binary", file);
		resolveFn(file);
	}
	
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

	let handle = ctx.getVariable("script");

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

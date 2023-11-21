
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
					sectionCount = mod.getImports().length;
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
					sectionCount = mod.functions.length;
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
let _activeFlowContext;
let _flowContexts = [];





const _workflows = [];



















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
		console.log(_activeFlowContext);
		let options = getWorkflowParameterValues();

		let _input = _activeFlowContext.input;
		let _output = _activeFlowContext.output;
		let _wasmModule = _activeFlowContext.module;

		if (!_output && _activeFlowContext.params.hasOwnProperty("wasm-binary")) {
			_output = _activeFlowContext.params["wasm-binary"];
		}
	
		let _vars = Object.assign({}, _activeFlowContext.params);
		let workflowCtx = {
			id: _workflowActive.id,
			module: _wasmModule,
			setVariable: function(name, value) {
				_vars[name] = value;
			},
			getVariable: function(name) {
				if (_vars.hasOwnProperty(name)) {
					return _vars[name];
				}
	
				return undefined;
			}
		};
	
		Object.defineProperty(workflowCtx, "input", {
			get: function() {
				return _input;
			}
		});
	
		Object.defineProperty(workflowCtx, "output", {
			get: function() {
				return _output;
			}
		});

		//storeRecentWorkflowInDB(_workflowActive.id, options);
		runWorkflowActions(workflowCtx.module, _workflowActive.actions, workflowCtx, options.params).then(function(res) {
			populateWebAssemblyInfo(workflowCtx.module);
			console.log("workflow did complete");
		}, function (err) {
			console.error(err);
		});
	});
}

function showMemoryParamEditor(container, module, memory) {

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
		let sec = (memory instanceof ImportedMemory) ? module.findSection(SECTION_TYPE_IMPORT) : module.findSection(SECTION_TYPE_MEMORY);
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
		
		let sec = (memory instanceof ImportedMemory) ? module.findSection(SECTION_TYPE_IMPORT) : module.findSection(SECTION_TYPE_MEMORY);
		sec._isDirty = true;
	});

	let input = container.querySelector("#memory-shared");
	input.checked = memory.shared;
	input.addEventListener("change", function(evt) {
		memory.shared = input.checked;
		let sec = (memory instanceof ImportedMemory) ? module.findSection(SECTION_TYPE_IMPORT) : module.findSection(SECTION_TYPE_MEMORY);
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
	showInitialMemory(dataContainer, module, memory)
}

function showInitialMemory(container, module, mem) {

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
	
	let dataSegments = module.dataSegments;
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
		let mod = this._module;
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}
		let paginator = this._paginator;
		let start = paginator.pageIndex * this._pageRowCount;
		let items = this._collection;

		let globals = mod.globals;
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

	set module(value) {
		this._module = value;
		if (this._defaultCollection)
			this.render();
	}

	get module() {
		return this._module;
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
			if (table instanceof ImportedTable)
				continue;
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
	let globals = mod.globals;
	let exported = mod.exports;
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
		showMemoryParamEditor(container, mod, mem);
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
			view.module = mod;
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
				let file;
				if (typeof item.getAsFileSystemHandle == "function") {
					file = item.getAsFileSystemHandle();
				} else {
					file = item.getAsFile();
				}
				
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

		this._isDefaultInput = false;
		this._isDefaultOutput = false;
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

				if (_self.context) {
					if (_self._isDefaultInput) {
						_self.context.input = file;
					} else if (_self._isDefaultInput) {
						_self.context.output = file;
					} else if (typeof _self._paramName == "string" && _self._paramName.length > 0) {
						_self.context.params[_self._paramName] = file;
					}
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

			let _self = this;
			let files = filesFromDataTransfer(evt.dataTransfer);
			if (files.length == 0) {
				evt.preventDefault();
				return;
			}

			Promise.all(files).then(function(files) {
				
				let file = files[0];
				if (_self.context) {
					if (_self._isDefaultInput) {
						_self.context.input = file;
					} else if (_self._isDefaultInput) {
						_self.context.output = file;
					} else if (typeof _self._paramName == "string" && _self._paramName.length > 0) {
						_self.context.params[_self._paramName] = file;
					}
				}

				nameText.textContent = files[0].name;
				//sizeText.textContent = humanFileSize(files[0].size, true);
				appendFiles(files);
				
				_fileViews.set(file, _self);
				_self._file = files[0];
			
			}, console.error);

			evt.preventDefault();
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
	let lc = name.toLowerCase();
	return lc.indexOf("kern") == -1 && lc.indexOf("tinybsd") == -1 && lc.indexOf("netbsd") == -1;
}

function autoSelectWorkflow(files) {

}


function tryMigrateWorkflowParams(oldWorkflow, newWorkflow) {

}

function setupWorkflowUIForTarget(newWorkflow, wasmBinary, wasmSymbolDump, workflowCtx) {

	let container = document.querySelector("ul.workflow-ui");
	let workflow;

	if (!newWorkflow) {

		if (wasmBinary) {
			let fname = wasmBinary.name;
			if (fname == "kern.wasm") {
				workflow = globalApp.workflowById("tinybsd_14_0.kern-main-binary");
			} else if (fname == "netbsd-kern.wasm") {
				workflow = globalApp.workflowById("netbsd_10.kern-main-binary");
			} else if (fname == "gdnc.wasm" || fname == "gpbs.wasm") {
				workflow = globalApp.workflowById("gs_2_0_usrbin");
			} else if (isUserBinary(fname)) {
				workflow = globalApp.workflowById("netbsd_10.user-binary+emul-fork");
			}


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
	srcfileView.context = workflowCtx;
	srcfileView.role = "Source";
	srcfileView._isDefaultInput = true;
	let label = srcfileView.element.querySelector(".action-body .filename");
	label.textContent = wasmBinary.name;
	label = srcfileView.element.querySelector(".action-body .filesize");
	label.textContent = humanFileSize(wasmBinary.size, true);
	container.appendChild(srcfileView.element);
	_fileViews.set(wasmBinary, srcfileView);
	_activeFlowContext = workflowCtx;

	let actions = workflow.actions;
	let ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_flowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _flowActions", actionName);
			continue;
		}
		let actionTemplate = _flowActions[actionName];
		if (actionTemplate.params) {
			let params = actionTemplate.params;
			let xlen = params.length;
			for (let x = 0; x < xlen; x++) {
				let param = params[x];
				if (param.type == "file") {
					let view = new WorkflowUIFilePicker();
					view.context = workflowCtx;
					view.paramName = param.name;
					view.types = param.types;
					container.appendChild(view.element);
					_workflowParamViews[param.name] = view;
					_workflowParameters.push(param);
					if (param.isdefaultoutput) {
						view._isDefaultOutput = true;
					}
				}
			}
		}
	}

	actions = workflow.actions;
	ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_flowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _flowActions", actionName);
			continue;
		}
		let actionTemplate = _flowActions[actionName];
		let li = document.createElement("li");
		li.textContent = actionName;
		container.appendChild(li);
	}

	actions = workflow.actions;
	ylen = actions.length;
	for (let y = 0; y < ylen; y++) {
		let actionData = actions[y];
		let actionName = actionData.action;
		if (!_flowActions.hasOwnProperty(actionName)) {
			console.warn("missing %s in _flowActions", actionName);
			continue;
		}
		let actionTemplate = _flowActions[actionName];
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
			evt.preventDefault();
			return;
		}

		Promise.all(files).then(function(files) {
			
			findInputFiles(files);
			appendFiles(files);
		
		}, console.error);

		evt.preventDefault();
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
	let parseOptions = {};

	let len = files.length;
	for (let i = 0; i < len; i++) {
		let file = files[i];
		if (file.kind != "file")
			continue;
		
		if (file.name.endsWith(".wasm")) {	// application/wasm
			wasmFiles.push({binary: file});
		} else if (file.name.endsWith(".bc")) {
			wasmFiles.push({binary: file, linking: true});
			parseOptions.linking = true;
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
			let n2 = f2.name;
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
		let options = {params: {}};
		options.input = wasmFiles[0].binary;
		if (wasmFiles[0].symbolMapFile) {
			options.symbolsFile = wasmFiles[0].symbolMapFile;
		}
		loadFilePairs(wasmFiles[0].binary, wasmFiles[0].symbolMapFile, options, parseOptions).then(function(res) {
			if (file.name == "kern.wasm") {
				//postOptimizeWasm(targetModule);
				//postOptimizeFreeBSDKernMainAction(null, targetModule, {});
				inspectFreeBSDBinary(moduleBuffer, targetModule);
			}
			setupWorkflowUIForTarget(null, wasmFiles[0].binary, wasmFiles[0].symbolMapFile, options);

			if (wasmFiles[0].linking) {
				handleLinking(res);
			}
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

async function loadFilePairs(binary, symbolMapFile, options, parseOptions) {
	let file;
	if (binary instanceof FileSystemFileHandle) {
		file = await binary.getFile();
	}
	let buf1 = await file.arrayBuffer();
	let buf2;
	if (symbolMapFile && symbolMapFile instanceof FileSystemFileHandle) {
		file = await symbolMapFile.getFile();
		buf2 = await file.text();
	}

	return loadWebAssemblyBinary(buf1, buf2, options, parseOptions) 
}

const flow = {};
const globalApp = {
	_extentions: [],
	_uiInspect: [],
	workflowById: function(id) {
		let len = _workflows.length;
		for (let i = 0; i < len; i++) {
			let workflow = _workflows[i];
			if (workflow.id == id)
				return workflow;
		}

		return null;
	}
};

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
		let module = await import(path);
		let def = module.default;
		globalApp._extentions.push(def);
		let actions = def.flowActions;
		let len = actions.length;
		for (let i = 0; i < len; i++) {
			let action = actions[i];
			if (_flowActions.hasOwnProperty(action.name)) {
				console.warn("action %s already exist", action.name);
				continue;
			}
			_flowActions[action.name] = action;
		}

		let flows = def.flowTemplates;
		len = flows.length;
		for (let i = 0; i < len; i++) {
			let flow = flows[i];
			_workflows.push(flow);
		}

		let uiInspect = def.uiInspect;
		len = uiInspect.length;
		for (let i = 0; i < len; i++) {
			let inspector = uiInspect[i];
			globalApp._uiInspect.push(inspector);
		}
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

	let functions = mod.functions;
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
		let fn = functions[num];
		fn[__nsym] = name;
	}
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

	let imports = mod.getImports();
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

function mapGlobalsUsage(mod) {

	if (!mod.globals)
		return;

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
	let imports = mod.getImports();
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
				let glob = op.global;
				if (globals.indexOf(glob) === -1) {
					console.error("invalid globalidx at funcidx: %d inst-index: %d", y, x);
				} else {
					glob.usage++;
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

function loadWebAssemblyBinary(buf, symbolsTxt, context, options) {
	moduleBuffer = buf;
	let mod = parseWebAssemblyBinary(buf, options);
	showWasmInfoStats(mod, mod.sections);

	console.log(mod);

	context.module = mod;
	globalThis.__wasmModule = mod;

	if (symbolsTxt) {
		processSymbolsMap(mod, symbolsTxt);
	}
	//postOptimizeWasm(mod);
	mapGlobalsUsage(mod);
	generateCallCount(mod);
	generateStackUsage(mod);
	populateWebAssemblyInfo(mod);

	let inspectors = globalApp._uiInspect;
	let len = inspectors.length;
	for (let i = 0; i < len; i++) {
		let inspector = inspectors[i];
		if (inspector.type != "binary")
			continue;

		try {
			let result = inspector.test(mod);
			if (result === true) {
				let view = inspector.render(mod, buf);
				console.log(view);
			}
		} catch (err) {
			console.error(err);
		}	
	}

	return mod;
}

}




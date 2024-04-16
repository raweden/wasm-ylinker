#!/bin/env -S node --experimental-vm-modules
//#!/bin/node 
//
// 
// a node.js variant with command line interface of the ui based workflow optimization.

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

import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as path from "node:path"
import * as vm from "node:vm"
import { Blob } from "node:buffer"
import {WebAssemblyModule, parseWebAssemblyBinary} from "../src/core/WebAssembly"
import { ByteArray, lengthBytesUTF8, lengthSLEB128, lengthULEB128 } from "../src/core/ByteArray"
import { ImportedFunction, ImportedGlobal, ImportedMemory, ImportedTable, ImportedTag, WasmDataSegment, WasmElementSegment, WasmFunction, WasmGlobal, WasmLocal, WasmMemory, WasmTable, WasmTag, WasmType, WebAssemblyCustomSection } from "../src/core/types"
import { _flowActions, replaceCallInstructions } from "../src/core-flow"
import { SECTION_TYPE_CODE, SECTION_TYPE_CUSTOM, SECTION_TYPE_DATA, SECTION_TYPE_DATA_COUNT, SECTION_TYPE_ELEMENT, SECTION_TYPE_EXPORT, SECTION_TYPE_FUNC, SECTION_TYPE_FUNCTYPE, SECTION_TYPE_GLOBAL, SECTION_TYPE_IMPORT, SECTION_TYPE_MEMORY, SECTION_TYPE_START, WA_TYPE_F32, WA_TYPE_F64, WA_TYPE_I32, WA_TYPE_I64, __nsym } from "../src/core/const"
import { WA_TYPE_ANY } from "../src/core/inst";
import { WebAssemblyCustomSectionNetBSDDylinkV2 } from "../src/ylinker/rtld.dylink0";
import { WebAssemblyCustomSectionNetBSDExecHeader } from "../src/ylinker/rtld.exechdr";

const scopes = new Map();

/*

node script-shell.js --input-file=../test/abc.wasm --workflow-name=nb10-usr-bin --workflow-data="../test.json"


'/home/raweden/.nvm/versions/node/v16.15.1/bin/node',
  '/home/raweden/Projects/wasm-info/dist/script-shell.js',
  '--input-file=../test/abc.wasm',
  '--workflow-name=nb10-usr-bin',
  '--workflow-data=../test.json'
 */

const _workflowNameMap = {
	'nb10-usrbin': {script: "../dist/ext-netbsd.js", id: "netbsd_10.user-binary+emul-fork"},
	'nb10-dynld': {script: "../dist/ext-netbsd.js", id: "netbsd_10.dynld-binary"},
	//'nb10-usr-bin': {script: "../dist/flows/netbsd-usrbin-flow.js"},
	'nb10-kmain': {script: "../dist/ext-netbsd.js", id: "netbsd_10.kern-main-binary"},
	'freebsd-kernel': {script: "../dist/ext-freebsd.js", id: "tinybsd_14_0.kern-main-binary"}
}

function main() {
	//console.log(process.argv);

	let _cwd = process.cwd();
	let params = {};
	let workflowId;
	let workflowPath;
	let defaultInputFile;
	let defaultOutputFile;
	let inputcnt = 0;
	let namedInputFile = {};
	let namedOutputFile = {};
	let moduleName;
	let args = process.argv;
	let argc = args.length;
	for (let i = 2; i < argc; i++) {
		let arg = args[i];
		if (arg.startsWith("--input-file=")) {
			let org, filepath = arg.substring(13);
			org = filepath;
			if (!path.isAbsolute(filepath)) {
				filepath = path.join(_cwd, filepath);
			}
			defaultInputFile = createFileSystemHandle(filepath);
			inputcnt++;
		} else if (arg.startsWith("--input-")) {
			let org, end = arg.indexOf('=', 8);
			if (end == -1) {

			}
			let name = arg.substring(8, end);
			let file, filepath = arg.substring(end + 1);
			org = filepath;
			if (!path.isAbsolute(filepath)) {
				filepath = path.join(_cwd, filepath);
			}
			file = createFileSystemHandle(filepath);
			namedInputFile[name] = file;
			params[name] = file;
			inputcnt++;
		} else if (arg.startsWith("--workflow-name=")) {
			let value = arg.substring(16);
			workflowId = value;
		} else if (arg.startsWith("--module-name=")) {
			let value = arg.substring(14);
			if (value.startsWith("\"") && value.endsWith("\"")) {
				value = value.substring(1, value.length - 1);
			}
			moduleName = value;
		} else if (arg.startsWith("--workflow-file=")) {
			let value = arg.substring(16);
			workflowPath = value;
		} else if (arg.startsWith("--workflow-param=")) {
			let value = arg.substring(17);
		} else if (arg.startsWith("--output-file=")) {
			let org, filepath = arg.substring(14);
			org = filepath;
			if (defaultOutputFile) {

			}
			if (!path.isAbsolute(filepath)) {
				filepath = path.join(_cwd, filepath);
			}
			defaultOutputFile = createFileSystemHandle(filepath);
		} else if (arg.startsWith("--output-")) {
			let end = arg.indexOf('=', 9);
			if (end == -1) {

			}
			let name = arg.substring(9, end);
			let org, file, filepath = arg.substring(end + 1);
			org = filepath;
			if (!path.isAbsolute(filepath)) {
				filepath = path.join(_cwd, filepath);
			}
			file = createFileSystemHandle(filepath);
			namedOutputFile[name] = file;
			params[name] = file;
		} else if (arg.startsWith("-o\x20")) {
			let org, filepath = arg.substring(3);
			org = filepath;
			org = filepath;
			if (defaultOutputFile) {

			}
			if (!path.isAbsolute(filepath)) {
				filepath = path.join(_cwd, filepath);
			}
			defaultOutputFile = createFileSystemHandle(filepath);
		} else if (arg.startsWith("-D")) {
			let end = arg.indexOf("=");
			let prop = arg.substring(2, end);
			let value = arg.substring(end);
			params[prop] = value;
		}
	}

	if (inputcnt == 0) {
		console.error("no input file");
		process.exit(1);
	} else {
		console.log(params);
	}

	/*
	console.log("__dirname: ", __dirname);
	console.log("process.cwd: ", process.cwd());
	console.log("workflow-id: %s", workflowId);
	console.log("workflow-path: %s", workflowPath);
	console.log("default-input: %s", defaultInputFile);
	console.log("default-output: %s", defaultOutputFile);
	console.log("named-inputs: %o", namedInputFile);
	console.log("named-outputs: %o", namedOutputFile);
	console.log("params: %o", params);
	*/

	// these are expected to be on the global scope.
	globalThis.FileSystemFileHandle = FileSystemFileHandle;
	globalThis.Blob = Blob;

	if (workflowPath) {
		console.error("no such workflow = %s", workflowPath);
		process.exit(1);
	} else if (workflowId) {
		let obj = _workflowNameMap[workflowId];
		if (!obj) {
			console.error("no such workflow = %s", workflowId);
			process.exit(1);
			return;
		}
		let scriptPath = obj.script;
		if (!path.isAbsolute(scriptPath)) {
			scriptPath = path.join(__dirname, scriptPath);
		}

		loadWorkflowScript_mjs(scriptPath, obj.id, {
			defaultInputFile: defaultInputFile,
			defaultOutputFile: defaultOutputFile,
			namedInputFile: namedInputFile,
			namedOutputFile: namedOutputFile,
			moduleName: moduleName,
			parameters: params
		}).then(function(mod) {
			console.log(mod);
		}, console.error);
	}
}


function calledWaitUntil(scope, promise) {
	console.log(this);
	scopes.set(scope, promise);
}

class WorkflowContext {

	constructor(input, files, params, variables) {
		this._input = input;
		this._files = files;
		this._params = params;
		this._variables = variables;
	}

	namedGlobalsMap() {
		return new Map();
	}

	get files() {

	}

	get input() {

	}

	get parameters() {

	}

	set output(value) {

	}

	get output() {

	}

	setVariable(name, value) {

	}

	getVariable(name) {
		
	}
}

class WorkflowWorkletGlobalScope {

	constructor(WorkflowContext) {
		this.text = "";
		this._WorkflowContext = WorkflowContext;
		scopes.set(this, {
			_promise: undefined,
			_workflowParam: undefined,
			_WorkflowContext: WorkflowContext
		});
	}

	namedGlobalsMap() {
		return new Map();
	}

	/**
	 * Pauses the execution of the next workflow step until the promise provided has been resolved.
	 * @param  {Promise} promise
	 * @return {void}
	 */
	waitUntil(promise) {
		calledWaitUntil(this, promise);
	}

	get wasmModule() {
		return this._wasmModule;
	}

	get workflow() {
		return this._WorkflowContext;
	}
}

let _privateAlloc = false;
const _fileMap = new WeakMap();

class File extends Blob {

    constructor(sources, name, options) {
		if (_privateAlloc) {
			super([], options);
		} else {
			super(sources, options);
			this._name = name;
		}
    }

	get name() {
		let fdata = _fileMap.get(this);
		if (!fdata) {
			return this._name;
		} else {
			return fdata._name;
		}
	}

	get size() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			return super.size;
	}

	arrayBuffer() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			return super.arrayBuffer();
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		return p;
	}

	text() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			return super.text();
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		return p;
	}

	slice() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			return super.text.apply(this, arguments);
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		return p;
	}

	stream() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			return super.stream();
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		return p;
	}

};

class FileSystemHandle {

	constructor() {

	}

	get kind() {
		let fdata = _fileMap.get(this);

        return fdata.isdir === true ? "directory" : "file";
	}

	get name() {
		let fdata = _fileMap.get(this);
        return path.basename(fdata._path);
	}
};

class FileSystemSyncAccessHandle {
	
	constructor() {
		if (!_privateAlloc) {

		} else {
			
		}
	}
};

class FileSystemFileHandle extends FileSystemHandle {

    constructor() {
		super();
		if (!_privateAlloc) {

		} else {
			
		}
    }

    getFile() {
		let data = _fileMap.get(this);
		if (!data._file) {
			_privateAlloc = true;
			let obj = new File();
			_privateAlloc = false;
			_fileMap.set(obj, data);
		}
        return data._file;
    }

    createSyncAccessHandle() {
        let data = _fileMap.get(this);
		if (!data._fileSync) {
			_privateAlloc = true;
			let obj = new FileSystemSyncAccessHandle();
			_privateAlloc = false;
			_fileMap.set(obj, data);
			data._fileSync = obj;
		}
        return data._fileSync;
    }

    createWritable(options) {
		let data = _fileMap.get(this);
		if (!data)
			throw TypeError("this is not file obj");
		if (data._writeStream) {
			return Promise.reject(new Error("WriteStream already open"));
		}
		
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		let keepExistingData = false;
		if (options && typeof options.keepExistingData == "boolean") {
			keepExistingData = options.keepExistingData;
		}

		let flags = keepExistingData ? 'a' : 'w';

		fsPromises.open(data._path, flags).then(function(fhandle) {
			data._fhandle = fhandle;
			data._writeStream = true;
			_privateAlloc = true;
			let obj = new FileSystemWritableFileStream();
			_fileMap.set(obj, data);
			resolveFn(obj);
		}, function(err) {
			console.error(err);
			rejectFn(err);
		});

		return p;
    }
};

class FileSystemWritableFileStream {

	constructor() {
		if (!_privateAlloc) {

		}
		this._fpos = 0;
	}

	/**
	 * Writes content into the file the method is called on, at the current file cursor offset.
	 */
	write(data) {

		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		let fdata = _fileMap.get(this);
		if (!fdata)
			throw new TypeError("this is not file obj");
		
		let _self = this;
		let fhandle = fdata._fhandle;
		
		if (typeof data == "string") {

			fhandle.write(data, 'utf8', _self._fpos).then(function(res) {
				_self._fpos += res.bytesWritten;
				resolveFn(undefined);
			}, rejectFn);
		
		} else if (data && data instanceof Blob) {

			let stream = data.stream();
			const reader = stream.getReader();
			// read() returns a promise that resolves when a value has been received
			reader.read().then(function pump({ done, value }) {
			  	if (done) {
					// Do something with last chunk of data then exit reader
					resolveFn();
					return;
			  	}

			  	fhandle.write(value, 0, value.byteLength, _self._fpos).then(function(res) {
					_self._fpos += value.byteLength;
					reader.read().then(pump);
			 	}, rejectFn);
			});

		} else if (data && ArrayBuffer.isView(data)) {

			fhandle.write(data, 0, data.byteLength, _self._fpos).then(function(res) {
				_self._fpos += res.bytesWritten;
				resolveFn(undefined);
			}, rejectFn);
		}

		return p;
	}

	/**
	 * Updates the current file cursor offset to the position (in bytes) specified.
	 */
	seek(position) {

		let data = _fileMap.get(this);
		if (!data)
			throw new TypeError("this is not file obj");

		if (typeof position != "number" && typeof position != "bigint" && position > 0)
			throw new TypeError("size not set");

		this._fpos = position;

		return Promise.resolve(undefined);
	}

	/**
	 * Resizes the file associated with the stream to be the specified size in bytes.
	 */
	truncate(size) {
		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		let data = _fileMap.get(this);
		if (!data)
			throw new TypeError("this is not file obj");
		
		let _self = this;
		let fhandle = data._fhandle;

		if (typeof size != "number" && typeof size != "bigint")
			throw new TypeError("size not set");

		fhandle.truncate(size).then(function(res) {
			if (_self._fpos > size) {
				_self._fpos = size;
			}
			resolveFn(undefined);
		}, rejectFn);

		return p;
	}

	close() {
		let fdata = _fileMap.get(this);
		if (!fdata)
			throw new TypeError("this is not file obj");

		let resolveFn;
		let rejectFn;
		let p = new Promise(function(resolve, reject) {
			resolveFn = resolve;
			rejectFn = reject;
		});

		let _self = this;
		let fhandle = fdata._fhandle;

		fhandle.close().then(function(res) {
			_self._state = "closed";
			resolveFn(undefined);
		}, rejectFn);

		return p;
	}
};

class FileSystemDirectoryHandle extends FileSystemHandle {

	constructor() {
		super();
	}

}

function createFileSystemHandle(pathname) {
	_privateAlloc = true;
	let fobj, stats;
	try {
		stats = fs.statSync(pathname);
	} catch (err) {

	}
	if ((stats && stats.isDirectory()) || pathname.endsWith('/')) {
		fobj = new FileSystemDirectoryHandle();
		fobj._path = pathname;
		let fdata = {_path: pathname, isdir: true};
		_fileMap.set(fobj, fdata);
	} else {
		fobj = new FileSystemFileHandle();
		fobj._path = pathname;
		let fdata = {_path: pathname};
		_fileMap.set(fobj, fdata);
	}
	_privateAlloc = false;
	return fobj;
}

async function loadWorkflowScript_mjs(scriptPath, flowId, params) {

	let ctxobj = new WorkflowWorkletGlobalScope();
	ctxobj.console = console;
	ctxobj.File = File;
	ctxobj.FileSystemFileHandle = FileSystemFileHandle;
	ctxobj.FileSystemWritableFileStream = FileSystemWritableFileStream;
	ctxobj.FileSystemSyncAccessHandle = FileSystemSyncAccessHandle;
	ctxobj.Blob = Blob;
	// adding common constants to worflows global scope
	ctxobj.SECTION_TYPE_FUNCTYPE = SECTION_TYPE_FUNCTYPE;
	ctxobj.SECTION_TYPE_IMPORT = SECTION_TYPE_IMPORT;
	ctxobj.SECTION_TYPE_FUNC = SECTION_TYPE_FUNC;
	ctxobj.SECTION_TYPE_CODE = SECTION_TYPE_CODE;
	ctxobj.SECTION_TYPE_GLOBAL = SECTION_TYPE_GLOBAL;
	ctxobj.SECTION_TYPE_CUSTOM = SECTION_TYPE_CUSTOM;
	ctxobj.SECTION_TYPE_EXPORT = SECTION_TYPE_EXPORT;
	ctxobj.SECTION_TYPE_ELEMENT = SECTION_TYPE_ELEMENT;
	ctxobj.SECTION_TYPE_DATA = SECTION_TYPE_DATA;
	ctxobj.SECTION_TYPE_DATA_COUNT = SECTION_TYPE_DATA_COUNT;
	ctxobj.SECTION_TYPE_MEMORY = SECTION_TYPE_MEMORY;
	ctxobj.SECTION_TYPE_START = SECTION_TYPE_START;
	ctxobj.WA_TYPE_I32 = WA_TYPE_I32;
	ctxobj.WA_TYPE_I64 = WA_TYPE_I64;
	ctxobj.WA_TYPE_F32 = WA_TYPE_F32;
	ctxobj.WA_TYPE_F64 = WA_TYPE_F64;
	ctxobj.WA_TYPE_ANY = WA_TYPE_ANY;
	ctxobj.__nsym = __nsym;
	// adding common classes to workflows globalThis object
	ctxobj.ByteArray = ByteArray;
	ctxobj.lengthBytesUTF8 = lengthBytesUTF8;
	ctxobj.lengthSLEB128 = lengthSLEB128;
	ctxobj.lengthULEB128 = lengthULEB128;
	ctxobj.WasmLocal = WasmLocal;
	ctxobj.WasmFunction = WasmFunction;
	ctxobj.WasmGlobal = WasmGlobal;
	ctxobj.WasmType = WasmType;
	ctxobj.WasmTable = WasmTable;
	ctxobj.WasmMemory = WasmMemory;
	ctxobj.WasmDataSegment = WasmDataSegment;
	ctxobj.WasmElementSegment = WasmElementSegment;
	ctxobj.WasmTag = WasmTag;
	ctxobj.ImportedFunction = ImportedFunction;
	ctxobj.ImportedGlobal = ImportedGlobal;
	ctxobj.ImportedMemory = ImportedMemory;
	ctxobj.ImportedTable = ImportedTable;
	ctxobj.ImportedTag = ImportedTag;
	ctxobj.WebAssemblyCustomSection = WebAssemblyCustomSection;
	ctxobj.WebAssemblyModule = WebAssemblyModule;
	ctxobj.replaceCallInstructions = replaceCallInstructions;
	ctxobj.parseWebAssemblyBinary = parseWebAssemblyBinary;
	ctxobj._flowActions = _flowActions;
	let ctx = vm.createContext(ctxobj);

	// loading the module extention
	let filename = scriptPath.split('/').pop();
	let script = await fsPromises.readFile(scriptPath, {encoding: "utf8"});
	let flowModule, flowModuleSrc = new vm.SourceTextModule(script, {
		filename: filename,
		context: ctx,
		initializeImportMeta: function(meta, module) {
			console.log("initializeImportMeta called");
		},
		importModuleDynamically: function(specifier, script, importAssertions) {
			console.log("found import statement %s %s", specifier, script);
		}
	});

	let moduleMap = {};

	moduleMap[filename] = flowModuleSrc;
	
	/*
	flowModule = await flowModuleSrc.link(function(specifier, referencingModule, extra) {
		console.log("found import statement %s in flowModuleSrc.link()", specifier);
	});*/

	let runFlowScript = `
	//let _flowActions = [];

	function runWorkflow(workflowAPI, flow) {
		let actions = flow.actions;
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
			let ctx;
			let actionData;
			let returnPromise;
			for (let i = index; i < actions.length; i++) {
				let ret;
				actionData = actions[i];
				let name = actionData.action;
				if (!_flowActions.hasOwnProperty(name)) {
					console.error("missing %s action handler", name);
					rejectFn(new ReferenceError("MISSING_ACTION_HANDLER"));
					return;
				}
				let action = _flowActions[name];
				let fn = action.handler;
				let options = typeof actionData.options == "object" && actionData.options !== null ? actionData.options : undefined;
				if (options) {
					ret = fn(workflowAPI, workflowAPI.module, options);
				} else {
					ret = fn(workflowAPI, workflowAPI.module);
				}
				if (ret instanceof Promise) {
					returnPromise = ret;
					index = i;
					break;
				}
			}
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

	let p = new Promise(function(resolve, reject) {
		resolveFn = resolve;
		rejectFn = reject;
	});

	import("${filename}").then(function(mod) {
		let def = mod.default;
		let flowActions = def.flowActions;
		let len = flowActions.length;
		for (let i = 0; i < len; i++) {
			let action = flowActions[i];
			if (_flowActions.hasOwnProperty(action.name)) {
				console.warn("action '%s' is already declared");
				continue;
			}
			_flowActions[action.name] = action;
		}

		let flowTemplates = def.flowTemplates;
		len = flowTemplates.length;
		let result = null;
		for (let i = 0; i < len; i++) {
			let flow = flowTemplates[i];
			if (flow.id == workflow.id) {
				result = flow;
				break;
			} 
		}
		//console.log("found-flow: %o", result);
		if (!result) {
			rejectFn(new Error("NOT_WORKFLOW"));
			return;
		}

		return runWorkflow(workflow, result).then(resolveFn, rejectFn);
	}, rejectFn);

	return p;
	`;
	let args = ["workflow", "wasmModule"];
	let options = {
		filename: "run-flow<internal>", 
		parsingContext: ctx, 
		contextExtensions: [ctx],
		initializeImportMeta: function(meta, module) {
			console.log("initializeImportMeta called");
		},
		importModuleDynamically: async function(specifier, script, importAssertions) {
			console.log("found import statement %s", specifier);
			let module = moduleMap[specifier];
			if (!module) {
				return null;
			}
			if (module.status == "unlinked")
				await module.link(() => {});
			if (module.status == "linked")
				await module.evaluate();
			return module;
		}
	};
	let fn = vm.compileFunction(runFlowScript, args, options);

	let fdata = _fileMap.get(params.defaultInputFile);
	let srcbuf = await fsPromises.readFile(fdata._path);
	//console.log(srcbuf);
	let _input = params.defaultInputFile;
	let _output = params.defaultOutputFile;
	let wasmModule = parseWebAssemblyBinary(srcbuf, {
		customSections: function(mod, data, size, name, options, chunk) {
            let result;
            if (name == 'rtld.dylink.0') {
                result = WebAssemblyCustomSectionNetBSDDylinkV2.decode(mod, data, size, name);
                mod._dl_data = result.data;
            } else if (name == 'rtld.exec-hdr') {
                result = WebAssemblyCustomSectionNetBSDExecHeader.decode(mod, data, size, name);
                mod._exechdr = result.data;
            }

			return result;
        }
	});
	wasmModule._buffer = srcbuf;
	if (typeof params.moduleName == "string") {
		wasmModule[ctxobj.__nsym] = params.moduleName;
	}
	let _vars = Object.assign({}, params.parameters);
	let workflowCtx = {
		id: flowId,
		module: wasmModule,
		setVariable: function(name, value) {
			_vars[name] = value;
		},
		getVariable: function(name) {
			//console.log("get var with name '%s' %o", name, _vars[name]);
			if (_vars.hasOwnProperty(name)) {
				return _vars[name];
			}

			return undefined;
		},
		hasVariable: function(name) {
			return _vars.hasOwnProperty(name);
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

	let ret = fn(workflowCtx, wasmModule);
	console.log(ret);

	//console.log(ctx);
	//console.log(flowModule);

	return flowModule;
}

main();




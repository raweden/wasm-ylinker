
const WASM_PAGE_SIZE = (1 << 16);

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
		console.log("__stack_pointer = %d", glob.init[0].value);
		ctx.__stack_pointer = glob.init[0].value; // store it for later use.
		glob = mod.getGlobalByName("lwp0");
		console.log("lwp0 = %d", glob.init[0].value);
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
	netbsd_wakern_info.__shared_vmtotal = getValueByName("wasm_shared_vmtotal")
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
		__wasm_meminfo: "__wasm_meminfo",
		__builtin_iosurfaceAddr: "__builtin_iosurfaceReqMem",
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
	mod.removeExportByRef(g1);

	g1 = mod.getGlobalByName("wasm_curlwp");
	g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__curlwp";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
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
				min: 2000,
				max: 2000,
				shared: true,
			}
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
				names: ["__wasm_call_ctors", "__indirect_function_table", "global_start", "syscall", "syscall_trap", "syscall_trap_handler", "lwp_trampoline", "uvm_total", "wasm_update_vmtotal_stats"]
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
		},*/ 
		{
			action: "filterModuleExports",
			options: {
				names: ["__wasm_call_ctors", "main", "start", "__indirect_function_table"]
			}
		}, {
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

// NetBSD

function inspectNetBSDBinary(buf, mod) {

}

console.log("test print from ext-netbsd.js");

const netbsd_ext = {
    name: "NetBSD Extension",
    flowActions: [{
        name: "generateNetbsdWebAssembly",
        handler: generateNetbsdWebAssembly
    }, {
        name: "postOptimizeNetbsdUserBinary",
        handler: postOptimizeNetbsdUserBinaryAction
    }],
    flowTemplates: [_netbsdKernMainWorkflow, _netbsdKernModuleWorkflow, _netbsdUserBinaryForkWorkflow

    ],
    uiInspect: [{
        type: "binary",
        test: function(wasmModule) {
            return false;
        }
    }, {
        type: "section",
        test: function(wasmModule, section, buffer) {
            return false;
        }
    }]
};

export default netbsd_ext;

//
// FreeBSD
//
//  ModInfo (kernel module defintion used by elf in freebsd)
// - https://man.freebsd.org/cgi/man.cgi?query=kld&sektion=4#MODULE_TYPES
// related to source code in: /tinybsd/sys/kern/kern_linker.c
// 
// module info are basically a vector of the struct described below:
// {
//     uint32_t field_name; 		// MODINFO or MODINFOMD
//     uint32_t value_size;
//     char value_data[value_size];
// }
// 
// terminated by a entry of field_name == 0 && value_size == 0
// 

//Module information subtypes
const MODINFO = {
	END: 0x0000,			/* End of list */
	NAME: 0x0001,			/* Name of module (string) */
	TYPE: 0x0002,			/* Type of module (string) */
	ADDR: 0x0003,			/* Loaded address */
	SIZE: 0x0004,			/* Size of module */
	EMPTY: 0x0005,			/* Has been deleted */
	ARGS: 0x0006,			/* Parameters string */
	METADATA: 0x8000,		/* Module-specfic */
};

const MODINFOMD = {
	AOUTEXEC: 0x0001,		/* a.out exec header */
	ELFHDR: 0x0002,			/* ELF header */
	SSYM: 0x0003,			/* start of symbols */
	ESYM: 0x0004,			/* end of symbols */
	DYNAMIC: 0x0005,		/* _DYNAMIC pointer */
	MB2HDR: 0x0006,			/* MB2 header info */
	ENVP: 0x0006,			/* envp[] */
	HOWTO: 0x0007,			/* boothowto */
	KERNEND: 0x0008,		/* kernend */
	SHDR: 0x0009,			/* section header table */
	CTORS_ADDR: 0x000a,		/* address of .ctors */
	CTORS_SIZE: 0x000b,		/* size of .ctors */
	FW_HANDLE: 0x000c,		/* Firmware dependent handle */
	KEYBUF: 0x000d,			/* Crypto key intake buffer */
	FONT: 0x000e,			/* Console font */
	NOCOPY: 0x8000,			/* don't copy this metadata to the kernel */
	DEPLIST: (0x4001 | 0x8000)
};

// appends a dataSegment named ".modinfo" to the WebAssembly Module.
function encodeModInfoSection() {

}

function encodeModInfo() {

	let bytes = new Uint8Array(512);
	let data = new ByteArray(bytes);
	let idx = 0; // next byte to write, which also gives the current size.

	function push_string(str) {
		let strlen = str.length;
	}

	data.writeUint32(MODINFO.NAME);
	push_string("kernel");

	data.writeUint32(MODINFO.TYPE);
	push_string("elf kernel");

	data.writeUint32(MODINFO.ADDR);
	data.writeUint32(4);
	data.writeUint32(0);

	data.writeUint32(MODINFO.SIZE);
	data.writeUint32(8);
	data.writeUint64(BigInt(0));

	// MODINFO_METADATA | MODINFOMD_DTBP

	data.writeUint32(MODINFO.METADATA | MODINFOMD.KERNEND);
	data.writeUint32(4);
	data.writeUint32(0);

	data.writeUint32(MODINFO.METADATA | MODINFOMD.HOWTO);
	data.writeUint32(4);
	data.writeInt32(0x800);

	// End marker
	data.writeUint32(0);
	data.writeUint32(0);

	// set preload_metadata global (the address should contain a address)

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


function inspectFreeBSDBinary(buf, mod) {

	// TODO: move me to a general initialData initializer..
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

	inspectFreeBSDSysInit(buf, mod, mem, data);
	inspectFreeBSDModMetadataSet(buf, mod, mem, data);
}

// FreeBSD

function inspectFreeBSDModMetadataSet(buf, mod, mem, data) {

	let start_modmetadata = mod.getGlobalByName("__start_set_modmetadata_set").init[0].value;
	let stop_modmetadata = mod.getGlobalByName("__stop_set_modmetadata_set").init[0].value;

	console.log("start_modmetadata = %d", start_modmetadata);
	console.log("stop_modmetadata = %d", stop_modmetadata);

	let table = mod.tables[0];
	let indirectTable = table.contents;

	const MDT_DEPEND = 1;
	const MDT_MODULE = 2;
	const MDT_VERSION = 3;
	const MDT_PNP_INFO = 4;

	let idx = start_modmetadata;
	let cnt = 0;
	let arr = [];
	while (idx < stop_modmetadata) {
		let ptr = data.getUint32(idx, true);
		let md_ver = data.getInt32(ptr, true);
		let md_type = data.getInt32(ptr + 4, true);
		let md_data = data.getUint32(ptr + 8, true);
		let md_cval = data.getUint32(ptr + 12, true);

		if (md_ver != 1) {
			throw new TypeError("metadata struct verion is not 1");
		}

		if (md_type == MDT_DEPEND) {
			let md_ver_minimum = data.getInt32(md_data, true);
			let md_ver_preferred = data.getInt32(md_data + 4, true);
			let md_ver_maximum = data.getInt32(md_data + 8, true);
			console.log("MDT_DEPEND {md_data = %d md_cval = %d}", md_data, md_cval);
			console.log("md_data {md_ver_minimum = %d md_ver_preferred = %d md_ver_maximum = %d}", md_ver_minimum, md_ver_preferred, md_ver_maximum);
		} else if (md_type == MDT_MODULE) {
			let str, strptr = data.getUint32(md_data, true);
			if (strptr != null) {
				str = UTF8ArrayToString(mem, strptr);
			} else {
				str = "";
			}

			let fnptr = data.getUint32(md_data + 4, true);
			let fname = "";
			let funcidx, fn = indirectTable[fnptr];
			if (fn && mod.names.functions.has(fn)) {
				fname = mod.names.functions.get(fn);
				funcidx = mod.functions.indexOf(fn);
			} else {
				fname = "<<NULL>>"
				funcidx = 0;
			}

			let priv = data.getUint32(md_data + 8, true);
			console.log("MDT_MODULE {md_data = %d md_cval = %d}", md_data, md_cval);
			console.log("md_data {name = '%s' evhand = %s (funcidx %d) priv = %d}", str, fname, funcidx, priv);
		} else if (md_type == MDT_VERSION) {
			let mv_version = data.getInt32(md_data, true);
			console.log("MDT_VERSION {md_data = %d md_cval = %d, mv_version = %d}", md_data, md_cval, mv_version);
		} else if (md_type == MDT_PNP_INFO) {
			console.log("MDT_PNP_INFO {md_data = %d md_cval = %d}", md_data, md_cval);
		} else {
			throw new TypeError("metadata unsupported md_type");
		}

		idx += 4;
	}
}

function inspectFreeBSDSysInit(buf, mod, mem, data) {

	let start_sysinit = mod.getGlobalByName("__start_set_sysinit_set").init[0].value;
	let stop_sysinit = mod.getGlobalByName("__stop_set_sysinit_set").init[0].value;

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
	let indirectTable = table.contents;
	/*let newtable = [undefined];
	let functions = mod.functions;
	len = oldtable.length;

	for (let i = 1; i < len; i++) {
		let funcidx = oldtable[i];
		let func = functions[funcidx];
		newtable.push(func);
	}*/

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
		let func = indirectTable[funcidx];
		let type = func.type;
		if (types.indexOf(type) == -1) {
			if (!first)
				first = type; // we make a assumetion here that our first type is correct.
			let fn = mod.names.functions.get(func);
			console.log("sysinit index = %d (init %d) funcidx (table1) = %d fn: %s added type: %o", sysinit.index, i, sysinit.funcidx, fn, type);
			types.push(type);
		} else if (type != first) {
			let fn = mod.names.functions.get(func);
			console.log("fn %s of type", fn, type);
		}
		let fname = mod.names.functions.get(func);
		sysinit.fn = fname;
		if (fname == "module_register_init") {
			let ptr = sysinit.udata;
			if (ptr !== 0) {
				let strptr = data.getUint32(ptr, true);
				let str = UTF8ArrayToString(mem, strptr);
				let fnptr = data.getUint32(ptr + 4, true);
				let func = fnptr != 0 ? indirectTable[fnptr] : 0;
				sysinit.udataText = "{" + (strptr != 0 ? "\"" + str + "\"" : strptr)  +", " + (func != 0 && mod.names.functions.has(func) ? mod.names.functions.get(func) : "0") + ", "  + data.getUint32(ptr + 8, true) +  "}";
			}
		} else if (fname == "kproc_start") {
			let ptr = sysinit.udata;
			if (ptr !== 0) {
				let strptr = data.getUint32(ptr, true);
				let str = UTF8ArrayToString(mem, strptr);
				let fnptr = data.getUint32(ptr + 4, true);
				let func = fnptr != 0 ? indirectTable[fnptr] : 0;
				sysinit.udataText = "{.arg0=" + (strptr != 0 ? "\"" + str + "\"" : strptr)  +", .main=" + (func != 0 && mod.names.functions.has(func) ? mod.names.functions.get(func) : "0") + ", "  + data.getUint32(ptr + 8, true) +  "}";
			}
		} else if (fname == "kthread_start") {
			let ptr = sysinit.udata;
			if (ptr !== 0) {
				let strptr = data.getUint32(ptr, true);
				let str = UTF8ArrayToString(mem, strptr);
				let fnptr = data.getUint32(ptr + 4, true);
				let func = fnptr != 0 ? indirectTable[fnptr] : 0;
				sysinit.udataText = "{.arg0=" + (strptr != 0 ? "\"" + str + "\"" : strptr)  +", .main=" + (func != 0 && mod.names.functions.has(func) ? mod.names.functions.get(func) : "0") + ", "  + data.getUint32(ptr + 8, true) +  "}";
			}
		}
	}

	console.log(types);

	addFreeBSDInspectorViews(mod, old);
}

class WasmSysInitTableInspectorView {

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
		table.classList.add("data-table");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>Order</th><th>Subsystem</th><th>Function</th><th>udata (addr)</th><th>udata (preview)</th></tr>";
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

		findOptions.addEventListener("change", (evt) => {
			let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			this._collection = results;
			this._pageIndex = 0;
			this.render();
		});

		findInput.addEventListener("keyup", (evt) => {
			if (evt.key == "Enter") {
				let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				this._collection = results;
				this._pageIndex = 0;
				this.render();
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
						if (item.fn && item.fn.toLowerCase().startsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.fn && item.fn.startsWith(string)) {
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
						if (item.fn && item.fn.toLowerCase().endsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.fn && item.fn.endsWith(string)) {
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
						if (item.fn && item.fn.toLowerCase().includes(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.fn && item.fn.includes(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "regexp": {
				let regexp = new Regexp(string);
				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.fn && item.fn.search(regexp)) {
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
		let arr = this._sysinit;
		let mod = this._module;
		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let sysinit = items[i];

			let tr = document.createElement("tr");
			tbody.appendChild(tr);
			let td = document.createElement("td");
			td.textContent = arr.indexOf(sysinit);
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = sysinit.ssname;
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = sysinit.fn;
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = sysinit.udata;
			tr.appendChild(td);
			td = document.createElement("td");
			if (sysinit.udataText) {
				td.textContent += sysinit.udataText;
			}
			tr.appendChild(td);
		}

		this._footer.textContent = "found " + this._collection.length + " matches";	
	}

	set sysinit(value) {
		let cpy = value.slice();
		this._defaultCollection = cpy
		this._collection = cpy;
		this._sysinit = cpy;
		this.render();
	}

	get sysinit() {
		return this._sysinit.slice();
	}
}

function addFreeBSDInspectorViews(mod, sysinit_arr) {

	let inspectContainer = document.querySelector("#wasm-modules-inspect");

	let container = document.createElement("section");
	container.classList.add("inspect-body");
	container.style.setProperty("padding-bottom", "20px");
	inspectContainer.appendChild(container);

	let h3 = document.createElement("h3");
	h3.textContent = "freeBSD sysinit";
	container.appendChild(h3);

	let view = new WasmSysInitTableInspectorView(h3, container);
	view.sysinit = sysinit_arr;
}


function postOptimizeFreeBSDKernMainAction(ctx, mod, options) {

	let opcodes = [
	    {"opcode": 0x02, "type": 64},						// block
	    {"opcode": 0x41, "value": 0}, 						// i32.const
	    {"opcode": 0x28, "offset": 10732288, "align": 2},	// i32.load  	(__curthread)
	    {"opcode": 0x41, "value": 0},						// i32.const
	    {"opcode": 0x28, "offset": 10732292, "align": 2},	// i32.load 	(__mainthread)
	    {"opcode": 0x47}, 									// i32.ne 		(should be eq)
	    {"opcode": 0x0d, "labelidx": 0}, 					// br_if
	    {"opcode": 0x41, "value": 123},						// i32.const 	(value returned)
	    {"opcode": 0x0f}, 									// return
	    {"opcode": 0x0b},									// end
	    {"opcode": 0x41, "value": 1448},					// i32.const 	(1448 should be replaced by the table index of the current funct)
	    // we need to stack our args here..
	    {"opcode": 0x10, "func": null}, 					// call
	    {"opcode": 0x41, "value": 321},						// i32.const 	(value returned)
	    {"opcode": 0x0b}									// end (end of function)
	];

	let curthrglob = mod.getGlobalByName("__curthread");
	let mainthrglob = mod.getGlobalByName("__mainthread");
	let mainthraddr = mainthrglob.init.length == 2 && mainthrglob.init[0].opcode == 0x41 && mainthrglob.init[1].opcode == 0x0B ? mainthrglob.init[0].value : undefined;

	if (!curthrglob || !mainthraddr)
		throw TypeError("both curthrglob and main thread address neded to main kernel thread dispatch");

	let kthrmain_dispatch_list = [
		"G_PART_ADD",
		"G_PART_ADD_ALIAS",
		"G_PART_BOOTCODE",
		"G_PART_CREATE",
		"G_PART_DESTROY",
		"G_PART_DUMPCONF",
		"G_PART_DUMPTO",
		"G_PART_FULLNAME",
		"G_PART_IOCTL",
		"G_PART_MODIFY",
		"G_PART_NEW_PROVIDER",
		"G_PART_RESIZE",
		"G_PART_NAME",
		"G_PART_PRECHECK",
		"G_PART_PROBE",
		"G_PART_READ",
		"G_PART_RECOVER",
		"G_PART_SETUNSET",
		"G_PART_TYPE",
		"G_PART_WRITE",
		"G_PART_GETATTR",
		"ISA_ADD_CONFIG",
		"ISA_SET_CONFIG_CALLBACK",
		"ISA_PNP_PROBE",
		"BUS_PRINT_CHILD",
		"BUS_PROBE_NOMATCH",
		"BUS_READ_IVAR",
		"BUS_WRITE_IVAR",
		"BUS_CHILD_DELETED",
		"BUS_CHILD_DETACHED",
		"BUS_DRIVER_ADDED",
		"BUS_ADD_CHILD",
		"BUS_RESCAN",
		"BUS_ALLOC_RESOURCE",
		"BUS_ACTIVATE_RESOURCE",
		"BUS_MAP_RESOURCE",
		"BUS_UNMAP_RESOURCE",
		"BUS_DEACTIVATE_RESOURCE",
		"BUS_ADJUST_RESOURCE",
		"BUS_TRANSLATE_RESOURCE",
		"BUS_RELEASE_RESOURCE",
		"BUS_SETUP_INTR",
		"BUS_TEARDOWN_INTR",
		"BUS_SUSPEND_INTR",
		"BUS_RESUME_INTR",
		"BUS_SET_RESOURCE",
		"BUS_GET_RESOURCE",
		"BUS_DELETE_RESOURCE",
		"BUS_GET_RESOURCE_LIST",
		"BUS_CHILD_PRESENT",
		"BUS_CHILD_PNPINFO",
		"BUS_CHILD_LOCATION",
		"BUS_BIND_INTR",
		"BUS_CONFIG_INTR",
		"BUS_DESCRIBE_INTR",
		"BUS_HINTED_CHILD",
		"BUS_GET_DMA_TAG",
		"BUS_GET_BUS_TAG",
		"BUS_HINT_DEVICE_UNIT",
		"BUS_NEW_PASS",
		"BUS_REMAP_INTR",
		"BUS_SUSPEND_CHILD",
		"BUS_RESUME_CHILD",
		"BUS_GET_DOMAIN",
		"BUS_GET_CPUS",
		"BUS_RESET_PREPARE",
		"BUS_RESET_POST",
		"BUS_RESET_CHILD",
		"BUS_GET_PROPERTY",
		"BUS_GET_DEVICE_PATH",
		"CLOCK_GETTIME",
		"CLOCK_SETTIME",
		"CPUFREQ_SET",
		"CPUFREQ_GET",
		"CPUFREQ_LEVELS",
		"CPUFREQ_DRV_SET",
		"CPUFREQ_DRV_GET",
		"CPUFREQ_DRV_SETTINGS",
		"CPUFREQ_DRV_TYPE",
		"DEVICE_PROBE",
		"DEVICE_IDENTIFY",
		"DEVICE_ATTACH",
		"DEVICE_DETACH",
		"DEVICE_SHUTDOWN",
		"DEVICE_SUSPEND",
		"DEVICE_RESUME",
		"DEVICE_QUIESCE",
		"DEVICE_REGISTER",
		"LINKER_LOOKUP_SYMBOL",
		"LINKER_LOOKUP_DEBUG_SYMBOL",
		"LINKER_SYMBOL_VALUES",
		"LINKER_DEBUG_SYMBOL_VALUES",
		"LINKER_SEARCH_SYMBOL",
		"LINKER_EACH_FUNCTION_NAME",
		"LINKER_EACH_FUNCTION_NAMEVAL",
		"LINKER_LOOKUP_SET",
		"LINKER_UNLOAD",
		"LINKER_CTF_GET",
		"LINKER_SYMTAB_GET",
		"LINKER_STRTAB_GET",
		"LINKER_LOAD_FILE",
		"LINKER_LINK_PRELOAD",
		"LINKER_LINK_PRELOAD_FINISH",
		"MSI_ALLOC_MSI",
		"MSI_RELEASE_MSI",
		"MSI_ALLOC_MSIX",
		"MSI_RELEASE_MSIX",
		"MSI_MAP_MSI",
		"MSI_IOMMU_INIT",
		"MSI_IOMMU_DEINIT",
		"PIC_ACTIVATE_INTR",
		"PIC_BIND_INTR",
		"PIC_DISABLE_INTR",
		"PIC_ENABLE_INTR",
		"PIC_MAP_INTR",
		"PIC_DEACTIVATE_INTR",
		"PIC_SETUP_INTR",
		"PIC_TEARDOWN_INTR",
		"PIC_POST_FILTER",
		"PIC_POST_ITHREAD",
		"PIC_PRE_ITHREAD",
		"PIC_INIT_SECONDARY",
		"PIC_IPI_SEND",
		"PIC_IPI_SETUP",
		"SERDEV_IHAND",
		"SERDEV_IPEND",
		"SERDEV_SYSDEV",
		"CRYPTODEV_PROBESESSION",
		"CRYPTODEV_NEWSESSION",
		"CRYPTODEV_FREESESSION",
		"CRYPTODEV_PROCESS",
	];
	let elementsIsDirty = false;
	let typesIsDirty = false;

	let tableidx = 0;
	let table = mod.tables[tableidx].contents;
	let dispatchTypeMap = new Map();
	let types = [];
	let maincallable = [];
	let notfound = [];
	let names = mod.names.functions;
	let map = {};
	let len = kthrmain_dispatch_list.length;
	for (let i = 0; i < len; i++) {
		let str = kthrmain_dispatch_list[i];
		let found = false;
		for (const [func, name] of names) {
			if (str == name && !(func instanceof ImportedFunction)) {
				found = true;
				let obj = {func: func, name: name};
				let idx = table.indexOf(func);
				if (idx == -1) {
					idx = makeIndirectCallable(mod, tableidx, func);
					elementsIsDirty = true;
				}
				obj.indirectIndex = idx;
				maincallable.push(obj);
				let type = func.type;
				if (types.indexOf(type) == -1)
					types.push(type);
			}
		}
		if (!found)
			notfound.push(str);
	}

	let new_imports = [];

	// mapping out the type signature required for a proxying import function. (fp, ...)
	len = types.length;
	for (let i = 0; i < len; i++) {
		let type = types[i];
		let argv = Array.isArray(type.argv) ? type.argv.slice(0) : [];
		argv.unshift(127); // unshift i32 for funcidx
		let typeidx = indexOfFuncType(mod, argv, type.retv);
		if (typeidx == -1) {
			typeidx = mod.types.length;
			let newtype = new WasmType();
	        newtype.argc = argv.length;
	        newtype.argv = argv;
	        newtype.retc = type.retc;
	        newtype.retv = Array.isArray(type.retv) ? type.retv.slice(0) : null;
	        newtype.typeidx = typeidx;
	        newtype.count = 1;
			mod.types.push(newtype);
			typesIsDirty = true;
		} else {

		}

		let dtype = mod.types[typeidx];
		let typestr = emccStyleTypeString(type);

		console.log("ftype: %d dtype: %d %s", type.typeidx, typeidx, type.toString());
		console.log("kthread_dispatch_sync_%s", typestr);

		let newfn = new ImportedFunction();
		newfn.module = "kern";
		let suffix = typestr.indexOf('_') == 1 ? typestr.replace('_', '') : typestr;
		newfn.name = "kthrmain_dispatch_sync_" + suffix;
		newfn.type = dtype;

		dispatchTypeMap.set(type, newfn);

		new_imports.push(newfn);
	}

	let lastimp = 0;
	let functions = mod.functions;
	let imports = mod.imports;
	len = imports.length;
	for (let i = 0; i < len; i++) {
		let imp = imports[i];
		if (imp instanceof ImportedFunction) {
			lastimp++;
		}
	}

	// inserts new imports into module.function
	len = new_imports.length;
	for (let i = 0; i < len; i++) {
		let imp = new_imports[i];
		functions.splice(lastimp, 0, imp);
		lastimp++;
	}

	// inserts new imports into module.imports
	len = new_imports.length;
	for (let i = 0; i < len; i++) {
		let imp = new_imports[i];
		imports.push(imp);
	}

	console.log(maincallable);
	console.log(types);
	console.log(dispatchTypeMap);
	console.log(new_imports);
	console.log(notfound);

	len = maincallable.length;
	for (let i = 0; i < len; i++) {
		let obj = maincallable[i];
		let func = obj.func;

		let dispatchfn = dispatchTypeMap.get(obj.func.type);

		let newopcodes = [];
		newopcodes.push({opcode: 0x02, type: 64});						// block
		newopcodes.push({opcode: 0x23, global: curthrglob});			// global.get  	(__curthread)
		newopcodes.push({opcode: 0x41, value: 0});						// i32.const
		newopcodes.push({opcode: 0x28, offset: mainthraddr, align: 2});	// i32.load 	(__mainthread)
		newopcodes.push({opcode: 0x46});								// i32.eq
		newopcodes.push({opcode: 0x0d, labelidx: 0});					// br_if
		newopcodes.push({opcode: 0x41, value: obj.indirectIndex});		// i32.const 	()
		
		let argc = func.type.argc;
		// insert arguments (simply forwards the arguments this call got)
		for (let z = 0; z < argc; z++) {
			// arguments are simply in the local index before those declared in the body.
			newopcodes.push({"opcode": 0x20, x: z}); // local.get
		}
		newopcodes.push({opcode: 0x10, func: dispatchfn});				// call
		newopcodes.push({opcode: 0x0f}); 								// return
		newopcodes.push({opcode: 0x0b}); 								// end

		func.opcodes.unshift.apply(func.opcodes, newopcodes);
		func._opcodeDirty = true;

		console.log(newopcodes);
	}
}

let _freebsdKernMainWorkflow = {
	name: "tinybsd 14.0 Kernel Main Binary (workflow)",
	id: "tinybsd_14_0.kern-main-binary",
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
			action: "configureBootParameters",
			options: undefined,
		}, {
			action: "postOptimizeWasm",
			options: undefined,
		}, /*{
			action: "postOptimizeFreeBSDKernMain",
			options: undefined,
		},**/{
			action: "extractDataSegments",
			options: {
				format: "wasm",
				consume: true,
			}
		}, {
			action: "configureBindingTemplate",
			options: {
				format: "javascript",
				handler: function (ctx, mod, text) {
					const threadExp = /__curthread:\s*new\s*WebAssembly\.Global\(\{[^}]*}\s*,\s*(\d{1,10})\)/gm;
					const stackExp = /__stack_pointer:\s*new\s*WebAssembly\.Global\(\{[^}]*}\s*,\s*(\d{1,10})\)/gm;
					const kenvExp = /const\s*kenv_addr\s*=\s*(\d{1,10});/gm;
					const wabpExp = /const\s*wabp_addr\s*=\s*(\d{1,10});/gm;
					const opfs_ext4_exp = /const\s*OPFS_EXT4_HEAD_ADDR\s*=\s*(\d{1,10});/gm;

					let stack_pointer = ctx.__stack_pointer;
					let thread0_st = ctx.thread0_st;
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
						return before + thread0_st.toString() + after;
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

let _freebsdKernModuleWorkflow = {
	name: "tinybsd 14.0 Kernel Module Binary (Workflow)",
	id: "tinybsd_14_0.kern-module-binary",
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
		}, {
			action: "generateModinfo",
			options: undefined,
		}, {
			action: "postOptimizeWasm",
			options: undefined,
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

let _freebsdUserBinaryWorkflow = {
	name: "tinybsd 14.0 User Binary (Workflow)",
	id: "tinybsd_14_0.user-binary",
	actions: [
		/*{
			action: "convertMemory",
			options: {
				type: "import", 	// no value leaves the type as is.
				memidx: 0,
				// min: 			// no value leaves the min as is.
				min: 1954,
				max: 1954,
				shared: true,
			}
		},*/{
			action: "postOptimizeTinybsdUserBinary",
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

let _freebsdUserBinaryForkWorkflow = {
	name: "tinybsd 14.0 User Binary with fork (Workflow)",
	id: "tinybsd_14_0.user-binary+fork",
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
			action: "postOptimizeTinybsdUserBinary",
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

class TinyBSDBinaryInfoSection {

	constructor() {
		this.default_stack_pointer = 0;
		this.default_stack_size = 0;
	}

	static decode() {
		let keys = ["default_stack_pointer", "default_stack_size"];
	}

	// for now this is basically a embedded JSON object.
	encode(module) {
		const CUSTOM_SEC_SIGN = "tinybsd.wasm_imgact";
		let secsz, totsz = 0;
		let objstr = JSON.stringify(this, null, 2);
	    let objstrsz = lengthBytesUTF8(objstr);

	    totsz += objstrsz;
	    let strlen = lengthBytesUTF8(CUSTOM_SEC_SIGN);
	    totsz += lengthULEB128(strlen);
	    totsz += strlen;
	    secsz = totsz;
	    totsz += lengthULEB128(totsz);

	        // actual encdong
	    let buf = new ArrayBuffer(totsz + 1);
	    let data = new ByteArray(buf);
	    data.writeUint8(SECTION_TYPE_CUSTOM);
	    data.writeULEB128(secsz);
	    data.writeULEB128(strlen);
	    data.writeUTF8Bytes(CUSTOM_SEC_SIGN);
	    data.writeUTF8Bytes(objstr);

	    return buf;
	}
}

function postOptimizeTinybsdUserBinary(ctx, mod) {

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
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE00, 0, 0);
				return true;
			}
		}, {
			name: "atomic_wait32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE01, 0, 0);
				return true;
			}
		}, {
			name: "wasm_atomic_fence",
			replace: function(inst, index, arr) {
				return {opcode: 0xFE03, memidx: 0};
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
				arr[index] = new AtomicInst(0xFE13, 0, 0);
				return true;
			}
		}, {
			name: "atomic_store16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE1A, 0, 0);
				return true;
			}
		}, {
			name: "atomic_add16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE21, 0, 0);
				return true;
			}
		}, {
			name: "atomic_sub16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE28, 0, 0);
				return true;
			}
		}, {
			name: "atomic_and16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE2F, 0, 0);
				return true;
			}
		},{
			name: "atomic_or16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE36, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xor16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE3D, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xchg16",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE44, 0, 0);
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
				arr[index] = new AtomicInst(0xFE10, 0, 0);
				return true;
			}
		}, {
			name: "atomic_store32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE17, 0, 0);
				return true;
			}
		}, {
			name: "atomic_add32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE1E, 0, 0);
				return true;
			}
		}, {
			name: "atomic_sub32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE25, 0, 0);
				return true;
			}
		}, {
			name: "atomic_and32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE2C, 0, 0);
				return true;
			}
		},{
			name: "atomic_or32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE33, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xor32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE3A, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xchg32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE41, 0, 0);
				return true;
			}
		}, {
			name: "atomic_cmpxchg32",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE48, 0, 0);
				return true;
			}
		}, {
			name: "atomic_wait64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE02, 0, 0);
				return true;
			}
		}, {
			name: "atomic_load64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE11, 0, 0);
				return true;
			}
		}, {
			name: "atomic_store64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE18, 0, 0);
				return true;
			}
		}, {
			name: "atomic_add64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE1F, 0, 0);
				return true;
			}
		}, {
			name: "atomic_sub64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE26, 0, 0);
				return true;
			}
		}, {
			name: "atomic_and64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE2D, 0, 0);
				return true;
			}
		}, {
			name: "atomic_or64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE34, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xor64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE3B, 0, 0);
				return true;
			}
		}, {
			name: "atomic_xchg64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE42, 0, 0);
				return true;
			}
		},{
			name: "atomic_cmpxchg64",
			replace: function(inst, index, arr) {
				arr[index] = new AtomicInst(0xFE49, 0, 0);
				return true;
			}
		}, { 							// memory operations.
			name: "memcpy",
			replace: memcpyReplaceHandler
		}, {
			name: "__memcpy",
			replace: memcpyReplaceHandler
		}, {
			name: "memcpy_early",
			replace: memcpyReplaceHandler
		}/*, {
			name: "memset",
			// replacing memset vs. memory.fill is where it gets complicated, memset returns which the 
			// memory.fill instruction does not. check for drop instruction but if not found we must fake
			// the return of memset 
			replace: function(inst, index, arr) {
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

	let funcmap = new Map();
	let names = [];
	let ylen = inst_replace.length;
	for (let y = 0; y < ylen; y++) {
		let handler = inst_replace[y];
		names.push(handler.name);
	}

	
	let functions = mod.functions;
	ylen = functions.length;
	for (let y = 0; y < ylen; y++) {
		let idx, name, func = functions[y];
		if (typeof func[__nsym] != "string")
			continue;
		name = func[__nsym];
		idx = names.indexOf(name);
		if (idx === -1)
			continue;
		let handler = inst_replace[idx];
		handler.func = func;
		handler.count = 0;
		funcmap.set(name, handler);
	}


	// run trough all WebAssembly code to find call-sites where we call funcidx
	let start = 0;
	for (let y = 0; y < ylen; y++) {
		let func = functions[y];
		if (!(func instanceof ImportedFunction)) {
			start = y;
			break;
		}
	}

	for (let y = start; y < ylen; y++) {
		let func = functions[y];
		let opcodes = func.opcodes;
		// NOTE: don't try to optimize the opcodes.length, handlers might alter instructions around them.
		for (let x = 0; x < opcodes.length; x++) {
			let op = opcodes[x];
			if (op.opcode == 0x10) {
				if (funcmap.has(op.func)) {
					let handler = funcmap.get(op.func);
					handler.count++;
					let res = handler.replace(op, x, opcodes);
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

	// below is the convertion of globals.

	{
		let glob = mod.getGlobalByName("__stack_pointer");
		console.log("%s = %d", name, glob.init[0].value);
		ctx.__stack_pointer = glob.init[0].value; // store it for later use.
	}

	let sections = mod.findSections("tinybsd.wasm_imgact");
	if (sections.length == 0) {
		let sec = new TinyBSDBinaryInfoSection();
		mod.sections.push({type: 0x00, name: "tinybsd.wasm_imgact", data: sec, offset: 0, size: 0, dataOffset: 0, _isDirty: true});
		
		let stackptr = ctx.__stack_pointer;
		let dataMax = mod.computeInitialMemoryMaxAddress();
		let stacksz = stackptr - dataMax
		sec.default_stack_pointer = stackptr;
		sec.default_stack_size = stacksz;
	} else {
		let chunk = sections[0];
		let sec = new TinyBSDBinaryInfoSection();
		chunk.data = sec;
		chunk.offset = 0;
		chunk.size = 0;
		chunk.dataOffset = 0;
		chunk._isDirty = true;
		
		let stackptr = ctx.__stack_pointer;
		let dataMax = mod.computeInitialMemoryMaxAddress();
		let stacksz = stackptr - dataMax
		sec.default_stack_pointer = stackptr;
		sec.default_stack_size = stacksz;
	}


	let g1 = mod.getGlobalByName("__stack_pointer");
	let g2 = new ImportedGlobal();
	g2.module = "kern";
	g2.name = "__stack_pointer";
	g2.type = g1.type;
	g2.mutable = g1.mutable;
	mod.replaceGlobal(g1, g2, true);
	mod.imports.unshift(g2);
	mod.removeExportFor(g1);

	let section = mod.findSection(SECTION_TYPE_IMPORT);
	if (section)
		section.markDirty();

	section = mod.findSection(SECTION_TYPE_EXPORT);
	if (section)
		section.markDirty();

	section = mod.findSection(SECTION_TYPE_GLOBAL);
	if (section)
		section.markDirty();

	console.log(funcmap);
}

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

function postOptimizeTinybsdUserBinaryAction(ctx, mod, options) {
	return postOptimizeTinybsdUserBinary(ctx, mod);
}

function postOptimizeWasmAction(ctx, mod, options) {
	return postOptimizeWasm(ctx, mod);
}

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

const freebsd_ext = {
    name: "FreeBSD Extension",
    flowActions: [{
        name: "postOptimizeFreeBSDKernMain",
        handler: postOptimizeFreeBSDKernMain,
    }, {
        name: "postOptimizeTinybsdUserBinary",
        handler: postOptimizeTinybsdUserBinaryAction
    }, {
        name: "postOptimizeWasm",
		handler: postOptimizeWasmAction
	},
    ],
    flowTemplates: [_freebsdUserBinaryForkWorkflow, _freebsdUserBinaryWorkflow, _freebsdKernModuleWorkflow, _freebsdKernMainWorkflow],
    uiInspect: [{
        handle: function(wasmModule) {
            return false;
        }
    }]
};

export default freebsd_ext;
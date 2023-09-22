
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

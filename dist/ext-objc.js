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
	 
	let mem = mod.computeInitialMemory(mod.memory[0], true);
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
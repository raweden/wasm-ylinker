// start of Objective-C inspect

// out of range errors thrown are due to .bss not being included unless --import-memory is set.
function inspectObjectiveC(mod, buf) {

	let objcSectionNames = ["__objc_selectors", "__objc_protocols", "__objc_class_refs", "__objc_classes", "__objc_constant_string", "__objc_protocol_refs", "__objc_cats", "__objc_class_aliases"];
	let objc_segments = [];
	let fntable = mod.tables[0].contents;
	let map = {};

	let dataSegments = mod.dataSegments;

	let len = dataSegments.length;
	for (let i = 0; i < len; i++) {
		let segment = dataSegments[i];
		let name = segment[__nsym];
		if (typeof name != "string" || objcSectionNames.indexOf(name) == -1)
			continue;

		let opcodes = segment.inst.opcodes;
		let start = opcodes.length == 2 && opcodes[0].opcode == 0x41 && opcodes[1].opcode == 0x0B ? opcodes[0].value : undefined;
		let obj = {};
		obj.index = i;
		obj.name = name;
		obj.start = start;
		obj.segment = segment;
		obj.size = segment.size;
		objc_segments.push(obj);
		map[name] = obj;
	}
	 
	let mem = mod.computeInitialMemory(mod.memory[0], false);
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
			method.func = Number.isInteger(imp) && imp > 0 ? fntable[imp] : null;
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

		console.log("Objective-C Selectors");
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

		console.log("Objective-C Protocols");
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

		console.log("Objective-C class references");
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

		console.log("Objective-C Classes");
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

		console.log("Objective-C Categories");
		console.log(objc_cats);
	}

	console.log(mem);

}

// replace IMP
// 
// by naming:
// 
// _c_NSColor__initialize 
// _i_PasteboardData__checkConnection_
// 
// by anything linked trough IMP in classes
// 
// 
// And impl in libobjc2
// 
// nil_method 		= 64-bit int return
// nil_method_D  	= 128-bit float (long double) not supported
// nil_method_d 	= 64-bit float
// nil_method_f 	= 32-bit float
// 
// 
// replace message dispatch:
// 
// objc_msgSend_v*
// 
// 
// implement
// 
// _objc_msgSend
// _objc_msgSend_fpret
// _objc_msgSend_stret
// 
// using wasm instruction and have return type optimized versions.
// 
// libobjc2/Source/objc_msgSend.x86-32.S
// 
// find and manipulate argument and type signature for objc_msg_lookup_super call-sites
// 
// find any invokation of [object methodForSelector:@selector(name)] 
// 
// 
// find super call-sites:
// 
// objc_msg_lookup_super
// 
// 
// what about **objc_msg_lookup_sender**
// 
// 
// special:
// 
// ___forwarding___
// 
// variadic objc:
// 
// _c_NSArray__arrayWithObjects_
// _i_NSArray__initWithObjects_
// _i_GSMutableString__appendFormat_
// _i_NSAssertionHandler__handleFailureInFunction_file_lineNumber_description_
// _i_NSAssertionHandler__handleFailureInMethod_object_file_lineNumber_description_
// _i_NSCoder__encodeValuesOfObjCTypes_
// _i_NSCoder__decodeValuesOfObjCTypes_
// _i_NSDictionary__initWithObjectsAndKeys_
// _c_NSDictionary__dictionaryWithObjectsAndKeys_
// _i_NSException__raise_format_
// _i_NSObject_error_
// _c_NSOrderedSet__orderedSetWithObjects_count_
// _i_NSOrderedSet__initWithObjects_
// _c_NSPredicate__predicateWithFormat_
// _c_NSSet__setWithObjects_
// _i_NSSet__initWithObjects_
// _c_NSString__stringWithFormat_
// _i_NSString__initWithFormat_
// _i_NSString__initWithFormat_locale_
// _i_NSString__stringByAppendingFormat_
// _c_NSString__localizedStringWithFormat
// _c_NSString__stringWithFormat_
// _i_NSString__appendFormat_
// _i_AGSParser__log_
// _c_NSAlert__alertWithMessageText_defaultButton_alternateButton_otherButton_informativeTextWithFormat_
// _i_NSGradient__initWithColorsAndLocations_
// _i_XCAbstractDelegate__postMessage_
// 

// end of Objective-C inspect

// replaces standard named mathimatical function with wasm opcode equal.
const objc_op_replace_map = [
	{ 	// math operations
		name: "objc_msgSend",
		// no-type check
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9b};
			return true;
		}
	}, {
		name: "objc_msg_lookup_super",
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9c};
			return true;
		}
	}, {
		name: "objc_indirect_callsite",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x99};
			return true;
		}
	}, { 	// f32 math operations
		name: "ceilf",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x8d};
			return true;
		}
	}, {
		name: "floorf",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x8e};
			return true;
		}
	},

	// isnan = https://webassembly.github.io/spec/core/exec/numerics.html#aux-fbits
];

const objc_cimp_methods = [
	"nil_method",
	"nil_method_D",
	"nil_method_d",
	"nil_method_f",
	"deallocHiddenClass",
];

// objective-c special handlers
function objc_imp_variadic_handler() {

}

function objc_imp_forwarding_handler() {

}

const objc_special_imp_keys = [];
const objc_special_imp_data = [{
	name: "_c_NSArray__arrayWithObjects_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSArray__initWithObjects_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_GSMutableString__appendFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSAssertionHandler__handleFailureInFunction_file_lineNumber_description_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSAssertionHandler__handleFailureInFunction_file_lineNumber_description_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSAssertionHandler__handleFailureInMethod_object_file_lineNumber_description_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSCoder__encodeValuesOfObjCTypes_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSCoder__decodeValuesOfObjCTypes_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSDictionary__initWithObjectsAndKeys_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSDictionary__dictionaryWithObjectsAndKeys_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSException__raise_format_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSObject_error_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSOrderedSet__orderedSetWithObjects_count_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSOrderedSet__initWithObjects_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSPredicate__predicateWithFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSSet__setWithObjects_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSSet__initWithObjects_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSString__stringWithFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSString__initWithFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSString__initWithFormat_locale_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSString__stringByAppendingFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSString__localizedStringWithFormat",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSString__stringWithFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSString__appendFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_AGSParser__log_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_c_NSAlert__alertWithMessageText_defaultButton_alternateButton_otherButton_informativeTextWithFormat_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_NSGradient__initWithColorsAndLocations_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "_i_XCAbstractDelegate__postMessage_",
	handler: objc_imp_variadic_handler,
	options: {
		v_index: -1,
	},
	name: "___forwarding___",
	handler: objc_imp_forwarding_handler, // replace with *.wat implementation.
}];


function objc_optimize_objc_msgSend(ctx, module, options) {
	console.log(module);

	/*
	call objc_msg_lookup_super  	;; this type of super calls cannot be used with a uniform arguments array
  	call_indirect tableidx=0 		;; 
	 */
	let narr = [];
	let nmap = {};
	let funcs = module.functions;
	let impfns = [];
	let msgfns = [];
	let indirscopes = [];
	let objc_msg_map = new Map();
	let supermsg = null;
	let indirmsg = null;
	let slowMsgLookup = null;
	let __objc_indir = Symbol("@objc_indirect");
	let __objc_callfsz = Symbol("@objc_callframe_sz");

	// WasmType
	let type_void = null;
	let type_i32 = null;
	let type_i64 = null;
	let type_f32 = null;
	let type_f64 = null;

	// objc_msgSend variants
	let msgSend_void = null;
	let msgSend_i32 = null;
	let msgSend_i64 = null;
	let msgSend_f32 = null;
	let msgSend_f64 = null;

	let len = objc_special_imp_data.length;
	for (let i = 0; i < len; i++) {
		let data = objc_special_imp_data[i];
		let name = data.name;
		if (narr.indexOf(name) !== -1) {
			console.error("duplicate special entry");
		}
		narr.push(name);
		nmap[name] = data;
	}
	
	function getOrCreateObjcMsgSendMethod(orgfn) {

		let name = orgfn[__nsym];
		if (name.endsWith("_fpret") || name.endsWith("_stret")) { // _stret_ is in the middle
			console.error("found unsupported objc_msgSend variant fp/stret");
			return null;
		}

		let repl = null;
		let retv = orgfn.type.retc == 0 ? WA_TYPE_VOID : orgfn.type.retv[0];
		switch (retv) {
			case WA_TYPE_VOID:
				repl = msgSend_void;
				break;
			case WA_TYPE_I32:
				repl = msgSend_i32;
				break;
			case WA_TYPE_I64:
				repl = msgSend_i64;
				break;
			case WA_TYPE_F32:
				repl = msgSend_f32;
				break;
			case WA_TYPE_F64:
				repl = msgSend_f64;
				break;
			default:
				console.error("retv %d not supported", retv);
				return null;
		}

		if (repl !== null) {
			return repl;
		}

		let lself = new WasmLocal(WA_TYPE_I32);
		let lsel = new WasmLocal(WA_TYPE_I32);
		let largc = new WasmLocal(WA_TYPE_I32);
		let largv = new WasmLocal(WA_TYPE_I32);
		let type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], retv);
		let fn = new WasmFunction();
		module.functions.push(fn);
		fn[__nsym] = "objc_msgSend_" + type_name(retv);
		fn.narg = 4;
		fn.locals = [lself, lsel, largc, largv];
		fn.type = type;
		let inst, ins = [];
		fn.opcodes = ins;
		inst = new BlockInst(0x02);
		inst.type = 64;
		ins.push(inst);
		ins.push({opcode: 0x20, local: lself});	// local.get
		ins.push({opcode: 13, labelidx: 0});	// br_if
		if (retv == WA_TYPE_I32) {
			ins.push({opcode: 0x41, value: 0});		// i32.const
		} else if (retv == WA_TYPE_I64) {
			ins.push({opcode: 0x42, value: 0n});	// i64.const
		} else if (retv == WA_TYPE_F32) {
			ins.push({opcode: 0x43, value: 0});		// f32.const
		} else if (retv == WA_TYPE_F64) {
			ins.push({opcode: 0x44, value: 0});		// f64.const
		}
		ins.push(new ReturnInst(15));			// 
		ins.push({opcode: 11});					// end

		ins.push({opcode: 0x20, local: lself});		// local.get
		ins.push({opcode: 0x20, local: lsel});		// local.get
		ins.push({opcode: 0x20, local: largc});		// local.get
		ins.push({opcode: 0x20, local: largv});		// local.get

		// TODO: add option to do asm like inline lookup here!
		ins.push({opcode: 0x20, local: lself});			// local.get
		ins.push({opcode: 0x20, local: lsel});			// local.get
		ins.push(new CallInst(0x10, slowMsgLookup));	// call

		// TODO: do type lookup into vector of type in relation to __indirect_table
		ins.push(new IndirectCallInst(0x11, module.tables[0], type));

		ins.push({opcode: 11});					// end

		switch (retv) {
			case WA_TYPE_VOID:
				msgSend_void = fn;
				break;
			case WA_TYPE_I32:
				msgSend_i32 = fn;
				break;
			case WA_TYPE_I64:
				msgSend_i64 = fn;
				break;
			case WA_TYPE_F32:
				msgSend_f32 = fn;
				break;
			case WA_TYPE_F64:
				msgSend_f64 = fn;
				break;
			default:
				console.error("retv %d not supported", retv);
				return null;
		}


		return fn;
	}

	function compareInst(i1, i2) {

		if (i1.opcode != i2.opcode) {
			return false;
		}

        let op_code = i1.opcode;
        switch (op_code) {
            case 0x00: // unreachable
            case 0x01: // nop           [] -> []
                return true;
            case 0x02: // block         [t1] -> [t2]
            case 0x03: // loop          [t1] -> [t2]
            case 0x04: // if <inst> 0x0B || if <inst> 0x05 <inst> 0x0B [t1 i32] -> [t2]
            {
                if (i1.type != i2.type) {
                	return false;
                }
                break;
            }
            case 0x05: // else <inst> 0x0B
            	return true;
            // https://github.com/WebAssembly/exception-handling/blob/main/proposals/exception-handling/Exceptions.md#control-flow-operators
            // changes to binary format: https://github.com/WebAssembly/exception-handling/blob/main/proposals/exception-handling/Exceptions.md#tag-index-space
            case 0x06: // try bt
            {
                if (i1.type != i2.type) {
                	return false;
                }
                break;
            }
            case 0x19: // catch_all
            	return true;
            case 0x07: // catch x
            case 0x08: // throw x
            {
                if (i1.tagidx != i2.tagidx) {
                    return false;
                }
                break;
            }
            case 0x18: // delegate rd
            case 0x09: // rethrow rd
            {
                if (i1.relative_depth != i2.relative_depth) {
                    return false;
                }
                break;
            }

            case 0x0C: // br l
            case 0x0D: // br_if l
            case 0x0E: // br_table l* l [t1 t* i32] -> [t2]
            {
                if (i1.labelidx != i2.labelidx) {
                    return false;
                }
                break;
            }
            case 0x0F: // return        [t1 t*] -> [t2]
                opcodes.push(new ReturnInst(op_code));
                break;
            case 0x10: // call          [t1] -> [t2]
            {
                if (i1.func != i2.func) {
                    return false;
                }
                break;
            }
            case 0x11: // call_indirect [t1 i32] -> [t2]
            {
                if (i1.table != i2.table || i1.type != i2.type) {
                    return false;
                }
                break;
            }
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
            // return_call          0x12    [t3* t1*] -> [t4*]
            // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
            case 0x41: // i32.const     [] -> [i32]
                if (i1.value != i2.value) {
                    return false;
                }
                break;
            case 0x42: // i64.const     [] -> [i64]
                if (i1.value != i2.value) {
                    return false;
                }
                break;
            case 0x43: // f32.const     [] -> [f32]
            	if (i1.value != i2.value) {
                    return false;
                }
                break;
            case 0x44: // f64.const     [] -> [f64]
                if (i1.value != i2.value) {
                    return false;
                }
                break;
            case 0x0b: // end
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md#binary-format
            // 0x12 return_call
            // 0x13 return_call_indirect
            case 0x1A: // drop              [t] -> []
            case 0x1B: // select            [t t i32] -> [t]
                return true;
            case 0x1C: // select t* :vec(valtype) [t t i32] -> [t]
                opcodes.push({opcode: op_code});
                break;
            case 0x20: // local.get         [] -> [t]
            case 0x21: // local.set         [t] -> []
            case 0x22: // local.tee         [t] -> [t]
            {
                if (i1.local != i2.local) {
                    return false;
                }
                break;
            }
            case 0x23: // global.get        [] -> [t]
            case 0x24: // global.set        [t] -> []
            {
                if (i1.global != i2.global) {
                    return false;
                }
                break;
            }
            case 0x25: // table.get         [i32] -> [t]
            case 0x26: // table.set         [i32 t] -> []
            {
                if (i1.table != i2.table) {
                    return false;
                }
                break;
            }
            case 0x28: // i32.load          [i32] -> [i32]
            case 0x29: // i64.load          [i32] -> [i64]
            case 0x2a: // f32.load          [i32] -> [f32]
            case 0x2b: // f64.load          [i32] -> [f64]
            case 0x2c: // i32.load8_s       [i32] -> [i32]
            case 0x2d: // i32.load8_u       [i32] -> [i32]
            case 0x2e: // i32.load16_s      [i32] -> [i32]
            case 0x2f: // i32.load16_u      [i32] -> [i32]
            case 0x30: // i64.load8_s       [i32] -> [i64]
            case 0x31: // i64.load8_u       [i32] -> [i64]
            case 0x32: // i64.load16_s      [i32] -> [i64]
            case 0x33: // i64.load16_u      [i32] -> [i64]
            case 0x34: // i64.load32_s      [i32] -> [i64]
            case 0x35: // i64.load32_u      [i32] -> [i64]
            case 0x36: // i32.store         [i32] -> []
            case 0x37: // i64.store         [i32] -> []
            case 0x38: // f32.store         [i32] -> []
            case 0x39: // f64.store         [i32] -> []
            case 0x3a: // i32.store8        [i32] -> []
            case 0x3b: // i32.store16       [i32] -> []
            case 0x3c: // i64.store8        [i32] -> []
            case 0x3d: // i64.store16       [i32] -> []
            case 0x3e: // i64.store32       [i32] -> []
            {
                if (i1.offset != i2.offset || i1.align != i2.align) {
                    return false;
                }
                break;
            }
            case 0x3f: // memory.size 0x00   [] -> [i32]
            {
                if (i1.memidx != i2.memidx) {
                    return false;
                }
                break;
            }
            case 0x40: // memory.grow 0x00   [i32] -> []
            {
            	if (i1.memidx != i2.memidx) {
                    return false;
                }
                break
            }
            case 0x45: // i32.eqz       [i32] -> [i32]
            case 0x46: // i32.eq        [i32 i32] -> [i32]
            case 0x47: // i32.ne        [i32 i32] -> [i32]
            case 0x48: // i32.lt_s      [i32 i32] -> [i32]
            case 0x49: // i32.lt_u      [i32 i32] -> [i32]
            case 0x4a: // i32.gt_s      [i32 i32] -> [i32]
            case 0x4b: // i32.gt_u      [i32 i32] -> [i32]
            case 0x4c: // i32.le_s      [i32 i32] -> [i32]
            case 0x4d: // i32.le_u      [i32 i32] -> [i32]
            case 0x4e: // i32.ge_s      [i32 i32] -> [i32]
            case 0x4f: // i32.ge_u      [i32 i32] -> [i32]

            case 0x50: // i64.eqz       [i64] -> [i32]
            case 0x51: // i64.eq        [i64 i64] -> [i32]
            case 0x52: // i64.ne        [i64 i64] -> [i32]
            case 0x53: // i64.lt_s      [i64 i64] -> [i32]
            case 0x54: // i64.lt_u      [i64 i64] -> [i32]
            case 0x55: // i64.gt_s      [i64 i64] -> [i32]
            case 0x56: // i64.gt_u      [i64 i64] -> [i32]
            case 0x57: // i64.le_s      [i64 i64] -> [i32]
            case 0x58: // i64.le_u      [i64 i64] -> [i32]
            case 0x59: // i64.ge_s      [i64 i64] -> [i32]
            case 0x5a: // i64.ge_u      [i64 i64] -> [i32]

            case 0x5b: // f32.eq        [f32 f32] -> [i32]
            case 0x5c: // f32.ne        [f32 f32] -> [i32]
            case 0x5d: // f32.lt        [f32 f32] -> [i32]
            case 0x5e: // f32.gt        [f32 f32] -> [i32]
            case 0x5f: // f32.le        [f32 f32] -> [i32]
            case 0x60: // f32.ge        [f32 f32] -> [i32]

            case 0x61: // f64.eq        [f64 f64] -> [i32]
            case 0x62: // f64.ne        [f64 f64] -> [i32]
            case 0x63: // f64.lt        [f64 f64] -> [i32]
            case 0x64: // f64.gt        [f64 f64] -> [i32]
            case 0x65: // f64.le        [f64 f64] -> [i32]
            case 0x66: // f64.ge        [f64 f64] -> [i32]

            case 0x67: // i32.clz       [i32] -> [i32]
            case 0x68: // i32.ctz       [i32] -> [i32]
            case 0x69: // i32.popcnt    [i32] -> [i32]
            case 0x6a: // i32.add       [i32 i32] -> [i32]
            case 0x6b: // i32.sub       [i32 i32] -> [i32]
            case 0x6c: // i32.mul       [i32 i32] -> [i32]
            case 0x6d: // i32.div_s     [i32 i32] -> [i32]
            case 0x6e: // i32.div_u     [i32 i32] -> [i32]
            case 0x6f: // i32.rem_s     [i32 i32] -> [i32]
            case 0x70: // i32.rem_u     [i32 i32] -> [i32]
            case 0x71: // i32.and       [i32 i32] -> [i32]
            case 0x72: // i32.or        [i32 i32] -> [i32]
            case 0x73: // i32.xor       [i32 i32] -> [i32]
            case 0x74: // i32.shl       [i32 i32] -> [i32]
            case 0x75: // i32.shr_s     [i32 i32] -> [i32]
            case 0x76: // i32.shr_u     [i32 i32] -> [i32]
            case 0x77: // i32.rotl      [i32 i32] -> [i32]
            case 0x78: // i32.rotr      [i32 i32] -> [i32]

            case 0x79: // i64.clz       [i64] -> [i64]
            case 0x7a: // i64.ctz       [i64] -> [i64]
            case 0x7b: // i64.popcnt    [i64] -> [i64]
            case 0x7c: // i64.add       [i64 i64] -> [i64]
            case 0x7d: // i64.sub       [i64 i64] -> [i64]
            case 0x7e: // i64.mul       [i64 i64] -> [i64]
            case 0x7f: // i64.div_s     [i64 i64] -> [i64]
            case 0x80: // i64.div_u     [i64 i64] -> [i64]
            case 0x81: // i64.rem_s     [i64 i64] -> [i64]
            case 0x82: // i64.rem_u     [i64 i64] -> [i64]
            case 0x83: // i64.and       [i64 i64] -> [i64]
            case 0x84: // i64.or        [i64 i64] -> [i64]
            case 0x85: // i64.xor       [i64 i64] -> [i64]
            case 0x86: // i64.shl       [i64 i64] -> [i64]
            case 0x87: // i64.shr_s     [i64 i64] -> [i64]
            case 0x88: // i64.shr_u     [i64 i64] -> [i64]
            case 0x89: // i64.rotl      [i64 i64] -> [i64]
            case 0x8a: // i64.rotr      [i64 i64] -> [i64]

            case 0x8b: // f32.abs       [f32] -> [f32]
            case 0x8c: // f32.neg       [f32] -> [f32]
            case 0x8d: // f32.ceil      [f32] -> [f32]
            case 0x8e: // f32.floor     [f32] -> [f32]
            case 0x8f: // f32.trunc     [f32] -> [f32]
            case 0x90: // f32.nearest   [f32] -> [f32]
            case 0x91: // f32.sqrt      [f32] -> [f32]
            case 0x92: // f32.add       [f32 f32] -> [f32]
            case 0x93: // f32.sub       [f32 f32] -> [f32]
            case 0x94: // f32.mul       [f32 f32] -> [f32]
            case 0x95: // f32.div       [f32 f32] -> [f32]
            case 0x96: // f32.min       [f32 f32] -> [f32]
            case 0x97: // f32.max       [f32 f32] -> [f32]
            case 0x98: // f32.copysign  [f32 f32] -> [f32]

            case 0x99: // f64.abs       [f64] -> [f64]
            case 0x9a: // f64.neg       [f64] -> [f64]
            case 0x9b: // f64.ceil      [f64] -> [f64]
            case 0x9c: // f64.floor     [f64] -> [f64]
            case 0x9d: // f64.trunc     [f64] -> [f64]
            case 0x9e: // f64.nearest   [f64] -> [f64]
            case 0x9f: // f64.sqrt      [f64] -> [f64]
            case 0xA0: // f64.add       [f64 f64] -> [f64]
            case 0xA1: // f64.sub       [f64 f64] -> [f64]
            case 0xA2: // f64.mul       [f64 f64] -> [f64]
            case 0xA3: // f64.div       [f64 f64] -> [f64]
            case 0xA4: // f64.min       [f64 f64] -> [f64]
            case 0xA5: // f64.max       [f64 f64] -> [f64]
            case 0xA6: // f64.copysign  [f64 f64] -> [f64]

            case 0xA7: // i32.wrap_i64          [i64] -> [i32]
            case 0xA8: // i32.trunc_f32_s       [f32] -> [i32]
            case 0xA9: // i32.trunc_f32_u       [f32] -> [i32]
            case 0xAA: // i32.trunc_f64_s       [f64] -> [i32]
            case 0xAB: // i32.trunc_f64_u       [f64] -> [i32]
            case 0xAC: // i64.extend_i32_s      [i32] -> [i64]
            case 0xAD: // i64.extend_i32_u      [i32] -> [i64]
            case 0xAE: // i64.trunc_f32_s       [f32] -> [i64]
            case 0xAF: // i64.trunc_f32_u       [f32] -> [i64]
            case 0xB0: // i64.trunc_f64_s       [f64] -> [i64]
            case 0xB1: // i64.trunc_f64_u       [f64] -> [i64]
            case 0xB2: // f32.convert_i32_s     [i32] -> [f32]
            case 0xB3: // f32.convert_i32_u     [i32] -> [f32]
            case 0xB4: // f32.convert_i64_s     [i64] -> [f32]
            case 0xB5: // f32.convert_i64_u     [i64] -> [f32]
            case 0xB6: // f32.demote_f64        [f64] -> [f32]
            case 0xB7: // f64.convert_i32_s     [i32] -> [f64]
            case 0xB8: // f64.convert_i32_u     [i32] -> [f64]
            case 0xB9: // f64.convert_i64_s     [i64] -> [f64]
            case 0xBA: // f64.convert_i64_u     [i64] -> [f64]
            case 0xBB: // f64.promote_f32       [f32] -> [f64]
            case 0xBC: // i32.reinterpret_f32   [f32] -> [i32]
            case 0xBD: // i64.reinterpret_f64   [f64] -> [i64]
            case 0xBE: // f32.reinterpret_i32   [i32] -> [f32]
            case 0xBF: // f64.reinterpret_i64   [i64] -> [f64]

            case 0xC0: // i32.extend8_s         [i32] -> [i32]
            case 0xC1: // i32.extend16_s        [i32] -> [i32]
            case 0xC2: // i64.extend8_s         [i64] -> [i64]
            case 0xC3: // i64.extend16_s        [i64] -> [i64]
            case 0xC4: // i64.extend32_s        [i64] -> [i64]
                return true;
            case 0xD0: // ref.null t    [] -> [t]
                if (i1.reftype != i2.reftype) {
                    return false;
                }
                break;
            case 0xD1: // ref.is_null   [t] -> [i32]
                return true;
            case 0xD2: // ref.func x    [] -> [funcref]
            {
                if (i1.func != i2.func) {
                    return false;
                }
                break;
            }
            case 0xfc:
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case  0: // i32.trunc_sat_f32_s     [f32] -> [i32]
                    case  1: // i32.trunc_sat_f32_u     [f32] -> [i32]
                    case  2: // i32.trunc_sat_f64_s     [f64] -> [i32]
                    case  3: // i32.trunc_sat_f64_u     [f64] -> [i32]
                    case  4: // i64.trunc_sat_f32_s     [f32] -> [i64]
                    case  5: // i64.trunc_sat_f32_u     [f32] -> [i64]
                    case  6: // i64.trunc_sat_f64_s     [f64] -> [i64]
                    case  7: // i64.trunc_sat_f64_u     [f64] -> [i64]
                        return true;
                    case  8: // memory.init             [i32 i32 i32] -> []
                    {
                        if (i1.dataSegment != i2.dataSegment) {
                    		return false;
                    	}
                        break;
                    }
                    case  9: // data.drop               [] -> []
                    {
                        if (i1.dataSegment != i2.dataSegment) {
                    		return false;
                    	}
                        break;
                    }
                    case 10: // memory.copy 0x00 0x00   [i32 i32 i32] -> []
                    {
                    	if (i1.memidx1 != i2.memidx1 || i1.memidx2 != i2.memidx2) {
                    		return false;
                    	}
                        break;
                    }
                    case 11: // memory.fill 0x00        [i32 i32 i32] -> []
                    {
                        if (i1.memidx != i2.memidx) {
                    		return false;
                    	}
                        break;
                    }
                    //
                    case 12: // table.init              [i32 i32 i32] -> []
                    {
                        if (i1.table != i2.table || i1.elem != i2.elem) {
                    		return false;
                    	}
                        break;
                    }
                    case 13: // elem.drop               [] -> []
                    {
                        if (i1.elem != i2.elem) {
                    		return false;
                    	}
                        break;
                    }
                    case 14: // table.copy x y          [i32 i32 i32] -> []
                    {
                        if (i1.table1 != i2.table1 || i1.table2 != i2.table2) {
                    		return false;
                    	}
                        break;
                    }
                    case 15: // table.grow              [t i32] -> [i32]
                    case 16: // table.size              [] -> [i32]
                    case 17: // table.fill              [i32 t i32] -> []
                    {
                    	if (i1.table != i2.table) {
                    		return false;
                    	}
                        break;
                    }
                }
                break;
            }

            case 0xFD: // multi-byte sequence
            {
               	console.error("multi-byte sequence instruction compare not supported");
                return false;
                break;
            }

            case 0xFE: // Atomic Memory Instructions (https://github.com/WebAssembly/threads/blob/main/proposals/threads/Overview.md)
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case 0x00: // memory.atomic.notify m    [i32 i32] -> [i32]
                    case 0x01: // memory.atomic.wait32 m    [i32 i32 i64] -> [i32]
                    case 0x02: // memory.atomic.wait64 m    [i32 i64 i64] -> [i32]
                    {
                        if (i1.offset != i2.offset || i1.align != i2.align) {
                    		return false;
                    	}
                        break;
                    }
                    case 0x03: // atomic.fence 0x00
                    {
                        if (i1.memidx != i2.memidx || i1.offset != i2.offset || i1.align != i2.align) {
                    		return false;
                    	}
                        break;
                    }
                    case 0x10: // i32.atomic.load m         [i32] -> [i32]
                    case 0x11: // i64.atomic.load m         [i32] -> [i64]
                    case 0x12: // i32.atomic.load8_u m      [i32] -> [i32]
                    case 0x13: // i32.atomic.load16_u m     [i32] -> [i32]
                    case 0x14: // i64.atomic.load8_u m      [i32] -> [i64]
                    case 0x15: // i64.atomic.load16_u m     [i32] -> [i64]
                    case 0x16: // i64.atomic.load32_u m     [i32] -> [i64]
                    case 0x17: // i32.atomic.store m        [i32 i32] -> []
                    case 0x18: // i64.atomic.store m        [i32 i64] -> []
                    case 0x19: // i32.atomic.store8 m       [i32 i32] -> []
                    case 0x1A: // i32.atomic.store16 m      [i32 i32] -> []
                    case 0x1B: // i64.atomic.store8 m       [i32 i64] -> []
                    case 0x1C: // i64.atomic.store16 m      [i32 i64] -> []
                    case 0x1D: // i64.atomic.store32 m      [i32 i64] -> []

                    case 0x1E: // i32.atomic.rmw.add m      [i32 i32] -> [i32]
                    case 0x1F: // i64.atomic.rmw.add m      [i32 i64] -> [i64]
                    case 0x20: // i32.atomic.rmw8.add_u m   [i32 i32] -> [i32]
                    case 0x21: // i32.atomic.rmw16.add_u m  [i32 i32] -> [i32]
                    case 0x22: // i64.atomic.rmw8.add_u m   [i32 i64] -> [i64]
                    case 0x23: // i64.atomic.rmw16.add_u m  [i32 i64] -> [i64]
                    case 0x24: // i64.atomic.rmw32.add_u m  [i32 i64] -> [i64]

                    case 0x25: // i32.atomic.rmw.sub m      [i32 i32] -> [i32]
                    case 0x26: // i64.atomic.rmw.sub m      [i32 i64] -> [i64]
                    case 0x27: // i32.atomic.rmw8.sub_u m   [i32 i32] -> [i32]
                    case 0x28: // i32.atomic.rmw16.sub_u m  [i32 i32] -> [i32]
                    case 0x29: // i64.atomic.rmw8.sub_u m   [i32 i64] -> [i64]
                    case 0x2A: // i64.atomic.rmw16.sub_u m  [i32 i64] -> [i64]
                    case 0x2B: // i64.atomic.rmw32.sub_u m  [i32 i64] -> [i64]

                    case 0x2C: // i32.atomic.rmw.and m          [i32 i32] -> [i32]
                    case 0x2D: // i64.atomic.rmw.and m          [i32 i64] -> [i64]
                    case 0x2E: // i32.atomic.rmw8.and_u m       [i32 i32] -> [i32]
                    case 0x2F: // i32.atomic.rmw16.and_u m      [i32 i32] -> [i32]
                    case 0x30: // i64.atomic.rmw8.and_u m       [i32 i64] -> [i64]
                    case 0x31: // i64.atomic.rmw16.and_u m      [i32 i64] -> [i64]
                    case 0x32: // i64.atomic.rmw32.and_u m      [i32 i64] -> [i64]

                    case 0x33: // i32.atomic.rmw.or m           [i32 i32] -> [i32]
                    case 0x34: // i64.atomic.rmw.or m           [i32 i64] -> [i64]
                    case 0x35: // i32.atomic.rmw8.or_u m        [i32 i32] -> [i32]
                    case 0x36: // i32.atomic.rmw16.or_u m       [i32 i32] -> [i32]
                    case 0x37: // i64.atomic.rmw8.or_u m        [i32 i64] -> [i64]
                    case 0x38: // i64.atomic.rmw16.or_u m       [i32 i64] -> [i64]
                    case 0x39: // i64.atomic.rmw32.or_u m       [i32 i64] -> [i64]

                    case 0x3A: // i32.atomic.rmw.xor m          [i32 i32] -> [i32]
                    case 0x3B: // i64.atomic.rmw.xor m          [i32 i64] -> [i64]
                    case 0x3C: // i32.atomic.rmw8.xor_u m       [i32 i32] -> [i32]
                    case 0x3D: // i32.atomic.rmw16.xor_u m      [i32 i32] -> [i32]
                    case 0x3E: // i64.atomic.rmw8.xor_u m       [i32 i64] -> [i64]
                    case 0x3F: // i64.atomic.rmw16.xor_u m      [i32 i64] -> [i64]
                    case 0x40: // i64.atomic.rmw32.xor_u m      [i32 i64] -> [i64]

                    case 0x41: // i32.atomic.rmw.xchg m         [i32 i32] -> [i32]
                    case 0x42: // i64.atomic.rmw.xchg m         [i32 i64] -> [i64]
                    case 0x43: // i32.atomic.rmw8.xchg_u m      [i32 i32] -> [i32]
                    case 0x44: // i32.atomic.rmw16.xchg_u m     [i32 i32] -> [i32]
                    case 0x45: // i64.atomic.rmw8.xchg_u m      [i32 i64] -> [i64]
                    case 0x46: // i64.atomic.rmw16.xchg_u m     [i32 i64] -> [i64]
                    case 0x47: // i64.atomic.rmw32.xchg_u m     [i32 i64] -> [i64]

                    case 0x48: // i32.atomic.rmw.cmpxchg m      [i32 i32 i32] -> [i32]
                    case 0x49: // i64.atomic.rmw.cmpxchg m      [i32 i64 i64] -> [i64]
                    case 0x4A: // i32.atomic.rmw8.cmpxchg_u m   [i32 i32 i32] -> [i32]
                    case 0x4B: // i32.atomic.rmw16.cmpxchg_u m  [i32 i32 i32] -> [i32]
                    case 0x4C: // i64.atomic.rmw8.cmpxchg_u m   [i32 i64 i64] -> [i64]
                    case 0x4D: // i64.atomic.rmw16.cmpxchg_u m  [i32 i64 i64] -> [i64]
                    case 0x4E: // i64.atomic.rmw32.cmpxchg_u m  [i32 i64 i64] -> [i64]
                    {
                        if (i1.offset != i2.offset || i1.align != i2.align) {
                    		return false;
                    	}
                        break;
                    }
                    default:
                        throw new TypeError("opcode " + ("0x" + b1.toString(16) + b2.toString(16)) + " not supported");
                }
                break;
            }
            default:
                console.error("opcode %s not supported", "0x" + op_code.toString(16));
                brk = true;
                break;
        }

        return true;
	}

	function find_and_mark_objc_indirect_calls(func, opcodes, index, opcode) {

		let range = rangeAtPullIndex(func, opcodes, index - 1, 0);
		if (!range) {
			console.error("could not find pullv value at pos 0");
			return;
		}

		let first = opcodes[range.start];
		let last = opcodes[range.end];
		let match = opcodes.slice(range.start, range.end + 1);
		let mlen = match.length;
		let found = false;

		let len = opcodes.length;
		for (let i = 0; i < len; i++) {
			let inst = opcodes[i];
			if (inst.opcode != 0x11 || inst == opcode) { // inst[__objc_indir] === true
				continue;
			}

			let tmpf = true;
			let start = i - mlen;
			let o = 0;

			// if we have a combination of local.get & local.tee those are basically equal if the local are the same.
			if (((match[0].opcode == 0x20 && opcodes[start].opcode == 0x22) || (match[0].opcode == 0x22 && opcodes[start].opcode == 0x20)) && match[0].local == opcodes[start].local) {
				start++;
				o++;
			}

			for (let z = start; z < i; z++) {
				let i1 = match[o++];
				let i2 = opcodes[z];
				if (!compareInst(i1, i2)) {
					tmpf = false;
					break;
				}
			}

			if (tmpf) {
				inst[__objc_indir] = true;
				found = true;
			}
		}

		if (found) {
			if (indirscopes.indexOf(func) == -1)
				indirscopes.push(func);
		} else {
			console.warn("%s function had marker but no matching objc call_indirect instruction found", func[__nsym]);
		}

		return {index: range.start, length: mlen + 1};
	}

	function mark_objc_indirect_supercall(func, opcodes, index, opcode) {
		let nxt = opcodes[index + 1];

		if (nxt.opcode == 0x11) {
			// next instruction is a call_indirect which means that the super IMP is not stored and used later.
			nxt[__objc_indir] = true;
			if (indirscopes.indexOf(func) == -1)
				indirscopes.push(func);
		} else if (nxt.opcode == 0x21) {

			let local = nxt.local;
			let len = opcodes.length;
			for (let i = index + 2; i < len; i++) {
				let inst = opcodes[i];
				if (inst.opcode == 0x20 && inst.local == local) {
					let peek = opcodes[i + 1];
					if (!peek)
						throw new TypeError("instruction ended before indirect call could be found");
					if (peek.opcode == 0x11) {
						nxt[__objc_indir] = true;
						if (indirscopes.indexOf(func) == -1)
							indirscopes.push(func);
					}
				} else if ((inst.opcode == 0x21 || inst.opcode == 0x22) && inst.local == local) {
					console.warn("writing to IMP super");
					return;
				}
			}
		} else {
			console.warn("next instruction is not call_indirect, next opcode = %s", (nxt.opcode).toString(16));
		}

		
	}

	function sizeOfWasmType(type) {
		switch(type) {
	        case 0x7F:
	        case 0x7D:
	        	return 4;
	        case 0x7E:
	        case 0x7C:
	        	return 8;
	        default:
	            throw TypeError("type not supported in call-frame");
	    }
	}

	function computeCallFrameSize(locals) {
		let sz = 0;
		let len = locals.length;
		for (let i = 0; i < len; i++) {
			let local = locals[i];
			switch(local.type) {
		        case 0x7F:
		        case 0x7D:
		        	sz += 4;
		        	break;
		        case 0x7E:
		        case 0x7C:
		        	sz += 8;
		        	break;
		        default:
		            throw TypeError("type not supported in call-frame");
		    }
		}

		return sz;
	}

	function stackify_objc_method(func) {
		
		let argc = new WasmLocal(WA_TYPE_I32);
		argc[__nsym] = "argc";
		let argv = new WasmLocal(WA_TYPE_I32);
		argv[__nsym] = "argv";

		let type = module.getOrCreateType([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], func.type.retv === null ? WA_TYPE_VOID : func.type.retv);

		if (func.type.argc == 2) {
			// objc method with no arguments (since self & selector is inserted at compile-time) 
			func.narg = 4;
			func.type = type;
			func.locals.splice(2, 0, argc, argv);
			return;
		}
		let opcodes = func.opcodes;
		let largs = func.locals.slice(2, func.type.argc);
		let loff = 0;
		func.narg = 4;
		func.type = type;
		func.locals.splice(2, 0, argc, argv);
		func[__objc_callfsz] = computeCallFrameSize(largs);

		if (opcodes.length == 1 && opcodes[0].opcode == 0x0b) {
			func.locals.length = 4; // empty function body, simply remove the locals
			return;
		}


		let len = largs.length;
		for (let x = 0; x < len; x++) {
			let local = largs[x];
			let ylen = opcodes.length;
			for (let y = 0; y < ylen; y++) {
				let inst = opcodes[y];
				if (inst.opcode == 0x20 && inst.local == local) {
					let load_inst = undefined;
					if (local.type == 0x7F) {
						load_inst = {opcode: 0x28, offset: loff, align: 2};
					} else if (local.type == 0x7D) {
						load_inst = {opcode: 0x2A, offset: loff, align: 2};
					} else if (local.type == 0x7D) {
						load_inst = {opcode: 0x29, offset: loff, align: 2};
					} else if (local.type == 0x7C) {
						load_inst = {opcode: 0x2B, offset: loff, align: 2};
					} 
					opcodes.splice(y, 0, {opcode: 0x20, local: argv}, load_inst);
					inst.opcode = 0x22;
					loff += sizeOfWasmType(local.type);
					break;
				}
			}
		}
	}

	len = funcs.length;
	for (let i = 0; i < len; i++) {
		let fn = funcs[i];
		let name = fn[__nsym];
		if (name == "objc_msg_lookup_super") {
			supermsg = fn;
		} else if (name == "objc_indirect_callsite") {
			indirmsg = fn;
		} else if (name == "slowMsgLookup") {
			slowMsgLookup = fn;
		} else if (name.startsWith("objc_msgSend")) {
			msgfns.push(fn);
		} else if (name.startsWith("_i_") || name.startsWith("_c_") || objc_cimp_methods.indexOf(name) != -1) {
			impfns.push(fn);
		}
	}

	len = msgfns.length;
	for (let i = 0; i < len; i++) {
		let fn = funcs[i];
		let repl = getOrCreateObjcMsgSendMethod(fn);
		if (repl)
			objc_msg_map.set(fn, repl);
	}


	console.log(impfns);
	console.log(msgfns);

	let supercallcnt = 0;
	let indircallcnt = 0;
	let msgdispcnt = 0;

	// find indirect super-calls
	let xlen = funcs.length;
	for (let x = 0; x < xlen; x++) {
		let fn = funcs[x];
		if (fn instanceof ImportedFunction)
			continue;

		let ranges = [];
		let opcodes = fn.opcodes;
		let ylen = opcodes.length;
		for (let y = 0; y < ylen; y++) {
			let inst = opcodes[y];
			let op = inst.opcode;
			if (op == 0x10) {
				let func = inst.func;
				if (func == supermsg) {
					supercallcnt++;
					mark_objc_indirect_supercall(fn, opcodes, y, inst);
				} else if (func == indirmsg) {
					indircallcnt++;
					let rng = find_and_mark_objc_indirect_calls(fn, opcodes, y, inst);
					if (rng)
						ranges.push(rng);
				} else if (objc_msg_map.has(inst.func)) {
					msgdispcnt++;
					inst.func = objc_msg_map.get(inst.func);
					func._usage--;
					// stackify every argument after selector..
					
					// add i32.const for argc
					// add local.get for argv
				}
			}
		}

		// removes placeholder marker for indirect calls.
		ranges.reverse();
		ylen = ranges.length;
		for (let y = 0; y < ylen; y++) {
			let rng = ranges[y];
			opcodes.splice(rng.index, rng.length);
		}

	}

	// change function signature and stackify arguments after @selector
	len = impfns.length;
	for (let i = 0; i < 7; i++) {
		let fn = impfns[i];
		stackify_objc_method(fn);
	}

	console.log("call_indirect to super method %d call_indirect to objc method %d objc_msgSend count %d", supercallcnt, indircallcnt, msgdispcnt);
	console.log(indirscopes);
}

function objc_optimize_wasm_call_ctors(ctx, module, options) {
	
}

function objc_optimize_dylib(ctx, module, options) {
	
}

function gnustepEmbedInfoPlistAction(ctx, module, options) {

}

let _objcUserBinaryWorkflow = {
	name: "objc gnustep2 abi (objc variadic support)",
	id: "gs_2_0_usrbin",
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
			action: "gnustep2.0-objc_optimize_objc_msgSend",
			options: undefined,
		},/*{
			action: "addToExports",
			options: {exports: ["__stack_pointer"]},
		},*/ 
		{
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

const objc_ext = {
    name: "Objective-C Extension",
    flowActions: [{
            name: "gnustep2.0-objc_optimize_objc_msgSend",
	    	handler: objc_optimize_objc_msgSend
	    }, {
            name: "gnustep2.0-objc_optimize_wasm_call_ctors",
            handler: objc_optimize_wasm_call_ctors
	    }, {
            name: "gnustep2.0-objc_optimize_dylib",
            handler: objc_optimize_dylib
	    }, {
            name: "gnustep2.0-embed-plist",
            handler: gnustepEmbedInfoPlistAction
        }],
    flowTemplates: [
    	_objcUserBinaryWorkflow
    ],
    uiInspect: [{
        type: "binary",
        test: function(wasmModule) {

        	let segments = wasmModule.dataSegments;
        	let len = segments.length;
        	for (let i = 0; i < len; i++) {
        		let segment = segments[i];
        		let name = segment[__nsym];
        		if (typeof name == "string" && name.startsWith("__objc_")) {
        			return true;
        		}
        	}

            return false;
        },
        render: function(wasmModule) {
            let container = document.createElement("div");
            container.textContent = "Objective-C inspector here";
            inspectObjectiveC(wasmModule);
            return container;
        }
    }]
};

export default objc_ext;
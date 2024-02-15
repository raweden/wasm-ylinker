const builtin_op_replace_map = [ // every function is ImportedFunction and in module __builtin
	// 
	{ 	// atomic operations.
		name: "memory_atomic_notify",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE00, 2, 0);
			return true;
		}
	}, {
		name: "memory_atomic_wait32",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE01, 2, 0);
			return true;
		}
	}, {
		name: "atomic_fence",
		type: WasmType.create(null, null),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0xFE03, memidx: 0};
			return true;
		}
	}, {
		name: "i32_atomic_load8_u",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE12, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_store8",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE19, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_add_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE20, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_sub_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE27, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_and_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2E, 0, 0);
			return true;
		}
	},{
		name: "i32_atomic_rmw8_or_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE35, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_xor_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3C, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_xchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE43, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw8_cmpxchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE4A, 0, 0);
			return true;
		}
	},  {
		name: "i32_atomic_load16_u",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE13, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_store16",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1A, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_add_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE21, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_sub_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE28, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_and_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2F, 1, 0);
			return true;
		}
	},{
		name: "i32_atomic_rmw16_or_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE36, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_xor_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3D, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_xchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE44, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw16_cmpxchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE4B, 0, 0);
			return true;
		}
	}, {
		name: "i32_atomic_load",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE10, 1, 0);
			return true;
		}
	}, {
		name: "i32_atomic_store",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE17, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_add",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1E, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_sub",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE25, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_and",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2C, 2, 0);
			return true;
		}
	},{
		name: "i32_atomic_rmw_or",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE33, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_xor",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3A, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_xchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE41, 2, 0);
			return true;
		}
	}, {
		name: "i32_atomic_rmw_cmpxchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE48, 2, 0);
			return true;
		}
	}, {
		name: "memory_atomic_wait64",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_I64], [WA_TYPE_I32]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE02, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_load",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE11, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_store",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], null),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE18, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_add",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE1F, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_sub",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE26, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_and",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE2D, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_or",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE34, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_xor",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE3B, 3, 0);
			return true;
		}
	}, {
		name: "i64_atomic_rmw_xchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE42, 3, 0);
			return true;
		}
	},{
		name: "i64_atomic_rmw_cmpxchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_I64], [WA_TYPE_I64]),
		replace: function(inst, index, arr) {
			arr[index] = new AtomicInst(0xFE49, 3, 0);
			return true;
		}
	},
			// math operations
	{ 	
		name: "f64_ceil",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9b};
			return true;
		}
	}, {
		name: "f64_floor",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9c};
			return true;
		}
	}, {
		name: "f64_abs",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x99};
			return true;
		}
	}, {
		name: "f64_nearest",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9e};
			return true;
		}
	}, {
		name: "f64_trunc",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x9d};
			return true;
		}
	}, { 	// f32 math operations
		name: "f32_ceil",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x8d};
			return true;
		}
	}, {
		name: "f32_floor",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x8e};
			return true;
		}
	}, {
		name: "f32_nearest",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x90};
			return true;
		}
	}, {
		name: "f32_abs",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		replace: function(inst, index, arr) {
			arr[index] = {opcode: 0x8B};
			return true;
		}
	}
];

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

import {WasmFunction, ImportedFunction, ImportedGlobal, WasmType, WasmLocal } from "./core/types";
import { AtomicInst } from "./core/inst"
import {WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_F32, WA_TYPE_F64, __nsym} from "./core/const"

const REPLACE_CALL_SKIP_FUNC = Symbol("@skip-func");
const MODULE_BUILT_IN = "__builtin";

/**
 * 
 * @callback InstReplaceCallback
 * @param {WasmInstruction} inst
 * @param {integer} index
 * @param {WasmInstruction[]} instructions
 * @param {WasmFunction} insideFunc
 * @param {WasmFunction|ImportedFunction} calledFunc
 * @param {WebAssemblyModule} mod
 * @returns {boolean|WasmInstruction}
 * 
 * @typedef {ylinker.ReplaceCallInstParams}
 * @type {Object}
 * @property {string} module
 * @property {string} name
 * @property {WasmType} type
 * @property {InstReplaceCallback} replace
 */

/** @type {ylinker.ReplaceCallInstParams[]} */
export const builtin_op_replace_map = [ // every function is ImportedFunction and in module __builtin
	// 
	{ 	// atomic operations.
		module: MODULE_BUILT_IN,
		name: "memory_atomic_notify",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle, mod) {
			arr[index] = new AtomicInst(0xFE00, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_atomic_wait32",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE01, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "atomic_fence",
		type: WasmType.create(null, null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0xFE03, memidx: 0};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_load8_u",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE12, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_store8",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE19, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_add_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE20, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_sub_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE27, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_and_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE2E, 0, 0);
			calle._usage--;
			return true;
		}
	},{
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_or_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE35, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_xor_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE3C, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_xchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE43, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw8_cmpxchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE4A, 0, 0);
			calle._usage--;
			return true;
		}
	},  {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_load16_u",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE13, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_store16",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE1A, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_add_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE21, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_sub_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE28, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_and_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE2F, 1, 0);
			calle._usage--;
			return true;
		}
	},{
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_or_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE36, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_xor_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE3D, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_xchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE44, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw16_cmpxchg_u",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE4B, 0, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_load",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE10, 1, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_store",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE17, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_add",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE1E, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_sub",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE25, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_and",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE2C, 2, 0);
			calle._usage--;
			return true;
		}
	},{
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_or",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE33, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_xor",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE3A, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_xchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE41, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i32_atomic_rmw_cmpxchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE48, 2, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_atomic_wait64",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_I64], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE02, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_load",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE11, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_store",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE18, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_add",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE1F, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_sub",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE26, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_and",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE2D, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_or",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE34, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_xor",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE3B, 3, 0);
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_xchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE42, 3, 0);
			calle._usage--;
			return true;
		}
	},{
		module: MODULE_BUILT_IN,
		name: "i64_atomic_rmw_cmpxchg",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_I64], [WA_TYPE_I64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = new AtomicInst(0xFE49, 3, 0);
			calle._usage--;
			return true;
		}
	},
			// math operations
	{ 	
		module: MODULE_BUILT_IN,
		name: "f64_ceil",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x9b};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_floor",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x9c};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_abs",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x99};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_nearest",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x9e};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_trunc",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x9d};
			calle._usage--;
			return true;
		}
	},  {
		module: MODULE_BUILT_IN,
		name: "f64_isinf",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_I32]),
		// call instruction to:
		// f64.const value=Infinity
		// f64.eq
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			let i1, i2;
			i1 = {opcode: 0x44, value: Infinity};	// f64.const
			i2 = {opcode: 0x61};					// f64.eq
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_isnan",
		type: WasmType.create([WA_TYPE_F64], [WA_TYPE_I32]),
		// call instruction to:
		// f64.const value=NaN
		// f64.eq
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			let i1, i2;
			i1 = {opcode: 0x44, value: NaN};	// f64.const
			i2 = {opcode: 0x61};				// f64.eq
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f64_copysign",
		type: WasmType.create([WA_TYPE_F64, WA_TYPE_F64], [WA_TYPE_F64]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0xA6};
			calle._usage--;
			return true;
		}
	},
	// f32 math operations
	{ 	
		module: MODULE_BUILT_IN,
		name: "f32_ceil",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x8d};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_floor",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x8e};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_nearest",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x90};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_abs",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_F32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x8B};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_isinf",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_I32]),
		// call instruction to:
		// f32.const value=Infinity
		// f32.eq
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			let i1, i2;
			i1 = {opcode: 0x43, value: Infinity};	// f32.const
			i2 = {opcode: 0x5b};					// f32.eq
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_isnan",
		type: WasmType.create([WA_TYPE_F32], [WA_TYPE_I32]),
		// call instruction to:
		// f32.const value=NaN
		// f32.eq
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			let i1, i2;
			i1 = {opcode: 0x43, value: NaN};	// f32.const
			i2 = {opcode: 0x5b};				// f32.eq
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "f32_copysign",
		type: WasmType.create([WA_TYPE_F32, WA_TYPE_F32], [WA_TYPE_F32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x98};
			calle._usage--;
			return true;
		}
	},

	// other builtins
	
	{
		module: MODULE_BUILT_IN,
		name: "alloca",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, opcodes, pfunc, cfunc, pmodule) {
			let inst_enter, inst_exit, sp, glob, globs = pmodule.globals;
			let alloca = cfunc;
			let local_sp_enter, local_alloca_sz, local_alloca_ret;
			let enter_isset = false;
			let stack_use = false;
			let len;

			inst_enter = inst;
			local_sp_enter = new WasmLocal(WA_TYPE_I32);
			local_alloca_sz = new WasmLocal(WA_TYPE_I32);
			local_alloca_ret = new WasmLocal(WA_TYPE_I32);
			pfunc.locals.push(local_sp_enter);
			pfunc.locals.push(local_alloca_sz);
			pfunc.locals.push(local_alloca_ret);
			//local_sp_enter[__nsym] = "$sp_enter";
			//local_alloca_sz[__nsym] = "$alloca_sz";
			//local_alloca_ret[__nsym] = "$alloca_ret";

			// finding env.__stack_pointer
			len = globs.length;
			for (let i = 0; i < len; i++) {
				let glob = globs[i];
				if (!(glob instanceof ImportedGlobal))
					break;
				if (glob.module == "env" && glob.name == "__stack_pointer") {
					sp = glob;
					break;
				}
			}

			// don't try to optimize the length value
			for (let i = 0; i < opcodes.length; i++) {
				let inst = opcodes[i];
				let op = inst.opcode;
				if (op == 0x24) { // global.set
					
					// local.get
					// i32.const
					// i32.add
					// global.set $sp
					if (inst.global == sp && opcodes[i - 1].opcode == 0x6A && opcodes[i - 2].opcode == 0x41 && opcodes[i - 3].opcode == 0x20) {
						let i1, i2;
						i1 = {opcode: 0x20, local: local_sp_enter};		// local.get
						i2 = inst;										// global.set
						opcodes.splice(i - 3, 4, i1, i2);
						i = opcodes.indexOf(i2);
						stack_use = true;
					}

				} else if (op == 0x23) { // global.get

					// global.get
					// i32.const
					// i32.sub
					if (enter_isset == false && inst.global == sp && opcodes[i + 1].opcode == 0x41 && opcodes[i + 2].opcode == 0x6B) {
						let i1 = {opcode: 0x22, local: local_sp_enter};	// local.tee
						enter_isset = true;
						stack_use = true;
						opcodes.splice(i + 1, 0, i1);
						i = opcodes.indexOf(i1);
					}

				} else if (op == 0x10) {
					if (inst.func == alloca) {
						let i1, i2, i3, i4, i5, i6, i7;

						if (!stack_use) {
							i1 = {opcode: 0x23, global: sp};			// global.get
							i2 = {opcode: 0x21, local: local_sp_enter};	// local.set
							opcodes.unshift(i1, i2);
							i = opcodes.indexOf(inst);
						}

						i1 = {opcode: 0x21, local: local_alloca_sz};	// local.set
						i2 = {opcode: 0x23, global: sp};				// global.get
						i3 = {opcode: 0x20, local: local_alloca_sz};	// local.get
						i4 = {opcode: 0x6B};							// i32.sub
						i5 = {opcode: 0x22, local: local_alloca_ret};	// local.tee
						i6 = {opcode: 0x24, global: sp};				// global.set
						i7 = {opcode: 0x20, local: local_alloca_ret};	// local.get
						opcodes.splice(i, 1, i1, i2, i3, i4, i5, i6, i7);
						i = opcodes.indexOf(i7);
						if (!inst_exit && inst == inst_enter) {
							inst_exit = i7;
						}
						
						// decrement refcount
						alloca._usage--;
					}
				}
			}

			if (!inst_exit)
				throw new ReferenceError("inst_exit not set");

			return inst_exit; // tell the replace interatior to continue from at the next instuction after the original location.
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_copy",
		type: WasmType.create(null, [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0xfc0a, memidx1: 0, memidx2: 0};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_size",
		type: WasmType.create(null, [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x3f, memidx: 0};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_grow",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0x40, memidx: 0};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "memory_fill",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32], null),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle) {
			arr[index] = {opcode: 0xfc0b, memidx: 0};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "table_size",
		type: WasmType.create(null, [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle, mod) {
			arr[index] = {opcode: 0xfc10, table: mod.tables[0]};
			calle._usage--;
			return true;
		}
	}, {
		module: MODULE_BUILT_IN,
		name: "table_grow",
		type: WasmType.create([WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle, mod) {
			let tmp = arr[index - 1];		 // arg0
			arr[index - 1] = {opcode: 0xd0}; // ref.null
			let i1 = tmp;	
			let i2 = {opcode: 0xfc0f, table: mod.tables[0]};
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	},  {
		module: MODULE_BUILT_IN,
		name: "table_zerofill",
		type: WasmType.create([WA_TYPE_I32, WA_TYPE_I32], [WA_TYPE_I32]),
		/** @type {InstReplaceCallback} */
		replace: function(inst, index, arr, scope, calle, mod) {
			let tmp = arr[index - 1];			// arg1
			arr[index - 1] = {opcode: 0xd0}; 	// ref.null
			let i1 = tmp;						// now arg2
			let i2 = {opcode: 0xfc0f, table: mod.tables[0]};
			arr.splice(index, 1, i1, i2);
			calle._usage--;
			return i2;
		}
	}, 

];



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
 * @param  {Array.<WasmFunction|ImportedFunction>} functions A optional selection of functions in which to replace the matching call-sites. If not specified the replace happens on all function in the specified module.
 * @param  {Array} inst_replace A array of objects in the format described above.
 * @return {void}              
 */
export function replaceCallInstructions(ctx, mod, functions, inst_replace) {

	let opsopt = [];
	
	/** @type {ReplaceCallInstParams[]} */
	let impfnarr = [];
	let namemap = new Map();
	/** @type {Map.<WasmFunction|ImportedFunction, ReplaceCallInstParams>} */
	let funcmap = new Map();
	let names = [];
	let xlen, ylen = inst_replace.length;
	for (let y = 0; y < ylen; y++) {
		/** @type {ReplaceCallInstParams} */
		let handler = inst_replace[y];
		let name = handler.name;
		if (typeof name == "string") {

			if (typeof handler.module == "string") {
				impfnarr.push(handler);
			} else {

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
		} else if (name instanceof WasmFunction) {
			
			funcmap.set(name, handler);

		} else if (name instanceof ImportedFunction) {

			if (mod.function.indexOf(name) != -1) {
				funcmap.set(name, handler);
			} else {
				impfnarr.push(handler);
			}

		} else if (typeof name == "object" && typeof name.module == "string" && typeof name.name == "string") {
			impfnarr.push(handler);
		}
		
	}

	
	let fns = mod.functions;
	ylen = fns.length;
	xlen = impfnarr.length;
	for (let x = 0; x < xlen; x++) {
		let obj = impfnarr[x];
		for (let y = 0; y < ylen; y++) {
			let func = fns[y];
			if (!(func instanceof ImportedFunction))
				break;
			if (func.module == obj.module && func.name == obj.name) {
				funcmap.set(func, obj);
			}
		}
	}

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
			/** @type {WasmInstruction} */
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
					let res = handler.replace(op, x, opcodes, func, call, mod);
					if (res === false && zlen > 1) {
						let z = 1;
						while (res === false && z < zlen) {
							handler = handlers[z++];
							res = handler.replace(op, x, opcodes, func, call, mod);
						}
					}
					if (res === REPLACE_CALL_SKIP_FUNC) {
						break;
					} else if (res === op) {
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

	// garbage-collect.
	for (const [calle, handler] of funcmap) {

		if (calle._usage < 0) {
			console.warn("refcount for function is less than zero");
			continue;
		} else if (calle._usage !== 0) {
			continue;
		}

		let idx;
		idx = mod.functions.indexOf(calle);
		if (idx !== -1) {
			mod.functions.splice(idx, 1);
		}
    }

}
export function fixup_builtins(linker) {

	replaceCallInstructions(null, linker._wasmModule, linker.functions, builtin_op_replace_map);
}
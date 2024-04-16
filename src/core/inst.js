
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

import { WA_TYPE_I32, WA_TYPE_I64, WA_TYPE_F32, WA_TYPE_F64, WA_TYPE_VOID, WA_TYPE_V128, WA_TYPE_FUNC_REF, WA_TYPE_EXTERN_REF } from "./const"

export const WA_TYPE_ANY = Symbol("@any");
export const WA_TYPE_NUMRIC = Symbol("@type-numric");

const WA_LOCAL_TYPE = Symbol("@local-type"); // indicates that the pull/push value is of the type of the local at given index.

const WA_ROLE_ADDR = "addr";
export const WA_TYPE_ADDR = WA_TYPE_I32; //Symbol("@addr");   // everything that is a memory address has this type.. 

// the .type or .flag field [8 bits = type][8 bit = natural alignment (memory load/store)][16 bit flags]
const OP_TYPE_CTRL = 0x00;
const OP_TYPE_VAR = 0x01;
const OP_TYPE_PAR = 0x02
const OP_TYPE_MEM = 0x03;
const OP_TYPE_REF = 0x04;
const OP_TYPE_NUM = 0x05;
const OP_TYPE_VEC = 0x06;
const OP_TYPE_TBL = 0x07;
const OP_TYPE_EH = 0x08;

const OP_FLAG_MEM = 0x03;
const OP_FLAG_MEM_READ = 1 << 16;
const OP_FLAG_MEM_WRITE = 1 << 17;
const OP_FLAG_MEMARG = 1 << 18;     // flag that indicates that the instruction has align & offset

const OP_FLAG_MAY_TRAP = 1 << 19;

const NAT_ALIGN_NONE = (0 << 8);
const NAT_ALIGN_8 = (1 << 8);   // value-1 is the power of 2
const NAT_ALIGN_16 = (2 << 8);
const NAT_ALIGN_32 = (3 << 8);
const NAT_ALIGN_64 = (4 << 8);
const NAT_ALIGN_128 = (5 << 8);

const __t__ = Symbol("@type");
const ______ = undefined;

/**
 * Returns the instruction name given the two bytes that of it, not all instruction use two bytes.
 * @param {integer} opt1 
 * @param {integer} opt2 
 * @returns {?string}
 */
function instname(opt1, opt2) {

    switch(opt1) {
        case 0x00: return "unreachable";
        case 0x01: return "nop"
        case 0x02: return "block";
        case 0x03: return "loop";
        case 0x04: return "if";
        case 0x05: return "else";
        case 0x0B: return "end"
        case 0x0C: return "br";
        case 0x0D: return "br_if";
        case 0x0E: return "br_table";
        case 0x0F: return "return";
        case 0x10: return "call";
        case 0x11: return "call_indirect";
        // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
        // return_call          0x12    [t3* t1*] -> [t4*]
        // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
        case 0x1A: return "drop";
        case 0x1B: return "select";
        case 0x20: return "local.get";
        case 0x21: return "local.set";
        case 0x22: return "local.tee";
        case 0x23: return "global.get";
        case 0x24: return "global.set";

        // wasm 2.0
        case 0x25: return "table.get";
        case 0x26: return "table.set";

        case 0x28: return "i32.load";
        case 0x29: return "i64.load";
        case 0x2A: return "f32.load";
        case 0x2B: return "f64.load";
        case 0x2C: return "i32.load8_s";
        case 0x2D: return "i32.load8_u";
        case 0x2E: return "i32.load16_s";
        case 0x2F: return "i32.load16_u";
        case 0x30: return "i64.load8_s";
        case 0x31: return "i64.load8_u";
        case 0x32: return "i64.load16_s";
        case 0x33: return "i64.load16_u";
        case 0x34: return "i64.load32_s";
        case 0x35: return "i64.load32_u";
        case 0x36: return "i32.store";
        case 0x37: return "i64.store";
        case 0x38: return "f32.store";
        case 0x39: return "f64.store";
        case 0x3A: return "i32.store8";
        case 0x3B: return "i32.store16";
        case 0x3C: return "i64.store8";
        case 0x3D: return "i64.store16";
        case 0x3E: return "i64.store32";
        case 0x3F: return "memory.size";
        case 0x40: return "memory.grow";
        case 0xFE: // Atomic Memory Instructions
        {
            switch (opt2) {
                case 0x00: return "memory.atomic.notify";
                case 0x01: return "memory.atomic.wait32";
                case 0x02: return "memory.atomic.wait64";
                case 0x03: return "atomic.fence";

                case 0x10: return "i32.atomic.load";
                case 0x11: return "i64.atomic.load";
                case 0x12: return "i32.atomic.load8_u";
                case 0x13: return "i32.atomic.load16_u";
                case 0x14: return "i64.atomic.load8_u";
                case 0x15: return "i64.atomic.load16_u";
                case 0x16: return "i64.atomic.load32_u";
                case 0x17: return "i32.atomic.store";
                case 0x18: return "i64.atomic.store";
                case 0x19: return "i32.atomic.store8";
                case 0x1A: return "i32.atomic.store16";
                case 0x1B: return "i64.atomic.store8";
                case 0x1C: return "i64.atomic.store16";
                case 0x1D: return "i64.atomic.store32";

                case 0x1E: return "i32.atomic.rmw.add";
                case 0x1F: return "i64.atomic.rmw.add";
                case 0x20: return "i32.atomic.rmw8.add_u";
                case 0x21: return "i32.atomic.rmw16.add_u";
                case 0x22: return "i64.atomic.rmw8.add_u";
                case 0x23: return "i64.atomic.rmw16.add_u";
                case 0x24: return "i64.atomic.rmw32.add_u";

                case 0x25: return "i32.atomic.rmw.sub";
                case 0x26: return "i64.atomic.rmw.sub";
                case 0x27: return "i32.atomic.rmw8.sub_u";
                case 0x28: return "i32.atomic.rmw16.sub_u";
                case 0x29: return "i64.atomic.rmw8.sub_u";
                case 0x2A: return "i64.atomic.rmw16.sub_u";
                case 0x2B: return "i64.atomic.rmw32.sub_u";

                case 0x2C: return "i32.atomic.rmw.and";
                case 0x2D: return "i64.atomic.rmw.and";
                case 0x2E: return "i32.atomic.rmw8.and_u";
                case 0x2F: return "i32.atomic.rmw16.and_u";
                case 0x30: return "i64.atomic.rmw8.and_u";
                case 0x31: return "i64.atomic.rmw16.and_u";
                case 0x32: return "i64.atomic.rmw32.and_u";

                case 0x33: return "i32.atomic.rmw.or";
                case 0x34: return "i64.atomic.rmw.or";
                case 0x35: return "i32.atomic.rmw8.or_u";
                case 0x36: return "i32.atomic.rmw16.or_u";
                case 0x37: return "i64.atomic.rmw8.or_u";
                case 0x38: return "i64.atomic.rmw16.or_u";
                case 0x39: return "i64.atomic.rmw32.or_u";

                case 0x3A: return "i32.atomic.rmw.xor";
                case 0x3B: return "i64.atomic.rmw.xor";
                case 0x3C: return "i32.atomic.rmw8.xor_u";
                case 0x3D: return "i32.atomic.rmw16.xor_u";
                case 0x3E: return "i64.atomic.rmw8.xor_u";
                case 0x3F: return "i64.atomic.rmw16.xor_u";
                case 0x40: return "i64.atomic.rmw32.xor_u";

                case 0x41: return "i32.atomic.rmw.xchg";
                case 0x42: return "i64.atomic.rmw.xchg";
                case 0x43: return "i32.atomic.rmw8.xchg_u";
                case 0x44: return "i32.atomic.rmw16.xchg_u";
                case 0x45: return "i64.atomic.rmw8.xchg_u";
                case 0x46: return "i64.atomic.rmw16.xchg_u";
                case 0x47: return "i64.atomic.rmw32.xchg_u";

                case 0x48: return "i32.atomic.rmw.cmpxchg";
                case 0x49: return "i64.atomic.rmw.cmpxchg";
                case 0x4A: return "i32.atomic.rmw8.cmpxchg_u";
                case 0x4B: return "i32.atomic.rmw16.cmpxchg_u";
                case 0x4C: return "i64.atomic.rmw8.cmpxchg_u";
                case 0x4D: return "i64.atomic.rmw16.cmpxchg_u";
                case 0x4E: return "i64.atomic.rmw32.cmpxchg_u";
                default:
                    return null;
            }
        }

        // Numeric Instructions

        case 0x41: return "i32.const";
        case 0x42: return "i64.const";
        case 0x43: return "f32.const";
        case 0x44: return "f64.const";

        case 0x45: return "i32.eqz";
        case 0x46: return "i32.eq";
        case 0x47: return "i32.ne";
        case 0x48: return "i32.lt_s";
        case 0x49: return "i32.lt_u";
        case 0x4A: return "i32.gt_s";
        case 0x4B: return "i32.gt_u";
        case 0x4C: return "i32.le_s";
        case 0x4D: return "i32.le_u";
        case 0x4E: return "i32.ge_s";
        case 0x4F: return "i32.ge_u";

        case 0x50: return "i64.eqz";
        case 0x51: return "i64.eq";
        case 0x52: return "i64.ne";
        case 0x53: return "i64.lt_s";
        case 0x54: return "i64.lt_u";
        case 0x55: return "i64.gt_s";
        case 0x56: return "i64.gt_u";
        case 0x57: return "i64.le_s";
        case 0x58: return "i64.le_u";
        case 0x59: return "i64.ge_s";
        case 0x5A: return "i64.ge_u";

        case 0x5B: return "f32.eq";
        case 0x5C: return "f32.ne";
        case 0x5D: return "f32.lt";
        case 0x5E: return "f32.gt";
        case 0x5F: return "f32.le";
        case 0x60: return "f32.ge";

        case 0x61: return "f64.eq";
        case 0x62: return "f64.ne";
        case 0x63: return "f64.lt";
        case 0x64: return "f64.gt";
        case 0x65: return "f64.le";
        case 0x66: return "f64.ge";

        case 0x67: return "i32.clz";
        case 0x68: return "i32.ctz";
        case 0x69: return "i32.popcnt";
        case 0x6A: return "i32.add";
        case 0x6B: return "i32.sub";
        case 0x6C: return "i32.mul";
        case 0x6D: return "i32.div_s";
        case 0x6E: return "i32.div_u";
        case 0x6F: return "i32.rem_s";
        case 0x70: return "i32.rem_u";
        case 0x71: return "i32.and";
        case 0x72: return "i32.or";
        case 0x73: return "i32.xor";
        case 0x74: return "i32.shl";
        case 0x75: return "i32.shr_s";
        case 0x76: return "i32.shr_u";
        case 0x77: return "i32.rotl";
        case 0x78: return "i32.rotr";

        case 0x79: return "i64.clz";
        case 0x7A: return "i64.ctz";
        case 0x7B: return "i64.popcnt";
        case 0x7C: return "i64.add";
        case 0x7D: return "i64.sub";
        case 0x7E: return "i64.mul";
        case 0x7F: return "i64.div_s";
        case 0x80: return "i64.div_u";
        case 0x81: return "i64.rem_s";
        case 0x82: return "i64.rem_u";
        case 0x83: return "i64.and";
        case 0x84: return "i64.or";
        case 0x85: return "i64.xor";
        case 0x86: return "i64.shl";
        case 0x87: return "i64.shr_s";
        case 0x88: return "i64.shr_u";
        case 0x89: return "i64.rot";
        case 0x8A: return "li64.rotr";

        case 0x8B: return "f32.abs";
        case 0x8C: return "f32.neg";
        case 0x8D: return "f32.ceil";
        case 0x8E: return "f32.floor";
        case 0x8F: return "f32.trunc";
        case 0x90: return "f32.nearest";
        case 0x91: return "f32.sqrt";
        case 0x92: return "f32.add";
        case 0x93: return "f32.sub";
        case 0x94: return "f32.mul";
        case 0x95: return "f32.div";
        case 0x96: return "f32.min";
        case 0x97: return "f32.max";
        case 0x98: return "f32.copysign";

        case 0x99: return "f64.abs";
        case 0x9A: return "f64.neg";
        case 0x9B: return "f64.ceil";
        case 0x9C: return "f64.floor";
        case 0x9D: return "f64.trunc";
        case 0x9E: return "f64.nearest";
        case 0x9F: return "f64.sqrt";
        case 0xA0: return "f64.add";
        case 0xA1: return "f64.sub";
        case 0xA2: return "f64.mul";
        case 0xA3: return "f64.div";
        case 0xA4: return "f64.min";
        case 0xA5: return "f64.max";
        case 0xA6: return "f64.copysign";

        case 0xA7: return "i32.wrap_i64";
        case 0xA8: return "i32.trunc_f32_s";
        case 0xA9: return "i32.trunc_f32_u";
        case 0xAA: return "i32.trunc_f64_s";
        case 0xAB: return "i32.trunc_f64_u";
        case 0xAC: return "i64.extend_i32_s";
        case 0xAD: return "i64.extend_i32_u";
        case 0xAE: return "i64.trunc_f32_s";
        case 0xAF: return "i64.trunc_f32_u";
        case 0xB0: return "i64.trunc_f64_s";
        case 0xB1: return "i64.trunc_f64_u";
        case 0xB2: return "f32.convert_i32_s";
        case 0xB3: return "f32.convert_i32_u";
        case 0xB4: return "f32.convert_i64_s";
        case 0xB5: return "f32.convert_i64_u";
        case 0xB6: return "f32.demote_f64";
        case 0xB7: return "f64.convert_i32_s";
        case 0xB8: return "f64.convert_i32_u";
        case 0xB9: return "f64.convert_i64_s";
        case 0xBA: return "f64.convert_i64_u";
        case 0xBB: return "f64.promote_f32";
        case 0xBC: return "i32.reinterpret_f32";
        case 0xBD: return "i64.reinterpret_f64";
        case 0xBE: return "f32.reinterpret_i32";
        case 0xBF: return "f64.reinterpret_i64";

        case 0xC0: return "i32.extend8_s";
        case 0xC1: return "i32.extend16_s";
        case 0xC2: return "i64.extend8_s";
        case 0xC3: return "i64.extend16_s";
        case 0xC4: return "i64.extend32_s";

        case 0xFC:
        {
            switch (opt2) {
                case  0: return "i32.trunc_sat_f32_s";
                case  1: return "i32.trunc_sat_f32_u";
                case  2: return "i32.trunc_sat_f64_s";
                case  3: return "i32.trunc_sat_f64_u";
                case  4: return "i64.trunc_sat_f32_s";
                case  5: return "i64.trunc_sat_f32_u";
                case  6: return "i64.trunc_sat_f64_s";
                case  7: return "i64.trunc_sat_f64_u";
                case  8: return "memory.init";
                case  9: return "data.drop";
                case 10: return "memory.copy";
                case 11: return "memory.fill";
                //
                case 12: return "table.init";
                case 13: return "elem.drop";
                case 14: return "table.copy";
                case 15: return "table.grow";
                case 16: return "table.size";
                case 17: return "table.fill";

                default:
                    return null;
            }
        }

        case 0xFD: // multi-byte sequence
        {
                switch (opt2) {
                    case  0: // v128.load
                    case  1: // v128.load8x8_s
                    case  2: // v128.load8x8_u
                    case  3: // v128.load16x4_s
                    case  4: // v128.load16x4_u
                    case  5: // v128.load32x2_s
                    case  6: // v128.load32x2_u
                    case  7: // v128.load8_splat
                    case  8: // v128.load16_splat
                    case  9: // v128.load32_splat
                    case 10: // v128.load64_splat
                    case 92: // v128.load32_zero
                    case 93: // v128.load64_zero
                    case 11: // v128.store
                        break;
                    case 12: // v128.const
                        break
                    case 13: // i8x16.shuffle
                        break
                    case 84: // v128.load8_lane
                    case 85: // v128.load16_lane
                    case 86: // v128.load32_lane
                    case 87: // v128.load64_lane
                    case 88: // v128.store8_lane
                    case 89: // v128.store16_lane
                    case 90: // v128.store32_lane
                    case 91: // v128.store64_lane
                        break;
                        // the list of ops convers the whole 0-255 byte range.
                }
            }

        default:
            return null;
    }
}

/**
 * This defintion describes all the possible properties that could be present on a instruction.
 * @typedef WasmInstruction
 * @type {Object}
 * @property {integer} opcode Present on every instruction.
 * @property {integer|number} value Present `i32.const`, `i64.const`, `f32.const`, `f64.const` 
 * @property {integer} offset Present on all *.load and *.store instruction
 * @property {integer} align Present on all *.load and *.store instruction
 * @property {integer} _loc
 * @property {integer} _roff Present on certain instruction when relocation is enabled.
 * @property {WasmLocal} local Present on local.tee local.get local.set
 * @property {WasmGlobal|ImportedGlobal} global Present on global.set global.get
 * @property {WasmType} type Present on `block`, `loop`, `if`, `try`, `indirect_call`, 
 * @property {WasmFunction|ImportedFunction} func Present on `call` and `ref.func`
 * @property {WasmTable|ImportedTable} table Present on `indirect_call`, `table.get`, `table.set`, `table.grow`, `table.size`, `table.fill`
 * @property {WasmTag|ImportedTag} tag Present on `catch`, `throw`
 * @property {integer} relative_depth Present on `delegate`, `rethrow`
 * @property {integer} labelidx Present on `br`, `br_if`, 
 * @property {integer} default_br Present on `br_table`
 * @property {integer} memidx Present on memory.size, memory.grow, memory.fill, atomic.fence (Will be renamed and type will change)
 * @property {integer} reftype Present on `ref.null`
 * @property {WasmDataSegment} dataSegment Present on memory.init, data.drop
 * @property {integer} memidx1 Present on `memory.copy` (Will be renamed and type will change)
 * @property {integer} memidx2 Present on `memory.copy` (Will be renamed and type will change)
 * @property {WasmTable|ImportedTable} table1 Present on `memory.copy`
 * @property {WasmTable|ImportedTable} table2 Present on `memory.copy`
 */

/**
 * @typedef InstructionRange
 * @type {Object}
 * @property {WasmInstruction} start
 * @property {WasmInstruction} end
 */

class InstList {

    constructor(opcode) {
        this.opcodes = [];
    }
};

/**
 * @extends WasmInstruction
 */
export class Inst {

    constructor(opcode) {
        this.opcode = opcode;
    }
};

export class UnreachableInst extends Inst {

    constructor() {
        super(0x00);
    }
}

export class NopInst extends Inst {

    constructor() {
        super(0x01);
    }
}

export class EndInst extends Inst {

    constructor() {
        super(0x0b);
    }
}

export class BlockInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class LoopInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class IfInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class ReturnInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class LoadInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class StoreInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class CallInst extends Inst {

    constructor(opcode, func) {
        super(opcode);
        this.func = func;
    }
}

export class LocalInst extends Inst {

    constructor(opcode, local) {
        super(opcode);
        this.local = local;
    }
}

export class GlobalInst extends Inst {

    constructor(opcode, glob) {
        super(opcode);
        this.global = glob;
    }
}

export class AtomicInst extends Inst {

    constructor(opcode, align, offset) {
        super(opcode);
        /** @type {integer} */
        this.offset = offset;
        /** @type {integer} */
        this.align = align;
    }
}

export class BranchInst extends Inst {

    constructor(opcode, labelidx) {
        super(opcode);
        this.labelidx = labelidx;
    }
}

export class BranchIfInst extends Inst {

    constructor(opcode, labelidx) {
        super(opcode);
        this.labelidx = labelidx;
    }
}

export class BranchTableInst extends Inst {

    constructor(opcode, labels) {
        super(opcode);
        this.labels = labels;
    }
}

export class IndirectCallInst extends Inst {

    constructor(opcode, table, type) {
        super(opcode);
        /** @type {WasmTable|ImportedTable} */
        this.table = table;
        /** @type {WasmType} */
        this.type = type;
    }
}

export class LocalGetInst extends Inst {

    constructor(opcode, localidx) {
        super(opcode);
        this.localidx = localidx;
    }
}

export class LocalSetInst extends Inst {

    constructor(opcode, localidx) {
        super(opcode);
        this.localidx = localidx;
    }
}

export class GlobalGetInst extends Inst {

    constructor(opcode, globalidx) {
        super(opcode);
        this.globalidx = globalidx;
    }
}

export class GlobalSetInst extends Inst {

    constructor(opcode, globalidx) {
        super(opcode);
        this.globalidx = globalidx;
    }
}

export class TableGetInst extends Inst {

    constructor(opcode, tableidx) {
        super(opcode);
        this.tableidx = tableidx;
    }
}

export class TableSetInst extends Inst {

    constructor(opcode, tableidx) {
        super(opcode);
        this.tableidx = tableidx;
    }
}

export class TryInst extends Inst {

    constructor(opcode) {
        super(opcode);
        /** @type {WasmType} */
        this.type = undefined;
    }
}

export class CatchInst extends Inst {

    constructor(opcode) {
        super(opcode);
        /** @type {WasmTag|ImportedTag} */
        this.tag = undefined;
    }
}

export class CatchAllInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

export class DelegateInst extends Inst {

    constructor(opcode) {
        super(opcode);
        /** @type {integer} */
        this.relative_depth = undefined;
    }
}

export class ThrowInst extends Inst {

    constructor(opcode) {
        super(opcode);
        /** @type {WasmTag|ImportedTag} */
        this.tag = undefined;
    }
}

export class ReThrowInst extends Inst {

    constructor(opcode) {
        super(opcode);
        /** @type {integer} */
        this.relative_depth = undefined;
    }
}

export const opclsmap = new Map();
export const opcode_info = [
    {
        opcode: 0x00,
        type: OP_TYPE_CTRL,
        name: "unreachable",
        pull: WA_TYPE_VOID, // unreachable traps the virtual machine so stack is useless if reached..
        push: WA_TYPE_VOID
    }, {
        opcode: 0x01, 
        type: OP_TYPE_CTRL,
        name: "nop",
        pull: WA_TYPE_VOID,
        push: WA_TYPE_VOID
    }, 
    {
        opcode: 0x02,
        type: OP_TYPE_CTRL,
        name: "block",
        pull: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                return type.argc !== 0 ? type.argv : WA_TYPE_VOID;
            }
        },
        push: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                if (type.retc == 0) {
                    return WA_TYPE_VOID;
                }
                if (Array.isArray(type.retv) && type.retv.length == 1) {
                    return type.retv[0];
                }
                return type.retv;
            }
        },
    }, {
        opcode: 0x03,
        type: OP_TYPE_CTRL,
        name: "loop",
        pull: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                return type.argc !== 0 ? type.argv : WA_TYPE_VOID;
            }
        },
        push: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                if (type.retc == 0) {
                    return WA_TYPE_VOID;
                }
                if (Array.isArray(type.retv) && type.retv.length == 1) {
                    return type.retv[0];
                }
                return type.retv;
            }
        },
    }, {
        opcode: 0x04,  // if bt <in*> 0x0B || if bt <in1*> 0x05 <in2*> 0x0B
        type: OP_TYPE_CTRL,
        name: "if",
        pull: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                return type.argc !== 0 ? type.argv : WA_TYPE_VOID;
            }
        },
        push: function(fn, inst) {
            let type = inst.type;
            if (Number.isInteger(type)) {
                if (type == 0x40) {
                    return WA_TYPE_VOID;
                }
                return type;
            } else {
                if (type.retc == 0) {
                    return WA_TYPE_VOID;
                }
                if (Array.isArray(type.retv) && type.retv.length == 1) {
                    return type.retv[0];
                }
                return type.retv;
            }
        },
    }, {
        opcode: 0x05,  // else <in2*> 0x0B
        type: OP_TYPE_CTRL,
        name: "else"
    }, {
        opcode: 0x06,  // try bt
        type: OP_TYPE_EH,
        name: "try"
    }, {
        opcode: 0x07,  // catch x
        type: OP_TYPE_EH,
        name: "catch"
    }, {
        opcode: 0x19,  // catch_all
        type: OP_TYPE_EH,
        name: "catch_all"
    }, {
        opcode: 0x18,  // delegate rd
        type: OP_TYPE_EH,
        name: "delegate"
    }, {
        opcode: 0x08,  // throw x
        type: OP_TYPE_EH,
        name: "throw"
    }, {
        opcode: 0x09,  // rethrow rd
        type: OP_TYPE_EH,
        name: "rethrow"
    }, {
        opcode: 0x0C,
        type: OP_TYPE_CTRL,
        name: "br"
    }, {
        opcode: 0x0D,
        type: OP_TYPE_CTRL,
        name: "br_if"
    }, {
        opcode: 0x0E,
        type: OP_TYPE_CTRL,
        name: "br_table"
    }, {
        opcode: 0x0F,
        type: OP_TYPE_CTRL,
        name: "return"
    }, {
        opcode: 0x10,
        type: OP_TYPE_CTRL,
        name: "call",
        pull: function(fn, inst) {
            let type = inst.func.type;
            return type.argc !== 0 ? type.argv : WA_TYPE_VOID;
        },
        push: function(fn, inst) {
            let type = inst.func.type;
            if (type.retc == 0) {
                return WA_TYPE_VOID;
            }
            if (Array.isArray(type.retv) && type.retv.length == 1) {
                return type.retv[0];
            }
            return type.retv;
        },
    }, {
        opcode: 0x11,
        type: OP_TYPE_CTRL,
        name: "call_indirect",
        pull: function(fn, inst) {
            let type = inst.type;
            if (type.argc !== 0) {
                let pullv = type.argv.slice();
                pullv.push(WA_TYPE_I32);
                return pullv;
            } else {
                return WA_TYPE_I32;
            }
        },
        push: function(fn, inst) {
            let type = inst.type;
            if (type.retc == 0) {
                return WA_TYPE_VOID;
            }
            if (Array.isArray(type.retv) && type.retv.length == 1) {
                return type.retv[0];
            }
            return type.retv;
        },
    }, 
    // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
    // return_call          0x12    [t3* t1*] -> [t4*]
    // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
    {
        opcode: 0x41, 
        name: "i32.const",
        pull: WA_TYPE_VOID,
        push: WA_TYPE_I32,
    }, {
        opcode: 0x42,
	   name: "i64.const",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_I64
    }, {
        opcode: 0x43,
		name: "f32.const",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_F32
    }, {
        opcode: 0x44,
		name: "f64.const",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_F64
    }, {
        opcode: 0x0b,
        name: "end"
    }, {
        opcode: 0x1A,
        type: OP_TYPE_PAR,
        name: "drop",
        pull: WA_TYPE_ANY,
        push: WA_TYPE_VOID
    }, {
        opcode: 0x1B,   // select
        type: OP_TYPE_PAR,
        name: "select",
        pull: [WA_TYPE_NUMRIC, WA_TYPE_NUMRIC, WA_TYPE_I32],
        push: WA_TYPE_NUMRIC
    }, {
        opcode: 0x1C, // select t*
        type: OP_TYPE_PAR,
        name: "select"
    }, {
        opcode: 0x20,
        type: OP_TYPE_VAR,
        name: "local.get",
        pull: WA_TYPE_VOID,
        push: function(fn, inst) {
            return inst.local.type;
        }
    }, {
        opcode: 0x21,
        type: OP_TYPE_VAR,
        name: "local.set",
        pull: function(fn, inst) {
            return inst.local.type;
        },
        push: WA_TYPE_VOID
    }, {
        opcode: 0x22,
        type: OP_TYPE_VAR,
        name: "local.tee",
        pull: function(fn, inst) {
            return inst.local.type;
        },
        push: function(fn, inst) {
            return inst.local.type;
        }
    }, {
        opcode: 0x23,
        type: OP_TYPE_VAR,
        name: "global.get",
        pull: WA_TYPE_VOID,
        push: function(fn, inst) {
            return inst.global.type;
        },
    }, {
        opcode: 0x24,
        type: OP_TYPE_VAR,
        name: "global.set",
        pull: function(fn, inst) {
            return inst.global.type;
        },
        push: WA_TYPE_VOID
    }, {
        opcode: 0x25,
        type: OP_TYPE_TBL,
        name: "table.get",
        pull: WA_TYPE_I32,
        push: function(fn, inst) {
            return inst.table.reftype;
        }
    }, {
        opcode: 0x26,
        type: OP_TYPE_TBL,
        name: "table.set",
        pull: function(fn, inst) {
            return [inst.table.reftype, WA_TYPE_I32];
        },
        push: WA_TYPE_VOID
    }, {
        opcode: 0x28,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ,
        name: "i32.load",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I32

    }, {
        opcode: 0x29,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ,
        name: "i64.load",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x2a,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ,
        name: "f32.load",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_F32
    }, {
        opcode: 0x2b,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ,
        name: "f64.load",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_F64
    }, {
        opcode: 0x2c,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ,
        name: "i32.load8_s",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I32
    }, {
        opcode: 0x2d,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ,
        name: "i32.load8_u",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I32
    }, {
        opcode: 0x2e,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ,
        name: "i32.load16_s",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I32
    }, {
        opcode: 0x2f,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ,
        name: "i32.load16_u",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I32
    }, {
        opcode: 0x30,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ,
        name: "i64.load8_s",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x31,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ,
        name: "i64.load8_u",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x32,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ,
        name: "i64.load16_s",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x33,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ,
        name: "i64.load16_u",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x34,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ,
        name: "i64.load32_s",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x35,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ,
        name: "i64.load32_u",
        pull: WA_TYPE_ADDR,
        push: WA_TYPE_I64
    }, {
        opcode: 0x36,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE,
        name: "i32.store",
        pull: [WA_TYPE_ADDR, WA_TYPE_I32],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x37,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE,
        name: "i64.store",
        pull: [WA_TYPE_ADDR, WA_TYPE_I64],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x38,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE,
        name: "f32.store",
        pull: [WA_TYPE_ADDR, WA_TYPE_F32],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x39,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_WRITE,
        name: "f64.store",
        pull: [WA_TYPE_ADDR, WA_TYPE_F64],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3a,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_WRITE,
        name: "i32.store8",
        pull: [WA_TYPE_ADDR, WA_TYPE_I32],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3b,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_WRITE,
        name: "i32.store16",
        pull: [WA_TYPE_ADDR, WA_TYPE_I32],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3c,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_WRITE,
        name: "i64.store8",
        pull: [WA_TYPE_ADDR, WA_TYPE_I64],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3d,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_WRITE,
        name: "i64.store16",
        pull: [WA_TYPE_ADDR, WA_TYPE_I64],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3e,
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE,
        name: "i64.store32",
        pull: [WA_TYPE_ADDR, WA_TYPE_I64],
        push: WA_TYPE_VOID
    }, {
        opcode: 0x3f,
        name: "memory.size",    // memory.size 0x00
        pull: WA_TYPE_VOID,
        push: WA_TYPE_I32
    }, {
        opcode: 0x40,
        name: "memory.grow",    // memory.grow 0x00
        pull: WA_TYPE_I32,
        push: WA_TYPE_I32
    }, {
        opcode: 0x45,
        type: OP_TYPE_NUM,
        name: "i32.eqz",
        pull: WA_TYPE_I32,
        push: WA_TYPE_I32
    }, {
        opcode: 0x46,
        type: OP_TYPE_NUM,
        name: "i32.eq",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x47,
        type: OP_TYPE_NUM,
        name: "i32.ne",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x48,
        type: OP_TYPE_NUM,
        name: "i32.lt_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x49,
        type: OP_TYPE_NUM,
        name: "i32.lt_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4a,
        type: OP_TYPE_NUM,
        name: "i32.gt_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4b,
        type: OP_TYPE_NUM,
        name: "i32.gt_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4c, 
        type: OP_TYPE_NUM,
        name: "i32.le_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4d,
        name: "i32.le_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4e,
        name: "i32.ge_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x4f,
        name: "i32.ge_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x50,
        name: "i64.eqz",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I32
    }, {
        opcode: 0x51,
        name: "i64.eq",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x52,
        name: "i64.ne",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
        opcode: 0x53,
        name: "i64.lt_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x54,
		name: "i64.lt_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x55,
		name: "i64.gt_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x56,
		name: "i64.gt_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x57,
		name: "i64.le_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x58,
		name: "i64.le_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x59,
		name: "i64.ge_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5a,
		name: "i64.ge_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5b,
		name: "f32.eq",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5c,
		name: "f32.ne",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5d,
		name: "f32.lt",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5e,
		name: "f32.gt",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x5f,
		name: "f32.le",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x60,
		name: "f32.ge",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x61,
		name: "f64.eq",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x62,
		name: "f64.ne",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x63,
		name: "f64.lt",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x64,
		name: "f64.gt",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x65,
		name: "f64.le",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x66,
		name: "f64.ge",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x67,
		name: "i32.clz",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x68,
		name: "i32.ctz",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x69,
		name: "i32.popcnt",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6a,
		name: "i32.add",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6b,
		name: "i32.sub",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6c,
		name: "i32.mul",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6d,
		name: "i32.div_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6e,
		name: "i32.div_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x6f,
		name: "i32.rem_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x70,
		name: "i32.rem_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x71,
		name: "i32.and",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x72,
		name: "i32.or",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x73,
		name: "i32.xor",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x74,
		name: "i32.shl",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x75,
		name: "i32.shr_s",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x76,
		name: "i32.shr_u",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x77,
		name: "i32.rotl",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x78,
		name: "i32.rotr",
    	pull: [WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: 0x79,
		name: "i64.clz",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7a,
		name: "i64.ctz",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7b,
		name: "i64.popcnt",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7c,
		name: "i64.add",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7d,
		name: "i64.sub",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7e,
		name: "i64.mul",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x7f,
		name: "i64.div_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x80,
		name: "i64.div_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x81,
		name: "i64.rem_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x82,
		name: "i64.rem_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x83,
		name: "i64.and",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x84,
		name: "i64.or",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x85,
		name: "i64.xor",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x86,
		name: "i64.shl",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x87,
		name: "i64.shr_s",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x88,
		name: "i64.shr_u",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x89,
		name: "i64.rotl",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x8a,
		name: "i64.rotr",
    	pull: [WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: 0x8b,
		name: "f32.abs",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x8c,
		name: "f32.neg",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x8d,
		name: "f32.ceil",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x8e,
		name: "f32.floor",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x8f,
		name: "f32.trunc",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x90,
		name: "f32.nearest",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x91,
		name: "f32.sqrt",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x92,
		name: "f32.add",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x93,
		name: "f32.sub",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x94,
		name: "f32.mul",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x95,
		name: "f32.div",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x96,
		name: "f32.min",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x97,
		name: "f32.max",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x98,
		name: "f32.copysign",
    	pull: [WA_TYPE_F32, WA_TYPE_F32],
    	push: WA_TYPE_F32
    }, {
    	opcode: 0x99,
		name: "f64.abs",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9a,
		name: "f64.neg",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9b,
		name: "f64.ceil",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9c,
		name: "f64.floor",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9d,
		name: "f64.trunc",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9e,
		name: "f64.nearest",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0x9f,
		name: "f64.sqrt",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA0,
		name: "f64.add",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA1,
		name: "f64.sub",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA2,
		name: "f64.mul",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA3,
		name: "f64.div",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA4,
		name: "f64.min",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA5,
		name: "f64.max",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA6,
		name: "f64.copysign",
    	pull: [WA_TYPE_F64, WA_TYPE_F64],
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xA7,
		name: "i32.wrap_i64",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xA8,
		name: "i32.trunc_f32_s",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xA9,
		name: "i32.trunc_f32_u",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xAA,
		name: "i32.trunc_f64_s",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xAB,
		name: "i32.trunc_f64_u",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xAC,
		name: "i64.extend_i32_s",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xAD,
		name: "i64.extend_i32_u",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xAE,
		name: "i64.trunc_f32_s",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xAF,
		name: "i64.trunc_f32_u",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xB0,
		name: "i64.trunc_f64_s",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xB1,
		name: "i64.trunc_f64_u",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xB2,
		name: "f32.convert_i32_s",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xB3,
		name: "f32.convert_i32_u",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xB4,
		name: "f32.convert_i64_s",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xB5,
		name: "f32.convert_i64_u",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xB6,
		name: "f32.demote_f64",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xB7,
		name: "f64.convert_i32_s",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xB8,
		name: "f64.convert_i32_u",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xB9,
		name: "f64.convert_i64_s",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xBA,
		name: "f64.convert_i64_u",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xBB,
		name: "f64.promote_f32",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xBC,
		name: "i32.reinterpret_f32",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xBD,
		name: "i64.reinterpret_f64",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xBE,
		name: "f32.reinterpret_i32",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_F32
    }, {
    	opcode: 0xBF,
		name: "f64.reinterpret_i64",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_F64
    }, {
    	opcode: 0xC0,
		name: "i32.extend8_s",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xC1,
		name: "i32.extend16_s",
    	pull: WA_TYPE_I32,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xC2,
		name: "i64.extend8_s",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xC3,
		name: "i64.extend16_s",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xC4,
		name: "i64.extend32_s",
    	pull: WA_TYPE_I64,
    	push: WA_TYPE_I64
    }, {
    	opcode: 0xD0,
		name: "ref.null",
    	pull: WA_TYPE_VOID,
    	push: __t__
    }, {
    	opcode: 0xD1,
		name: "ref.is_null",
    	pull: __t__,
    	push: WA_TYPE_I32
    }, {
    	opcode: 0xD2,
		name: "ref.func",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_FUNC_REF
    }, {
    	opcode: (0xfc << 8) | 0,
		name: "i32.trunc_sat_f32_s",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 1,
		name: "i32.trunc_sat_f32_u",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 2,
		name: "i32.trunc_sat_f64_s",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 3,
		name: "i32.trunc_sat_f64_u",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 4,
		name: "i64.trunc_sat_f32_s",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xfc << 8) | 5,
		name: "i64.trunc_sat_f32_u",
    	pull: WA_TYPE_F32,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xfc << 8) | 6,
		name: "i64.trunc_sat_f64_s",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xfc << 8) | 7,
		name: "i64.trunc_sat_f64_u",
    	pull: WA_TYPE_F64,
    	push: WA_TYPE_I64
    }, {
        opcode: (0xfc << 8) | 8,
        name: "memory.init",
        type: OP_TYPE_MEM,
    	pull: [WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xfc << 8) | 9,
		name: "data.drop",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_VOID
    }, {
        opcode: (0xfc << 8) | 10,
        name: "memory.copy",
        type: OP_TYPE_MEM | NAT_ALIGN_NONE | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE,
        pull: [WA_TYPE_ADDR, WA_TYPE_ADDR, {type: WA_TYPE_I32, role: "length"}],
        push: WA_TYPE_VOID
    }, // memory.copy 0x00 0x00
    {
        opcode: (0xfc << 8) | 11,
        name: "memory.fill",
        type: OP_TYPE_MEM | NAT_ALIGN_NONE | OP_FLAG_MEM_WRITE,
        pull: [WA_TYPE_ADDR, WA_TYPE_ADDR, {type: WA_TYPE_I32, role: "length"}],
        push: WA_TYPE_VOID
    }, // memory.fill 0x00
    {
        opcode: (0xfc << 8) | 12,
		name: "table.init",
    	pull: [WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xfc << 8) | 13,
		name: "elem.drop",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xfc << 8) | 14,
		name: "table.copy",
    	pull: [WA_TYPE_I32, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xfc << 8) | 15,
		name: "table.grow",
    	pull: [__t__, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 16,
		name: "table.size",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xfc << 8) | 17,
		name: "table.fill",
    	pull: [WA_TYPE_I32, __t__, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    },


        // multi-byte sequence

    {
        opcode: (0xFD << 8) | 0,
        name: "v128.load",          //   m:memarg => v128.load m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
        opcode: (0xFD << 8) | 1,
        name: "v128.load8x8_s",     //   m:memarg => v128.load8x8_s m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 2,
		name: "v128.load8x8_u", //   m:memarg => v128.load8x8_u m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 3,
		name: "v128.load16x4_s", //   m:memarg => v128.load16x4_s m
        type: OP_TYPE_MEM | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 4,
		name: "v128.load16x4_u", //   m:memarg => v128.load16x4_u m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 5,
		name: "v128.load32x2_s", //   m:memarg => v128.load32x2_s m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 6,
		name: "v128.load32x2_u", //   m:memarg => v128.load32x2_u m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 7,
		name: "v128.load8_splat", //   m:memarg => v128.load8_splat m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 8,
		name: "v128.load16_splat", //   m:memarg => v128.load16_splat m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 9,
		name: "v128.load32_splat", //   m:memarg => v128.load32_splat m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 10,
		name: "v128.load64_splat", //   m:memarg => v128.load64_splat m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 92,
		name: "v128.load32_zero", //   m:memarg => v128.load32_zero m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 93,
		name: "v128.load64_zero", //   m:memarg => v128.load64_zero m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 11,
		name: "v128.store", //   m:memarg => v128.store m
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_WRITE,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFD << 8) | 84,
		name: "v128.load8_lane", //   m:memarg l:laneidx   => v128.load8_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 85,
		name: "v128.load16_lane", //   m:memarg l:laneidx   => v128.load16_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 86,
		name: "v128.load32_lane", //   m:memarg l:laneidx   => v128.load32_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 87,
		name: "v128.load64_lane", //   m:memarg l:laneidx   => v128.load64_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_READ,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 88,
		name: "v128.store8_lane", //   m:memarg l:laneidx   => v128.store8_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_WRITE,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFD << 8) | 89,
		name: "v128.store16_lane", //   m:memarg l:laneidx   => v128.store16_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_WRITE,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFD << 8) | 90,
		name: "v128.store32_lane", //   m:memarg l:laneidx   => v128.store32_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_WRITE,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFD << 8) | 91,
		name: "v128.store64_lane", //   m:memarg l:laneidx   => v128.store64_lane m l
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_128 | OP_FLAG_MEM_WRITE,
    	pull: [WA_TYPE_ADDR, WA_TYPE_V128],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFD << 8) | 21,
		name: "i8x16.extract_lane_s", //   l:laneidx    => i8x16.extract_lane_s l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 22,
		name: "i8x16.extract_lane_u", //   l:laneidx    => i8x16.extract_lane_u l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 23,
		name: "i8x16.replace_lane", //   l:laneidx    => i8x16.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 24,
		name: "i16x8.extract_lane_s", //   l:laneidx    => i16x8.extract_lane_s l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 25,
		name: "i16x8.extract_lane_u", //   l:laneidx    => i16x8.extract_lane_u l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 26,
		name: "i16x8.replace_lane", //   l:laneidx    => i16x8.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 27,
		name: "i32x4.extract_lane", //   l:laneidx    => i32x4.extract_lane l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 28,
		name: "i32x4.replace_lane", //   l:laneidx    => i32x4.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 29,
		name: "i64x2.extract_lane", //   l:laneidx    => i64x2.extract_lane l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFD << 8) | 30,
		name: "i64x2.replace_lane", //   l:laneidx    => i64x2.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_I64],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 31,
		name: "f32x4.extract_lane", //   l:laneidx    => f32x4.extract_lane l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_F32
    }, {
    	opcode: (0xFD << 8) | 32,
		name: "f32x4.replace_lane", //   l:laneidx    => f32x4.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_F32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 33,
		name: "f64x2.extract_lane", //   l:laneidx    => f64x2.extract_lane l
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_F64
    }, {
    	opcode: (0xFD << 8) | 34,
		name: "f64x2.replace_lane", //   l:laneidx    => f64x2.replace_lane l
    	pull: [WA_TYPE_V128, WA_TYPE_F64],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 14,
		name: "i8x16.swizzle", //  i8x16.swizzle
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 15,
		name: "i8x16.splat", //  i8x16.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 16,
		name: "i16x8.splat", //  i16x8.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 17,
		name: "i32x4.splat", //  i32x4.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 18,
		name: "i64x2.splat", //  i64x2.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 19,
		name: "f32x4.splat", //  f32x4.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 20,
		name: "f64x2.splat", //  f64x2.splat
    	pull: [______, ______],
    	push: ______
    }, {
    	opcode: (0xFD << 8) | 35,
		name: "i8x16.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 36,
		name: "i8x16.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 37,
		name: "i8x16.lt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 38,
		name: "i8x16.lt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 39,
		name: "i8x16.gt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 40,
		name: "i8x16.gt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 41,
		name: "i8x16.le_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 42,
		name: "i8x16.le_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 43,
		name: "i8x16.ge_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 44,
		name: "i8x16.ge_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 45,
		name: "i16x8.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 46,
		name: "i16x8.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 47,
		name: "i16x8.lt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 48,
		name: "i16x8.lt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 49,
		name: "i16x8.gt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 50,
		name: "i16x8.gt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 51,
		name: "i16x8.le_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 52,
		name: "i16x8.le_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 53,
		name: "i16x8.ge_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 54,
		name: "i16x8.ge_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 55,
		name: "i32x4.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 56,
		name: "i32x4.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 57,
		name: "i32x4.lt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 58,
		name: "i32x4.lt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 59,
		name: "i32x4.gt_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 60,
		name: "i32x4.gt_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 61,
		name: "i32x4.le_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 62,
		name: "i32x4.le_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 63,
		name: "i32x4.ge_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 64,
		name: "i32x4.ge_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 214,
		name: "i64x2.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 215,
		name: "i64x2.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 216,
		name: "i64x2.lt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 217,
		name: "i64x2.gt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 218,
		name: "i64x2.le",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 219,
		name: "i64x2.ge",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 65,
		name: "f32x4.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 66,
		name: "f32x4.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 67,
		name: "f32x4.lt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 68,
		name: "f32x4.gt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 69,
		name: "f32x4.le",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 70,
		name: "f32x4.ge",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 71,
		name: "f64x2.eq",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 72,
		name: "f64x2.ne",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 73,
		name: "f64x2.lt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 74,
		name: "f64x2.gt",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 75,
		name: "f64x2.le",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 76,
		name: "f64x2.ge",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 77,
		name: "v128.not",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 78,
		name: "v128.and",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 79,
		name: "v128.andnot",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 80,
		name: "v128.or",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 81,
		name: "v128.xor",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 82,
		name: "v128.bitselect",
    	pull: [WA_TYPE_V128, WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 83,
		name: "v128.any_true",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 96,
		name: "i8x16.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 97,
		name: "i8x16.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 98,
		name: "i8x16.popcnt",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 99,
		name: "i8x16.all_true",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 100,
		name: "i8x16.bitmask",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 101,
		name: "i8x16.narrow_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 102,
		name: "i8x16.narrow_i16x8_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 107,
		name: "i8x16.shl",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 108,
		name: "i8x16.shr_s",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 109,
		name: "i8x16.shr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 110,
		name: "i8x16.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 111,
		name: "i8x16.add_sat_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 112,
		name: "i8x16.add_sat_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 113,
		name: "i8x16.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 114,
		name: "i8x16.sub_sat_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 115,
		name: "i8x16.sub_sat_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 118,
		name: "i8x16.min_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 119,
		name: "i8x16.min_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 120,
		name: "i8x16.max_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 121,
		name: "i8x16.max_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 123,
		name: "i8x16.avgr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 124,
		name: "i16x8.extadd_pairwise_i8x16_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 125,
		name: "i16x8.extadd_pairwise_i8x16_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 128,
		name: "i16x8.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 129,
		name: "i16x8.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 130,
		name: "i16x8.q15mulr_sat_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 131,
		name: "i16x8.all_true",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 132,
		name: "i16x8.bitmask",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 133,
		name: "i16x8.narrow_i32x4_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 134,
		name: "i16x8.narrow_i32x4_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 135,
		name: "i16x8.extend_low_i8x16_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 136,
		name: "i16x8.extend_high_i8x16_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 137,
		name: "i16x8.extend_low_i8x16_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 138,
		name: "i16x8.extend_high_i8x16_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 139,
		name: "i16x8.shl",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 140,
		name: "i16x8.shr_s",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 141,
		name: "i16x8.shr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 142,
		name: "i16x8.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 143,
		name: "i16x8.add_sat_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 144,
		name: "i16x8.add_sat_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 145,
		name: "i16x8.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 146,
		name: "i16x8.sub_sat_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 147,
		name: "i16x8.sub_sat_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 149,
		name: "i16x8.mul",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 150,
		name: "i16x8.min_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 151,
		name: "i16x8.min_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 152,
		name: "i16x8.max_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 153,
		name: "i16x8.max_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 155,
		name: "i16x8.avgr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 156,
		name: "i16x8.extmul_low_i8x16_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 157,
		name: "i16x8.extmul_high_i8x16_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 158,
		name: "i16x8.extmul_low_i8x16_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 159,
		name: "i16x8.extmul_high_i8x16_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 126,
		name: "i32x4.extadd_pairwise_i16x8_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 127,
		name: "i32x4.extadd_pairwise_i16x8_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 160,
		name: "i32x4.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 161,
		name: "i32x4.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 163,
		name: "i32x4.all_true",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 164,
		name: "i32x4.bitmask",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 167,
		name: "i32x4.extend_low_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 168,
		name: "i32x4.extend_high_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 169,
		name: "i32x4.extend_low_i16x8_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 170,
		name: "i32x4.extend_high_i16x8_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 171,
		name: "i32x4.shl",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 172,
		name: "i32x4.shr_s",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 173,
		name: "i32x4.shr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 174,
		name: "i32x4.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 177,
		name: "i32x4.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 181,
		name: "i32x4.mul",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 182,
		name: "i32x4.min_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 183,
		name: "i32x4.min_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 184,
		name: "i32x4.max_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 185,
		name: "i32x4.max_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 186,
		name: "i32x4.dot_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 188,
		name: "i32x4.extmul_low_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 189,
		name: "i32x4.extmul_high_i16x8_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 190,
		name: "i32x4.extmul_low_i16x8_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 191,
		name: "i32x4.extmul_high_i16x8_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 192,
		name: "i64x2.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 193,
		name: "i64x2.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 195,
		name: "i64x2.all_true",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 196,
		name: "i64x2.bitmask",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFD << 8) | 199,
		name: "i64x2.extend_low_i32x4_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 200,
		name: "i64x2.extend_high_i32x4_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 201,
		name: "i64x2.extend_low_i32x4_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 202,
		name: "i64x2.extend_high_i32x4_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 203,
		name: "i64x2.shl",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 204,
		name: "i64x2.shr_s",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 205,
		name: "i64x2.shr_u",
    	pull: [WA_TYPE_V128, WA_TYPE_I32],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 206,
		name: "i64x2.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 209,
		name: "i64x2.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 213,
		name: "i64x2.mul",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 220,
		name: "i64x2.extmul_low_i32x4_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 221,
		name: "i64x2.extmul_high_i32x4_s",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 222,
		name: "i64x2.extmul_low_i32x4_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 223,
		name: "i64x2.extmul_high_i32x4_u",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 103,
		name: "f32x4.ceil",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 104,
		name: "f32x4.floor",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 105,
		name: "f32x4.trunc",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 106,
		name: "f32x4.nearest",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 224,
		name: "f32x4.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 225,
		name: "f32x4.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 227,
		name: "f32x4.sqrt",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 228,
		name: "f32x4.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 229,
		name: "f32x4.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 230,
		name: "f32x4.mul",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 231,
		name: "f32x4.div",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 232,
		name: "f32x4.min",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 233,
		name: "f32x4.max",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 234,
		name: "f32x4.pmin",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 235,
		name: "f32x4.pmax",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 116,
		name: "f64x2.ceil",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 117,
		name: "f64x2.floor",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 122,
		name: "f64x2.trunc",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 148,
		name: "f64x2.nearest",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 236,
		name: "f64x2.abs",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 237,
		name: "f64x2.neg",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 239,
		name: "f64x2.sqrt",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 240,
		name: "f64x2.add",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 241,
		name: "f64x2.sub",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 242,
		name: "f64x2.mul",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 243,
		name: "f64x2.div",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 244,
		name: "f64x2.min",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 245,
		name: "f64x2.max",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 246,
		name: "f64x2.pmin",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 247,
		name: "f64x2.pmax",
    	pull: [WA_TYPE_V128, WA_TYPE_V128],
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 248,
		name: "i32x4.trunc_sat_f32x4_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 249,
		name: "i32x4.trunc_sat_f32x4_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 250,
		name: "f32x4.convert_i32x4_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 251,
		name: "f32x4.convert_i32x4_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 252,
		name: "i32x4.trunc_sat_f64x2_s_zero",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 253,
		name: "i32x4.trunc_sat_f64x2_u_zero",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 254,
		name: "f64x2.convert_low_i32x4_s",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 255,
		name: "f64x2.convert_low_i32x4_u",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
    	opcode: (0xFD << 8) | 94,
		name: "f32x4.demote_f64x2_zero",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    }, {
        opcode: (0xFD << 8) | 95,
        name: "f64x2.promote_low_f32x4",
    	pull: WA_TYPE_V128,
    	push: WA_TYPE_V128
    },



    // Atomic Memory Instructions
    {
        opcode: (0xFE << 8) | 0x00,
        name: "memory.atomic.notify",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | OP_FLAG_MAY_TRAP,
        pull: [WA_TYPE_ADDR, WA_TYPE_I32],
        push: WA_TYPE_I32
    }, {
        opcode: (0xFE << 8) | 0x01,
        name: "memory.atomic.wait32",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
        pull: [WA_TYPE_ADDR, WA_TYPE_I32, WA_TYPE_I64], // addr, expected, timeout
        push: WA_TYPE_I32
    }, {
        opcode: (0xFE << 8) | 0x02,
        name: "memory.atomic.wait64",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
        pull: [WA_TYPE_ADDR, WA_TYPE_I64, WA_TYPE_I64], // addr, expected, timeout
        push: WA_TYPE_I32
    }, {
        opcode: (0xFE << 8) | 0x03,
        name: "atomic.fence",
    	pull: WA_TYPE_VOID,
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x10,
		name: "i32.atomic.load",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x11,
		name: "i64.atomic.load",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x12,
		name: "i32.atomic.load8_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x13,
		name: "i32.atomic.load16_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x14,
		name: "i64.atomic.load8_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x15,
		name: "i64.atomic.load16_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x16,
		name: "i64.atomic.load32_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MAY_TRAP,
    	pull: WA_TYPE_ADDR,
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x17,
		name: "i32.atomic.store",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x18,
		name: "i64.atomic.store",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x19,
		name: "i32.atomic.store8",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x1A,
		name: "i32.atomic.store16",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x1B,
		name: "i64.atomic.store8",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x1C,
		name: "i64.atomic.store16",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x1D,
		name: "i64.atomic.store32",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_VOID
    }, {
    	opcode: (0xFE << 8) | 0x1E,
		name: "i32.atomic.rmw.add",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x1F,
		name: "i64.atomic.rmw.add",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x20,
		name: "i32.atomic.rmw8.add_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x21,
		name: "i32.atomic.rmw16.add_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x22,
		name: "i64.atomic.rmw8.add_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x23,
		name: "i64.atomic.rmw16.add_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x24,
		name: "i64.atomic.rmw32.add_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x25,
		name: "i32.atomic.rmw.sub",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x26,
		name: "i64.atomic.rmw.sub",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x27,
		name: "i32.atomic.rmw8.sub_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x28,
		name: "i32.atomic.rmw16.sub_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x29,
		name: "i64.atomic.rmw8.sub_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x2A,
		name: "i64.atomic.rmw16.sub_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x2B,
		name: "i64.atomic.rmw32.sub_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x2C,
		name: "i32.atomic.rmw.and",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x2D,
		name: "i64.atomic.rmw.and",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x2E,
		name: "i32.atomic.rmw8.and_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x2F,
		name: "i32.atomic.rmw16.and_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x30,
		name: "i64.atomic.rmw8.and_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x31,
		name: "i64.atomic.rmw16.and_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x32,
		name: "i64.atomic.rmw32.and_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x33,
		name: "i32.atomic.rmw.or",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x34,
		name: "i64.atomic.rmw.or",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x35,
		name: "i32.atomic.rmw8.or_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x36,
		name: "i32.atomic.rmw16.or_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x37,
		name: "i64.atomic.rmw8.or_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x38,
		name: "i64.atomic.rmw16.or_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x39,
		name: "i64.atomic.rmw32.or_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x3A,
		name: "i32.atomic.rmw.xor",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x3B,
		name: "i64.atomic.rmw.xor",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x3C,
		name: "i32.atomic.rmw8.xor_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x3D,
		name: "i32.atomic.rmw16.xor_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x3E,
		name: "i64.atomic.rmw8.xor_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x3F,
		name: "i64.atomic.rmw16.xor_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x40,
		name: "i64.atomic.rmw32.xor_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x41,
		name: "i32.atomic.rmw.xchg",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x42,
		name: "i64.atomic.rmw.xchg",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x43,
		name: "i32.atomic.rmw8.xchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x44,
		name: "i32.atomic.rmw16.xchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x45,
		name: "i64.atomic.rmw8.xchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x46,
		name: "i64.atomic.rmw16.xchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x47,
		name: "i64.atomic.rmw32.xchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x48,
		name: "i32.atomic.rmw.cmpxchg",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x49,
		name: "i64.atomic.rmw.cmpxchg",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_64 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x4A,
		name: "i32.atomic.rmw8.cmpxchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x4B,
		name: "i32.atomic.rmw16.cmpxchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I32, WA_TYPE_I32],
    	push: WA_TYPE_I32
    }, {
    	opcode: (0xFE << 8) | 0x4C,
		name: "i64.atomic.rmw8.cmpxchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_8 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x4D,
		name: "i64.atomic.rmw16.cmpxchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_16 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }, {
    	opcode: (0xFE << 8) | 0x4E,
		name: "i64.atomic.rmw32.cmpxchg_u",
        type: OP_TYPE_MEM | OP_FLAG_MEMARG | NAT_ALIGN_32 | OP_FLAG_MEM_READ | OP_FLAG_MEM_WRITE | OP_FLAG_MAY_TRAP,
    	pull: [WA_TYPE_ADDR, WA_TYPE_I64, WA_TYPE_I64],
    	push: WA_TYPE_I64
    }
];

(function() {

    let len = opcode_info.length;
    for (let i = 0; i < len; i++) {
        let opcls = opcode_info[i];
        opclsmap.set(opcls.opcode, opcls);
    }

})();

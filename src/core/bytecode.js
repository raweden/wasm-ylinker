
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

import { RELOC_PAD } from "./const"
import { WasmType, isValidValueType } from "./types";
import { BlockInst, CallInst, IfInst, BranchTableInst, ThrowInst, TryInst, CatchAllInst, LoopInst,DelegateInst, CatchInst, ReThrowInst, ReturnInst, IndirectCallInst, UnreachableInst } from "./inst"
import { lengthSLEB128, lengthULEB128 } from "./ByteArray"


/**
 * Runs trough every instruction to compute the number of bytes needed to encode it, it also validates that a reference to
 * objectified value exists within the corresponding structure in module.
 * 
 * @param {WebAssemblyModule} mod 
 * @param {WasmInstruction[]} opcodes 
 * @param {WasmLocal[]} locals 
 * @param {boolean=} genloc A boolean that determines if the offset of every instruction should be noted on the instruction itself, this is set to the `_loc` property.
 * @param {boolean=} relocatable A boolean value that determines whether certain instruction should be encoded as relocatable (adding extra padding to the leb128 so that the value could be changed.)
 * @returns {integer} 
 */
export function byteCodeComputeByteLength(mod, opcodes, locals, genloc, relocatable) {
    genloc = (genloc === true);
    relocatable = (relocatable === true);
    let sz = 0;


    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;
    let padTo = relocatable === true ? RELOC_PAD : 0;

    let len = opcodes.length;
    for (let i = 0; i < len; i++) {
        let inst = opcodes[i];
        let b1 = inst.opcode
        let b2 = 0;
        if (b1 > 0xFF) {
            b2 = b1 & 0xFF;
            b1 = (b1 >> 8) & 0xFF;
        }

        if (genloc)
            inst._loc = sz;

        /*if (debug) {
            console.log("inst 0x%s at %d", (inst.opcode).toString(16), sz);
        }*/

        switch (b1) {
            case 0x00: // unreachable
            case 0x01: // nop
                sz += 1;
                break;
            case 0x02: // block
            case 0x03: // loop
            case 0x04: // if bt <in*> 0x0B || if bt <in1*> 0x05 <in2*> 0x0B
            {
                sz += 1;
                if (typeof inst.type == "number") {
                    let type = inst.type;
                    if (type != 0x40 && !isValidValueType(type))
                        throw TypeError("invalid valuetype");
                    sz += 1;
                } else if (typeof inst.typeidx == "number") {
                    sz += lengthSLEB128(inst.typeidx);
                } else if (inst.type instanceof WasmType) {
                    let typeidx = types.indexOf(inst.type);
                    if (typeidx === -1)
                        throw new ReferenceError("typeidx not found");
                    sz += lengthSLEB128(typeidx);
                }
                break;
            }
            case 0x05: // else <in2*> 0x0B
                sz += 1;
                break;
            
            // wasm-eh
            case 0x06: // try bt
            {
                sz += 1;
                if (typeof inst.type == "number") {
                    let type = inst.type;
                    if (type != 0x40 && !isValidValueType(type))
                        throw TypeError("invalid valuetype");
                    sz += 1;
                } else if (inst.type instanceof WasmType) {
                    let typeidx = types.indexOf(inst.type);
                    if (typeidx === -1)
                        throw new ReferenceError("typeidx not found");
                    sz += lengthSLEB128(typeidx);
                }
                break;
            }
            case 0x07: // catch x
            {
                sz += 1;
                let tagidx = mod.tags.indexOf(inst.tag);
                if (tagidx === -1)
                    throw new ReferenceError("tagidx not found");
                sz += lengthULEB128(tagidx);
                break;
            }
            case 0x19: // catch_all
                sz += 1;
                break;
            case 0x18: // delegate rd
                sz += 1;
                sz += lengthULEB128(inst.relative_depth);
                break;
            case 0x08: // throw x
            {
                sz += 1;
                let tagidx = mod.tags.indexOf(inst.tag);
                if (tagidx === -1)
                    throw new ReferenceError("tagidx not found");
                sz += lengthULEB128(tagidx);
                break;
            }
            case 0x09: // rethrow rd
                sz += 1;
                sz += lengthULEB128(inst.relative_depth);
                break;

            case 0x0C: // br
                sz += 1;
                sz += lengthULEB128(inst.labelidx);
                break;
            case 0x0D: // br_if
                sz += 1;
                sz += lengthULEB128(inst.labelidx);
                break;
            case 0x0E: // br_table
            {
                sz += 1;
                let labels = inst.labels;
                let cnt = labels.length;
                sz += lengthULEB128(cnt);
                for (let x = 0; x < cnt; x++) {
                    sz += lengthULEB128(labels[x]);
                }
                sz += lengthULEB128(inst.default_br);
                break;
            }
            case 0x0F: // return
                sz += 1;
                break;
            case 0x10: // call
            {
                sz += 1;
                let funcidx = functions.indexOf(inst.func);
                if (funcidx === -1)
                    throw new ReferenceError("funcidx not found");
                sz += lengthULEB128(funcidx);
                break;
            }
            case 0x11: // call_indirect
            {
                sz += 1;
                let typeidx, tableidx = tables.indexOf(inst.table);
                if (tableidx === -1)
                    throw new ReferenceError("tableidx not found");
                typeidx = types.indexOf(inst.type);
                if (typeidx === -1)
                    throw new ReferenceError("typeidx not found");
                sz += lengthULEB128(typeidx);
                sz += lengthULEB128(tableidx);
                break;
            }
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
            // return_call          0x12    [t3* t1*] -> [t4*]
            // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
            case 0x41: // i32.const
                sz += 1;
                sz += lengthSLEB128(inst.value, inst.reloc ? padTo : 0);
                break;
            case 0x42: // i64.const
                sz += 1;
                sz += lengthSLEB128(inst.value, inst.reloc ? padTo : 0);
                break;
            case 0x43: // f32.const
                sz += 5;
                break;
            case 0x44: // f64.const
                sz += 9;
                break;
            case 0x0b: // end
            {
                sz += 1;
                break;
            }
            case 0x1A: // drop
                sz += 1;
                break;
            case 0x1B: // select
                sz += 1;
                break;
            case 0x1C: // select t*
                sz += 1;
                break;
            case 0x20: // local.get
            {
                sz += 1;
                let idx = locals.indexOf(inst.local);
                sz += lengthULEB128(idx);
                break;
            }
            case 0x21: // local.set
            {
                sz += 1;
                let idx = locals.indexOf(inst.local);
                sz += lengthULEB128(idx);
                break;
            }
            case 0x22: // local.tee
            {
                sz += 1;
                let idx = locals.indexOf(inst.local);
                sz += lengthULEB128(idx);
                break;
            }
            case 0x23: // global.get
            {
                sz += 1;
                let globalidx = globals.indexOf(inst.global);
                if (globalidx === -1)
                    throw new ReferenceError("globalidx not found");
                sz += lengthULEB128(globalidx);
                break;
            }
            case 0x24: // global.set
            {
                sz += 1;
                let globalidx = globals.indexOf(inst.global);
                if (globalidx === -1)
                    throw new ReferenceError("globalidx not found");
                sz += lengthULEB128(globalidx);
                break;
            }
            case 0x25: // table.get
            {
                sz += 1;
                let tableidx = tables.indexOf(inst.table);
                if (tableidx === -1)
                    throw new ReferenceError("tableidx not found");
                sz += lengthULEB128(tableidx);
                break;
            }
            case 0x26: // table.set
            {
                sz += 1;
                let tableidx = tables.indexOf(inst.table);
                if (tableidx === -1)
                    throw new ReferenceError("tableidx not found");
                sz += lengthULEB128(tableidx);
                break;
            }
            case 0x28: // i32.load
            case 0x29: // i64.load
            case 0x2a: // f32.load
            case 0x2b: // f64.load
            case 0x2c: // i32.load8_s
            case 0x2d: // i32.load8_u
            case 0x2e: // i32.load16_s
            case 0x2f: // i32.load16_u
            case 0x30: // i64.load8_s
            case 0x31: // i64.load8_u
            case 0x32: // i64.load16_s
            case 0x33: // i64.load16_u
            case 0x34: // i64.load32_s
            case 0x35: // i64.load32_u
            case 0x36: // i32.store
            case 0x37: // i64.store
            case 0x38: // f32.store
            case 0x39: // f64.store
            case 0x3a: // i32.store8
            case 0x3b: // i32.store16
            case 0x3c: // i64.store8
            case 0x3d: // i64.store16
            case 0x3e: // i64.store32
            {
                sz += 1;
                sz += lengthULEB128(inst.align);
                sz += lengthULEB128(inst.offset, inst.reloc ? padTo : 0);
                break;
            }
            case 0x3f: // memory.size 0x00
            {
                if (inst.memidx != 0x00)
                    throw TypeError("invalid memidx");
                sz += 2;
                //sz += lengthULEB128(inst.memidx);
                break;
            }
            case 0x40: // memory.grow 0x00
            {
                if (inst.memidx != 0x00)
                    throw TypeError("invalid memidx");
                sz += 2;
                //sz += lengthULEB128(inst.memidx);
                break;
            }
            case 0x45: // i32.eqz
            case 0x46: // i32.eq
            case 0x47: // i32.ne
            case 0x48: // i32.lt_s
            case 0x49: // i32.lt_u
            case 0x4a: // i32.gt_s
            case 0x4b: // i32.gt_u
            case 0x4c: // i32.le_s
            case 0x4d: // i32.le_u
            case 0x4e: // i32.ge_s
            case 0x4f: // i32.ge_u

            case 0x50: // i64.eqz
            case 0x51: // i64.eq
            case 0x52: // i64.ne
            case 0x53: // i64.lt_s
            case 0x54: // i64.lt_u
            case 0x55: // i64.gt_s
            case 0x56: // i64.gt_u
            case 0x57: // i64.le_s
            case 0x58: // i64.le_u
            case 0x59: // i64.ge_s
            case 0x5a: // i64.ge_u

            case 0x5b: // f32.eq
            case 0x5c: // f32.ne
            case 0x5d: // f32.lt
            case 0x5e: // f32.gt
            case 0x5f: // f32.le
            case 0x60: // f32.ge

            case 0x61: // f64.eq
            case 0x62: // f64.ne
            case 0x63: // f64.lt
            case 0x64: // f64.gt
            case 0x65: // f64.le
            case 0x66: // f64.ge

            case 0x67: // i32.clz
            case 0x68: // i32.ctz
            case 0x69: // i32.popcnt
            case 0x6a: // i32.add
            case 0x6b: // i32.sub
            case 0x6c: // i32.mul
            case 0x6d: // i32.div_s
            case 0x6e: // i32.div_u
            case 0x6f: // i32.rem_s
            case 0x70: // i32.rem_u
            case 0x71: // i32.and
            case 0x72: // i32.or
            case 0x73: // i32.xor
            case 0x74: // i32.shl
            case 0x75: // i32.shr_s
            case 0x76: // i32.shr_u
            case 0x77: // i32.rotl
            case 0x78: // i32.rotr

            case 0x79: // i64.clz
            case 0x7a: // i64.ctz
            case 0x7b: // i64.popcnt
            case 0x7c: // i64.add
            case 0x7d: // i64.sub
            case 0x7e: // i64.mul
            case 0x7f: // i64.div_s
            case 0x80: // i64.div_u
            case 0x81: // i64.rem_s
            case 0x82: // i64.rem_u
            case 0x83: // i64.and
            case 0x84: // i64.or
            case 0x85: // i64.xor
            case 0x86: // i64.shl
            case 0x87: // i64.shr_s
            case 0x88: // i64.shr_u
            case 0x89: // i64.rotl
            case 0x8a: // i64.rotr

            case 0x8b: // f32.abs
            case 0x8c: // f32.neg
            case 0x8d: // f32.ceil
            case 0x8e: // f32.floor
            case 0x8f: // f32.trunc
            case 0x90: // f32.nearest
            case 0x91: // f32.sqrt
            case 0x92: // f32.add
            case 0x93: // f32.sub
            case 0x94: // f32.mul
            case 0x95: // f32.div
            case 0x96: // f32.min
            case 0x97: // f32.max
            case 0x98: // f32.copysign

            case 0x99: // f64.abs
            case 0x9a: // f64.neg
            case 0x9b: // f64.ceil
            case 0x9c: // f64.floor
            case 0x9d: // f64.trunc
            case 0x9e: // f64.nearest
            case 0x9f: // f64.sqrt
            case 0xA0: // f64.add
            case 0xA1: // f64.sub
            case 0xA2: // f64.mul
            case 0xA3: // f64.div
            case 0xA4: // f64.min
            case 0xA5: // f64.max
            case 0xA6: // f64.copysign

            case 0xA7: // i32.wrap_i64
            case 0xA8: // i32.trunc_f32_s
            case 0xA9: // i32.trunc_f32_u
            case 0xAA: // i32.trunc_f64_s
            case 0xAB: // i32.trunc_f64_u
            case 0xAC: // i64.extend_i32_s
            case 0xAD: // i64.extend_i32_u
            case 0xAE: // i64.trunc_f32_s
            case 0xAF: // i64.trunc_f32_u
            case 0xB0: // i64.trunc_f64_s
            case 0xB1: // i64.trunc_f64_u
            case 0xB2: // f32.convert_i32_s
            case 0xB3: // f32.convert_i32_u
            case 0xB4: // f32.convert_i64_s
            case 0xB5: // f32.convert_i64_u
            case 0xB6: // f32.demote_f64
            case 0xB7: // f64.convert_i32_s
            case 0xB8: // f64.convert_i32_u
            case 0xB9: // f64.convert_i64_s
            case 0xBA: // f64.convert_i64_u
            case 0xBB: // f64.promote_f32
            case 0xBC: // i32.reinterpret_f32
            case 0xBD: // i64.reinterpret_f64
            case 0xBE: // f32.reinterpret_i32
            case 0xBF: // f64.reinterpret_i64

            case 0xC0: // i32.extend8_s
            case 0xC1: // i32.extend16_s
            case 0xC2: // i64.extend8_s
            case 0xC3: // i64.extend16_s
            case 0xC4: // i64.extend32_s
                sz += 1;
                break;
            case 0xD0: // ref.null
                sz += 1;
                sz += lengthULEB128(inst.reftype);
                break;
            case 0xD1: // ref.is_null
                sz += 1;
                break;
            case 0xD2: // ref.func
            {
                let funcidx = functions.indexOf(inst.func);
                if (funcidx === -1)
                    throw new ReferenceError("funcidx not found");
                sz += 1;
                sz += lengthULEB128(funcidx);
                break;
            }
            case 0xfc:
            {
                switch (b2) {
                    case  0: // i32.trunc_sat_f32_s
                    case  1: // i32.trunc_sat_f32_u
                    case  2: // i32.trunc_sat_f64_s
                    case  3: // i32.trunc_sat_f64_u
                    case  4: // i64.trunc_sat_f32_s
                    case  5: // i64.trunc_sat_f32_u
                    case  6: // i64.trunc_sat_f64_s
                    case  7: // i64.trunc_sat_f64_u
                        sz += 1;
                        sz += lengthULEB128(b2);
                        break;
                    case  8: // memory.init
                    {
                        let memidx, dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        memidx = mod.memory.indexOf(inst.memory);
                        if (memidx === -1)
                            throw new ReferenceError("memidx not found");
                        sz += 2; // low-bytecode + memidx
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(dataidx);
                        break;
                    }
                    case  9: // data.drop
                    {
                        let dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(dataidx);
                        break;
                    }
                    case 10: // memory.copy 0x00 0x00
                        sz += 3; // b1 + 2x 8-byte reserved (from/to memidx)
                        sz += lengthULEB128(b2);
                        break;
                    case 11: // memory.fill 0x00
                        sz += 2;
                        sz += lengthULEB128(b2);
                        break;
                    //
                    case 12: // table.init
                    {
                        let elemidx, tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        elemidx = mod.elementSegments.indexOf(inst.elem);
                        if (elemidx === -1)
                            throw new ReferenceError("elemidx not found");
                        sz += 2; // low-opcode + tblidx
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(elemidx);
                        break;
                    }
                    case 13: // elem.drop
                    {
                        let elemidx = mod.elementSegments.indexOf(inst.elem);
                        if (elemidx === -1)
                            throw new ReferenceError("elemidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(elemidx);
                        break;
                    }
                    case 14: // table.copy
                    {
                        let tblidx2, tblidx1 = tables.indexOf(inst.table1);
                        if (tblidx1 === -1)
                            throw new ReferenceError("tableidx not found");
                        tblidx2 = tables.indexOf(inst.table2);
                        if (tblidx2 === -1)
                            throw new ReferenceError("tableidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(tblidx1);
                        sz += lengthULEB128(tblidx2);
                        break;
                    }
                    case 15: // table.grow
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(tblidx);
                        break;
                    }
                    case 16: // table.size
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(tblidx);
                        break;
                    }
                    case 17: // table.fill
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(tblidx);
                        break;
                    }
                }
                break;
            }

            case 0xFD: // multi-byte sequence
            {
                switch (b2) {
                    case 0:     // m:memarg =>  v128.load m
                    case 1:     // m:memarg =>  v128.load8x8_s m
                    case 2:     // m:memarg =>  v128.load8x8_u m
                    case 3:     // m:memarg =>  v128.load16x4_s m
                    case 4:     // m:memarg =>  v128.load16x4_u m
                    case 5:     // m:memarg =>  v128.load32x2_s m
                    case 6:     // m:memarg =>  v128.load32x2_u m
                    case 7:     // m:memarg =>  v128.load8_splat m
                    case 8:     // m:memarg =>  v128.load16_splat m
                    case 9:     // m:memarg =>  v128.load32_splat m
                    case 10:    // m:memarg =>  v128.load64_splat m
                    case 92:    // m:memarg =>  v128.load32_zero m
                    case 93:    // m:memarg =>  v128.load64_zero m
                    case 11:    // m:memarg =>  v128.store m
                    {
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.align);
                        sz += lengthULEB128(inst.offset);
                        break;
                    }
                    case 84:    // m:memarg l:laneidx   =>  v128.load8_lane m l
                    case 85:    // m:memarg l:laneidx   =>  v128.load16_lane m l
                    case 86:    // m:memarg l:laneidx   =>  v128.load32_lane m l
                    case 87:    // m:memarg l:laneidx   =>  v128.load64_lane m l
                    case 88:    // m:memarg l:laneidx   =>  v128.store8_lane m l
                    case 89:    // m:memarg l:laneidx   =>  v128.store16_lane m l
                    case 90:    // m:memarg l:laneidx   =>  v128.store32_lane m l
                    case 91:    // m:memarg l:laneidx   =>  v128.store64_lane m l

                        break;

                    case 12:    // v128.const (b0 ... b15)
                        sz += 1;
                        sz += lengthULEB128(b2);
                        throw TypeError("TODO implement me!");
                        break;
                    case 13:    // i8x16.shuffle l
                        sz += 1;
                        sz += lengthULEB128(b2);
                        throw TypeError("TODO implement me!");
                        break;
                    case 21:    // l:laneidx    =>  i8x16.extract_lane_s l
                    case 22:    // l:laneidx    =>  i8x16.extract_lane_u l
                    case 23:    // l:laneidx    =>  i8x16.replace_lane l
                    case 24:    // l:laneidx    =>  i16x8.extract_lane_s l
                    case 25:    // l:laneidx    =>  i16x8.extract_lane_u l
                    case 26:    // l:laneidx    =>  i16x8.replace_lane l
                    case 27:    // l:laneidx    =>  i32x4.extract_lane l
                    case 28:    // l:laneidx    =>  i32x4.replace_lane l
                    case 29:    // l:laneidx    =>  i64x2.extract_lane l
                    case 30:    // l:laneidx    =>  i64x2.replace_lane l
                    case 31:    // l:laneidx    =>  f32x4.extract_lane l
                    case 32:    // l:laneidx    =>  f32x4.replace_lane l
                    case 33:    // l:laneidx    =>  f64x2.extract_lane l
                    case 34:    // l:laneidx    =>  f64x2.replace_lane l
                        throw TypeError("TODO implement me!");
                        break;
                    case 14:    // i8x16.swizzle
                    case 15:    // i8x16.splat
                    case 16:    // i16x8.splat
                    case 17:    // i32x4.splat
                    case 18:    // i64x2.splat
                    case 19:    // f32x4.splat
                    case 20:    // f64x2.splat

                    case 35:    // i8x16.eq
                    case 36:    // i8x16.ne
                    case 37:    // i8x16.lt_s
                    case 38:    // i8x16.lt_u
                    case 39:    // i8x16.gt_s
                    case 40:    // i8x16.gt_u
                    case 41:    // i8x16.le_s
                    case 42:    // i8x16.le_u
                    case 43:    // i8x16.ge_s
                    case 44:    // i8x16.ge_u

                    case 45:    // i16x8.eq
                    case 46:    // i16x8.ne
                    case 47:    // i16x8.lt_s
                    case 48:    // i16x8.lt_u
                    case 49:    // i16x8.gt_s
                    case 50:    // i16x8.gt_u
                    case 51:    // i16x8.le_s
                    case 52:    // i16x8.le_u
                    case 53:    // i16x8.ge_s
                    case 54:    // i16x8.ge_u

                    case 55:    // i32x4.eq
                    case 56:    // i32x4.ne
                    case 57:    // i32x4.lt_s
                    case 58:    // i32x4.lt_u
                    case 59:    // i32x4.gt_s
                    case 60:    // i32x4.gt_u
                    case 61:    // i32x4.le_s
                    case 62:    // i32x4.le_u
                    case 63:    // i32x4.ge_s
                    case 64:    // i32x4.ge_u

                    case 214:   // i64x2.eq
                    case 215:   // i64x2.ne
                    case 216:   // i64x2.lt
                    case 217:   // i64x2.gt
                    case 218:   // i64x2.le
                    case 219:   // i64x2.ge

                    case 65:    // f32x4.eq
                    case 66:    // f32x4.ne
                    case 67:    // f32x4.lt
                    case 68:    // f32x4.gt
                    case 69:    // f32x4.le
                    case 70:    // f32x4.ge

                    case 71:    // f64x2.eq
                    case 72:    // f64x2.ne
                    case 73:    // f64x2.lt
                    case 74:    // f64x2.gt
                    case 75:    // f64x2.le
                    case 76:    // f64x2.ge

                    case 77:    // v128.not
                    case 78:    // v128.and
                    case 79:    // v128.andnot
                    case 80:    // v128.or
                    case 81:    // v128.xor
                    case 82:    // v128.bitselect
                    case 83:    // v128.any_true

                    case 96:    // i8x16.abs
                    case 97:    // i8x16.neg
                    case 98:    // i8x16.popcnt
                    case 99:    // i8x16.all_true
                    case 100:   // i8x16.bitmask
                    case 101:   // i8x16.narrow_i16x8_s
                    case 102:   // i8x16.narrow_i16x8_u
                    case 107:   // i8x16.shl
                    case 108:   // i8x16.shr_s
                    case 109:   // i8x16.shr_u
                    case 110:   // i8x16.add
                    case 111:   // i8x16.add_sat_s
                    case 112:   // i8x16.add_sat_u
                    case 113:   // i8x16.sub
                    case 114:   // i8x16.sub_sat_s
                    case 115:   // i8x16.sub_sat_u
                    case 118:   // i8x16.min_s
                    case 119:   // i8x16.min_u
                    case 120:   // i8x16.max_s
                    case 121:   // i8x16.max_u
                    case 123:   // i8x16.avgr_u

                    case 124:   // i16x8.extadd_pairwise_i8x16_s
                    case 125:   // i16x8.extadd_pairwise_i8x16_u
                    case 128:   // i16x8.abs
                    case 129:   // i16x8.neg
                    case 130:   // i16x8.q15mulr_sat_s
                    case 131:   // i16x8.all_true
                    case 132:   // i16x8.bitmask
                    case 133:   // i16x8.narrow_i32x4_s
                    case 134:   // i16x8.narrow_i32x4_u
                    case 135:   // i16x8.extend_low_i8x16_s
                    case 136:   // i16x8.extend_high_i8x16_s
                    case 137:   // i16x8.extend_low_i8x16_u
                    case 138:   // i16x8.extend_high_i8x16_u
                    case 139:   // i16x8.shl
                    case 140:   // i16x8.shr_s
                    case 141:   // i16x8.shr_u
                    case 142:   // i16x8.add
                    case 143:   // i16x8.add_sat_s
                    case 144:   // i16x8.add_sat_u

                    case 145:   // i16x8.sub
                    case 146:   // i16x8.sub_sat_s
                    case 147:   // i16x8.sub_sat_u

                    case 149:   // i16x8.mul
                    case 150:   // i16x8.min_s
                    case 151:   // i16x8.min_u
                    case 152:   // i16x8.max_s
                    case 153:   // i16x8.max_u
                    case 155:   // i16x8.avgr_u
                    case 156:   // i16x8.extmul_low_i8x16_s
                    case 157:   // i16x8.extmul_high_i8x16_s
                    case 158:   // i16x8.extmul_low_i8x16_u
                    case 159:   // i16x8.extmul_high_i8x16_u

                    case 126:   // i32x4.extadd_pairwise_i16x8_s
                    case 127:   // i32x4.extadd_pairwise_i16x8_u
                    case 160:   // i32x4.abs
                    case 161:   // i32x4.neg
                    case 163:   // i32x4.all_true
                    case 164:   // i32x4.bitmask
                    case 167:   // i32x4.extend_low_i16x8_s
                    case 168:   // i32x4.extend_high_i16x8_s
                    case 169:   // i32x4.extend_low_i16x8_u
                    case 170:   // i32x4.extend_high_i16x8_u

                    case 171:   // i32x4.shl
                    case 172:   // i32x4.shr_s
                    case 173:   // i32x4.shr_u
                    case 174:   // i32x4.add
                    case 177:   // i32x4.sub

                    case 181:   // i32x4.mul
                    case 182:   // i32x4.min_s
                    case 183:   // i32x4.min_u
                    case 184:   // i32x4.max_s
                    case 185:   // i32x4.max_u
                    case 186:   // i32x4.dot_i16x8_s
                    case 188:   // i32x4.extmul_low_i16x8_s
                    case 189:   // i32x4.extmul_high_i16x8_s
                    case 190:   // i32x4.extmul_low_i16x8_u
                    case 191:   // i32x4.extmul_high_i16x8_u

                    case 192:   // i64x2.abs
                    case 193:   // i64x2.neg
                    case 195:   // i64x2.all_true
                    case 196:   // i64x2.bitmask
                    case 199:   // i64x2.extend_low_i32x4_s
                    case 200:   // i64x2.extend_high_i32x4_s
                    case 201:   // i64x2.extend_low_i32x4_u
                    case 202:   // i64x2.extend_high_i32x4_u
                    case 203:   // i64x2.shl
                    case 204:   // i64x2.shr_s
                    case 205:   // i64x2.shr_u
                    case 206:   // i64x2.add
                    case 209:   // i64x2.sub
                    case 213:   // i64x2.mul
                    case 220:   // i64x2.extmul_low_i32x4_s
                    case 221:   // i64x2.extmul_high_i32x4_s
                    case 222:   // i64x2.extmul_low_i32x4_u
                    case 223:   // i64x2.extmul_high_i32x4_u


                    case 103:   // f32x4.ceil
                    case 104:   // f32x4.floor
                    case 105:   // f32x4.trunc
                    case 106:   // f32x4.nearest
                    case 224:   // f32x4.abs
                    case 225:   // f32x4.neg
                    case 227:   // f32x4.sqrt
                    case 228:   // f32x4.add
                    case 229:   // f32x4.sub
                    case 230:   // f32x4.mul
                    case 231:   // f32x4.div
                    case 232:   // f32x4.min
                    case 233:   // f32x4.max
                    case 234:   // f32x4.pmin
                    case 235:   // f32x4.pmax

                    case 116:   // f64x2.ceil
                    case 117:   // f64x2.floor
                    case 122:   // f64x2.trunc
                    case 148:   // f64x2.nearest
                    case 236:   // f64x2.abs
                    case 237:   // f64x2.neg
                    case 239:   // f64x2.sqrt
                    case 240:   // f64x2.add
                    case 241:   // f64x2.sub
                    case 242:   // f64x2.mul
                    case 243:   // f64x2.div
                    case 244:   // f64x2.min
                    case 245:   // f64x2.max
                    case 246:   // f64x2.pmin
                    case 247:   // f64x2.pmax

                    case 248:   // i32x4.trunc_sat_f32x4_s
                    case 249:   // i32x4.trunc_sat_f32x4_u
                    case 250:   // f32x4.convert_i32x4_s
                    case 251:   // f32x4.convert_i32x4_u
                    case 252:   // i32x4.trunc_sat_f64x2_s_zero
                    case 253:   // i32x4.trunc_sat_f64x2_u_zero
                    case 254:   // f64x2.convert_low_i32x4_s
                    case 255:   // f64x2.convert_low_i32x4_u
                    case 94:    // f32x4.demote_f64x2_zero
                    case 95:    // f64x2.promote_low_f32x4
                        throw TypeError("TODO implement me!");
                        break;
                }
            }

            case 0xFE: // Atomic Memory Instructions
            {
                switch (b2) {
                    case 0x00: // memory.atomic.notify
                    case 0x01: // memory.atomic.wait32
                    case 0x02: // memory.atomic.wait64
                    {
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.align);
                        sz += lengthULEB128(inst.offset);
                        break;
                    }
                    case 0x03: // atomic.fence 0x00
                    {
                        if (inst.memidx != 0x00)
                            throw TypeError("invalid memidx");
                        sz += 2;
                        sz += lengthULEB128(b2);
                        break;
                    }
                    case 0x10: // i32.atomic.load
                    case 0x11: // i64.atomic.load
                    case 0x12: // i32.atomic.load8_u
                    case 0x13: // i32.atomic.load16_u
                    case 0x14: // i64.atomic.load8_u
                    case 0x15: // i64.atomic.load16_u
                    case 0x16: // i64.atomic.load32_u
                    case 0x17: // i32.atomic.store
                    case 0x18: // i64.atomic.store
                    case 0x19: // i32.atomic.store8
                    case 0x1A: // i32.atomic.store16
                    case 0x1B: // i64.atomic.store8
                    case 0x1C: // i64.atomic.store16
                    case 0x1D: // i64.atomic.store32

                    case 0x1E: // i32.atomic.rmw.add
                    case 0x1F: // i64.atomic.rmw.add
                    case 0x20: // i32.atomic.rmw8.add_u
                    case 0x21: // i32.atomic.rmw16.add_u
                    case 0x22: // i64.atomic.rmw8.add_u
                    case 0x23: // i64.atomic.rmw16.add_u
                    case 0x24: // i64.atomic.rmw32.add_u

                    case 0x25: // i32.atomic.rmw.sub
                    case 0x26: // i64.atomic.rmw.sub
                    case 0x27: // i32.atomic.rmw8.sub_u
                    case 0x28: // i32.atomic.rmw16.sub_u
                    case 0x29: // i64.atomic.rmw8.sub_u
                    case 0x2A: // i64.atomic.rmw16.sub_u
                    case 0x2B: // i64.atomic.rmw32.sub_u

                    case 0x2C: // i32.atomic.rmw.and
                    case 0x2D: // i64.atomic.rmw.and
                    case 0x2E: // i32.atomic.rmw8.and_u
                    case 0x2F: // i32.atomic.rmw16.and_u
                    case 0x30: // i64.atomic.rmw8.and_u
                    case 0x31: // i64.atomic.rmw16.and_u
                    case 0x32: // i64.atomic.rmw32.and_u

                    case 0x33: // i32.atomic.rmw.or
                    case 0x34: // i64.atomic.rmw.or
                    case 0x35: // i32.atomic.rmw8.or_u
                    case 0x36: // i32.atomic.rmw16.or_u
                    case 0x37: // i64.atomic.rmw8.or_u
                    case 0x38: // i64.atomic.rmw16.or_u
                    case 0x39: // i64.atomic.rmw32.or_u

                    case 0x3A: // i32.atomic.rmw.xor
                    case 0x3B: // i64.atomic.rmw.xor
                    case 0x3C: // i32.atomic.rmw8.xor_u
                    case 0x3D: // i32.atomic.rmw16.xor_u
                    case 0x3E: // i64.atomic.rmw8.xor_u
                    case 0x3F: // i64.atomic.rmw16.xor_u
                    case 0x40: // i64.atomic.rmw32.xor_u

                    case 0x41: // i32.atomic.rmw.xchg
                    case 0x42: // i64.atomic.rmw.xchg
                    case 0x43: // i32.atomic.rmw8.xchg_u
                    case 0x44: // i32.atomic.rmw16.xchg_u
                    case 0x45: // i64.atomic.rmw8.xchg_u
                    case 0x46: // i64.atomic.rmw16.xchg_u
                    case 0x47: // i64.atomic.rmw32.xchg_u

                    case 0x48: // i32.atomic.rmw.cmpxchg
                    case 0x49: // i64.atomic.rmw.cmpxchg
                    case 0x4A: // i32.atomic.rmw8.cmpxchg_u
                    case 0x4B: // i32.atomic.rmw16.cmpxchg_u
                    case 0x4C: // i64.atomic.rmw8.cmpxchg_u
                    case 0x4D: // i64.atomic.rmw16.cmpxchg_u
                    case 0x4E: // i64.atomic.rmw32.cmpxchg_u
                    {
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.align);
                        sz += lengthULEB128(inst.offset, inst.reloc ? padTo : 0);
                        break;
                    }
                    default:
                        console.error("opcode %s not supported", ("0x" + b1.toString(16) + b2.toString(16)));
                        brk = true;
                        break;
                }

                break;
            }
            default:
                console.error("opcode %s not supported", "0x" + b1.toString(16));
                brk = true;
                break;
        }
    }

    return sz
}


/**
 * @typedef WebAssemblyDecodeByteCodeResult
 * @type
 * @property {integer} start
 * @property {integer} end
 * @property {WasmInstruction[]} opcodes
 */

// https://webassembly.github.io/spec/core/binary/instructions.html#binary-expr
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
/**
 * 
 * @param {ByteArray} data 
 * @param {WebAssemblyModule} mod 
 * @param {WasmLocal[]=} locals 
 * @param {boolean=} reloc 
 * @returns 
 */
export function decodeByteCode(data, mod, locals, reloc) {
    
    let start = data.offset;
    let brk = false;
    /** @type {WasmInstruction[]} */
    let topInsts = [];
    let opcodes = topInsts;
    let blkstack = [{opcodes: topInsts}]; // holds the nesting for block, loop and if/else
    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;
    let locend = locals ? locals.length - 1 : 0;
    let rloc = undefined;

    while(brk == false) {
        let op_code = data.readUint8();
        rloc = data.offset;
        switch (op_code) {
            case 0x00: // unreachable
                opcodes.push(new UnreachableInst());
                break;
            case 0x01: // nop           [] -> []
                opcodes.push({opcode: op_code});
                break;
            case 0x02: // block         [t1] -> [t2]
            case 0x03: // loop          [t1] -> [t2]
            {
                let inst = (op_code == 0x03) ? new LoopInst(op_code) : new BlockInst(op_code);
                let type = data.readUint8();
                if (type == 0x40) { // empty
                    inst.type = type;
                } else if (isValidValueType(type)) {
                    inst.type = type;
                } else {
                    data.offset--; // rewind
                    type = data.readSLEB128(32);
                    if (type > 0) {
                        inst.type = types[type];
                    } else {
                        throw new RangeError("block typeidx is invalid");
                    }
                }
                opcodes.push(inst);
                //inst.opcodes = [];
                //opcodes = inst.opcodes;
                blkstack.push(inst);
                break;
            }
            case 0x04: // if <inst> 0x0B || if <inst> 0x05 <inst> 0x0B [t1 i32] -> [t2]
            {
                let inst = new IfInst(op_code);
                let type = data.readUint8();
                if (type == 0x40) { // empty
                    inst.type = type;
                } else if (isValidValueType(type)) {
                    inst.type = type;
                } else {
                    data.offset--; // rewind
                    type = data.readSLEB128(32);
                    if (type > 0) {
                        inst.type = types[type];
                    } else {
                        throw new RangeError("if typeidx is invalid");
                    }
                }
                opcodes.push(inst);
                //inst.opcodes = [];
                //opcodes = inst.opcodes;
                blkstack.push(inst);
                break;
            }
            case 0x05: // else <inst> 0x0B
            {
                let lastidx = blkstack.length - 1;
                let blkst = blkstack[lastidx];
                if (blkst.opcode != 0x04)
                    throw new TypeError("else opcode found outside if opcode");
                if (blkst.else)
                    throw new TypeError("else followed by a else");
                let inst = new IfInst(op_code);
                opcodes.push(inst);
                //inst.opcodes = [];
                //blkst.else = inst;
                //opcodes = inst.opcodes;
                blkstack[lastidx] = inst;
                break;
            }

            // https://github.com/WebAssembly/exception-handling/blob/main/proposals/exception-handling/Exceptions.md#control-flow-operators
            // changes to binary format: https://github.com/WebAssembly/exception-handling/blob/main/proposals/exception-handling/Exceptions.md#tag-index-space
            case 0x06: // try bt
            {
                let inst = new TryInst(op_code);
                let type = data.readUint8();
                if (type == 0x40) { // empty
                    inst.type = type;
                } else if (isValidValueType(type)) {
                    inst.type = type;
                } else {
                    data.offset--; // rewind
                    type = data.readSLEB128(32);
                    if (type > 0) {
                        inst.type = types[type];
                    } else {
                        throw new RangeError("if typeidx is invalid");
                    }
                }
                opcodes.push(inst);
                break;
            }
            case 0x07: // catch x
            {
                let inst = new CatchInst(op_code);
                let tagidx = data.readULEB128();
                inst.tag = mod.tags[tagidx];
                opcodes.push(inst);
                break;
            }
            case 0x19: // catch_all
            {
                let inst = new CatchAllInst(op_code);
                opcodes.push(inst);
                break;
            }
            case 0x18: // delegate rd
            {
                let inst = new DelegateInst(op_code);
                inst.relative_depth = data.readULEB128();
                opcodes.push(inst);
                break;
            }
            case 0x08: // throw x
            {
                let inst = new ThrowInst(op_code);
                let tagidx = data.readULEB128();
                inst.tag = mod.tags[tagidx];
                opcodes.push(inst);
                break;
            }
            case 0x09: // rethrow rd
            {
                let inst = new ReThrowInst(op_code);
                inst.relative_depth = data.readULEB128();
                opcodes.push(inst);
                break;
            }

            case 0x0C: // br l
                opcodes.push({opcode: op_code, labelidx: data.readULEB128()});
                break;
            case 0x0D: // br_if l
                opcodes.push({opcode: op_code, labelidx: data.readULEB128()});
                break;
            case 0x0E: // br_table l* l [t1 t* i32] -> [t2]
            {
                let labels = [];
                let cnt = data.readULEB128();
                for (let x = 0; x < cnt; x++) {
                    let label = data.readULEB128();
                    labels.push(label);
                }
                let def = data.readULEB128();
                let inst = new BranchTableInst(op_code, labels);
                inst.default_br = def;
                opcodes.push(inst);
                break;
            }
            case 0x0F: // return        [t1 t*] -> [t2]
                opcodes.push(new ReturnInst(op_code));
                break;
            case 0x10: // call          [t1] -> [t2]
            {
                let funcidx = data.readULEB128();
                let fn = functions[funcidx];
                opcodes.push(new CallInst(op_code, fn));
                fn._usage++;
                break;
            }
            case 0x11: // call_indirect [t1 i32] -> [t2]
            {
                let typeidx = data.readULEB128();
                let tableidx = data.readULEB128();
                if (tableidx !== 0)
                    console.warn("tableidx: %d typeidx: %d", tableidx, typeidx);
                opcodes.push(new IndirectCallInst(op_code, tables[tableidx], types[typeidx]));
                //opcodes.push({opcode: op_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()});
                break;
            }
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
            // return_call          0x12    [t3* t1*] -> [t4*]
            // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
            case 0x41: // i32.const     [] -> [i32]
                opcodes.push({opcode: op_code, value: data.readSLEB128(32)});
                break;
            case 0x42: // i64.const     [] -> [i64]
                opcodes.push({opcode: op_code, value: data.readSLEB128(64)});
                break;
            case 0x43: // f32.const     [] -> [f32]
                opcodes.push({opcode: op_code, value: data.readFloat32()});
                break;
            case 0x44: // f64.const     [] -> [f64]
                opcodes.push({opcode: op_code, value: data.readFloat64()});
                break;
            case 0x0b: // end
            {
                opcodes.push({opcode: op_code});
                blkstack.pop();

                if (blkstack.length > 0) {
                    let last = blkstack[blkstack.length - 1];
                    //opcodes = last.opcodes;
                } else if (blkstack.length == 0) {
                    brk = true;
                }
                break;
            }
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md#binary-format
            // 0x12 return_call
            // 0x13 return_call_indirect
            case 0x1A: // drop              [t] -> []
                opcodes.push({opcode: op_code});
                break;
            case 0x1B: // select            [t t i32] -> [t]
                opcodes.push({opcode: op_code});
                break;
            case 0x1C: // select t* :vec(valtype) [t t i32] -> [t]
                opcodes.push({opcode: op_code});
                break;
            case 0x20: // local.get         [] -> [t]
            {
                let x = data.readULEB128();
                if (x < 0 || x > locend)
                    throw new RangeError(".local out of range");
                let local = locals[x];
                local.usage++;
                opcodes.push({opcode: op_code, local: local, x: x});
                break;
            }
            case 0x21: // local.set         [t] -> []
            {
                let x = data.readULEB128();
                if (x < 0 || x > locend)
                    throw new RangeError(".local out of range");
                let local = locals[x];
                local.usage++;
                opcodes.push({opcode: op_code, local: local, x: x});
                break;
            }
            case 0x22: // local.tee         [t] -> [t]
            {
                let x = data.readULEB128();
                if (x < 0 || x > locend)
                    throw new RangeError(".local out of range");
                let local = locals[x];
                local.usage++;
                opcodes.push({opcode: op_code, local: local, x: x});
                break;
            }
            case 0x23: // global.get        [] -> [t]
            {
                let idx = data.readULEB128();
                opcodes.push({opcode: op_code, global: globals[idx]});
                break;
            }
            case 0x24: // global.set        [t] -> []
            {
                let idx = data.readULEB128();
                opcodes.push({opcode: op_code, global: globals[idx]});
                break;
            }
            case 0x25: // table.get         [i32] -> [t]
            {
                let tableidx = data.readULEB128();
                opcodes.push({opcode: op_code, table: tables[tableidx]});
                break;
            }
            case 0x26: // table.set         [i32 t] -> []
            {
                let tableidx = data.readULEB128();
                opcodes.push({opcode: op_code, table: tables[tableidx]});
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
                let a = data.readULEB128();
                if (reloc)
                    rloc = data.offset;
                let o = data.readULEB128();
                opcodes.push({opcode: op_code, offset: o, align: a});
                break;
            }
            case 0x3f: // memory.size 0x00   [] -> [i32]
            {
                let memidx = data.readUint8();
                if (memidx != 0x00)
                    throw TypeError("invalid memidx");
                opcodes.push({opcode: op_code, memidx: memidx});
                break;
            }
            case 0x40: // memory.grow 0x00   [i32] -> []
            {
                let memidx = data.readUint8();
                if (memidx != 0x00)
                    throw TypeError("invalid memidx");
                opcodes.push({opcode: op_code, memidx: memidx});
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
                opcodes.push({opcode: op_code});
                break;
            case 0xD0: // ref.null t    [] -> [t]
                opcodes.push({opcode: op_code, reftype: data.readULEB128()});
                break;
            case 0xD1: // ref.is_null   [t] -> [i32]
                opcodes.push({opcode: op_code});
                break;
            case 0xD2: // ref.func x    [] -> [funcref]
            {
                let func, funcidx = data.readULEB128();
                if (funcidx >= functions.length)
                    throw new RangeError("funcidx out of range");
                func = functions[funcidx];
                opcodes.push({opcode: op_code, func: func});
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
                        opcodes.push({opcode: (op_code << 8) | sub});
                        break;
                    case  8: // memory.init             [i32 i32 i32] -> []
                    {
                        let mem, memidx;
                        let dataSegment, dataidx = data.readULEB128();
                        if (dataidx < 0 || dataidx >= mod.dataSegments.length)
                            throw new RangeError("dataidx out of range");
                        memidx = data.readUint8();
                        if (memidx < 0 || memidx >= mod.memory.length)
                            throw new RangeError("memidx out of range");
                        mem = mod.memory[memidx];
                        opcodes.push({opcode: (op_code << 8) | sub, dataSegment: dataSegment, memory: mem});
                        break;
                    }
                    case  9: // data.drop               [] -> []
                    {
                        let dataSegment, dataidx = data.readULEB128();
                        if (dataidx < 0 || dataidx >= mod.dataSegments.length)
                            throw new RangeError("dataidx out of range");
                        dataSegment = mod.dataSegments[dataidx];
                        opcodes.push({opcode: (op_code << 8) | sub, dataSegment: dataSegment});
                        break;
                    }
                    case 10: // memory.copy 0x00 0x00   [i32 i32 i32] -> []
                    {
                        opcodes.push({opcode: (op_code << 8) | sub, memidx1: data.readUint8(), memidx2: data.readUint8()});
                        break;
                    }
                    case 11: // memory.fill 0x00        [i32 i32 i32] -> []
                    {
                        opcodes.push({opcode: (op_code << 8) | sub, memidx: data.readUint8()});
                        break;
                    }
                    //
                    case 12: // table.init              [i32 i32 i32] -> []
                    {
                        let tbl, elem, idx = data.readULEB128();
                        if (idx < 0 || idx >= mod.elementSegments.length)
                            throw new RangeError("elemidx out of range");
                        elem = mod.elementSegments[idx];
                        idx = data.readUint8();
                        if (idx < 0 || idx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl = tables[idx];
                        opcodes.push({opcode: (op_code << 8) | sub, table: tbl, elem: elem});
                        break;
                    }
                    case 13: // elem.drop               [] -> []
                    {
                        let elem, idx = data.readULEB128();
                        if (idx < 0 || idx >= mod.elementSegments.length)
                            throw new RangeError("elemidx out of range");
                        elem = mod.elementSegments[idx];

                        opcodes.push({opcode: (op_code << 8) | sub, elem: elem});
                        break;
                    }
                    case 14: // table.copy x y          [i32 i32 i32] -> []
                    {
                        let tbl1, tbl2, tblidx = data.readULEB128();
                        if (tblidx < 0 || tblidx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl1 = tables[tblidx];
                        tblidx = data.readULEB128();
                        if (tblidx < 0 || tblidx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl2 = tables[tblidx];

                        opcodes.push({opcode: (op_code << 8) | sub, table1: tbl1, table2: tbl2});
                        break;
                    }
                    case 15: // table.grow              [t i32] -> [i32]
                    {
                        let tbl, tblidx = data.readULEB128();
                        if (tblidx < 0 || tblidx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl = tables[tblidx];

                        opcodes.push({opcode: (op_code << 8) | sub, table: tbl});
                        break;
                    }
                    case 16: // table.size              [] -> [i32]
                    {
                        let tbl, tblidx = data.readULEB128();
                        if (tblidx < 0 || tblidx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl = tables[tblidx];

                        opcodes.push({opcode: (op_code << 8) | sub, table: tbl});
                        break;
                    }
                    case 17: // table.fill              [i32 t i32] -> []
                    {
                        let tbl, tblidx = data.readULEB128();
                        if (tblidx < 0 || tblidx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl = tables[tblidx];

                        opcodes.push({opcode: (op_code << 8) | sub, table: tbl});
                        break;
                    }
                }
                break;
            }

            case 0xFD: // multi-byte sequence
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case 0:     // m:memarg =>  v128.load m             [i32] -> [v128]
                    case 1:     // m:memarg =>  v128.load8x8_s m        [i32] -> [v128]
                    case 2:     // m:memarg =>  v128.load8x8_u m        [i32] -> [v128]
                    case 3:     // m:memarg =>  v128.load16x4_s m       [i32] -> [v128]
                    case 4:     // m:memarg =>  v128.load16x4_u m       [i32] -> [v128]
                    case 5:     // m:memarg =>  v128.load32x2_s m       [i32] -> [v128]
                    case 6:     // m:memarg =>  v128.load32x2_u m       [i32] -> [v128]
                    case 7:     // m:memarg =>  v128.load8_splat m      [i32] -> [v128]
                    case 8:     // m:memarg =>  v128.load16_splat m     [i32] -> [v128]
                    case 9:     // m:memarg =>  v128.load32_splat m     [i32] -> [v128]
                    case 10:    // m:memarg =>  v128.load64_splat m     [i32] -> [v128]
                    case 92:    // m:memarg =>  v128.load32_zero m      [i32] -> [v128]
                    case 93:    // m:memarg =>  v128.load64_zero m      [i32] -> [v128]
                    case 11:    // m:memarg =>  v128.store m            [i32 v128] -> []
                    {
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        opcodes.push({opcode: (op_code << 8) | sub, offset: o, align: a});
                        break;
                    }
                    case 84:    // m:memarg l:laneidx   =>  v128.load8_lane m l     [i32 v128] -> [v128]
                    case 85:    // m:memarg l:laneidx   =>  v128.load16_lane m l    [i32 v128] -> [v128]
                    case 86:    // m:memarg l:laneidx   =>  v128.load32_lane m l    [i32 v128] -> [v128]
                    case 87:    // m:memarg l:laneidx   =>  v128.load64_lane m l    [i32 v128] -> [v128]
                    case 88:    // m:memarg l:laneidx   =>  v128.store8_lane m l    [i32 v128] -> [v128]
                    case 89:    // m:memarg l:laneidx   =>  v128.store16_lane m l   [i32 v128] -> [v128]
                    case 90:    // m:memarg l:laneidx   =>  v128.store32_lane m l   [i32 v128] -> [v128]
                    case 91:    // m:memarg l:laneidx   =>  v128.store64_lane m l   [i32 v128] -> [v128]
                    {
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        let l = data.readUint8();
                        opcodes.push({opcode: (op_code << 8) | sub, offset: o, align: a, laneidx: l});
                        break;
                    }
                    case 12:    // v128.const (b0 ... b15)              [] -> [v128]
                    {
                        let v128 = new Uint8Array(16);
                        for (let z = 0; z < 16; z++) {
                            v128[z] = data.readUint8();
                        }
                        opcodes.push({opcode: (op_code << 8) | sub, value: v128});
                        break;
                    }
                    case 13:    // i8x16.shuffle (l0 ... l15)           [v128 v128] -> [v128]
                    {
                        let lanes = new Uint8Array(16);
                        for (let z = 0; z < 16; z++) {
                            lanes[z] = data.readUint8();
                        }
                        opcodes.push({opcode: (op_code << 8) | sub, lanes: lanes});
                        break;
                    }
                    case 21:    // l:laneidx    =>  i8x16.extract_lane_s l  [v128] -> [i32]
                    case 22:    // l:laneidx    =>  i8x16.extract_lane_u l  [v128] -> [i32]
                    case 23:    // l:laneidx    =>  i8x16.replace_lane l    [v128 i32] -> [v128]
                    case 24:    // l:laneidx    =>  i16x8.extract_lane_s l  [v128] -> [i32]
                    case 25:    // l:laneidx    =>  i16x8.extract_lane_u l  [v128] -> [i32]
                    case 26:    // l:laneidx    =>  i16x8.replace_lane l    [v128 i32] -> [v128]
                    case 27:    // l:laneidx    =>  i32x4.extract_lane l    [v128] -> [i32]
                    case 28:    // l:laneidx    =>  i32x4.replace_lane l    [v128 i32] -> [v128]
                    case 29:    // l:laneidx    =>  i64x2.extract_lane l    [v128] -> [i64]
                    case 30:    // l:laneidx    =>  i64x2.replace_lane l    [v128 i64] -> [v128]
                    case 31:    // l:laneidx    =>  f32x4.extract_lane l    [v128] -> [f32]
                    case 32:    // l:laneidx    =>  f32x4.replace_lane l    [v128 f32] -> [v128]
                    case 33:    // l:laneidx    =>  f64x2.extract_lane l    [v128] -> [f64]
                    case 34:    // l:laneidx    =>  f64x2.replace_lane l    [v128 f64] -> [v128]
                    {
                        let l = data.readUint8();
                        opcodes.push({opcode: (op_code << 8) | sub, laneidx: l});
                        break;
                    }
                    case 14:    // i8x16.swizzle    [v128 v128] -> [v128]
                    case 15:    // i8x16.splat      [i32] -> [v128]
                    case 16:    // i16x8.splat      [i32] -> [v128]
                    case 17:    // i32x4.splat      [i32] -> [v128]
                    case 18:    // i64x2.splat      [i64] -> [v128]
                    case 19:    // f32x4.splat      [f32] -> [v128]
                    case 20:    // f64x2.splat      [f64] -> [v128]

                    case 35:    // i8x16.eq         [v128 v128] -> [v128]
                    case 36:    // i8x16.ne         [v128 v128] -> [v128]
                    case 37:    // i8x16.lt_s       [v128 v128] -> [v128]
                    case 38:    // i8x16.lt_u       [v128 v128] -> [v128]
                    case 39:    // i8x16.gt_s       [v128 v128] -> [v128]
                    case 40:    // i8x16.gt_u       [v128 v128] -> [v128]
                    case 41:    // i8x16.le_s       [v128 v128] -> [v128]
                    case 42:    // i8x16.le_u       [v128 v128] -> [v128]
                    case 43:    // i8x16.ge_s       [v128 v128] -> [v128]
                    case 44:    // i8x16.ge_u       [v128 v128] -> [v128]

                    case 45:    // i16x8.eq         [v128 v128] -> [v128]
                    case 46:    // i16x8.ne         [v128 v128] -> [v128]
                    case 47:    // i16x8.lt_s       [v128 v128] -> [v128]
                    case 48:    // i16x8.lt_u       [v128 v128] -> [v128]
                    case 49:    // i16x8.gt_s       [v128 v128] -> [v128]
                    case 50:    // i16x8.gt_u       [v128 v128] -> [v128]
                    case 51:    // i16x8.le_s       [v128 v128] -> [v128]
                    case 52:    // i16x8.le_u       [v128 v128] -> [v128]
                    case 53:    // i16x8.ge_s       [v128 v128] -> [v128]
                    case 54:    // i16x8.ge_u       [v128 v128] -> [v128]

                    case 55:    // i32x4.eq         [v128 v128] -> [v128]
                    case 56:    // i32x4.ne         [v128 v128] -> [v128]
                    case 57:    // i32x4.lt_s       [v128 v128] -> [v128]
                    case 58:    // i32x4.lt_u       [v128 v128] -> [v128]
                    case 59:    // i32x4.gt_s       [v128 v128] -> [v128]
                    case 60:    // i32x4.gt_u       [v128 v128] -> [v128]
                    case 61:    // i32x4.le_s       [v128 v128] -> [v128]
                    case 62:    // i32x4.le_u       [v128 v128] -> [v128]
                    case 63:    // i32x4.ge_s       [v128 v128] -> [v128]
                    case 64:    // i32x4.ge_u       [v128 v128] -> [v128]

                    case 214:   // i64x2.eq         [v128 v128] -> [v128]
                    case 215:   // i64x2.ne         [v128 v128] -> [v128]
                    case 216:   // i64x2.lt_s       [v128 v128] -> [v128]
                    case 217:   // i64x2.gt_s       [v128 v128] -> [v128]
                    case 218:   // i64x2.le_s       [v128 v128] -> [v128]
                    case 219:   // i64x2.ge_s       [v128 v128] -> [v128]

                    case 65:    // f32x4.eq         [v128 v128] -> [v128]
                    case 66:    // f32x4.ne         [v128 v128] -> [v128]
                    case 67:    // f32x4.lt         [v128 v128] -> [v128]
                    case 68:    // f32x4.gt         [v128 v128] -> [v128]
                    case 69:    // f32x4.le         [v128 v128] -> [v128]
                    case 70:    // f32x4.ge         [v128 v128] -> [v128]

                    case 71:    // f64x2.eq         [v128 v128] -> [v128]
                    case 72:    // f64x2.ne         [v128 v128] -> [v128]
                    case 73:    // f64x2.lt         [v128 v128] -> [v128]
                    case 74:    // f64x2.gt         [v128 v128] -> [v128]
                    case 75:    // f64x2.le         [v128 v128] -> [v128]
                    case 76:    // f64x2.ge         [v128 v128] -> [v128]

                    case 77:    // v128.not         [v128] -> [v128]
                    case 78:    // v128.and         [v128 v128] -> [v128]
                    case 79:    // v128.andnot      [v128 v128] -> [v128]
                    case 80:    // v128.or          [v128 v128] -> [v128]
                    case 81:    // v128.xor         [v128 v128] -> [v128]
                    case 82:    // v128.bitselect   [v128 v128 v128] -> [v128]
                    case 83:    // v128.any_true    [v128] -> [i32]

                    case 96:    // i8x16.abs                        [v128] -> [v128]
                    case 97:    // i8x16.neg                        [v128] -> [v128]
                    case 98:    // i8x16.popcnt                     [v128] -> [v128]
                    case 99:    // i8x16.all_true                   [v128] -> [i32]
                    case 100:   // i8x16.bitmask                    [v128] -> [i32]
                    case 101:   // i8x16.narrow_i16x8_s             [v128 v128] -> [v128]
                    case 102:   // i8x16.narrow_i16x8_u             [v128 v128] -> [v128]
                    case 107:   // i8x16.shl                        [v128 i32] -> [v128]
                    case 108:   // i8x16.shr_s                      [v128 i32] -> [v128]
                    case 109:   // i8x16.shr_u                      [v128 i32] -> [v128]
                    case 110:   // i8x16.add                        [v128 v128] -> [v128]
                    case 111:   // i8x16.add_sat_s                  [v128 v128] -> [v128]
                    case 112:   // i8x16.add_sat_u                  [v128 v128] -> [v128]
                    case 113:   // i8x16.sub                        [v128 v128] -> [v128]
                    case 114:   // i8x16.sub_sat_s                  [v128 v128] -> [v128]
                    case 115:   // i8x16.sub_sat_u                  [v128 v128] -> [v128]
                    case 118:   // i8x16.min_s                      [v128 v128] -> [v128]
                    case 119:   // i8x16.min_u                      [v128 v128] -> [v128]
                    case 120:   // i8x16.max_s                      [v128 v128] -> [v128]
                    case 121:   // i8x16.max_u                      [v128 v128] -> [v128]
                    case 123:   // i8x16.avgr_u                     [v128 v128] -> [v128]

                    case 124:   // i16x8.extadd_pairwise_i8x16_s    [v128] -> [v128]
                    case 125:   // i16x8.extadd_pairwise_i8x16_u    [v128] -> [v128]
                    case 128:   // i16x8.abs                        [v128] -> [v128]
                    case 129:   // i16x8.neg                        [v128] -> [v128]
                    case 130:   // i16x8.q15mulr_sat_s              [v128 v128] -> [v128]
                    case 131:   // i16x8.all_true                   [v128] -> [i32]
                    case 132:   // i16x8.bitmask                    [v128] -> [i32]
                    case 133:   // i16x8.narrow_i32x4_s             [v128 v128] -> [v128]
                    case 134:   // i16x8.narrow_i32x4_u             [v128 v128] -> [v128]
                    case 135:   // i16x8.extend_low_i8x16_s         [v128] -> [v128]
                    case 136:   // i16x8.extend_high_i8x16_s        [v128] -> [v128]
                    case 137:   // i16x8.extend_low_i8x16_u         [v128] -> [v128]
                    case 138:   // i16x8.extend_high_i8x16_u        [v128] -> [v128]
                    case 139:   // i16x8.shl                        [v128 i32] -> [v128]
                    case 140:   // i16x8.shr_s                      [v128 i32] -> [v128]
                    case 141:   // i16x8.shr_u                      [v128 i32] -> [v128]
                    case 142:   // i16x8.add                        [v128 v128] -> [v128]
                    case 143:   // i16x8.add_sat_s                  [v128 v128] -> [v128]
                    case 144:   // i16x8.add_sat_u                  [v128 v128] -> [v128]

                    case 145:   // i16x8.sub                        [v128 v128] -> [v128]
                    case 146:   // i16x8.sub_sat_s                  [v128 v128] -> [v128]
                    case 147:   // i16x8.sub_sat_u                  [v128 v128] -> [v128]

                    case 149:   // i16x8.mul                        [v128 v128] -> [v128]
                    case 150:   // i16x8.min_s                      [v128 v128] -> [v128]
                    case 151:   // i16x8.min_u                      [v128 v128] -> [v128]
                    case 152:   // i16x8.max_s                      [v128 v128] -> [v128]
                    case 153:   // i16x8.max_u                      [v128 v128] -> [v128]
                    case 155:   // i16x8.avgr_u                     [v128 v128] -> [v128]
                    case 156:   // i16x8.extmul_low_i8x16_s         [v128 v128] -> [v128]
                    case 157:   // i16x8.extmul_high_i8x16_s        [v128 v128] -> [v128]
                    case 158:   // i16x8.extmul_low_i8x16_u         [v128 v128] -> [v128]
                    case 159:   // i16x8.extmul_high_i8x16_u        [v128 v128] -> [v128]

                    case 126:   // i32x4.extadd_pairwise_i16x8_s    [v128] -> [v128]
                    case 127:   // i32x4.extadd_pairwise_i16x8_u    [v128] -> [v128]
                    case 160:   // i32x4.abs                        [v128] -> [v128]
                    case 161:   // i32x4.neg                        [v128] -> [v128]
                    case 163:   // i32x4.all_true                   [v128] -> [i32]
                    case 164:   // i32x4.bitmask                    [v128] -> [i32]
                    case 167:   // i32x4.extend_low_i16x8_s         [v128] -> [v128]
                    case 168:   // i32x4.extend_high_i16x8_s        [v128] -> [v128]
                    case 169:   // i32x4.extend_low_i16x8_u         [v128] -> [v128]
                    case 170:   // i32x4.extend_high_i16x8_u        [v128] -> [v128]

                    case 171:   // i32x4.shl                        [v128 i32] -> [v128]
                    case 172:   // i32x4.shr_s                      [v128 i32] -> [v128]
                    case 173:   // i32x4.shr_u                      [v128 i32] -> [v128]
                    case 174:   // i32x4.add                        [v128 v128] -> [v128]
                    case 177:   // i32x4.sub                        [v128 v128] -> [v128]

                    case 181:   // i32x4.mul                        [v128 v128] -> [v128]
                    case 182:   // i32x4.min_s                      [v128 v128] -> [v128]
                    case 183:   // i32x4.min_u                      [v128 v128] -> [v128]
                    case 184:   // i32x4.max_s                      [v128 v128] -> [v128]
                    case 185:   // i32x4.max_u                      [v128 v128] -> [v128]
                    case 186:   // i32x4.dot_i16x8_s                [v128 v128] -> [v128]
                    case 188:   // i32x4.extmul_low_i16x8_s         [v128 v128] -> [v128]
                    case 189:   // i32x4.extmul_high_i16x8_s        [v128 v128] -> [v128]
                    case 190:   // i32x4.extmul_low_i16x8_u         [v128 v128] -> [v128]
                    case 191:   // i32x4.extmul_high_i16x8_u        [v128 v128] -> [v128]

                    case 192:   // i64x2.abs                        [v128] -> [v128]
                    case 193:   // i64x2.neg                        [v128] -> [v128]
                    case 195:   // i64x2.all_true                   [v128] -> [i32]
                    case 196:   // i64x2.bitmask                    [v128] -> [i32]
                    case 199:   // i64x2.extend_low_i32x4_s         [v128] -> [v128]
                    case 200:   // i64x2.extend_high_i32x4_s        [v128] -> [v128]
                    case 201:   // i64x2.extend_low_i32x4_u         [v128] -> [v128]
                    case 202:   // i64x2.extend_high_i32x4_u        [v128] -> [v128]
                    case 203:   // i64x2.shl                        [v128 i32] -> [v128]
                    case 204:   // i64x2.shr_s                      [v128 i32] -> [v128]
                    case 205:   // i64x2.shr_u                      [v128 i32] -> [v128]
                    case 206:   // i64x2.add                        [v128 v128] -> [v128]
                    case 209:   // i64x2.sub                        [v128 v128] -> [v128]
                    case 213:   // i64x2.mul                        [v128 v128] -> [v128]
                    case 220:   // i64x2.extmul_low_i32x4_s         [v128 v128] -> [v128]
                    case 221:   // i64x2.extmul_high_i32x4_s        [v128 v128] -> [v128]
                    case 222:   // i64x2.extmul_low_i32x4_u         [v128 v128] -> [v128]
                    case 223:   // i64x2.extmul_high_i32x4_u        [v128 v128] -> [v128]


                    case 103:   // f32x4.ceil                       [v128] -> [v128]
                    case 104:   // f32x4.floor                      [v128] -> [v128]
                    case 105:   // f32x4.trunc                      [v128] -> [v128]
                    case 106:   // f32x4.nearest                    [v128] -> [v128]
                    case 224:   // f32x4.abs                        [v128] -> [v128]
                    case 225:   // f32x4.neg                        [v128] -> [v128]
                    case 227:   // f32x4.sqrt                       [v128] -> [v128]
                    case 228:   // f32x4.add                        [v128 v128] -> [v128]
                    case 229:   // f32x4.sub                        [v128 v128] -> [v128]
                    case 230:   // f32x4.mul                        [v128 v128] -> [v128]
                    case 231:   // f32x4.div                        [v128 v128] -> [v128]
                    case 232:   // f32x4.min                        [v128 v128] -> [v128]
                    case 233:   // f32x4.max                        [v128 v128] -> [v128]
                    case 234:   // f32x4.pmin                       [v128 v128] -> [v128]
                    case 235:   // f32x4.pmax                       [v128 v128] -> [v128]

                    case 116:   // f64x2.ceil                       [v128] -> [v128]
                    case 117:   // f64x2.floor                      [v128] -> [v128]
                    case 122:   // f64x2.trunc                      [v128] -> [v128]
                    case 148:   // f64x2.nearest                    [v128] -> [v128]
                    case 236:   // f64x2.abs                        [v128] -> [v128]
                    case 237:   // f64x2.neg                        [v128] -> [v128]
                    case 239:   // f64x2.sqrt                       [v128] -> [v128]
                    case 240:   // f64x2.add                        [v128 v128] -> [v128]
                    case 241:   // f64x2.sub                        [v128 v128] -> [v128]
                    case 242:   // f64x2.mul                        [v128 v128] -> [v128]
                    case 243:   // f64x2.div                        [v128 v128] -> [v128]
                    case 244:   // f64x2.min                        [v128 v128] -> [v128]
                    case 245:   // f64x2.max                        [v128 v128] -> [v128]
                    case 246:   // f64x2.pmin                       [v128 v128] -> [v128]
                    case 247:   // f64x2.pmax                       [v128 v128] -> [v128]

                    case 248:   // i32x4.trunc_sat_f32x4_s          [v128] -> [v128]
                    case 249:   // i32x4.trunc_sat_f32x4_u          [v128] -> [v128]
                    case 250:   // f32x4.convert_i32x4_s            [v128] -> [v128]
                    case 251:   // f32x4.convert_i32x4_u            [v128] -> [v128]
                    case 252:   // i32x4.trunc_sat_f64x2_s_zero     [v128] -> [v128]
                    case 253:   // i32x4.trunc_sat_f64x2_u_zero     [v128] -> [v128]
                    case 254:   // f64x2.convert_low_i32x4_s        [v128] -> [v128]
                    case 255:   // f64x2.convert_low_i32x4_u        [v128] -> [v128]
                    case 94:    // f32x4.demote_f64x2_zero          [v128] -> [v128]
                    case 95:    // f64x2.promote_low_f32x4          [v128] -> [v128]
                    {
                        opcodes.push({opcode: (op_code << 8) | sub});
                        break;
                    }
                    default:
                        throw new TypeError("opcode " + ("0x" + op_code.toString(16) + sub.toString(16)) + " not supported");
                }
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
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        opcodes.push({opcode: (op_code << 8) | sub, offset: o, align: a});
                        break;
                    }
                    case 0x03: // atomic.fence 0x00
                    {
                        let memidx = data.readULEB128();
                        opcodes.push({opcode: (op_code << 8) | sub, memidx: memidx}); // TODO: replace memidx with memory ref
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
                        let a = data.readULEB128();
                        if (reloc)
                            rloc = data.offset;
                        let o = data.readULEB128();
                        opcodes.push({opcode: (op_code << 8) | sub, offset: o, align: a});
                        break;
                    }
                    default:
                        throw new TypeError("opcode " + ("0x" + op_code.toString(16) + sub.toString(16)) + " not supported");
                }
                break;
            }
            default:
                console.error("opcode %s not supported", "0x" + op_code.toString(16));
                brk = true;
                break;
        }

        if (reloc)
            topInsts[topInsts.length - 1]._roff = rloc;
    }

    return {start: start, end: data.offset, opcodes: topInsts};
}

/**
 * 
 * @param {WebAssemblyModule} mod 
 * @param {WasmInstruction[]} opcodes 
 * @param {WasmLocal[]} locals 
 * @param {ByteArray} data 
 * @param {integer=} reloc_offset 
 * @returns {boolean}
 */
export function encodeByteCode(mod, opcodes, locals, data, reloc_offset) {

    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;
    let reloc = false;
    if (Number.isInteger(reloc_offset)) {
        reloc = true;
    }
    
    let dstart = data.offset;
    let len = opcodes.length;
    for (let i = 0; i < len; i++) {
        let inst = opcodes[i];
        let b1 = inst.opcode
        let b2 = 0;
        if (b1 > 0xFF) {
            b2 = b1 & 0xFF;
            b1 = (b1 >> 8) & 0xFF;
        }

        /*if (debug) {
            console.log("inst 0x%s at %d", (inst.opcode).toString(16), data.offset - dstart);
        }*/

        switch (b1) {
            case 0x00: // unreachable
            case 0x01: // nop
                data.writeUint8(b1);
                break;
            case 0x02: // block bt in* 0x0B
            case 0x03: // loop bt in* 0x0B
            case 0x04: // if bt in* 0x0B || if in1* 0x05 in2* 0x0B
            {
                if (typeof inst.type == "number") {
                    let type = inst.type;
                    if (!(type == 0x40 || type == 0x7F || type == 0x7E || type == 0x7D || type == 0x7C || type == 0x7B  || type == 0x70 || type == 0x6F))
                        throw TypeError("invalid valuetype");
                    data.writeUint8(b1);
                    data.writeUint8(type);
                } else if (typeof inst.typeidx == "number") {
                    data.writeUint8(b1);
                    data.writeSLEB128(inst.typeidx);
                } else if (inst.type instanceof WasmType) {
                    let typeidx = types.indexOf(inst.type);
                    if (typeidx === -1)
                        throw new ReferenceError("typeidx not found");
                    data.writeUint8(b1);
                    data.writeSLEB128(typeidx);
                }
                break;
            }
            case 0x05: // else in2* 0x0B
                data.writeUint8(b1);
                break;
            
            // wasm-eh
            case 0x06: // try bt
            {
                if (typeof inst.type == "number" && (inst.type == 0x40 || isValidValueType(inst.type))) {
                    data.writeUint8(b1);
                    data.writeUint8(inst.type);
                } else if (inst.type instanceof WasmType) {
                    let typeidx = types.indexOf(inst.type);
                    if (typeidx === -1)
                        throw new ReferenceError("typeidx not found");
                    data.writeUint8(b1);
                    data.writeSLEB128(typeidx);
                } else {
                    throw TypeError("inst.type is invalid");
                }
                break;
            }
            case 0x07: // catch x
            {
                let tagidx = mod.tags.indexOf(inst.tag);
                if (tagidx === -1)
                    throw new ReferenceError("tagidx not found");

                data.writeUint8(b1);
                data.writeULEB128(tagidx);
                break;
            }
            case 0x19: // catch_all
                data.writeUint8(b1);
                break;
            case 0x18: // delegate rd
                data.writeUint8(b1);
                data.writeULEB128(inst.relative_depth);
                break;
            case 0x08: // throw x
            {
                let tagidx = mod.tags.indexOf(inst.tag);
                if (tagidx === -1)
                    throw new ReferenceError("tagidx not found");

                data.writeUint8(b1);
                data.writeULEB128(tagidx);
                break;
            }
            case 0x09: // rethrow rd
                data.writeUint8(b1);
                data.writeULEB128(inst.relative_depth);
                break;

            case 0x0C: // br
                data.writeUint8(b1);
                data.writeULEB128(inst.labelidx);
                break;
            case 0x0D: // br_if
                data.writeUint8(b1);
                data.writeULEB128(inst.labelidx);
                break;
            case 0x0E: // br_table
            {
                data.writeUint8(b1);
                let labels = inst.labels;
                let cnt = labels.length;
                data.writeULEB128(cnt);
                for (let x = 0; x < cnt; x++) {
                    let label = labels[x];
                    data.writeULEB128(label);
                }
                data.writeULEB128(inst.default_br);
                break;
            }
            case 0x0F: // return
                data.writeUint8(b1);
                break;
            case 0x10: // call
            {
                data.writeUint8(b1);
                let funcidx = functions.indexOf(inst.func);
                if (funcidx === -1)
                    throw new ReferenceError("funcidx not found");
                data.writeULEB128(funcidx);
                break;
            }
            case 0x11: // call_indirect
            {
                data.writeUint8(b1);
                let typeidx, tableidx = tables.indexOf(inst.table);
                if (tableidx === -1)
                    throw new ReferenceError("tableidx not found");
                typeidx = types.indexOf(inst.type);
                if (typeidx === -1)
                    throw new ReferenceError("typeidx not found");
                data.writeULEB128(typeidx);
                data.writeULEB128(tableidx);
                break;
            }
            // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
            // return_call          0x12    [t3* t1*] -> [t4*]
            // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
            case 0x41: // i32.const
                data.writeUint8(b1);
                if (reloc && inst.reloc === true) {
                    inst._roff = data.offset + reloc_offset;
                    data.writeSLEB128(inst.value, RELOC_PAD);
                } else {
                    data.writeSLEB128(inst.value);
                }
                
                break;
            case 0x42: // i64.const
                data.writeUint8(b1);
                if (reloc && inst.reloc === true) {
                    inst._roff = data.offset + reloc_offset;
                    data.writeSLEB128(inst.value, RELOC_PAD);
                } else {
                    data.writeSLEB128(inst.value);   
                }
                break;
            case 0x43: // f32.const
                data.writeUint8(b1);
                data.writeFloat32(inst.value);
                break;
            case 0x44: // f64.const
                data.writeUint8(b1);
                data.writeFloat64(inst.value);
                break;
            case 0x0b: // end
            {
                data.writeUint8(b1);
                break;
            }
            case 0x1A: // drop
                data.writeUint8(b1);
                break;
            case 0x1B: // select
                data.writeUint8(b1);
                break;
            case 0x1C: // select t*
                data.writeUint8(b1);
                break;
            case 0x20: // local.get
            {
                let idx = locals.indexOf(inst.local);
                if (idx === -1)
                    throw new RangeError("inst.local not defined");
                data.writeUint8(b1);
                data.writeULEB128(idx);
                break;
            }
            case 0x21: // local.set
            {
                let idx = locals.indexOf(inst.local);
                if (idx === -1)
                    throw new RangeError("inst.local not defined");
                data.writeUint8(b1);
                data.writeULEB128(idx);
                break;
            }
            case 0x22: // local.tee
            {
                let idx = locals.indexOf(inst.local);
                if (idx === -1)
                    throw new RangeError("inst.local not defined");
                data.writeUint8(b1);
                data.writeULEB128(idx);
                break;
            }
            case 0x23: // global.get
            {
                data.writeUint8(b1);
                let globalidx = globals.indexOf(inst.global);
                if (globalidx === -1)
                    throw new ReferenceError("globalidx not found");
                data.writeULEB128(globalidx);
                break;
            }
            case 0x24: // global.set
            {
                data.writeUint8(b1);
                let globalidx = globals.indexOf(inst.global);
                if (globalidx === -1)
                    throw new ReferenceError("globalidx not found");
                data.writeULEB128(globalidx);
                break;
            }
            case 0x25: // table.get
            {
                data.writeUint8(b1);
                let tblidx = tables.indexOf(inst.table);
                if (tblidx === -1)
                    throw new ReferenceError("tableidx not found");
                data.writeULEB128(tblidx);
                break;
            }
            case 0x26: // table.set
            {
                data.writeUint8(b1);
                let tblidx = tables.indexOf(inst.table);
                if (tblidx === -1)
                    throw new ReferenceError("tableidx not found");
                data.writeULEB128(tblidx);
                break;
            }
            case 0x28: // i32.load
            case 0x29: // i64.load
            case 0x2a: // f32.load
            case 0x2b: // f64.load
            case 0x2c: // i32.load8_s
            case 0x2d: // i32.load8_u
            case 0x2e: // i32.load16_s
            case 0x2f: // i32.load16_u
            case 0x30: // i64.load8_s
            case 0x31: // i64.load8_u
            case 0x32: // i64.load16_s
            case 0x33: // i64.load16_u
            case 0x34: // i64.load32_s
            case 0x35: // i64.load32_u
            case 0x36: // i32.store
            case 0x37: // i64.store
            case 0x38: // f32.store
            case 0x39: // f64.store
            case 0x3a: // i32.store8
            case 0x3b: // i32.store16
            case 0x3c: // i64.store8
            case 0x3d: // i64.store16
            case 0x3e: // i64.store32
            {
                data.writeUint8(b1);
                data.writeULEB128(inst.align);
                if (reloc && inst.reloc === true) {
                    inst._roff = data.offset + reloc_offset;
                    data.writeULEB128(inst.offset, RELOC_PAD);
                } else {
                    data.writeULEB128(inst.offset);   
                }
                break;
            }
            case 0x3f: // memory.size 0x00
            {
                if (inst.memidx != 0x00)
                    throw TypeError("invalid memidx");
                data.writeUint8(b1);
                data.writeUint8(inst.memidx); // u8 or ULEB128? dont matter right now as no other value than 0 are supported, but what about later?
                break;
            }
            case 0x40: // memory.grow 0x00
            {
                if (inst.memidx != 0x00)
                    throw TypeError("invalid memidx");
                data.writeUint8(b1);
                data.writeUint8(inst.memidx); // u8 or ULEB128?
                break;
            }
            case 0x45: // i32.eqz
            case 0x46: // i32.eq
            case 0x47: // i32.ne
            case 0x48: // i32.lt_s
            case 0x49: // i32.lt_u
            case 0x4a: // i32.gt_s
            case 0x4b: // i32.gt_u
            case 0x4c: // i32.le_s
            case 0x4d: // i32.le_u
            case 0x4e: // i32.ge_s
            case 0x4f: // i32.ge_u

            case 0x50: // i64.eqz
            case 0x51: // i64.eq
            case 0x52: // i64.ne
            case 0x53: // i64.lt_s
            case 0x54: // i64.lt_u
            case 0x55: // i64.gt_s
            case 0x56: // i64.gt_u
            case 0x57: // i64.le_s
            case 0x58: // i64.le_u
            case 0x59: // i64.ge_s
            case 0x5a: // i64.ge_u

            case 0x5b: // f32.eq
            case 0x5c: // f32.ne
            case 0x5d: // f32.lt
            case 0x5e: // f32.gt
            case 0x5f: // f32.le
            case 0x60: // f32.ge

            case 0x61: // f64.eq
            case 0x62: // f64.ne
            case 0x63: // f64.lt
            case 0x64: // f64.gt
            case 0x65: // f64.le
            case 0x66: // f64.ge

            case 0x67: // i32.clz
            case 0x68: // i32.ctz
            case 0x69: // i32.popcnt
            case 0x6a: // i32.add
            case 0x6b: // i32.sub
            case 0x6c: // i32.mul
            case 0x6d: // i32.div_s
            case 0x6e: // i32.div_u
            case 0x6f: // i32.rem_s
            case 0x70: // i32.rem_u
            case 0x71: // i32.and
            case 0x72: // i32.or
            case 0x73: // i32.xor
            case 0x74: // i32.shl
            case 0x75: // i32.shr_s
            case 0x76: // i32.shr_u
            case 0x77: // i32.rotl
            case 0x78: // i32.rotr

            case 0x79: // i64.clz
            case 0x7a: // i64.ctz
            case 0x7b: // i64.popcnt
            case 0x7c: // i64.add
            case 0x7d: // i64.sub
            case 0x7e: // i64.mul
            case 0x7f: // i64.div_s
            case 0x80: // i64.div_u
            case 0x81: // i64.rem_s
            case 0x82: // i64.rem_u
            case 0x83: // i64.and
            case 0x84: // i64.or
            case 0x85: // i64.xor
            case 0x86: // i64.shl
            case 0x87: // i64.shr_s
            case 0x88: // i64.shr_u
            case 0x89: // i64.rotl
            case 0x8a: // i64.rotr

            case 0x8b: // f32.abs
            case 0x8c: // f32.neg
            case 0x8d: // f32.ceil
            case 0x8e: // f32.floor
            case 0x8f: // f32.trunc
            case 0x90: // f32.nearest
            case 0x91: // f32.sqrt
            case 0x92: // f32.add
            case 0x93: // f32.sub
            case 0x94: // f32.mul
            case 0x95: // f32.div
            case 0x96: // f32.min
            case 0x97: // f32.max
            case 0x98: // f32.copysign

            case 0x99: // f64.abs
            case 0x9a: // f64.neg
            case 0x9b: // f64.ceil
            case 0x9c: // f64.floor
            case 0x9d: // f64.trunc
            case 0x9e: // f64.nearest
            case 0x9f: // f64.sqrt
            case 0xA0: // f64.add
            case 0xA1: // f64.sub
            case 0xA2: // f64.mul
            case 0xA3: // f64.div
            case 0xA4: // f64.min
            case 0xA5: // f64.max
            case 0xA6: // f64.copysign

            case 0xA7: // i32.wrap_i64
            case 0xA8: // i32.trunc_f32_s
            case 0xA9: // i32.trunc_f32_u
            case 0xAA: // i32.trunc_f64_s
            case 0xAB: // i32.trunc_f64_u
            case 0xAC: // i64.extend_i32_s
            case 0xAD: // i64.extend_i32_u
            case 0xAE: // i64.trunc_f32_s
            case 0xAF: // i64.trunc_f32_u
            case 0xB0: // i64.trunc_f64_s
            case 0xB1: // i64.trunc_f64_u
            case 0xB2: // f32.convert_i32_s
            case 0xB3: // f32.convert_i32_u
            case 0xB4: // f32.convert_i64_s
            case 0xB5: // f32.convert_i64_u
            case 0xB6: // f32.demote_f64
            case 0xB7: // f64.convert_i32_s
            case 0xB8: // f64.convert_i32_u
            case 0xB9: // f64.convert_i64_s
            case 0xBA: // f64.convert_i64_u
            case 0xBB: // f64.promote_f32
            case 0xBC: // i32.reinterpret_f32
            case 0xBD: // i64.reinterpret_f64
            case 0xBE: // f32.reinterpret_i32
            case 0xBF: // f64.reinterpret_i64

            case 0xC0: // i32.extend8_s
            case 0xC1: // i32.extend16_s
            case 0xC2: // i64.extend8_s
            case 0xC3: // i64.extend16_s
            case 0xC4: // i64.extend32_s
                data.writeUint8(b1);
                break;
            case 0xD0: // ref.null
                data.writeUint8(b1);
                data.writeULEB128(inst.reftype);
                break;
            case 0xD1: // ref.is_null
                data.writeUint8(b1);
                break;
            case 0xD2: // ref.func
            {
                let funcidx = functions.indexOf(inst.func);
                if (funcidx === -1)
                    throw new ReferenceError("funcidx not found");
                data.writeUint8(b1);
                data.writeULEB128(funcidx);
                break;
            }
            case 0xfc:
            {
                switch (b2) {
                    case  0: // i32.trunc_sat_f32_s
                    case  1: // i32.trunc_sat_f32_u
                    case  2: // i32.trunc_sat_f64_s
                    case  3: // i32.trunc_sat_f64_u
                    case  4: // i64.trunc_sat_f32_s
                    case  5: // i64.trunc_sat_f32_u
                    case  6: // i64.trunc_sat_f64_s
                    case  7: // i64.trunc_sat_f64_u
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        break;
                    case  8: // memory.init
                    {
                        let memidx;
                        let dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        memidx = mod.memory.indexOf(inst.memory);
                        if (memidx === -1)
                            throw new ReferenceError("memidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(dataidx);
                        data.writeUint8(memidx);
                        break;
                    }
                    case  9: // data.drop
                    {
                        let dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(dataidx);
                        break;
                    }
                    case 10: // memory.copy 0x00 0x00
                    {
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeUint8(inst.memidx1);
                        data.writeUint8(inst.memidx2);
                        break;
                    }
                    case 11: // memory.fill 0x00
                    {
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeUint8(inst.memidx);
                        break;
                    }
                    case 12: // table.init
                    {
                        let elemidx, tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        elemidx = mod.elementSegments.indexOf(inst.elem);
                        if (elemidx === -1)
                            throw new ReferenceError("elemidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(elemidx);
                        data.writeUint8(tblidx);
                        break;
                    }
                    case 13: // elem.drop
                    {
                        let elemidx = mod.elementSegments.indexOf(inst.elem);
                        if (elemidx === -1)
                            throw new ReferenceError("elemidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(elemidx);
                        break;
                    }
                    case 14: // table.copy
                    {
                        let tblidx2, tblidx1 = tables.indexOf(inst.table1);
                        if (tblidx1 === -1)
                            throw new ReferenceError("tableidx not found");
                        tblidx2 = tables.indexOf(inst.table2);
                        if (tblidx2 === -1)
                            throw new ReferenceError("tableidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(tblidx1);
                        data.writeULEB128(tblidx2);
                        break;
                    }
                    case 15: // table.grow
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(tblidx);
                        break;
                    }
                    case 16: // table.size
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(tblidx);
                        break;
                    }
                    case 17: // table.fill
                    {
                        let tblidx = tables.indexOf(inst.table);
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(tblidx);
                        break;
                    }
                }
                break;
            }

            case 0xFD: // multi-byte sequence
            {
                switch (b2) {
                    case 0:     // m:memarg =>  v128.load m
                    case 1:     // m:memarg =>  v128.load8x8_s m
                    case 2:     // m:memarg =>  v128.load8x8_u m
                    case 3:     // m:memarg =>  v128.load16x4_s m
                    case 4:     // m:memarg =>  v128.load16x4_u m
                    case 5:     // m:memarg =>  v128.load32x2_s m
                    case 6:     // m:memarg =>  v128.load32x2_u m
                    case 7:     // m:memarg =>  v128.load8_splat m
                    case 8:     // m:memarg =>  v128.load16_splat m
                    case 9:     // m:memarg =>  v128.load32_splat m
                    case 10:    // m:memarg =>  v128.load64_splat m
                    case 92:    // m:memarg =>  v128.load32_zero m
                    case 93:    // m:memarg =>  v128.load64_zero m
                    case 11:    // m:memarg =>  v128.store m
                    {
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.align);
                        data.writeULEB128(inst.offset);
                        break;
                    }
                    case 84:    // m:memarg l:laneidx   =>  v128.load8_lane m l
                    case 85:    // m:memarg l:laneidx   =>  v128.load16_lane m l
                    case 86:    // m:memarg l:laneidx   =>  v128.load32_lane m l
                    case 87:    // m:memarg l:laneidx   =>  v128.load64_lane m l
                    case 88:    // m:memarg l:laneidx   =>  v128.store8_lane m l
                    case 89:    // m:memarg l:laneidx   =>  v128.store16_lane m l
                    case 90:    // m:memarg l:laneidx   =>  v128.store32_lane m l
                    case 91:    // m:memarg l:laneidx   =>  v128.store64_lane m l

                        break;

                    case 12:    // v128.const (b0 ... b15)
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        throw TypeError("TODO implement me!");
                        break;
                    case 13:    // i8x16.shuffle l
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        throw TypeError("TODO implement me!");
                        break;
                    case 21:    // l:laneidx    =>  i8x16.extract_lane_s l
                    case 22:    // l:laneidx    =>  i8x16.extract_lane_u l
                    case 23:    // l:laneidx    =>  i8x16.replace_lane l
                    case 24:    // l:laneidx    =>  i16x8.extract_lane_s l
                    case 25:    // l:laneidx    =>  i16x8.extract_lane_u l
                    case 26:    // l:laneidx    =>  i16x8.replace_lane l
                    case 27:    // l:laneidx    =>  i32x4.extract_lane l
                    case 28:    // l:laneidx    =>  i32x4.replace_lane l
                    case 29:    // l:laneidx    =>  i64x2.extract_lane l
                    case 30:    // l:laneidx    =>  i64x2.replace_lane l
                    case 31:    // l:laneidx    =>  f32x4.extract_lane l
                    case 32:    // l:laneidx    =>  f32x4.replace_lane l
                    case 33:    // l:laneidx    =>  f64x2.extract_lane l
                    case 34:    // l:laneidx    =>  f64x2.replace_lane l
                        throw TypeError("TODO implement me!");
                        break;
                    case 14:    // i8x16.swizzle
                    case 15:    // i8x16.splat
                    case 16:    // i16x8.splat
                    case 17:    // i32x4.splat
                    case 18:    // i64x2.splat
                    case 19:    // f32x4.splat
                    case 20:    // f64x2.splat

                    case 35:    // i8x16.eq
                    case 36:    // i8x16.ne
                    case 37:    // i8x16.lt_s
                    case 38:    // i8x16.lt_u
                    case 39:    // i8x16.gt_s
                    case 40:    // i8x16.gt_u
                    case 41:    // i8x16.le_s
                    case 42:    // i8x16.le_u
                    case 43:    // i8x16.ge_s
                    case 44:    // i8x16.ge_u

                    case 45:    // i16x8.eq
                    case 46:    // i16x8.ne
                    case 47:    // i16x8.lt_s
                    case 48:    // i16x8.lt_u
                    case 49:    // i16x8.gt_s
                    case 50:    // i16x8.gt_u
                    case 51:    // i16x8.le_s
                    case 52:    // i16x8.le_u
                    case 53:    // i16x8.ge_s
                    case 54:    // i16x8.ge_u

                    case 55:    // i32x4.eq
                    case 56:    // i32x4.ne
                    case 57:    // i32x4.lt_s
                    case 58:    // i32x4.lt_u
                    case 59:    // i32x4.gt_s
                    case 60:    // i32x4.gt_u
                    case 61:    // i32x4.le_s
                    case 62:    // i32x4.le_u
                    case 63:    // i32x4.ge_s
                    case 64:    // i32x4.ge_u

                    case 214:   // i64x2.eq
                    case 215:   // i64x2.ne
                    case 216:   // i64x2.lt
                    case 217:   // i64x2.gt
                    case 218:   // i64x2.le
                    case 219:   // i64x2.ge

                    case 65:    // f32x4.eq
                    case 66:    // f32x4.ne
                    case 67:    // f32x4.lt
                    case 68:    // f32x4.gt
                    case 69:    // f32x4.le
                    case 70:    // f32x4.ge

                    case 71:    // f64x2.eq
                    case 72:    // f64x2.ne
                    case 73:    // f64x2.lt
                    case 74:    // f64x2.gt
                    case 75:    // f64x2.le
                    case 76:    // f64x2.ge

                    case 77:    // v128.not
                    case 78:    // v128.and
                    case 79:    // v128.andnot
                    case 80:    // v128.or
                    case 81:    // v128.xor
                    case 82:    // v128.bitselect
                    case 83:    // v128.any_true

                    case 96:    // i8x16.abs
                    case 97:    // i8x16.neg
                    case 98:    // i8x16.popcnt
                    case 99:    // i8x16.all_true
                    case 100:   // i8x16.bitmask
                    case 101:   // i8x16.narrow_i16x8_s
                    case 102:   // i8x16.narrow_i16x8_u
                    case 107:   // i8x16.shl
                    case 108:   // i8x16.shr_s
                    case 109:   // i8x16.shr_u
                    case 110:   // i8x16.add
                    case 111:   // i8x16.add_sat_s
                    case 112:   // i8x16.add_sat_u
                    case 113:   // i8x16.sub
                    case 114:   // i8x16.sub_sat_s
                    case 115:   // i8x16.sub_sat_u
                    case 118:   // i8x16.min_s
                    case 119:   // i8x16.min_u
                    case 120:   // i8x16.max_s
                    case 121:   // i8x16.max_u
                    case 123:   // i8x16.avgr_u

                    case 124:   // i16x8.extadd_pairwise_i8x16_s
                    case 125:   // i16x8.extadd_pairwise_i8x16_u
                    case 128:   // i16x8.abs
                    case 129:   // i16x8.neg
                    case 130:   // i16x8.q15mulr_sat_s
                    case 131:   // i16x8.all_true
                    case 132:   // i16x8.bitmask
                    case 133:   // i16x8.narrow_i32x4_s
                    case 134:   // i16x8.narrow_i32x4_u
                    case 135:   // i16x8.extend_low_i8x16_s
                    case 136:   // i16x8.extend_high_i8x16_s
                    case 137:   // i16x8.extend_low_i8x16_u
                    case 138:   // i16x8.extend_high_i8x16_u
                    case 139:   // i16x8.shl
                    case 140:   // i16x8.shr_s
                    case 141:   // i16x8.shr_u
                    case 142:   // i16x8.add
                    case 143:   // i16x8.add_sat_s
                    case 144:   // i16x8.add_sat_u

                    case 145:   // i16x8.sub
                    case 146:   // i16x8.sub_sat_s
                    case 147:   // i16x8.sub_sat_u

                    case 149:   // i16x8.mul
                    case 150:   // i16x8.min_s
                    case 151:   // i16x8.min_u
                    case 152:   // i16x8.max_s
                    case 153:   // i16x8.max_u
                    case 155:   // i16x8.avgr_u
                    case 156:   // i16x8.extmul_low_i8x16_s
                    case 157:   // i16x8.extmul_high_i8x16_s
                    case 158:   // i16x8.extmul_low_i8x16_u
                    case 159:   // i16x8.extmul_high_i8x16_u

                    case 126:   // i32x4.extadd_pairwise_i16x8_s
                    case 127:   // i32x4.extadd_pairwise_i16x8_u
                    case 160:   // i32x4.abs
                    case 161:   // i32x4.neg
                    case 163:   // i32x4.all_true
                    case 164:   // i32x4.bitmask
                    case 167:   // i32x4.extend_low_i16x8_s
                    case 168:   // i32x4.extend_high_i16x8_s
                    case 169:   // i32x4.extend_low_i16x8_u
                    case 170:   // i32x4.extend_high_i16x8_u

                    case 171:   // i32x4.shl
                    case 172:   // i32x4.shr_s
                    case 173:   // i32x4.shr_u
                    case 174:   // i32x4.add
                    case 177:   // i32x4.sub

                    case 181:   // i32x4.mul
                    case 182:   // i32x4.min_s
                    case 183:   // i32x4.min_u
                    case 184:   // i32x4.max_s
                    case 185:   // i32x4.max_u
                    case 186:   // i32x4.dot_i16x8_s
                    case 188:   // i32x4.extmul_low_i16x8_s
                    case 189:   // i32x4.extmul_high_i16x8_s
                    case 190:   // i32x4.extmul_low_i16x8_u
                    case 191:   // i32x4.extmul_high_i16x8_u

                    case 192:   // i64x2.abs
                    case 193:   // i64x2.neg
                    case 195:   // i64x2.all_true
                    case 196:   // i64x2.bitmask
                    case 199:   // i64x2.extend_low_i32x4_s
                    case 200:   // i64x2.extend_high_i32x4_s
                    case 201:   // i64x2.extend_low_i32x4_u
                    case 202:   // i64x2.extend_high_i32x4_u
                    case 203:   // i64x2.shl
                    case 204:   // i64x2.shr_s
                    case 205:   // i64x2.shr_u
                    case 206:   // i64x2.add
                    case 209:   // i64x2.sub
                    case 213:   // i64x2.mul
                    case 220:   // i64x2.extmul_low_i32x4_s
                    case 221:   // i64x2.extmul_high_i32x4_s
                    case 222:   // i64x2.extmul_low_i32x4_u
                    case 223:   // i64x2.extmul_high_i32x4_u


                    case 103:   // f32x4.ceil
                    case 104:   // f32x4.floor
                    case 105:   // f32x4.trunc
                    case 106:   // f32x4.nearest
                    case 224:   // f32x4.abs
                    case 225:   // f32x4.neg
                    case 227:   // f32x4.sqrt
                    case 228:   // f32x4.add
                    case 229:   // f32x4.sub
                    case 230:   // f32x4.mul
                    case 231:   // f32x4.div
                    case 232:   // f32x4.min
                    case 233:   // f32x4.max
                    case 234:   // f32x4.pmin
                    case 235:   // f32x4.pmax

                    case 116:   // f64x2.ceil
                    case 117:   // f64x2.floor
                    case 122:   // f64x2.trunc
                    case 148:   // f64x2.nearest
                    case 236:   // f64x2.abs
                    case 237:   // f64x2.neg
                    case 239:   // f64x2.sqrt
                    case 240:   // f64x2.add
                    case 241:   // f64x2.sub
                    case 242:   // f64x2.mul
                    case 243:   // f64x2.div
                    case 244:   // f64x2.min
                    case 245:   // f64x2.max
                    case 246:   // f64x2.pmin
                    case 247:   // f64x2.pmax

                    case 248:   // i32x4.trunc_sat_f32x4_s
                    case 249:   // i32x4.trunc_sat_f32x4_u
                    case 250:   // f32x4.convert_i32x4_s
                    case 251:   // f32x4.convert_i32x4_u
                    case 252:   // i32x4.trunc_sat_f64x2_s_zero
                    case 253:   // i32x4.trunc_sat_f64x2_u_zero
                    case 254:   // f64x2.convert_low_i32x4_s
                    case 255:   // f64x2.convert_low_i32x4_u
                    case 94:    // f32x4.demote_f64x2_zero
                    case 95:    // f64x2.promote_low_f32x4
                        throw TypeError("TODO implement me!");
                        break;
                }
                break;
            }

            case 0xFE: // Atomic Memory Instructions
            {
                switch (b2) {
                    case 0x00: // memory.atomic.notify
                    case 0x01: // memory.atomic.wait32
                    case 0x02: // memory.atomic.wait64
                    {
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.align);
                        data.writeULEB128(inst.offset);
                        break;
                    }
                    case 0x03: // atomic.fence 0x00
                    {
                        if (inst.memidx != 0x00)
                            throw TypeError("invalid memidx");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeUint8(inst.memidx);
                        break;
                    }

                    case 0x10: // i32.atomic.load
                    case 0x11: // i64.atomic.load
                    case 0x12: // i32.atomic.load8_u
                    case 0x13: // i32.atomic.load16_u
                    case 0x14: // i64.atomic.load8_u
                    case 0x15: // i64.atomic.load16_u
                    case 0x16: // i64.atomic.load32_u
                    case 0x17: // i32.atomic.store
                    case 0x18: // i64.atomic.store
                    case 0x19: // i32.atomic.store8
                    case 0x1A: // i32.atomic.store16
                    case 0x1B: // i64.atomic.store8
                    case 0x1C: // i64.atomic.store16
                    case 0x1D: // i64.atomic.store32

                    case 0x1E: // i32.atomic.rmw.add
                    case 0x1F: // i64.atomic.rmw.add
                    case 0x20: // i32.atomic.rmw8.add_u
                    case 0x21: // i32.atomic.rmw16.add_u
                    case 0x22: // i64.atomic.rmw8.add_u
                    case 0x23: // i64.atomic.rmw16.add_u
                    case 0x24: // i64.atomic.rmw32.add_u

                    case 0x25: // i32.atomic.rmw.sub
                    case 0x26: // i64.atomic.rmw.sub
                    case 0x27: // i32.atomic.rmw8.sub_u
                    case 0x28: // i32.atomic.rmw16.sub_u
                    case 0x29: // i64.atomic.rmw8.sub_u
                    case 0x2A: // i64.atomic.rmw16.sub_u
                    case 0x2B: // i64.atomic.rmw32.sub_u

                    case 0x2C: // i32.atomic.rmw.and
                    case 0x2D: // i64.atomic.rmw.and
                    case 0x2E: // i32.atomic.rmw8.and_u
                    case 0x2F: // i32.atomic.rmw16.and_u
                    case 0x30: // i64.atomic.rmw8.and_u
                    case 0x31: // i64.atomic.rmw16.and_u
                    case 0x32: // i64.atomic.rmw32.and_u

                    case 0x33: // i32.atomic.rmw.or
                    case 0x34: // i64.atomic.rmw.or
                    case 0x35: // i32.atomic.rmw8.or_u
                    case 0x36: // i32.atomic.rmw16.or_u
                    case 0x37: // i64.atomic.rmw8.or_u
                    case 0x38: // i64.atomic.rmw16.or_u
                    case 0x39: // i64.atomic.rmw32.or_u

                    case 0x3A: // i32.atomic.rmw.xor
                    case 0x3B: // i64.atomic.rmw.xor
                    case 0x3C: // i32.atomic.rmw8.xor_u
                    case 0x3D: // i32.atomic.rmw16.xor_u
                    case 0x3E: // i64.atomic.rmw8.xor_u
                    case 0x3F: // i64.atomic.rmw16.xor_u
                    case 0x40: // i64.atomic.rmw32.xor_u

                    case 0x41: // i32.atomic.rmw.xchg
                    case 0x42: // i64.atomic.rmw.xchg
                    case 0x43: // i32.atomic.rmw8.xchg_u
                    case 0x44: // i32.atomic.rmw16.xchg_u
                    case 0x45: // i64.atomic.rmw8.xchg_u
                    case 0x46: // i64.atomic.rmw16.xchg_u
                    case 0x47: // i64.atomic.rmw32.xchg_u

                    case 0x48: // i32.atomic.rmw.cmpxchg
                    case 0x49: // i64.atomic.rmw.cmpxchg
                    case 0x4A: // i32.atomic.rmw8.cmpxchg_u
                    case 0x4B: // i32.atomic.rmw16.cmpxchg_u
                    case 0x4C: // i64.atomic.rmw8.cmpxchg_u
                    case 0x4D: // i64.atomic.rmw16.cmpxchg_u
                    case 0x4E: // i64.atomic.rmw32.cmpxchg_u
                    {
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.align);
                        if (reloc && inst.reloc === true) {
                            inst._roff = data.offset + reloc_offset;
                            data.writeULEB128(inst.offset, RELOC_PAD);
                        } else {
                            data.writeULEB128(inst.offset);
                        }
                        break;
                    }
                    default:
                        throw new TypeError("opcode " + ("0x" + b1.toString(16) + b2.toString(16)) + " not supported");
                }
                break;
            }
            default:
                throw new TypeError("opcode " + ("0x" + b1.toString(16)) + " not supported");
        }
    }

    return true;
}
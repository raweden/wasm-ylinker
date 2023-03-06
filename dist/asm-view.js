
let url = "./examples/kern.wasm"
let txtdata = "97040109 7F230041 106B2200 24000240 41002D00 C1B00641 0871450D 00410041 002802 C4B0064101 6A3602C4 B0060B02 40024041 002802D4 B0062201 450D0041 002802D0 B0062102 0C010B41 00210241 00410036 02D0B006 41002101 41004100 3602D4B0 060B0340 02402001 20024F0D 00200141 046A2203 21040340 02402004 2002490D 00200321 010C030B 02402001 28020022 05280200 22062004 28020022 07280200 2208490D 00024020 06200847 0D002005 28020420 07280204 4D0D010B 20012007 36020020 04200536 02004100 2802D0B0 0621020B 20044104 6A21040C 000B0B41 002802D4 B0062104 41818080 04210702 40034020 0420024F 0D010240 02402004 28020022 01280200 22054102 490D0002 40200520 074D0D00 41002D00 ECC10641 FF017145 0D002000 20053602 0041A36F 41B81520 0010291A 20042802 0021010B 20012802 0C200128 02081100 00200428 02002202 28020021 07200241 01360200 41002802 C8B00622 010D0141 002802D0 B0062102 0B200441 046A2104 0C010B0B 02404100 2802D4B0 06220441 00460D00 200441A0 DC0410B8 06410028 02C8B006 21010B41 00200136 02D4B006 41004100 2802CCB0 06220236 02D0B006 41004100 3602C8B0 06410041 003602CC B0060C01 0B0B0240 41002D00 ECC10645 0D004100 41C09201 41001029 1A0B0240 41A4C50A 41106A22 04410041 00FE4800 00220245 0D002004 20021084 070B10C8 2E200041 106A2400 0B";
let buffer;


function bufferFromHexDump(txt) {
	let cnt = 0;
	let len = txt.length;
	for (let i = 0; i < len; i++) {
		let cc = txt.charCodeAt(i);
		if ((cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 70) || (cc >= 97 && cc <= 102)) {
			cnt++;
		} else if (cc != 32 && cc != 9) {
			console.error("invalid char '%s' at %d", txt[i], i);
		}
	}

	let sz = cnt * 0.5;
	let buf = new ArrayBuffer(sz);
	let u8 = new Uint8Array(buf);

	let dst = 0;
	let idx = 0;

	while (idx < len) {
		let c1 = txt.charCodeAt(idx++);
		if (c1 >= 48 && c1 <= 57) {
			c1 = c1 - 48;
		} else if (c1 >= 65 && c1 <= 70) {
			c1 = c1 - 55;
		} else if (c1 >= 97 && c1 <= 102) {
			c1 = c1 - 87;
		}
		let c2 = txt.charCodeAt(idx++);
		if (c2 >= 48 && c2 <= 57) {
			c2 = c2 - 48;
		} else if (c2 >= 65 && c2 <= 70) {
			c2 = c2 - 55;
		} else if (c2 >= 97 && c2 <= 102) {
			c2 = c2 - 87;
		}
		u8[dst++] = ((c1 << 4) | c2);

		let cc = txt.charCodeAt(idx);
		while(cc == 32 || cc == 9) {
			cc = txt.charCodeAt(idx++);
			if (cc != 32 && cc != 9) {
				idx--;
				break;
			}
		}
	}

	console.log(u8);
	return u8;
}

function decodeByteCodeForEdit(data, mod) {
    
    let start = data.offset;
    let brk = false;
    let topInsts = [];
    let opcodes = topInsts;
    let blkstack = [{opcodes: topInsts}]; // holds the nesting for block, loop and if/else

    while(brk == false) {
    	let loc = data._offset;
        let op_code = data.readUint8();
        let inst;
        switch (op_code) {
            case 0x00: // unreachable
                inst = new UnreachableInst();
                break;
            case 0x01: // nop           [] -> []
                inst = {opcode: op_code};
                break;
            case 0x02: // block
            case 0x03: // loop
            {
                inst = (op_code == 0x03) ? new LoopInst(op_code) : new BlockInst(op_code);
                let type = data.readUint8();
                if (type == 0x40) { // empty
                    inst.type = type;
                } else if (type == 0x7F || type == 0x7E || type == 0x7D || type == 0x7C || type == 0x7B  || type == 0x70 || type == 0x6F) {
                    inst.type = type;
                } else {
                    data.offset--;
                    type = data.readSLEB128();
                    inst.type = type;
                }
                //inst.opcodes = [];
                //opcodes = inst.opcodes;
                blkstack.push(inst);
                break;
            }
            case 0x04: // if <inst> 0x0B || if <inst> 0x05 <inst> 0x0B
            {
                inst = new IfInst(op_code);
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
                inst = new IfInst(op_code);
                //inst.opcodes = [];
                //blkst.else = inst;
                //opcodes = inst.opcodes;
                blkstack[lastidx] = inst;
                break;
            }
            case 0x0C: // br
                inst = {opcode: op_code, labelidx: data.readULEB128()};
                break;
            case 0x0D: // br_if
                inst = {opcode: op_code, labelidx: data.readULEB128()};
                break;
            case 0x0E: // br_table
            {
                let labels = [];
                let cnt = data.readULEB128();
                for (let x = 0; x < cnt; x++) {
                    let label = data.readULEB128();
                    labels.push(label);
                }
                let def = data.readULEB128();
                inst = new BranchTableInst(op_code, labels);
                inst.default_br = def;
                break;
            }
            case 0x0F: // return
                inst = new ReturnInst(op_code);
                break;
            case 0x10: // call
                inst = new CallInst(op_code, data.readULEB128());
                break;
            case 0x11: // call_indirect
                inst = new IndirectCallInst(op_code, data.readULEB128(), data.readULEB128());
                //inst = {opcode: op_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()};
                break;
            case 0x41: // i32.const     [] -> [i32]
                inst = {opcode: op_code, value: data.readULEB128()};
                break;
            case 0x42: // i64.const     [] -> [i64]
                inst = {opcode: op_code, value: data.readULEB128(true)};
                break;
            case 0x43: // f32.const     [] -> [f32]
                inst = {opcode: op_code, value: data.readFloat32()};
                break;
            case 0x44: // f64.const     [] -> [f64]
                inst = {opcode: op_code, value: data.readFloat64()};
                break;
            case 0x0b: // end
            {
                inst = {opcode: op_code};
                blkstack.pop();

                if (blkstack.length > 0) {
                    let last = blkstack[blkstack.length - 1];
                    //opcodes = last.opcodes;
                } else if (blkstack.length == 0) {
                    brk = true;
                }
                break;
            }
            case 0x1A: // drop              [t] -> []
                inst = {opcode: op_code};
                break;
            case 0x1B: // select            [t t i32] -> [t]
                inst = {opcode: op_code};
                break;
            case 0x1C: // select t*         [t t i32] -> [t]
                inst = {opcode: op_code};
                break;
            case 0x20: // local.get         [] -> [t]
                inst = {opcode: op_code, x: data.readULEB128()};
                break;
            case 0x21: // local.set         [t] -> []
                inst = {opcode: op_code, x: data.readULEB128()};
                break;
            case 0x22: // local.tee         [t] -> [t]
                inst = {opcode: op_code, x: data.readULEB128()};
                break;
            case 0x23: // global.get        [] -> [t]
            {
                let idx = data.readULEB128();
                inst = {opcode: op_code, x: idx};
                if (mod)
                	inst.global = mod.globals[idx];
                break;
            }
            case 0x24: // global.set        [t] -> []
            {
                let idx = data.readULEB128();
                inst = {opcode: op_code, x: idx};
                if (mod)
                	inst.global = mod.globals[idx];
                break;
            }
            case 0x25: // table.get         [i32] -> [t]
                inst = {opcode: op_code, tableidx: data.readULEB128()};
                break;
            case 0x26: // table.set         [i32 t] -> []
                inst = {opcode: op_code, tableidx: data.readULEB128()};
                break;                
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
                let o = data.readULEB128();
                inst = {opcode: op_code, offset: o, align: a};
                break;
            }
            case 0x3f: // suffix 0x00 memory.size   [] -> [i32]
            {
                let sub = data.readULEB128();
                if (sub == 0x00) {
                    inst = {opcode: (op_code << 8) | sub};
                }
                break;
            }
            case 0x40: // suffix 0x00 memory.grow   [i32] -> []
            {
                let sub = data.readULEB128();
                if (sub == 0x00) {
                    inst = {opcode: (op_code << 8) | sub};
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
                inst = {opcode: op_code};
                break;
            case 0xD0: // ref.null t    [] -> [t]
                inst = {opcode: op_code, reftype: data.readULEB128()};
                break;
            case 0xD1: // ref.is_null   [t] -> [i32]
                inst = {opcode: op_code};
                break;
            case 0xD2: // ref.func x    [] -> [funcref]
                inst = {opcode: op_code, funcidx: data.readULEB128()};
                break;
            case 0xfc:
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case  0: // i32.trunc_sat_f32_s
                    case  1: // i32.trunc_sat_f32_u
                    case  2: // i32.trunc_sat_f64_s
                    case  3: // i32.trunc_sat_f64_u
                    case  4: // i64.trunc_sat_f32_s
                    case  5: // i64.trunc_sat_f32_u
                    case  6: // i64.trunc_sat_f64_s
                    case  7: // i64.trunc_sat_f64_u
                        inst = {opcode: (op_code << 8) | sub};
                        break;
                    case  8: // memory.init
                        inst = {opcode: (op_code << 8) | sub, dataidx: data.readULEB128()};
                        break;
                    case  9: // data.drop
                        inst = {opcode: (op_code << 8) | sub, dataidx: data.readULEB128()};
                        break;
                    case 10: // memory.copy 0x00 0x00 [i32 i32 i32] -> []
                        inst = {opcode: (op_code << 8) | sub, memidx1: data.readUint8(), memidx2: data.readUint8()};
                        break;
                    case 11: // memory.fill 0x00 [i32 i32 i32] -> []
                        inst = {opcode: (op_code << 8) | sub, memidx: data.readUint8()};
                        break;
                    //
                    case 12: // table.init
                        inst = {opcode: (op_code << 8) | sub, tableidx: data.readULEB128(), elemidx: data.readULEB128()};
                        break;
                    case 13: // elem.drop
                        inst = {opcode: (op_code << 8) | sub, elemidx: data.readULEB128()};
                        break;
                    case 14: // table.copy
                        inst = {opcode: (op_code << 8) | sub, tableidx1: data.readULEB128(), tableidx2: data.readULEB128()};
                        break;
                    case 15: // table.grow
                        inst = {opcode: (op_code << 8) | sub, tableidx: data.readULEB128()};
                        break;
                    case 16: // table.size [] -> [i32]
                        inst = {opcode: (op_code << 8) | sub, tableidx: data.readULEB128()};
                        break;
                    case 17: // table.fill
                        inst = {opcode: (op_code << 8) | sub, tableidx: data.readULEB128()};
                        break;
                }
                break;
            } 

            case 0xFD: // multi-byte sequence
            {
                let sub = data.readULEB128();
                switch (sub) {
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
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        inst = {opcode: (op_code << 8) | sub, offset: o, align: a};
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
                    {
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        let l = data.readUint8();
                        inst = {opcode: (op_code << 8) | sub, offset: o, align: a, laneidx: l};
                        break;
                    }
                    case 12:    // v128.const (b0 ... b15)
                    {
                        let v128 = new Uint8Array(16);
                        for (let z = 0; z < 16; z++) {
                            v128[z] = data.readUint8();
                        }
                        inst = {opcode: (op_code << 8) | sub, value: v128};
                        break;
                    }
                    case 13:    // i8x16.shuffle (l0 ... l15)
                    {
                        let lanes = new Uint8Array(16);
                        for (let z = 0; z < 16; z++) {
                            lanes[z] = data.readUint8();
                        }
                        inst = {opcode: (op_code << 8) | sub, lanes: lanes};
                        break;
                    }
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
                    {
                        let l = data.readUint8();
                        inst = {opcode: (op_code << 8) | sub, laneidx: l};
                        break;
                    }
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
                    {
                        inst = {opcode: (op_code << 8) | sub};
                        break;
                    }
                    default:
                        throw new TypeError("opcode " + ("0x" + b1.toString(16) + b2.toString(16)) + " not supported");
                }
                break;
            }

            case 0xFE: // Atomic Memory Instructions
            {
                let sub = data.readULEB128();
                switch (sub) {
                    case 0x00: // memory.atomic.notify      [i32 i32] -> [i32]
                    case 0x01: // memory.atomic.wait32      [i32 i32 i64] -> [i32]
                    case 0x02: // memory.atomic.wait64      [i32 i64 i64] -> [i32]

                    case 0x10: // i32.atomic.load           [i32] -> [i32]
                    case 0x11: // i64.atomic.load           [i32] -> [i64]
                    case 0x12: // i32.atomic.load8_u        [i32] -> [i32]
                    case 0x13: // i32.atomic.load16_u       [i32] -> [i32]
                    case 0x14: // i64.atomic.load8_u        [i32] -> [i64]
                    case 0x15: // i64.atomic.load16_u       [i32] -> [i64]
                    case 0x16: // i64.atomic.load32_u       [i32] -> [i64]
                    case 0x17: // i32.atomic.store          [i32 i32] -> []
                    case 0x18: // i64.atomic.store          [i32 i64] -> []
                    case 0x19: // i32.atomic.store8         [i32 i32] -> []
                    case 0x1A: // i32.atomic.store16        [i32 i32] -> []
                    case 0x1B: // i64.atomic.store8         [i32 i64] -> []
                    case 0x1C: // i64.atomic.store16        [i32 i64] -> []
                    case 0x1D: // i64.atomic.store32        [i32 i64] -> []

                    case 0x1E: // i32.atomic.rmw.add        [i32 i32] -> [i32]
                    case 0x1F: // i64.atomic.rmw.add        [i32 i64] -> [i64]
                    case 0x20: // i32.atomic.rmw8.add_u     [i32 i32] -> [i32]
                    case 0x21: // i32.atomic.rmw16.add_u    [i32 i32] -> [i32]
                    case 0x22: // i64.atomic.rmw8.add_u     [i32 i64] -> [i64]
                    case 0x23: // i64.atomic.rmw16.add_u    [i32 i64] -> [i64]
                    case 0x24: // i64.atomic.rmw32.add_u    [i32 i64] -> [i64]

                    case 0x25: // i32.atomic.rmw.sub        [i32 i32] -> [i32]
                    case 0x26: // i64.atomic.rmw.sub        [i32 i64] -> [i64]
                    case 0x27: // i32.atomic.rmw8.sub_u     [i32 i32] -> [i32]
                    case 0x28: // i32.atomic.rmw16.sub_u    [i32 i32] -> [i32]
                    case 0x29: // i64.atomic.rmw8.sub_u     [i32 i64] -> [i64]
                    case 0x2A: // i64.atomic.rmw16.sub_u    [i32 i64] -> [i64]
                    case 0x2B: // i64.atomic.rmw32.sub_u    [i32 i64] -> [i64]

                    case 0x2C: // i32.atomic.rmw.and            [i32 i32] -> [i32]
                    case 0x2D: // i64.atomic.rmw.and            [i32 i64] -> [i64]
                    case 0x2E: // i32.atomic.rmw8.and_u         [i32 i32] -> [i32]
                    case 0x2F: // i32.atomic.rmw16.and_u        [i32 i32] -> [i32]
                    case 0x30: // i64.atomic.rmw8.and_u         [i32 i64] -> [i64]
                    case 0x31: // i64.atomic.rmw16.and_u        [i32 i64] -> [i64]
                    case 0x32: // i64.atomic.rmw32.and_u        [i32 i64] -> [i64]

                    case 0x33: // i32.atomic.rmw.or             [i32 i32] -> [i32]
                    case 0x34: // i64.atomic.rmw.or             [i32 i64] -> [i64]
                    case 0x35: // i32.atomic.rmw8.or_u          [i32 i32] -> [i32]
                    case 0x36: // i32.atomic.rmw16.or_u         [i32 i32] -> [i32]
                    case 0x37: // i64.atomic.rmw8.or_u          [i32 i64] -> [i64]
                    case 0x38: // i64.atomic.rmw16.or_u         [i32 i64] -> [i64]
                    case 0x39: // i64.atomic.rmw32.or_u         [i32 i64] -> [i64]

                    case 0x3A: // i32.atomic.rmw.xor            [i32 i32] -> [i32]
                    case 0x3B: // i64.atomic.rmw.xor            [i32 i64] -> [i64]
                    case 0x3C: // i32.atomic.rmw8.xor_u         [i32 i32] -> [i32]
                    case 0x3D: // i32.atomic.rmw16.xor_u        [i32 i32] -> [i32]
                    case 0x3E: // i64.atomic.rmw8.xor_u         [i32 i64] -> [i64]
                    case 0x3F: // i64.atomic.rmw16.xor_u        [i32 i64] -> [i64]
                    case 0x40: // i64.atomic.rmw32.xor_u        [i32 i64] -> [i64]

                    case 0x41: // i32.atomic.rmw.xchg           [i32 i32] -> [i32]
                    case 0x42: // i64.atomic.rmw.xchg           [i32 i64] -> [i64]
                    case 0x43: // i32.atomic.rmw8.xchg_u        [i32 i32] -> [i32]
                    case 0x44: // i32.atomic.rmw16.xchg_u       [i32 i32] -> [i32]
                    case 0x45: // i64.atomic.rmw8.xchg_u        [i32 i64] -> [i64]
                    case 0x46: // i64.atomic.rmw16.xchg_u       [i32 i64] -> [i64]
                    case 0x47: // i64.atomic.rmw32.xchg_u       [i32 i64] -> [i64]

                    case 0x48: // i32.atomic.rmw.cmpxchg        [i32 i32 i32] -> [i32]
                    case 0x49: // i64.atomic.rmw.cmpxchg        [i32 i64 i64] -> [i64]
                    case 0x4A: // i32.atomic.rmw8.cmpxchg_u     [i32 i32 i32] -> [i32]
                    case 0x4B: // i32.atomic.rmw16.cmpxchg_u    [i32 i32 i32] -> [i32]
                    case 0x4C: // i64.atomic.rmw8.cmpxchg_u     [i32 i64 i64] -> [i64]
                    case 0x4D: // i64.atomic.rmw16.cmpxchg_u    [i32 i64 i64] -> [i64]
                    case 0x4E: // i64.atomic.rmw32.cmpxchg_u    [i32 i64 i64] -> [i64]
                    {
                        let a = data.readULEB128();
                        let o = data.readULEB128();
                        inst = {opcode: (op_code << 8) | sub, offset: o, align: a};
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

        if (inst) {
        	inst._loc = loc;
        	opcodes.push(inst);
        }
    }

    return {start: start, end: data.offset, opcodes: topInsts};
}

let lineGuters = [];
let binLines = [];
let txtLines = [];

function setupAsmViewer() {
	let asmViewer = document.createElement("div");
	asmViewer.classList.add("asm-viewer");

	let ruleMaxChrs = 4;
	let asmGuter = document.createElement("div");
	asmGuter.classList.add("gutter");
	let offsetValue = 0;
	asmViewer.appendChild(asmGuter);
	let lncnt = 283;

	for (let i = 0;i < lncnt;i++) {
		let ruleElement = document.createElement("div");
		ruleElement.dataset.offset = offsetValue;
		lineGuters.push(ruleElement);


		let str = offsetValue.toString(16);
		str = str.padStart(ruleMaxChrs, "0");
		ruleElement.textContent = str;

		asmGuter.appendChild(ruleElement);
		offsetValue += 16;
	}
	
	let asmBinary = document.createElement("div");
	asmBinary.classList.add("asm-binary-view");
	asmViewer.appendChild(asmBinary);

	for (let i = 0;i < lncnt;i++) {
		let binElement = document.createElement("div");
		binLines.push(binElement);


		let str = i.toString(16);
		str = str.padStart(ruleMaxChrs, "0");
		binElement.textContent = str;

		asmBinary.appendChild(binElement);
	}
	
	let asmText = document.createElement("div");
	asmText.classList.add("asm-text-view")
	asmViewer.appendChild(asmText);

	for (let i = 0;i < lncnt;i++) {
		let txtElement = document.createElement("div");
		txtLines.push(txtElement);

		let str = i.toString(16);
		str = str.padStart(ruleMaxChrs, "0");
		txtElement.textContent = str;

		asmText.appendChild(txtElement);
	}
	
	document.body.appendChild(asmViewer);

}

function clearElement(element) {
	while(element.lastChild) {
		element.removeChild(element.lastChild);
	}
}

function toHex(val, prefix) {
	let str = val.toString(16);
	if (str.length <= 2) {
		str = str.padStart(2, '0');
	} else if (str.length <= 4) {
		str = str.padStart(4, '0');
	} else if (str.length <= 6) {
		str = str.padStart(6, '0');
	} else if (str.length <= 8) {
		str = str.padStart(8, '0');
	}

	if (typeof prefix == "string")
		str = prefix + str;

	return str;
}

function renderIndirectCall(element, inst, fn, module) {
	element.appendChild(document.createTextNode('\x20'));
	let v = document.createElement("span");
	v.textContent = "tableidx=" + inst.tableidx;
	element.appendChild(v);
	element.appendChild(document.createTextNode('\x20'));
	v = document.createElement("span");
	v.classList.add("stack-signature");
	let type = module.types[inst.typeidx];
	v.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
	element.appendChild(v);
}

function renderCall(element, inst, fn, module) {
	element.appendChild(document.createTextNode('\x20'));
	let v = document.createElement("span");
	v.textContent = module.names && module.names.functions.has(inst.funcidx) ? module.names.functions.get(inst.funcidx) : inst.funcidx;
	element.appendChild(v);
	element.appendChild(document.createTextNode('\x20'));
	v = document.createElement("span");
	v.classList.add("stack-signature");
	let type = module.functions[inst.funcidx].type;
	v.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
	element.appendChild(v);
}

function renderAsmView(opcodes, fn, module) {

	console.log(fn);

	let blkstack = [];
	let indentChars = 2;
	let indent = 0;

	let argc,locals = [];
	let functype = fn.type;
	let len = functype.argc > 0 ? functype.argv.length : 0;
	for (let i = 0; i < len; i++) {
		locals.push(functype.argv[i])
	}

	argc = locals.length;

	len = fn.locals ? fn.locals.length : 0;
	for (let i = 0; i < len; i++) {
		let ylen = fn.locals[i].count;
		let type = fn.locals[i].type;
		for (let y = 0; y < ylen; y++) {
			locals.push(type);
		}
	}

	console.log(locals);

	len = Math.min(opcodes.length, lineGuters.length);
	for (let i = 0; i < len;i++) {
		let op = opcodes[i];

		let e1 = lineGuters[i];
		let e2 = binLines[i];
		let e3 = txtLines[i];

		e1.textContent = (op._loc).toString(16).padStart(4, '0');

		let txt = "";
		let instElement = document.createElement("span");
		instElement.classList.add("instr");
		txt += (op.opcode).toString(16).padStart(2, '0');
		instElement.textContent = txt;
		clearElement(e2);
		e2.appendChild(instElement);

		if (op.opcode == 0x41) {
			e2.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = toHex(op.value);
			e2.appendChild(v);
		} else if (op.opcode == 0x20 || op.opcode == 0x21 || op.opcode == 0x22) {
			e2.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = toHex(op.x);
			e2.appendChild(v);
		} else if (op.opcode == 0x23 || op.opcode == 0x24) {
            e2.appendChild(document.createTextNode('\x20'));
            let v = document.createElement("span");
            v.textContent = toHex(op.x);
            e2.appendChild(v);
        } else if (op.opcode == 0x28 || op.opcode == 0x36) {
			e2.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = toHex(op.align);
			e2.appendChild(v);
			e2.appendChild(document.createTextNode('\x20'));
			v = document.createElement("span");
			v.textContent = toHex(op.offset);
			e2.appendChild(v);
		} else if (op.opcode == 0x10) {
            e2.appendChild(document.createTextNode('\x20'));
            let v = document.createElement("span");
            v.textContent = toHex(op.funcidx);
            e2.appendChild(v);
        } else if (op.opcode == 0x11) {
            e2.appendChild(document.createTextNode('\x20'));
            let v = document.createElement("span");
            v.textContent = toHex(op.tableidx);
            e2.appendChild(v);
            e2.appendChild(document.createTextNode('\x20'));
            v = document.createElement("span");
            v.textContent = toHex(op.typeidx);
            e2.appendChild(v);
        } else if (op.opcode == 0x0c || op.opcode == 0x0d) {
            e2.appendChild(document.createTextNode('\x20'));
            let v = document.createElement("span");
            v.textContent = toHex(op.labelidx);
            e2.appendChild(v);
        } else if (op.opcode == 0x02 || op.opcode == 0x03 || op.opcode == 0x04) {
            e2.appendChild(document.createTextNode('\x20'));
            let v = document.createElement("span");
            if (typeof op.type == "number") {
                v.textContent = toHex(op.type);
            } else if (op.type instanceof FuncType) {
                v.textContent = toHex(op.type.typeidx);
            }
            e2.appendChild(v);
        }

		txt = "";
		let name;
		if (op.opcode > 255) {
			let b1 = op.opcode;
			let b2 = b1 & 0xFF;
            b1 = (b1 >> 8) & 0xFF;
			name = instname(b1, b2);
		} else {
			name = instname(op.opcode);
		}

		if (op.opcode == 0x0b) {
			blkstack.pop();
			indent--;
		}

		instElement = document.createElement("span");
		instElement.classList.add("instr");
		instElement.textContent = name;
		
		let sep = document.createElement("span");
		sep.classList.add("asm-text-prefix");
		sep.textContent = ";";
		clearElement(e3);
		e3.appendChild(sep);

		if (indent > 0) {
            if (op.opcode != 0x05) {
                let spaces = '\x20'.repeat(indent * indentChars);
                e3.appendChild(document.createTextNode(spaces));
            } else if (indent > 1) {
                // avoids inserting zero spaces for else
                let spaces = '\x20'.repeat((indent - 1) * indentChars);
                e3.appendChild(document.createTextNode(spaces));
            }
		}

		e3.appendChild(instElement);

		if (op.opcode == 0x41) {
			e3.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = "value=" + ((op.value).toString());
			e3.appendChild(v);
		} else if (op.opcode == 0x20 || op.opcode == 0x21 || op.opcode == 0x22) {
			e3.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			let idx = op.x;
			v.textContent = idx < argc ? "arg" + (idx).toString() : (op.x).toString();
			e3.appendChild(v);
			e3.appendChild(document.createTextNode('\x20'));
			v = document.createElement("span");
			v.classList.add("stack-signature");
            if (op.opcode == 0x22) {
                let tn = type_name(locals[op.x]);
                v.textContent = "[" + tn + "] → [" + tn + "]";
            } else if (op.opcode == 0x21) {
                v.textContent = "[" + type_name(locals[op.x]) + "] → []";
            } else {
                v.textContent = "[] → [" + type_name(locals[op.x]) + "]";
            }
			e3.appendChild(v);
		} else if (op.opcode == 0x23 || op.opcode == 0x24) {
			e3.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.classList.add("variable");
            if (module.globals[op.x] instanceof ImportedGlobal) {
                let glob = module.globals[op.x];
                v.textContent = glob.module + '.' + glob.name;
            } else if (module.names && module.names.globals && module.names.globals.has(op.x)) {
                v.textContent = module.names.globals.get(op.x);
            } else {
                v.textContent = ((op.x).toString());
            }
			e3.appendChild(v);
		} else if (op.opcode == 0x28 || op.opcode == 0x36) {
			e3.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = "align=" + ((op.align).toString());
			e3.appendChild(v);
			e3.appendChild(document.createTextNode('\x20'));
			v = document.createElement("span");
			v.textContent = "offset=" + ((op.offset).toString());
			e3.appendChild(v);
		} else if (op.opcode == 0x10) {
			renderCall(e3, op, fn, module);
		} else if (op.opcode == 0x11) {
            renderIndirectCall(e3, op, fn, module);
		} else if (op.opcode == 0x0c || op.opcode == 0x0d) {
			e3.appendChild(document.createTextNode('\x20'));
			let v = document.createElement("span");
			v.textContent = op.labelidx;
			e3.appendChild(v);
		} else if (op.opcode == 0x02 || op.opcode == 0x03 || op.opcode == 0x04) {
            e3.appendChild(document.createTextNode('\x20'));
            if (typeof op.type == "number") {
                let type = op.type;
                if (type !== 0x40) {
                    let ts = document.createElement("span");
                    ts.classList.add("stack-signature");
                    let typename = type_name(type);
                    ts.textContent = "[] → [" + typename + "]";
                    e3.appendChild(ts);
                }
            } else if (op.type instanceof FuncType) {
                let type = op.type;
                let ts = document.createElement("span");
                ts.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
                e3.appendChild(ts);
            }
        }

		if (op.opcode == 0x02 || op.opcode == 0x03) {
			blkstack.push(op);
			indent++;
		}
	}

	let txtbody = "";

	len = opcodes.length;
	for (let i = 0; i < len;i++) {
		let op = opcodes[i];

		let ln = (op._loc).toString(16).padStart(4, '0');
		ln = ln.padEnd(5, '\x20');

		ln += (op.opcode).toString(16).padStart(2, '0');
		ln = ln.padEnd(40, '\x20');

		if (op.opcode > 255) {
			let b1 = op.opcode;
			let b2 = b1 & 0xFF;
            b1 = (b1 >> 8) & 0xFF;
			ln += ';' + instname(b1, b2);
		} else {
			ln += ';' + instname(op.opcode);
		}

		txtbody += ln + '\n';
	}


	let pre = document.createElement("pre");
	let element = document.createElement("code");
	pre.appendChild(element);
	document.body.appendChild(pre);

	element.textContent = txtbody;
}

fetch(url).then(function(res) {

	res.arrayBuffer().then(function(buf) {

		moduleBuffer = buf;
		let mod = parseWebAssemblyBinary(buf);
        let fn = mod.functions[5589];
		//let fn = mod.functions[1463];
        //let fn = mod.functions[178];
		let opcodes = fn.opcodes;
		byteCodeComputeByteLength(mod, opcodes, true);
		renderAsmView(opcodes, fn, mod);

	}, console.error);
}, console.error);

function localTest() {
	let u8 = bufferFromHexDump(txtdata);
	buffer = u8.buffer;
	let data = new ByteArray(u8);
	let size = data.readULEB128();
	let cnt = data.readULEB128();
	let locals = [];
	for (let i = 0; i < cnt;i++) {
		let n = data.readULEB128();
		let t = data.readUint8();
		locals.push({count: n, type: t});
	}

	console.log(locals);

	// locals in the code section are referenced after the one defined as parameters of the function.

	let opcodes = decodeByteCodeForEdit(data, null);
	opcodes = opcodes.opcodes;
	console.log(opcodes);

	renderAsmView(opcodes, null, null)
}

setupAsmViewer();
//localTest();

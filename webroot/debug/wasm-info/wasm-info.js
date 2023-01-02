
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
// https://en.wikipedia.org/wiki/LEB128
// https://nielsleenheer.com/articles/2017/the-case-for-console-hex/


const sectionnames = {
    '0': "custom",
    '1': "type",
    '2': "import",
    '3': "function",
    '4': "table",
    '5': "memory",
    '6': "global",
    '7': "export",
    '8': "start",
    '9': "element",
    '10': "code",
    '11': "data",
    '12': "data count"
}

function type_name(type) {
    switch(type) {
        case 0x7F: 
            return 'i32';
        case 0x7E:
            return 'i64';
        case 0x7D:
            return 'f32';
        case 0x7C:
            return 'f64';
        case 0x00:
            return 'void';
        // wasm 2.0
        case 0x7b:
            return 'v128';
        case 0x70:
            return 'funcref';
        case 0x67:
            return 'externref';
        default:
            return undefined;
    }
}

function export_type_name(type) {
    switch(type) {
        case 0x00: 
            return 'function';
        case 0x01:
            return 'table';
        case 0x02:
            return 'memory';
        case 0x03:
            return 'global';
        default:
            return undefined;
    }
}

function dump_func_type(type, argc, argv, retc, retv) {
    let argstr = "";
    if (type == 0x60) {
        argstr += "(";
        if (typeof argv == "string") {
            argstr += argv;
        } else if (Array.isArray(argv)) {
            argstr += argv.join(', ');
        }
        argstr += ")";
    }
    let retstr = "";
    if (type == 0x60) {

        if (retc > 1) {
            retstr += "{";
        }
        if (typeof retv == "string") {
            retstr += retv;
        } else if (Array.isArray(argv)) {
            retstr += retv.join(', ');
        }
        if (retc > 1) {
            retstr += "}";
        }
    }
    console.log("type: %s %s %s", type.toString(16), argstr, retstr);
}

// from emscripten.
var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

function UTF8ArrayToString(heap, idx, maxBytesToRead) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
    // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
    // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
    while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;

    if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(heap.subarray(idx, endPtr));
    } else {
        var str = '';
        // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
        while (idx < endPtr) {
            // For UTF8 byte structure, see:
            // http://en.wikipedia.org/wiki/UTF-8#Description
            // https://www.ietf.org/rfc/rfc2279.txt
            // https://tools.ietf.org/html/rfc3629
            var u0 = heap[idx++];
            if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
            var u1 = heap[idx++] & 63;
            if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
            var u2 = heap[idx++] & 63;
            if ((u0 & 0xF0) == 0xE0) {
                u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
            } else {
                if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
                u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
            }

            if (u0 < 0x10000) {
                str += String.fromCharCode(u0);
            } else {
                var ch = u0 - 0x10000;
                str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
            }
        }
    }
    return str;
}

function inst_name(optcode) {

}

const optcode_names = {};
optcode_names[0x00] = "unreachable";
optcode_names[0x01] = "noop";
optcode_names[0x02] = "block";
optcode_names[0x03] = "if->else";
optcode_names[0x04] = "if->elif";
optcode_names[0x0C] = "br";
optcode_names[0x0D] = "br_if";
optcode_names[0x0E] = "br_label";
optcode_names[0x0F] = "return";
optcode_names[0x10] = "call";
optcode_names[0x11] = "call_indirect";
optcode_names[0xd0] = "ref.null";
optcode_names[0xd1] = "ref.is_null";
optcode_names[0xd2] = "ref.func";
optcode_names[0x1a] = "drop";
optcode_names[0x1b] = "select";
optcode_names[0x1c] = "select t*";

optcode_names[0x20] = "local.get";
optcode_names[0x21] = "local.set";
optcode_names[0x22] = "local.tee";
optcode_names[0x23] = "global.get";
optcode_names[0x24] = "global.set";

optcode_names[0x25] = "table.get";
optcode_names[0x26] = "table.set";
optcode_names[0xfc] = "<multibyte>";

optcode_names[0x28] = "i32.load";

optcode_names[0x41] = "i32.const";
optcode_names[0x42] = "i64.const";
optcode_names[0x43] = "f32.const";
optcode_names[0x44] = "f64.const";

optcode_names[0x0b] = "end";

function instname(opt1, opt2) {

    switch(opt1) {
        case 0x00: return "unreachable";
        case 0x01: return "nop"
        case 0x02: return "block";
        case 0x03: return "loop";
        case 0x04: return "if_else";
        case 0x0B: return "end"
        case 0x0C: return "br";
        case 0x0D: return "br_if";
        case 0x0E: return "br_table";
        case 0x0F: return "return";
        case 0x10: return "call";
        case 0x11: return "call_indirect";
        case 0x1A: return "drop";
        case 0x1B: return "select";
        case 0x20: return "local.get";
        case 0x21: return "local.set";
        case 0x22: return "local.tee";
        case 0x23: return "global.get";
        case 0x24: return "global.set";

        // wasm 2.0
        case 0x23: return "table.get";
        case 0x24: return "table.set";

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
        case 0x3F:
            if (opt2 == 0x00) {
                return "memory.size";
            } else {
                console.error("invalid follow up byte");
                return null;
            }
        case 0x40:
            if (opt2 == 0x00) {
                return "memory.grow";
            } else {
                console.error("invalid follow up byte");
                return null;
            }

        case 0xFE: // Atomic Memory Instructions
        {
            switch (opt2) {
                case 0x00: return "memory.atomic.notify";
                case 0x01: return "memory.atomic.wait32";
                case 0x02: return "memory.atomic.wait64";

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

// https://webassembly.github.io/spec/core/binary/instructions.html#binary-expr
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
function decodeByteCode(u8, data, off)
{

    function unsignedLEB128() {
        // consumes an unsigned LEB128 integer starting at `off`.
        // changes `off` to immediately after the integer
        let result = 0;
        let shift = 0;
        let byte = 0;
        do {
                byte = u8[off++];
                result += (byte & 0x7F) << shift;
                shift += 7;
        } while (byte & 0x80);

        return result;
    }
    
    let start = off;
    let brk = false;
    let optcodes = [];

    while(brk == false) {
        let opt_code = data.getUint8(off++);
        switch (opt_code) {
            case 0x00: // unreachable
                break;
            case 0x01: // nop
                break;
            case 0x02: // block
                break;
            case 0x03: // loop
                break;
            case 0x04: // if-else <inst> 0x0B || if-elif <inst> 0x05 <inst> 0x0B
                break;
            case 0x0C: // br
                break;
            case 0x0D: // br_if
                break;
            case 0x0E: // br_table
                break;
            case 0x0F: // return
                break;
            case 0x10: // call
                break;
            case 0x11: // call_indirect
                break;
            case 0x41: // i32.const
                optcodes.push({optcode: opt_code, value: unsignedLEB128()});
                break;
            case 0x42: // i64.const
                optcodes.push({optcode: opt_code, value: unsignedLEB128()});
                break;
            case 0x43: // f32.const
                optcodes.push({optcode: opt_code, value: data.getFloat32(off)});
                off += 4;
                break;
            case 0x44: // f64.const
                optcodes.push({optcode: opt_code, value: data.getFloat64(off)});
                off += 8;
                break;
            case 0x0b: // end
                optcodes.push({optcode: opt_code});
                brk = true;
                break;
            case 0x1A: // drop
            case 0x1B: // select
            case 0x1C: // select t*
                break;
            case 0x20: // local.get
                optcodes.push({optcode: opt_code, x: unsignedLEB128()});
                break;
            case 0x21: // local.set
                optcodes.push({optcode: opt_code, x: unsignedLEB128()});
                break;
            case 0x22: // local.tee
                optcodes.push({optcode: opt_code, x: unsignedLEB128()});
                break;
            case 0x23: // global.get
                optcodes.push({optcode: opt_code, x: unsignedLEB128()});
                break;
            case 0x24: // global.set
                optcodes.push({optcode: opt_code, x: unsignedLEB128()});
                break;
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
                let a = unsignedLEB128();
                let o = unsignedLEB128();
                break;
            }
            case 0x3f: // suffix 0x00 memory.size
            case 0x40: // suffix 0x00 memory.grow
                break
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
                break;
            case 0x6b: // i32.sub
                optcodes.push({optcode: opt_code});
                break;
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

            case 0xD0: // ref.null
            case 0xD1: // ref.is_null
            case 0xD2: // ref.func

            case 0xfc:
            {
                let sub = unsignedLEB128();
                switch (sub) {
                    case  0: // i32.trunc_sat_f32_s
                    case  1: // i32.trunc_sat_f32_u
                    case  2: // i32.trunc_sat_f64_s
                    case  3: // i32.trunc_sat_f64_u
                    case  4: // i64.trunc_sat_f32_s
                    case  5: // i64.trunc_sat_f32_u
                    case  6: // i64.trunc_sat_f64_s
                    case  7: // i64.trunc_sat_f64_u

                    case  8: // memory.init
                    case  9: // data.drop
                    case 10: // memory.copy [i32 i32 i32] -> []
                    case 11: // memory.fill [i32 i32 i32] -> []
                    //
                    case 12: // table.init
                    case 13: // elem.drop
                    case 14: // table.copy
                    case 15: // table.grow
                    case 16: // table.size [] -> [i32]
                    case 17: // table.fill 
                }
                break;
            } 

            case 0xFD: // multi-byte sequence
            {
                let sub = unsignedLEB128();
                switch (sub) {
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

            case 0xFE: // Atomic Memory Instructions
            {
                switch (opt2) {
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
                    default:
                        return null;
                }
            }
            default:
                console.error("optcode %s not supported", "0x" + opt_code.toString(16));
                brk = true;
                break;
        }   
    }

    return {start: start, end: off, optcodes: optcodes};
}

// TODO: implement a Reader/Writter class which itself increments the read/write position.`

const CHUNK_TYPE = {
    TYPE: 1,
    IMPORT: 2,
    FUNC: 3,
    TABLE: 4,
    MEMORY: 5,
    GLOBAL: 6,
    EXPORT: 7,
    START: 8,
    ELEMENT: 9,
    BYTECODE: 0x0A,
    DATA: 0x0B,
    CUSTOM: 0x00
};

class ByteArray {

    constructor(buffer) {
        this._data = null;
        this._u8 = null;
        this._offset = 0;
        this._littleEndian = true;
    }

    get offset() {
        return this._offset;
    }

    get endian() {

    }

    // reading

    readBigInt64() {
        let off = this._offset;
        let ret = this._data.getBigInt64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    readBigUint64() {
        let off = this._offset;
        let ret = this._data.getBigUint64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    readFloat32() {
        let off = this._offset;
        let ret = this._data.getFloat32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    readFloat64() {
        let off = this._offset;
        let ret = this._data.getFloat64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    readInt16() {
        let off = this._offset;
        let ret = this._data.getInt16(off, this._littleEndian);
        this._offset = off + 2;
        return ret;
    }

    readInt32() {
        let off = this._offset;
        let ret = this._data.getInt32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    readInt8() {
        return this._data.getInt8(this._offset++, this._littleEndian);
    }

    readUint16() {
        let off = this._offset;
        let ret = this._data.getUint16(off, this._littleEndian);
        this._offset = off + 2;
        return ret;
    }

    readUint32() {
        let off = this._offset;
        let ret = this._data.getUint32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    readUint8() {
        return this._data.getUint8(this._offset++, value);
    }

    readULEB128() {
        // consumes an unsigned LEB128 integer starting at `off`.
        // changes `off` to immediately after the integer
        let u8 = this._u8;
        let off = this._offset;
        let result = 0;
        let shift = 0;
        let byte = 0;
        do {
                byte = u8[off++];
                result += (byte & 0x7F) << shift;
                shift += 7;
        } while (byte & 0x80);

        this._offset = off;

        return result;
    }

    // reads a signed LEB128 (little-endian-base128) integer
    readSLEB128() {
        let u8 = this._u8;
        let off = this._offset;
        let len = u8.byteLength;
        let result = 0;
        let shift = 0;
        while (off < len) {
            const byte = u8[off++];
            result |= (byte & 0x7f) << shift;
            shift += 7;
            if ((0x80 & byte) === 0) {
                this._offset = off;
                if (shift < 32 && (byte & 0x40) !== 0) {
                    return result | (~0 << shift);
                }
                return result;
            }
        }

        throw RangeError("encoding of LEB128 did not end correct");
    }

    // writting

    writeBigInt64(value) {
        let off = this._offset;
        this._data.setBigInt64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    writeBigUint64(value) {
        let off = this._offset;
        this._data.setBigUint64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    writeFloat32(value) {
        let off = this._offset;
        this._data.setFloat32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    writeFloat64(value) {
        let off = this._offset;
        this._data.setFloat64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    writeInt16(value) {
        let off = this._offset;
        this._data.setInt16(off, value, this._littleEndian);
        this._offset = off + 2;
    }

    writeInt32(value) {
        let off = this._offset;
        this._data.setInt32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    writeInt8(value) {
        this._data.setInt8(this._offset++, value);
    }

    writeUint16(value) {
        let off = this._offset;
        this._data.setUint16(off, value, this._littleEndian);
        this._offset = off + 2;
    }

    writeUint32(value) {
        let off = this._offset;
        this._data.setUint32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    writeUint8(value) {
        this._data.setUint8(this._offset++, value);
    }

    writeULEB128(value) {
        let u8 = this._u8;
        let off = this._offset;
        let len = u8.byteLength;
        do {
            let byte = value & 0x7f;
            value >>= 7;
            if (value != 0) {
                u8[off++] = (byte | 0x80);
            } else {
                u8[off++] = byte;
                this._offset = off;
                return;
            }

        } while (value != 0);

        throw RangeError("arraybuffer to small");
    }

    writeSLEB128(value) {
        let u8 = this._u8;
        let off = this._offset;
        let len = u8.byteLength;
        value |= 0;
        while (off < len) {
            const byte_ = value & 0x7f;
            value >>= 7;
            if ((value === 0 && (byte_ & 0x40) === 0) || (value === -1 && (byte_ & 0x40) !== 0)) {
                u8[off++] = byte_;
                this._offset = off;
                return;
            }
            u8[off++] = (byte_ | 0x80);
        }

        throw RangeError("arraybuffer to small");
    }

};

// https://webassembly.github.io/spec/core/binary/modules.html#binary-version
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
function parseWebAssemblyBinary(buf) {
    let u8 = new Uint8Array(buf);
    let data = new DataView(buf);
    let magic = data.getUint32(0, true);
    let version = data.getUint32(4, true);
    if (data.getUint8(0) != 0x00 || data.getUint8(1) != 0x61 || data.getUint8(2) != 0x73 || data.getUint8(3) != 0x6D) {
        console.error("magic is not equal to '\\0asm'");
        return false;
    }

    console.log("magic: %s version: %d", magic.toString(16), version);

    let off = 8;
    let len = data.byteLength;

    function unsignedLEB128() {
        // consumes an unsigned LEB128 integer starting at `off`.
        // changes `off` to immediately after the integer
        let result = 0;
        let shift = 0;
        let byte = 0;
        do {
                byte = u8[off++];
                result += (byte & 0x7F) << shift;
                shift += 7;
        } while (byte & 0x80);

        return result;
    }

    function decodeTypeSection(section, len) {
        let end = off + len;
        let cnt = data.getUint8(off++);
        while (off < end) {
            let type = data.getUint8(off++);
            let argc = data.getUint8(off++);
            let argv = argc > 0 ? [] : 'void';;
            for(let i = 0;i < argc;i++) {
                let arg = data.getUint8(off++);
                argv.push(type_name(arg));
            }
            if (argc == 1) {
                argv = argv[0];
            }
            let retc = data.getUint8(off++);
            let retv = retc > 0 ? [] : 'void';
            for(let i = 0;i < retc;i++) {
                let ret = data.getUint8(off++);
                retv.push(type_name(ret));
            }
            if (retc == 1) {
                retv = retv[0];
            }

            if (type == 0x60) {
                dump_func_type(type, argc, argv, retc, retv);
            } else {
                console.log("type: %s argv: %o retv: %o", type.toString(16), argv, retv);
            }
            
            // // 0x7F: i32, 0x7E: i64, 0x7D: f32, 0x7C: f64
        }
    }

    function decodeImportSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let mlen = unsignedLEB128();
            let mod = UTF8ArrayToString(u8, off, mlen);
            off += mlen;
            let nlen = unsignedLEB128();
            let name = UTF8ArrayToString(u8, off, nlen);
            off += nlen;
            let type = data.getUint8(off++);
            let obj = {};
            obj.mod = mod;
            obj.name = name;
            obj.type = export_type_name(type);
            if (type == 0x00) {
                obj.typeidx = unsignedLEB128();
            } else if (type == 0x01) {
                obj.reftype = data.getUint8(off++);
                let limit = data.getUint8(off++);
                let min = null;
                let max = null;
                if (limit == 0x01) {
                    obj.min = unsignedLEB128();
                    obj.max = unsignedLEB128();
                } else if (limit == 0x00) {
                    obj.min = unsignedLEB128();
                }
            } else if (type == 0x02) {
                let limit = data.getUint8(off++);
                let min = null;
                let max = null;
                if (limit == 0x01) {
                    obj.min = unsignedLEB128();
                    obj.max = unsignedLEB128();
                    obj.shared = false;
                } else if (limit == 0x00) {
                    obj.min = unsignedLEB128();
                    obj.shared = false;
                } else if (limit == 0x02) {
                    obj.min = unsignedLEB128();
                    obj.shared = true;
                } else if (limit == 0x03) {     // can't find this anywhere in spec, but wat2wasm seams indicate shared memory by using limit of type 3
                    obj.min = unsignedLEB128();
                    obj.max = unsignedLEB128();
                    obj.shared = true;              
                }
            } else if (type == 0x03) {
                let t = unsignedLEB128();
                obj.globaltype = type_name(t);
                obj.mutable = data.getUint8(off++);
            } else {
                console.error("found memory limit of type %d", type);
            }
            results.push(obj);
        }
        console.log("import vector count: %d", cnt);
        console.log(results);
        // TODO: map every existing module-name
    }

    
    function decodeFuncSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let typeidx = unsignedLEB128();
            results.push(typeidx);
        }
        console.log("function vector count: %d", cnt);
        console.log(results);
    }

    function decodeTableSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        //while (off < end) {
            //let typeidx = unsignedLEB128();
            //results.push(typeidx);
        //}
        console.log("table vector count: %d", cnt);
        console.log(undefined);
    }

    function decodeMemorySection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let type = data.getUint8(off++);
            let min = null;
            let max = null;
            if (type == 0x01) {
                min = unsignedLEB128();
                max = unsignedLEB128();
            } else if (type == 0x00) {
                min = unsignedLEB128();
            }
            results.push({
                min: min,
                max: max
            });
        }
        console.log("memory vector count: %d", cnt);
        console.log(results);
    }

    function decodeGlobalSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let type = data.getUint8(off++);
            let mut = data.getUint8(off++);
            let optcode = decodeByteCode(u8, data, off);
            results.push({
                type: type_name(type),
                mutable: (mut === 1),
                expr: optcode.optcodes,
            });
            off = optcode.end;
        }
        console.log("global vector count: %d", cnt);
        console.log(results);
    }

    function decodeExportSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let nlen = unsignedLEB128();
            let name = UTF8ArrayToString(u8, off, nlen);
            off += nlen;
            let type = data.getUint8(off++);
            let idx = unsignedLEB128();
            results.push({
                name: name,
                type: export_type_name(type),
                index: idx,
            });
        }
        console.log("export vector count: %d", cnt);
        console.log(results);
    }

    function decodeStartSection(section, len) {
        let funcidx = unsignedLEB128();
        console.log("start section entry-fn-idx: %d", funcidx);
    }

    function decodeElementSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        console.log("element section vector count: %d", cnt);
    }

    function decodeCodeSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let bytesz = unsignedLEB128();
            let tmp = off;
            let lcnt = unsignedLEB128();
            let locals = lcnt > 0 ? [] : null;
            for(let i = 0;i < lcnt;i++) {
                let n = unsignedLEB128();
                let t = data.getUint8(off++);
                locals.push({count: n, type: type_name(t)});
            }
            let optcode_start = off;
            let optcode_end = tmp + bytesz;
            if (results.length == 14) {
                decodeByteCode(u8, data, optcode_start, optcode_end);
            }
            results.push({
                locals: locals,
                optcode_start: optcode_start,
                optcode_end: optcode_end,
            });
            off = optcode_end;
        }
        console.log("code vector count: %d", cnt);
        console.log(results);
    }

    function decodeDataSection(section, len) {
        let end = off + len;
        let cnt = unsignedLEB128();
        let results = [];
        while (off < end) {
            let kind = unsignedLEB128();
            if (kind == 0x00) {
                let inst = decodeByteCode(u8, data, off);
                let data_start = inst.end;
                off = inst.end;
                let datasz = unsignedLEB128();
                results.push({
                    memidx: 0,
                    inst: inst,
                    offset: data_start,
                    size: datasz,
                });
                off += datasz;
            } else if (kind == 0x01) {
                console.warn("data segment of type `init b*, mode passive` is not implemented");
                break;
            } else if (kind == 0x02) {
                console.warn("data segment of type `init b*, mode active {memory, offset }` is not implemented");
                let memidx = unsignedLEB128();
                break;
            } else {
                console.warn("undefined data-segment mode!");
                break;
            }
        }
        console.log("data vector count: %d", cnt);
        console.log(results);
    }

    function decodeCustomSection(section, len) {
        let end = off + len;
        let results = [];
        let nlen = data.getUint8(off++);
        let name = UTF8ArrayToString(u8, off, nlen);
        let start = off + nlen;
        //let datasz = unsignedLEB128();
        results.push({
            name: name,
            start: start,
            end : end,
        });
        console.log("custom section name: %s", name);
        section.name = name;
        console.log(results);

        if (name == "producers") {
            off += nlen;
            let info = decodeCustomProducers(start, end);
        } else if (name == "name") {
            off += nlen;
            let info = decodeCustomName(start, end);
        }

        // .debug_info
        // .debug_loc
        // .debug_ranges
        // .debug_abbrev
        // .debug_line
        // .debug_str
        // 
        // are actually embedded DWARF debugging information.
        // 
        // https://github.com/WebAssembly/tool-conventions/blob/main/Debugging.md
    }

    // known custom sections.
    
    // https://github.com/WebAssembly/tool-conventions/blob/main/ProducersSection.md
    function decodeCustomProducers(start, end) {
        let count = unsignedLEB128();
        console.log("count: %d", count);
        let dict = {};
        for (let i = 0; i < len; i++) {
            let nlen = unsignedLEB128();
            let key = UTF8ArrayToString(u8, off, nlen);
            off += nlen;

            let vcnt = unsignedLEB128();
            if (vcnt == 1) {
                let vlen = unsignedLEB128();
                let val = UTF8ArrayToString(u8, off, vlen);
                off += vlen;
                vlen = unsignedLEB128(); // version string.
                if (vlen > 0) {
                    let verv = UTF8ArrayToString(u8, off, vlen);
                    dict[key] = {value: val, version: verv};
                    off += vlen;
                } else {
                    dict[key] = val;
                }
                
            } else if (vcnt > 0) {
                let values = [];
                for (let x = 0; x < vcnt; x++) {
                    let vlen = unsignedLEB128();
                    let val = UTF8ArrayToString(u8, off, vlen);
                    off += vlen;
                    vlen = unsignedLEB128(); // version string.
                    if (vlen > 0) {
                        let verv = UTF8ArrayToString(u8, off, vlen);
                        values.push({value: val, version: verv});
                        off += vlen;
                    } else {
                        values.push(val);
                    }
                }
                dict[key] = values;
            }
        }

        console.log(dict);
        return dict;
    }

    function decode_name_map(start, end) {

        let cnt = unsignedLEB128();
        let map = new Map();
        while (off < end) {
            let idx = unsignedLEB128();
            let nlen = unsignedLEB128();
            let name = UTF8ArrayToString(u8, off, nlen);
            off += nlen;
            map.set(idx, name);
        }

        return map;
    }

    // https://webassembly.github.io/spec/core/appendix/custom.html
    // https://github.com/WebAssembly/extended-name-section/blob/main/document/core/appendix/custom.rst
    function decodeCustomName(start, end) {

        while (off < end) {

            let id = data.getUint8(off++);
            let sz = unsignedLEB128();
            let substart = off;
            if (id == 0x01) {

                console.log("id %d size: %d", id, sz);
                let map = decode_name_map(off, substart + sz);
                console.log(map);

            } else if (id == 0x00) {
                console.log("id %d size: %d", id, sz);
                off = substart + sz;
            } else if (id == 0x02) {
                console.log("id %d size: %d", id, sz);
                off = substart + sz;
            } else if (id == 0x07) {

                console.log("id %d size: %d", id, sz);
                let map = decode_name_map(off, substart + sz);
                console.log(map);
                off = substart + sz;

            } else if (id == 0x09) {

                console.log("id %d size: %d", id, sz);
                let map = decode_name_map(off, substart + sz);
                console.log(map);
                off = substart + sz;
            } else {
                console.warn("id %d size: %d", id, sz);
                off = substart + sz;
            }
        }
    }

    let results = [];
    let chunks = [];



    while (off < len) {
        let start = off;
        let type = data.getUint8(off++);
        let tmp = off;
        let size = unsignedLEB128();
        tmp = off - tmp;
        console.log("type: %d (%s) size: %d offset: %d data-offset: %d", type, sectionnames[type], size, start, off);
        let chunk = {type: type, name: sectionnames[type], size: size, offset: start, dataOffset: off};
        results.push(sec);
        switch (type) {
            case 0x01:
            case 0x02:
            case 0x03:
            case 0x04:
            case 0x05:
            case 0x06:
            case 0x07:
            case 0x08:
            case 0x09:
            case 0x0A:
            case 0x0B:
                break;
            case 0x00: // CUSTOM
            {
                let nlen = data.getUint8(off++);
                let name = UTF8ArrayToString(u8, off, nlen);
                let start = off + nlen;
                break;
            }
            default:
                console.warn("section type: %d (%s) not handled", type, sectionnames[type]);
        }
        off += size;
    }

    while (off < len) {
        let start = off;
        let type = data.getUint8(off++);
        let tmp = off;
        let size = unsignedLEB128();
        tmp = off - tmp;
        console.log("type: %d (%s) size: %d offset: %d data-offset: %d", type, sectionnames[type], size, start, off);
        let sec = {type: type, name: sectionnames[type], size: size, offset: start, dataOffset: off};
        results.push(sec);
        if (type == CHUNK_TYPE.TYPE) {
            let tmp = off;
            decodeTypeSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.IMPORT) {
            let tmp = off;
            decodeImportSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.FUNC) {
            let tmp = off;
            decodeFuncSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.TABLE) {
            let tmp = off;
            decodeTableSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.MEMORY) {
            let tmp = off;
            decodeMemorySection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.GLOBAL) {
            let tmp = off;
            decodeGlobalSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.EXPORT) {
            let tmp = off;
            decodeExportSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.START) {
            let tmp = off;
            decodeStartSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.ELEMENT) {
            let tmp = off;
            decodeElementSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.BYTECODE) {
            let tmp = off;
            decodeCodeSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.DATA) {
            let tmp = off;
            decodeDataSection(sec, size);
            off = tmp;
        } else if (type == CHUNK_TYPE.CUSTOM) {
            let tmp = off;
            decodeCustomSection(sec, size);
            off = tmp;
        } else {
            console.warn("section type: %d (%s) not handled", type, sectionnames[type]);
        }
        off += size;
    }

    return results;
}
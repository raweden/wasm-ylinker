
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
// https://en.wikipedia.org/wiki/LEB128
// https://nielsleenheer.com/articles/2017/the-case-for-console-hex/
// https://webassembly.github.io/spec/core/appendix/custom.html#binary-indirectnamemap
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
// https://github.com/WebAssembly/tool-conventions/issues/59

// nexts steps:
// 1. manipulate globals; requires globals to be objectified rather than index referenced in instructions etc.
// 2. refactor into class based approach sectionclass.decode/encode etc each with section based logics such as insert/remove objects.

const __nsym = Symbol("@custom-name");
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
};

const SECTION_TYPE_FUNCTYPE = 1;
const SECTION_TYPE_IMPORT = 2;
const SECTION_TYPE_FUNC = 3;
const SECTION_TYPE_TABLE = 4;
const SECTION_TYPE_MEMORY = 5;
const SECTION_TYPE_GLOBAL = 6;
const SECTION_TYPE_EXPORT = 7;
const SECTION_TYPE_START = 8;
const SECTION_TYPE_ELEMENT = 9;
const SECTION_TYPE_CODE = 0x0A;
const SECTION_TYPE_DATA = 0x0B;
const SECTION_TYPE_DATA_COUNT = 0x0C;
const SECTION_TYPE_TAG = 0x0D;
const SECTION_TYPE_CUSTOM = 0x00;

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

function u8_memcpy(src, sidx, slen, dst, didx) {
    // TODO: remove this assert at later time. (should be a debug)
    if (!(src instanceof Uint8Array) && (dst instanceof Uint8Array)) {
        throw TypeError("src and dst Must be Uint8Array");
    }
    //console.log(src, dst);
    let idx = sidx;
    let end = idx + slen;
    /*if (slen > 512) {
        let subarr = src.subarray(idx, end);
        dst.set(subarr, didx);
        return;
    }*/

    while(idx < end) {
        dst[didx++] = src[idx++];
    }
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

// Base Classes

class WebAssemblySection {

    constructor(type, module) {
        this.type = type;
        this.module = module;
        this._cache = undefined;
    }

    decode(data) {
        throw new Error("subclasses of this class must override this method");
    }

    encode(data) {
        throw new Error("subclasses of this class must override this method");
    }

    markDirty() {
        this._isDirty = true;
    }

    get isDirty() {
        return this._isDirty;
    }
}

class WebAssemblyCustomSection extends WebAssemblySection {

    constructor(module, name) {
        super(SECTION_TYPE_CUSTOM, module);
        this.name = name;
    }
}


function inst_name(opcode) {

}


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

class InstList {

    constructor(opcode) {
        this.opcodes = [];
    }
};

class Inst {

    constructor(opcode) {
        this.opcode = opcode;
    }
};

class UnreachableInst extends Inst {

    constructor() {
        super(0x00);
    }
}

class NopInst extends Inst {

    constructor() {
        super(0x01);
    }
}

class EndInst extends Inst {

    constructor() {
        super(0x0b);
    }
}

class BlockInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class LoopInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class IfInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class ReturnInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class LoadInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class StoreInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class CallInst extends Inst {

    constructor(opcode, func) {
        super(opcode);
        this.func = func;
    }
}

class LocalInst extends Inst {

    constructor(opcode, local) {
        super(opcode);
        this.local = local;
    }
}

class GlobalInst extends Inst {

    constructor(opcode, glob) {
        super(opcode);
        this.global = glob;
    }
}

class AtomicInst extends Inst {

    constructor(opcode, align, offset) {
        super(opcode);
        this.offset = offset;
        this.align = align;
    }
}

class BranchInst extends Inst {

    constructor(opcode, labelidx) {
        super(opcode);
        this.labelidx = labelidx;
    }
}

class BranchIfInst extends Inst {

    constructor(opcode, labelidx) {
        super(opcode);
        this.labelidx = labelidx;
    }
}

class BranchTableInst extends Inst {

    constructor(opcode, labels) {
        super(opcode);
        this.labels = labels;
    }
}

class IndirectCallInst extends Inst {

    constructor(opcode, table, type) {
        super(opcode);
        this.table = table;
        this.type = type;
    }
}

class LocalGetInst extends Inst {

    constructor(opcode, localidx) {
        super(opcode);
        this.localidx = localidx;
    }
}

class LocalSetInst extends Inst {

    constructor(opcode, localidx) {
        super(opcode);
        this.localidx = localidx;
    }
}

class GlobalGetInst extends Inst {

    constructor(opcode, globalidx) {
        super(opcode);
        this.globalidx = globalidx;
    }
}

class GlobalSetInst extends Inst {

    constructor(opcode, globalidx) {
        super(opcode);
        this.globalidx = globalidx;
    }
}

class TableGetInst extends Inst {

    constructor(opcode, tableidx) {
        super(opcode);
        this.tableidx = tableidx;
    }
}

class TableSetInst extends Inst {

    constructor(opcode, tableidx) {
        super(opcode);
        this.tableidx = tableidx;
    }
}

class TryInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class CatchInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class CatchAllInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class DelegateInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class ThrowInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

class ReThrowInst extends Inst {

    constructor(opcode) {
        super(opcode);
    }
}

/**
 * walks the bytecode backwards to find the instruction which is the nearest instruction that would end up at position.
 * For example finding the memory address for a i32.store, it takes into account that stack might have been used in instruction
 * or a tree of instruction prior. This by counting push & pull to the stack from instructions.
 * 
 * @param  {WasmFunction} fn       The WebAssembly function scope.
 * @param  {Array}   instructions [description]
 * @param  {integer}   fromIndex    The index to start from, should be the index directly prior to the instruction which consumes the values.
 * @param  {integer}   relative     The signatures are in reverse, so for example src in memory.copy would be at position 2.
 * @return {Instruction}                [description]
 */
function traverseStack(fn, instructions, fromIndex, relative) {
    let count = -1;
    for (let i = fromIndex; i >= 0; i--) {
        let inst = instructions[i];
        let opcls = opclsmap.get(inst.opcode);
        let pullv, pushv;
        if (typeof opcls.push == "function") {
            pushv = opcls.push(fn, inst);
        } else {
            pushv = opcls.push;
        }

        if (pushv == WA_TYPE_I32 || pushv == WA_TYPE_I64 || pushv == WA_TYPE_F32 || pushv == WA_TYPE_F64 || pushv == WA_TYPE_V128  || pushv == WA_TYPE_NUMRIC  || pushv == WA_TYPE_ANY) {
            count++;
        }

        if (Array.isArray(pushv)) {
            debugger;
        }

        if (count == relative) {
            return inst;
        }

        if (typeof opcls.pull == "function") {
            pullv = opcls.pull(fn, inst);
        } else {
            pullv = opcls.pull;
        }

        if (Array.isArray(pullv)) {
            count -= pullv.length;
        } else if (pullv && pullv != WA_TYPE_VOID) {
            count--;
        }
    }

    return undefined;
}

function InstTraversal(opcodes) {

    let atEnd = false;
    let lidx = 0;
    let pseudo = null;
    let scope = opcodes;
    let scopes = [{scope: opcodes, index: undefined}];

    return function next() {

        if (pseudo !== null) {
            let tmp = pseudo;
            pseudo = null;
            return tmp;
        } else if (atEnd) {
            return null;
        }

        let inst = scope[lidx++];
        if ((inst.opcode == 0x02 || inst.opcode == 0x03 || inst.opcode == 0x04 || inst.opcode == 0x05) && inst.opcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.opcodes, inst: inst, index: undefined});
            scope = inst.opcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

            if (scope.inst.opcode == 0x04 && blkst.else) {
                let last = scopes[scopes.length - 1];
                last.scope = blkst.else.opcodes;
                last.inst = blkst.else;
                last.index = undefined;
                scope = last.scope;
                lidx = 0;
                pseudo = {opcode: 0x05};
            } else {
                while (scopes.length > 0) {
                    let tmp = scopes[scopes.length - 1];
                    if (tmp.index === undefined) {
                        console.error("scopes[i].index should not be undefined");
                        throw new Error("index is undefined");
                    }
                    if (tmp.index == tmp.scope.length) {
                        scopes.pop();
                    } else {
                        scope = tmp.scope;
                        lidx = tmp.index;
                        break;
                    }
                }

                if (scopes.length == 0)
                    atEnd = true;
            }
        }

        return inst;
    }
}

function InstToArray(opcodes) {

    let lidx = 0;
    let scope = opcodes;
    let scopes = [{opcodes: scope, inst: undefined, index: undefined}];
    let results = [];

    while (lidx < scope.length) {

        let inst = scope[lidx++];

        if ((inst.opcode == 0x02 || inst.opcode == 0x03 || inst.opcode == 0x04 || inst.opcode == 0x05) && inst.opcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.opcodes, inst: inst, index: undefined});
            scope = inst.opcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

        }

        return inst;
    }
}

function isValidValueType(type) {
    return type == 0x7F || type == 0x7E || type == 0x7D || type == 0x7C || type == 0x7B  || type == 0x70 || type == 0x6F;
}

function byteCodeComputeByteLength(mod, opcodes, locals, genloc) {
    genloc = genloc === true;
    let sz = 0;


    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;

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
                sz += lengthSLEB128(inst.value);
                break;
            case 0x42: // i64.const
                sz += 1;
                sz += lengthSLEB128(inst.value);
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
                sz += lengthULEB128(inst.offset);
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
                        let dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        sz += 1;
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
                        sz += 3; // b1 + 2 8-byte reserved (from/to memidx)
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
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(tblidx);
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
                        if (tblidx === -1)
                            throw new ReferenceError("tableidx not found");
                        tblidx2 = tables.indexOf(inst.table2);
                        if (tblidx === -1)
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
                        sz += lengthULEB128(inst.offset);
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

class WebAssemblyInstructionSet {

}

// https://webassembly.github.io/spec/core/binary/instructions.html#binary-expr
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
function decodeByteCode(data, mod, locals) {
    
    let start = data.offset;
    let brk = false;
    let topInsts = [];
    let opcodes = topInsts;
    let blkstack = [{opcodes: topInsts}]; // holds the nesting for block, loop and if/else
    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;
    let locend = locals ? locals.length - 1 : 0;

    while(brk == false) {
        let op_code = data.readUint8();
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
                opcodes.push(new CallInst(op_code, functions[funcidx]));
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
                        let dataSegment, dataidx = data.readULEB128();
                        if (dataidx < 0 || dataidx >= mod.dataSegments.length)
                            throw new RangeError("dataidx out of range");
                        dataSegment = mod.dataSegments[dataidx];
                        opcodes.push({opcode: (op_code << 8) | sub, dataSegment: dataSegment});
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
                        if (idx < 0 || idx >= tables.length)
                            throw new RangeError("tableidx out of range");
                        tbl = tables[idx];
                        idx = data.readULEB128();
                        if (idx < 0 || idx >= mod.elementSegments.length)
                            throw new RangeError("elemidx out of range");
                        elem = mod.elementSegments[idx];

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
                        throw new TypeError("opcode " + ("0x" + b1.toString(16) + b2.toString(16)) + " not supported");
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
                        let o = data.readULEB128();
                        opcodes.push({opcode: (op_code << 8) | sub, offset: o, align: a});
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
    }

    return {start: start, end: data.offset, opcodes: topInsts};
}

function encodeByteCode(mod, opcodes, locals, data) {

    let functions = mod.functions;
    let globals = mod.globals;
    let tables = mod.tables;
    let types = mod.types;
    
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
                data.writeSLEB128(inst.value);
                break;
            case 0x42: // i64.const
                data.writeUint8(b1);
                data.writeSLEB128(inst.value);
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
                data.writeULEB128(inst.offset);
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
                        let dataidx = mod.dataSegments.indexOf(inst.dataSegment);
                        if (dataidx === -1)
                            throw new ReferenceError("dataidx not found");
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(dataidx);
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
                        data.writeULEB128(tblidx);
                        data.writeULEB128(elemidx);
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
                        data.writeULEB128(inst.offset);
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

// TODO: implement a Reader/Writter class which itself increments the read/write position.`

// LEB128 is based on psudeo code from the wikipedia page as well as other sources
// https://en.wikipedia.org/wiki/LEB128
// https://gitlab.com/mjbecze/leb128/-/blob/master/unsigned.js
class ByteArray {

    constructor(buffer) {
        this._data = null;
        this._u8 = null;

        // TODO: should support DataView subrange trough .byteOffset
        if (buffer instanceof DataView) {
            this._data = buffer;
            this._u8 = new Uint8Array(buffer.buffer);
        } else if (buffer instanceof Uint8Array) {
            this._data = new DataView(buffer.buffer);
            this._u8 = buffer;
        } else if (ArrayBuffer.isView(buffer)) {
            this._data = new DataView(buffer.buffer);
            this._u8 = new Uint8Array(buffer.buffer);
        } else if (buffer instanceof ArrayBuffer) {
            this._data = new DataView(buffer);
            this._u8 = new Uint8Array(buffer);
        } else if (!(buffer instanceof ByteArray)) {
            throw TypeError("buffer is of unsupported type");
        }
        this._offset = 0;
        this._littleEndian = true;
        if (buffer instanceof ByteArray) {
            this._data = buffer._data;
            this._u8 = buffer._u8;
            this._offset = buffer._offset;
            this._littleEndian = buffer._littleEndian;
        }
    }

    get offset() {
        return this._offset;
    }

    set offset(value) {
        let len = this._u8.byteLength;
        if (value < 0 || value > len) {
            throw new RangeError("index out of range");
        }

        this._offset = value;
    }

    get endian() {

    }

    get length() {
        return this._u8.byteLength;
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
        return this._data.getInt8(this._offset++);
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
        return this._data.getUint8(this._offset++);
    }

    readULEB128(as64) {
        // consumes an unsigned LEB128 integer starting at `off`.
        // changes `off` to immediately after the integer
        as64 = (as64 === true);
        let u8 = this._u8;
        let off = this._offset;
        let result = BigInt(0);
        let shift = BigInt(0);
        let byte = 0;
        do {
            byte = u8[off++];
            result += BigInt(byte & 0x7F) << shift;
            shift += 7n;
        } while (byte & 0x80);

        if (!as64 && result < 4294967295n)
            result = Number(result);

        this._offset = off;

        return result;
    }


    /**
     * Utility function to decode a SLEB128 value.
     *
     * @param {Number}          asIntN
     * @return {BigInt|Number}
     */
    readSLEB128(asIntN) {

        if (asIntN == 64 || asIntN === undefined) {

            const UINT64_MAX = 18446744073709551615n;
            let err, off = this._offset;
            const orig_p = off;
            const buf = this._u8;
            const end = buf.byteLength;
            let value = BigInt(0);
            let shift = 0;
            let byte;

            do {
                if (off == end) {
                    err = new RangeError("malformed sleb128, extends past end");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                byte = buf[off];
                let slice = byte & 0x7f;
                if ((shift >= 64 && slice != (value < 0n ? 0x7f : 0x00)) || (shift == 63 && slice != 0 && slice != 0x7f)) {
                    err = new RangeError("sleb128 too big for int64");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                value |= BigInt(slice) << BigInt(shift);
                shift += 7;
                ++off;
            } while (byte >= 128);
            
            // Sign extend negative numbers if needed.
            if (shift < 64 && (byte & 0x40))
                value |= UINT64_MAX << BigInt(shift);
            
            this._offset = off;
            
            return BigInt.asIntN(64, value);

        } else if (asIntN == 32) {

            let err, off = this._offset;
            const orig_p = off;
            const buf = this._u8;
            const end = buf.byteLength;
            let value = 0;
            let shift = 0;
            let byte;

            do {
                if (off == end) {
                    err = new RangeError("malformed sleb128, extends past end");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                byte = buf[off];
                let slice = byte & 0x7f;
                if ((shift >= 32 && slice != (value < 0 ? 0x7f : 0x00)) || (shift == 31 && slice != 0 && slice != 0x7f)) {
                    err = new RangeError("sleb128 too big for int32");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                value |= slice << shift;
                shift += 7;
                ++off;
            } while (byte >= 128);
            
            // Sign extend negative numbers if needed.
            if (shift < 32 && (byte & 0x40))
                value |= 0xFFFFFFFF << shift;
            
            this._offset = off;
            
            return value;
        }
    }

    readUTF8Bytes(length) {
        let u8 = this._u8;
        let off = this._offset;
        let end = off + length;
        let str = '';

        if (length > 16 && u8.subarray && UTF8Decoder) {
            str = UTF8Decoder.decode(u8.subarray(off, end));
            this._offset = end;
            return str;
        } else {
            // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
            while (off < end) {
                // For UTF8 byte structure, see:
                // http://en.wikipedia.org/wiki/UTF-8#Description
                // https://www.ietf.org/rfc/rfc2279.txt
                // https://tools.ietf.org/html/rfc3629
                let u0 = u8[off++];
                if (!(u0 & 0x80)) {
                    str += String.fromCharCode(u0);
                    continue;
                }
                let u1 = u8[off++] & 63;
                if ((u0 & 0xE0) == 0xC0) {
                    str += String.fromCharCode(((u0 & 31) << 6) | u1);
                    continue;
                }
                let u2 = u8[off++] & 63;
                if ((u0 & 0xF0) == 0xE0) {
                    u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
                } else {
                    if ((u0 & 0xF8) != 0xF0)
                        console.warn('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
                    u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8[off++] & 63);
                }

                if (u0 < 0x10000) {
                    str += String.fromCharCode(u0);
                } else {
                    let ch = u0 - 0x10000;
                    str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
                }
            }
        }

        this._offset = off;
        
        return str;
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

    /**
     * Utility function to encode a ULEB128 value to a buffer. Returns the length in bytes of the encoded value.
     * 
     * @param  {BigInt|Number} value         [description]
     * @param  {Number} padTo         [description]
     * @return {Number}          [description]
     */
    writeULEB128(value, padTo) {
        if (!Number.isInteger(padTo))
            padTo = 0;
        
        if (typeof value == "bigint") {
            const mask = BigInt(0x7f);
            let u8 = this._u8;
            let off = this._offset;
            let orig_p = off;
            let len = u8.byteLength;
            let cnt = 0;
            do {
                let byte = Number(value & mask);
                value >>= 7n;
                if (value < 0n) // protecting against overflow (causing negative value)
                    value = 0n;
                cnt++;
                if (value != 0 || cnt < padTo) {
                    byte = (byte | 0x80);
                }
                u8[off++] = byte;
            } while (value != 0n);

            // pad with 0x80 and emit a nyll byte at the end.
            if (cnt < padTo) {
                let end = padTo - 1;
                for (;cnt < end;++cnt)
                    u8[off++] = 0x80;
                u8[off++] = 0x00;
            }

            this._offset = off;

            return (off - orig_p);
        }

        let u8 = this._u8;
        let off = this._offset;
        let orig_p = off;
        let len = u8.byteLength;
        let cnt = 0;
        do {
            let byte = value & 0x7f;
            value >>= 7;
            if (value < 0)
                value = 0;
            cnt++;
            if (value != 0 || cnt < padTo) {
                byte = (byte | 0x80);
            }
            u8[off++] = byte;

        } while (value != 0);

        // pad with 0x80 and emit a nyll byte at the end.
        if (cnt < padTo) {
            let end = padTo - 1;
            for (;cnt < end;++cnt)
                u8[off++] = 0x80;
            u8[off++] = 0x00;
        }

        this._offset = off;

        return (off - orig_p);
    }


    /**
     * Utility function to encode a SLEB128 value to a buffer. Returns the length in bytes of the encoded value.
     * @param  {BigInt|Number}  value         [description]
     * @param  {Number}         padTo         [description]
     * @return {[type]}          [description]
     */
    writeSLEB128(value, padTo) {
        
        if (!Number.isInteger(padTo))
            padTo = 0;
        
        if (typeof value == "bigint") {

            let off = this._offset;
            const buf = this._u8;
            const orig_p = off;
            let count = 0;
            let more;
            do {
                let byte = Number(value & BigInt(0x7f));
                // NOTE: this assumes that this signed shift is an arithmetic right shift.
                value >>= BigInt(7);
                more = !((((value == 0n) && ((byte & 0x40) == 0)) || ((value == BigInt(-1)) && ((byte & 0x40) != 0))));
                count++;
                if (more || count < padTo)
                    byte |= 0x80; // Mark this byte to show that more bytes will follow.
                buf[off++] = byte;
            } while (more);
         
            // Pad with 0x80 and emit a terminating byte at the end.
            if (count < padTo) {
                const padValue = value < BigInt(0) ? 0x7f : 0x00;
                for (; count < padTo - 1; ++count)
                    buf[off++] = (padValue | 0x80);
                buf[off++] = padValue;
            }

            this._offset = off;

            return (off - orig_p);
        
        } else {

            let off = this._offset;
            const buf = this._u8;
            const orig_p = off;
            let count = 0;
            let more;
            do {
                let byte = value & 0x7f;
                // NOTE: this assumes that this signed shift is an arithmetic right shift.
                value >>= 7;
                more = !((((value == 0 ) && ((byte & 0x40) == 0)) || ((value == -1) && ((byte & 0x40) != 0))));
                count++;
                if (more || count < padTo)
                    byte |= 0x80; // Mark this byte to show that more bytes will follow.
                buf[off++] = byte;
            } while (more);
         
            // Pad with 0x80 and emit a terminating byte at the end.
            if (count < padTo) {
                const padValue = value < 0 ? 0x7f : 0x00;
                for (; count < padTo - 1; ++count)
                    buf[off++] = (padValue | 0x80);
                buf[off++] = padValue;
            }

            this._offset = off;

            return (off - orig_p);
        }
    }

    writeUTF8Bytes(value) {
        let u8 = this._u8;
        let off = this._offset;

        let start = off;
        let end = u8.byteLength;
        for (let i = 0; i < value.length; ++i) {
            // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
            // See http://unicode.org/faq/utf_bom.html#utf16-3
            // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
            let u = value.charCodeAt(i); // possibly a lead surrogate
            if (u >= 0xD800 && u <= 0xDFFF) {
                let u1 = value.charCodeAt(++i);
                u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
            }
            if (u <= 0x7F) {
                if (off >= end)
                    break;
                u8[off++] = u;
            } else if (u <= 0x7FF) {
                if (off + 1 >= end)
                    break;
                u8[off++] = 0xC0 | (u >> 6);
                u8[off++] = 0x80 | (u & 63);
            } else if (u <= 0xFFFF) {
                
                if (off + 2 >= end)
                    break;
                u8[off++] = 0xE0 | (u >> 12);
                u8[off++] = 0x80 | ((u >> 6) & 63);
                u8[off++] = 0x80 | (u & 63);
            } else {
                if (off + 3 >= end)
                    break;
                if (u > 0x10FFFF)
                    console.warn('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
                u8[off++] = 0xF0 | (u >> 18);
                u8[off++] = 0x80 | ((u >> 12) & 63);
                u8[off++] = 0x80 | ((u >> 6) & 63);
                u8[off++] = 0x80 | (u & 63);
            }
        }
        
        this._offset = off;

        return off - start;
    }

};

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
    let len = 0;
    for (let i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        let u = str.charCodeAt(i); // possibly a lead surrogate
        if (u >= 0xD800 && u <= 0xDFFF)
            u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
        if (u <= 0x7F)
            ++len;
        else if (u <= 0x7FF)
            len += 2;
        else if (u <= 0xFFFF)
            len += 3;
        else 
            len += 4;
    }
    
    return len;
}

function lengthULEB128(value, padTo) {
    if (!Number.isInteger(padTo))
        padTo = 0;
    let cnt = 0;
    if (typeof value == "bigint") {
        do {
            value >>= 7n;
            if (value < 0n) // protecting against overflow (causing negative value)
                value = 0n;

            if (value != 0n) {
                cnt++;
            } else {
                cnt++;
                if (cnt < padTo)
                    return padTo;
                return cnt;
            }

        } while (value != 0n);

        throw TypeError("should never get here!");
    }

    do {
        value >>= 7;
        if (value < 0)
            value = 0;

        if (value != 0) {
            cnt++;
        } else {
            cnt++;
            if (cnt < padTo)
                return padTo;
            return cnt;
        }

    } while (value != 0);

    throw TypeError("should never get here!");
}

/**
 * Utility function to compute the bytes needed to encode a SLEB128 value to a buffer.
 * @param  {BigInt|Number}  value         [description]
 * @param  {Number}         padTo         [description]
 * @return {[type]}         Returns the number of bytes needed.
 */
function lengthSLEB128(value, padTo) {
    
    if (!Number.isInteger(padTo))
        padTo = 0;
    
    if (typeof value == "bigint") {

        let more, off = 0;
        let count = 0;
        do {
            let byte = Number(value & BigInt(0x7f));
            // NOTE: this assumes that this signed shift is an arithmetic right shift.
            value >>= BigInt(7);
            more = !((((value == 0n) && ((byte & 0x40) == 0)) || ((value == BigInt(-1)) && ((byte & 0x40) != 0))));
            count++;
            off++
        } while (more);
     
        // Pad with 0x80 and emit a terminating byte at the end.
        if (count < padTo) {
            for (; count < padTo - 1; ++count) {
                off++
            }
            off++
        }

        return off;
    
    } else {

        let more, off = 0;
        let count = 0;
        do {
            let byte = value & 0x7f;
            // NOTE: this assumes that this signed shift is an arithmetic right shift.
            value >>= 7;
            more = !((((value == 0 ) && ((byte & 0x40) == 0)) || ((value == -1) && ((byte & 0x40) != 0))));
            count++;
            off++;
        } while (more);
     
        // Pad with 0x80 and emit a terminating byte at the end.
        if (count < padTo) {
            for (; count < padTo - 1; ++count)
                off++;
            off++;
        }

        return off;
    }

    /*
    if (typeof value == "bigint") {
        const neg = value < 0n;
        if (value >= BigInt(-64) && value < BigInt(64)) {
            return 1;
        }

        let n = 0;
        let x = value;
        let more = true;
        while (more) {
            let byte = Number(x & BigInt(0x7f));
            let sign = (byte & 0x40) > 0;
            x >>= 7n;
            if ((x == 0n && !sign) || (x == BigInt(-1) && sign)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            n += 1;
        }

        return n;
    
    } else {
        // else we asume that its a value of Number
        const neg = value < 0;
        if (value >= -64 && value < 64) {
            return 1;
        }

        let n = 0;
        let x = value;
        let more = true;
        while (more) {
            let byte = (x & 0x7f);
            let sign = (byte & 0x40) > 0;
            x >>= 7;
            if ((x == 0 && !sign) || (x == -1 && sign)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            n += 1;
        }

        return n;
    }*/
}

class WasmGlobal {

    constructor(type, mutable, expr) {
        this.type = type;
        this.mutable = mutable === true;
        this.init = typeof expr == "object" ? expr : null;
    }

    static createGlobalInt32(value, mutable) {
        let obj = new WasmGlobal(0x7F, mutable, undefined);
        obj.init = [{opcode: 0x41, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalInt64(value, mutable) {
        let obj = new WasmGlobal(0x7E, mutable, undefined);
        obj.init = [{opcode: 0x42, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalFloat32(value, mutable) {
        let obj = new WasmGlobal(0x7D, mutable, undefined);
        obj.init = [{opcode: 0x43, value: value}, {opcode: 0x0b}];
        return obj;
    }

    static createGlobalFloat64(value, mutable) {
        let obj = new WasmGlobal(0x7C, mutable, undefined);
        obj.init = [{opcode: 0x44, value: value}, {opcode: 0x0b}];
        return obj;
    }
};

class WasmTable {

    constructor() {
        this.reftype = undefined;
        this.min = undefined;
        this.max = undefined;
    }
}

class WasmFunction {

    constructor() {

    }
};

class WasmType {

    constructor() {
        this.argv = null;
        this.argc = 0;
        this.retv = null;
        this.retc = 0;
    }

    static isEqual(type1, type2) {
        if (type1 === type2) {
            return true;
        }

        if (type1.argc != type2.argc) {
            return false;
        }

        if (type1.retc != type2.retc) {
            return false;
        }

        let argc = type1.argc;
        let retc = type1.retc;

        if (argc != 0) {

            if (!Array.isArray(type1.retv) || !Array.isArray(type2.retv))
                throw new Error("type inconsistency");

            let a1 = type1.argv;
            let a2 = type2.argv;

            for (let x = 0; x < argc; x++) {
                if (a1[x] !== a2[x]) {
                    return false;
                }
            }
        }

        if (retc != 0) {

            let r1 = type1.retv;
            let r2 = type2.retv;

            if (!Array.isArray(type1.retv) || !Array.isArray(type2.retv))
                throw new Error("type inconsistency");

            for (let x = 0; x < retc; x++) {
                if (r1[x] !== r2[x]) {
                    return false;
                }
            }
        }

        return true;
    }


    static create(argv, retv) {
        let res = new WasmType();
        res.argv = argv;
        res.argc = Array.isArray(argv) ? argv.length : 0
        res.retv = retv;
        res.retc = Array.isArray(retv) ? retv.length : 0;
        Object.freeze(res);
        return res;
    }

    toString() {

        let arg, ret;
        let argv = this.argv;
        let argc = this.argc;
        if (argc == 0) {
            arg = "[]";
        } else if (argc == 1){
            arg = type_name(argv[0]);
            arg = '[' + arg + ']';
        } else {
            arg = [];
            for (let x = 0; x < argc; x++) {
                arg.push(type_name(argv[x]));
            }
            arg = '[' + arg.join(" ") + ']';
        }

        let retv = this.retv;
        let retc = this.retc;
        if (retc == 0) {
            ret = "[]";
        } else if (retc == 1){
            ret = type_name(retv[0]);
            ret = '[' + ret + ']';
        } else {
            ret = [];
            for (let x = 0; x < retc; x++) {
                ret.push(type_name(retv[x]));
            }
            ret = '[' + ret.join(" ") + ']';
        }

        return arg + " -> " + ret;
    }
};

class WebAssemblyFuncTypeSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_FUNCTYPE, module);

    }

    encode(options) {

        let totsz = 0;

        let types = this.module.types;
        let len = types.length;
        for (let i = 0; i < len; i++) {
            let type = types[i];
            let argc = Array.isArray(type.argv) ? type.argv.length : 0;
            let retc = Array.isArray(type.retv) ? type.retv.length : 0;
            totsz += lengthULEB128(argc);
            totsz += argc;
            totsz += lengthULEB128(retc);
            totsz += retc;
            totsz += 1; // prefix 0x60
        }

        totsz += lengthULEB128(len);
        let secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_FUNCTYPE);
        data.writeULEB128(secsz);
        data.writeULEB128(len);

        
        len = types.length;
        for (let i = 0; i < len; i++) {
            let type = types[i]
            let prefix = data.writeUint8(0x60);

            let argv = type.argv;
            let argc = Array.isArray(argv) ? argv.length : 0;
            data.writeULEB128(argc);
            for (let x = 0; x < argc; x++) {
                data.writeUint8(argv[x]);
            }

            let retv = type.retv;
            let retc = Array.isArray(retv) ? retv.length : 0;
            data.writeULEB128(retc);
            for (let x = 0; x < retc; x++) {
                data.writeUint8(retv[x]);
            }
        }

        return buf;
    }

    static decode(module, data, size) {

        let types;
        if (!module.types) {
            types = [];
            module.types = types;
        } else {
            types = module.types;
        }

        let end = data.offset + size;
        let cnt = data.readULEB128();
        let functypes = [];
        for (let y = 0; y < cnt; y++) {
            let prefix = data.readUint8();
            if (prefix != 0x60) {
                console.error("invalid functype prefix 0x%s", prefix.toString(16));
                return null;
            }
            let argc = data.readULEB128();
            let argv = argc > 0 ? [] : null;
            for (let x = 0; x < argc; x++) {
                let type = data.readUint8();
                argv.push(type);
            }

            let retc = data.readULEB128();
            let retv = retc > 0 ? [] : null;
            for (let x = 0; x < retc; x++) {
                let type = data.readUint8();
                retv.push(type);
            }
            let functype = new WasmType();
            functype.argc = argc;
            functype.argv = argv;
            functype.retc = retc;
            functype.retv = retv;
            functype.typeidx = y; // TODO: remove me
            functype.count = 0;
            types.push(functype);
        }

        return new WebAssemblyFuncTypeSection(module);
    }
}


class ImportedFunction {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.type = undefined;
    }
};

class ImportedTable {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.min = null;
        this.max = null;
    }
};

class ImportedMemory {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.min = null;
        this.max = null;
        this.shared = false;
    }
};

class ImportedGlobal {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.type = undefined;
        this.mutable = false;
    }
};

class ImportedTag {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.type = undefined;
    }
};

class WasmMemory {

    constructor() {
        this.min = null;
        this.max = null;
        this.shared = false;
    }
};

class WasmTag {

    constructor() {
        this.type = false;
    }
};

class WebAssemblyImportSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_IMPORT, module);
        
    }

    encode(options) {

        let imports = this.module.imports;
        let types = this.module.types;
        let total = 0;
        let ylen = imports.length;
        let cnt = 0;
        let memPadTo = 4;
        for (let y = 0; y < ylen; y++) {
            let imp = imports[y];
            let len = lengthBytesUTF8(imp.module);
            total += len;
            len = lengthULEB128(len);
            total += len;
            len = lengthBytesUTF8(imp.name);
            total += len;
            len = lengthULEB128(len);
            total += len;

            if (imp instanceof ImportedFunction) {
                total += 1; // type
                let idx = types.indexOf(imp.type);
                if (idx == -1)
                    throw new ReferenceError(".type not defined");
                total += lengthULEB128(idx);
                cnt++;
            } else if (imp instanceof ImportedGlobal) {
                total += 3; // type, valuetype, mutable
                cnt++;
            } else if (imp instanceof ImportedMemory) {
                total += 2; // type, limits
                total += lengthULEB128(imp.min, memPadTo);
                if (imp.max !== null) {
                    total += lengthULEB128(imp.max, memPadTo);
                }
                cnt++;
            } else if (imp instanceof ImportedTable) {
                total += 3; // type, reftype, limits
                total += lengthULEB128(imp.min);
                if (imp.max !== null) {
                    total += lengthULEB128(imp.max);
                }
                cnt++;
            } else if (imp instanceof ImportedTag) {
                total += 2; // type, attribute
                let idx = types.indexOf(imp.type);
                if (idx == -1)
                    throw new ReferenceError(".type not defined");
                total += lengthULEB128(idx);
                cnt++;
            } else {
                console.error("unsupported import type");
                continue;
            }
        }

        total += lengthULEB128(cnt);
        let sz = lengthULEB128(total);
        let buf = new ArrayBuffer(total + sz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_IMPORT);
        data.writeULEB128(total);
        data.writeULEB128(cnt);
        ylen = imports.length;
        for (let y = 0; y < ylen; y++) {
            let imp = imports[y];
            let strlen = lengthBytesUTF8(imp.module);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(imp.module);

            strlen = lengthBytesUTF8(imp.name);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(imp.name);

            if (imp instanceof ImportedFunction) {
                data.writeUint8(0x00);
                let idx = types.indexOf(imp.type);
                data.writeULEB128(idx);
            } else if (imp instanceof ImportedGlobal) {
                data.writeUint8(0x03);
                data.writeUint8(imp.type);
                data.writeUint8(imp.mutable ? 1 : 0);
            } else if (imp instanceof ImportedMemory) {
                data.writeUint8(0x02);
                if (imp.shared) {
                    if (imp.max === null) {
                        data.writeUint8(0x02);
                        data.writeULEB128(imp.min, memPadTo);
                    } else {
                        data.writeUint8(0x03);
                        data.writeULEB128(imp.min, memPadTo);
                        data.writeULEB128(imp.max, memPadTo);
                    }

                } else {
                    if (imp.max === null) {
                        data.writeUint8(0x00);
                        data.writeULEB128(imp.min, memPadTo);
                    } else {
                        data.writeUint8(0x01);
                        data.writeULEB128(imp.min, memPadTo);
                        data.writeULEB128(imp.max, memPadTo);
                    }

                }

            } else if (imp instanceof ImportedTable) {
                data.writeUint8(0x01);
                data.writeUint8(imp.reftype);
                data.writeULEB128(imp.min);
                if (imp.max !== null) {
                    data.writeULEB128(imp.max);
                }
            } else if (imp instanceof ImportedTag) {
                data.writeUint8(0x04);
                data.writeUint8(imp.attr);
                let idx = types.indexOf(imp.type);
                data.writeULEB128(idx);
            } else {
                console.error("unsupported import type");
                continue;
            }
        }

        return buf;
    }

    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let types = module.types;
        let results = [];
        for (let i = 0; i < cnt; i++) {
            let mlen = data.readULEB128();
            let mod = data.readUTF8Bytes(mlen);
            let nlen = data.readULEB128();
            let name = data.readUTF8Bytes(nlen);
            let type = data.readUint8();
            let imp;
            if (type == 0x00) {         // function
                imp = new ImportedFunction();
                let typeidx = data.readULEB128();
                imp.type = types[typeidx];
                imp.type.count++; // increment refcount.
                if (!module.functions) {
                    module.functions = [];
                }
                module.functions.push(imp);
            } else if (type == 0x01) {  // table
                imp = new ImportedTable();
                imp.reftype = data.readUint8();
                let limit = data.readUint8();
                if (limit == 0x01) {
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                } else if (limit == 0x00) {
                    imp.min = data.readULEB128();
                }
                if (!module.tables) {
                    module.tables = [];
                }
                module.tables.push(imp);
            } else if (type == 0x02) {  // memory
                let limit = data.readUint8();
                if (limit == 0x01) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                    imp.shared = false;
                } else if (limit == 0x00) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.shared = false;
                } else if (limit == 0x02) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.shared = true;
                } else if (limit == 0x03) {
                    imp = new ImportedMemory();
                    imp.min = data.readULEB128();
                    imp.max = data.readULEB128();
                    imp.shared = true;
                } else {
                    console.error("found memory limit of type %d", type);
                }
                if (!module.memory) {
                    module.memory = [];
                }
                module.memory.push(imp);
            } else if (type == 0x03) {  // global
                imp = new ImportedGlobal();
                let t = data.readUint8();
                imp.globaltype = type_name(t);
                imp.type = t;
                imp.mutable = data.readUint8() === 1;
                if (!module.globals) {
                    module.globals = [];
                }
                module.globals.push(imp);
            } else if (type == 0x04) {  // tag (wasm exception handling)
                imp = new ImportedTag();
                imp.attr = data.readUint8();
                imp.type = types[data.readULEB128()];
                if (!module.tags) {
                    module.tags = [];
                }
                module.tags.push(imp);
            } else {
                console.error("found unsupported import type %d", type);
                continue;
            }

            if (imp) {
                imp.module = mod;
                imp.name = name;
                results.push(imp);
            }
        }
        
        //console.log("import vector count: %d", cnt);
        //console.log(results);
        // TODO: map every existing module-name
        let section = new WebAssemblyImportSection(module);
        section.data = results;
        module.imports = results;
        return section;
    }
}


class WebAssemblyFunctionSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_FUNC, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let functions = mod.functions;
        let types = mod.types;
        let cnt, len = functions.length;
        let start = 0;

        // getting index where the imported functions ends.
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        cnt = len - start;

        for (let i = start; i < len; i++) {
            let func = functions[i];
            if (func instanceof ImportedFunction)
                throw new TypeError("found missplaced import");

            let typeidx = types.indexOf(func.type);
            if (typeidx == -1)
                throw new ReferenceError("type not found in vector");
            totsz += lengthULEB128(typeidx);
        }

        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_FUNC);
        data.writeULEB128(secsz);
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let func = functions[i];
            let typeidx = types.indexOf(func.type);
            data.writeULEB128(typeidx);
        }

        return buf;
    }

    static decode(module, data, size) {
        
        let cnt = data.readULEB128();

        let functions;
        if (!module.functions) {
            module.functions = [];
        }

        let types = module.types;
        /*let len2 = functypes.length;
        for (let i = 0; i < len2; i++) {
            functypes[i].count = 0;
        }*/

        functions = module.functions;
        for (let i = 0; i < cnt; i++) {
            let typeidx = data.readULEB128();
            let fn = new WasmFunction();
            let type = types[typeidx];
            fn.type = type;
            type.count++;
            functions.push(fn);
        }
        console.log("function vector count: %d", cnt);

        return new WebAssemblyFunctionSection(module);
    }
}


class WebAssemblyTableSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_TABLE, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let tables = mod.tables;
        let len = tables.length;
        let start = 0;
        let cnt = 0;

        // get the number of imports in begining.
        for (let i = 0; i < len; i++) {
            let table = tables[i];
            if (!(table instanceof ImportedTable)) {
                start = i;
                break;
            }
        }

        for (let i = start; i < len; i++) {
            let table = tables[i];
            if (table instanceof ImportedTable)
                throw new ReferenceError("imports mixed");

            if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                totsz += lengthULEB128(table.min);
                totsz += lengthULEB128(table.max);
            } else if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                totsz += lengthULEB128(table.min);
            } else {
                throw new TypeError("invalid definition of table object");
            }
            cnt++;
        }

        totsz += cnt * 2; // for table.reftype + table.limits (type)
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_TABLE);
        data.writeULEB128(secsz);
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let table = tables[i];
            data.writeUint8(table.reftype);
            if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                data.writeUint8(0x01);
                data.writeULEB128(table.min);
                data.writeULEB128(table.max);
            } else if (Number.isInteger(table.min) && Number.isInteger(table.max)) {
                data.writeUint8(0x00);
                data.writeULEB128(table.min);
            }
        }

        return buf;
    }

    static decode(module, data, size) {
        
        let cnt = data.readULEB128();
        let vector, tables = [];
        if (!module.tables)
            module.tables = [];
        vector = module.tables;
        for (let i = 0; i < cnt; i++) {
            let table = {};
            table.reftype = data.readUint8();
            let limits = data.readUint8();
            if (limits == 0x00) {
                table.min = data.readULEB128();
            } else if (limits == 0x01) {
                table.min = data.readULEB128();
                table.max = data.readULEB128();
            }
            tables.push(table);
            vector.push(table);
        }

        console.log("table vector count: %d", cnt);
        console.log(tables);

        return new WebAssemblyTableSection(module);
    }
}

class WebAssemblyTagSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_TAG, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let types = mod.types;
        let tags = mod.tags;
        let len = tags.length;
        let start = 0;
        let cnt = 0;

        // get the number of imports in begining.
        for (let i = 0; i < len; i++) {
            let tag = tags[i];
            if (!(tag instanceof ImportedTag)) {
                start = i;
                break;
            }
        }

        for (let i = start; i < len; i++) {
            let idx, tag = tags[i];
            if (tag instanceof ImportedTag)
                throw new ReferenceError("imports mixed");

            idx = types.indexOf(tag.type);
            if (idx === -1)
                throw new ReferenceError("missing type spec");
            totsz += lengthULEB128(idx);

            cnt++;
        }

        totsz += cnt; // accounting for tag.attr
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_TAG);
        data.writeULEB128(secsz);
        data.writeULEB128(cnt);

        for (let i = start; i < len; i++) {
            let idx, tag = tags[i];
            idx = types.indexOf(tag.type);
            data.writeUint8(tag.attr);
            data.writeULEB128(idx);
        }

        return buf;
    }

    static decode(module, data, size) {
        
        let types = module.types;
        let typemax = types.length - 1;
        let cnt = data.readULEB128();
        let tags;
        if (!module.tags)
            module.tags = [];
        tags = module.tags;
        for (let i = 0; i < cnt; i++) {
            let tag = new WasmTag();
            tag.attr = data.readUint8();
            let idx = data.readULEB128();
            if (idx < 0 || idx > typemax)
                throw new ReferenceError("missing type spec");
            tag.type = types[idx];
            tags.push(tag);
        }

        console.log("table vector count: %d", cnt);
        console.log(tags);

        return new WebAssemblyTagSection(module);
    }
}

class WebAssemblyMemorySection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_MEMORY, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let vector = mod.memory;
        let len = vector.length;
        let cnt = 0;
        let memPadTo = 4;

        for (let i = 0; i < len; i++) {
            let mem = vector[i];
            if (mem instanceof ImportedMemory)
                continue;

            if (mem.shared) {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                    totsz += lengthULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                } else {
                    throw new TypeError("invalid memory definition");
                }

            } else {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                    totsz += lengthULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    totsz += lengthULEB128(mem.min, memPadTo);
                } else {
                    throw new TypeError("invalid memory definition");
                }
            }
            cnt++;
        }

        totsz += cnt; // accounts for the byte(s) used by mem.limits
        totsz += lengthULEB128(cnt);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_MEMORY);
        data.writeULEB128(secsz);
        data.writeULEB128(cnt);

        for (let i = 0; i < len; i++) {
            let mem = vector[i];
            if (mem instanceof ImportedMemory)
                continue;

            if (mem.shared) {
                //
                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    data.writeUint8(0x03);
                    data.writeULEB128(mem.min, memPadTo);
                    data.writeULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    data.writeUint8(0x02);
                    data.writeULEB128(mem.min, memPadTo);
                }

            } else {

                if (Number.isInteger(mem.min) && Number.isInteger(mem.max)) {
                    data.writeUint8(0x01);
                    data.writeULEB128(mem.min, memPadTo);
                    data.writeULEB128(mem.max, memPadTo);
                } else if (Number.isInteger(mem.min)) {
                    data.writeUint8(0x00);
                    data.writeULEB128(mem.min, memPadTo);
                }
            }
        }

        return buf;
    }

    static decode(module, data, size) {
        let end = data.offset + size;
        let cnt = data.readULEB128();
        let vector;
        if (!module.memory) {
            vector = [];
            module.memory = vector;
        } else {
            vector = module.memory;
        }

        for (let i = 0; i < cnt; i++) {
            let limit = data.readUint8();
            let mem = new WasmMemory();
            if (limit == 0x01) {
                mem.min = data.readULEB128();
                mem.max = data.readULEB128();
                mem.shared = false;
            } else if (limit == 0x00) {
                mem.min = data.readULEB128();
                mem.shared = false;
            } else if (limit == 0x02) {
                mem.min = data.readULEB128();
                mem.shared = true;
            } else if (limit == 0x03) {
                mem.min = data.readULEB128();
                mem.max = data.readULEB128();
                mem.shared = true;
            }
            vector.push(mem);
        }

        console.log("memory vector count: %d", cnt);
        console.log(vector);

        return new WebAssemblyMemorySection(module);
    }
}


class WebAssemblyGlobalSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_GLOBAL, module);
        
    }

    encode(options) {
        let vector = [];
        let mod = this.module;
        let globals = mod.globals;
        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            glob.index = i;
            if (glob instanceof ImportedGlobal)
                continue;
            vector.push(glob);
        }

        let secsz = 0;
        secsz += lengthULEB128(vector.length);
        len = vector.length;
        for (let i = 0; i < len; i++) {
            let glob = vector[i];
            secsz += byteCodeComputeByteLength(mod, glob.init, null);
            secsz += 2;
        }

        let totsz = lengthULEB128(secsz);
        totsz += secsz + 1;

        let buf = new ArrayBuffer(totsz);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_GLOBAL);
        data.writeULEB128(secsz);
        data.writeULEB128(vector.length);
        for (let i = 0; i < len; i++) {
            let glob = vector[i];
            data.writeUint8(glob.type);
            data.writeUint8(glob.mutable);
            encodeByteCode(mod, glob.init, null, data);
        }

        return buf;
    }

    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let vector;
        if (!module.globals) {
            vector = [];
            module.globals = vector;
        } else {
            vector = module.globals;
        }
        
        for (let i = 0; i < cnt; i++) {
            let type = data.readUint8();
            let mut = data.readUint8();
            let opcode = decodeByteCode(data, module);
            let obj = new WasmGlobal(type, (mut === 1), opcode.opcodes);
            vector.push(obj);
            data.offset = opcode.end;
        }

        return new WebAssemblyGlobalSection(module);
    }
}


class ExportedFunction {

    constructor() {
        this.type = "function";
        this.name = undefined;
        this.typeidx = undefined;
    }
};

class ExportedTable {

    constructor() {
        this.type = "table";
        this.name = undefined;
        this.min = null;
        this.max = null;
    }
};

class ExportedMemory {

    constructor() {
        this.type = "memory";
        this.name = undefined;
        this.min = null;
        this.max = null;
        this.shared = false;
    }
};

class ExportedGlobal {

    constructor() {
        this.type = "global";
        this.name = undefined;
        this.globaltype = undefined;
        this.mutable = false;
    }
};

class WebAssemblyExportSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_EXPORT, module);
        this.data = undefined;
    }

    encode(options) {

        let mod = this.module;
        let exported = mod.exports;
        let indexes = [];
        let secsz = lengthULEB128(exported.length);
        secsz += exported.length; // each export have a type-id
        let len = exported.length;
        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            let nlen = lengthBytesUTF8(exp.name);
            secsz += nlen;
            secsz += lengthULEB128(nlen);
            let idx = -1;
            if (exp instanceof ExportedFunction) {
                idx = mod.functions.indexOf(exp.function);
            } else if (exp instanceof ExportedTable) {
                idx = mod.tables.indexOf(exp.table);
            } else if (exp instanceof ExportedMemory) {
                idx = mod.memory.indexOf(exp.memory);
            } else if (exp instanceof ExportedGlobal) {
                idx = mod.globals.indexOf(exp.global);
            }

            if (idx === -1)
                throw TypeError("invalid reference or type");
            indexes.push(idx);
            secsz += lengthULEB128(idx);
        }

        let totsz = secsz + 1;
        totsz += lengthULEB128(secsz);
        let buf = new ArrayBuffer(totsz);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_EXPORT);
        data.writeULEB128(secsz);
        data.writeULEB128(len);

        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            let idx = indexes[i];
            let strlen = lengthBytesUTF8(exp.name);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(exp.name);
            if (exp instanceof ExportedFunction) {
                data.writeUint8(0x00);
                data.writeULEB128(idx);
            } else if (exp instanceof ExportedTable) {
                data.writeUint8(0x01);
                data.writeULEB128(idx);
            } else if (exp instanceof ExportedMemory) {
                data.writeUint8(0x02);
                data.writeULEB128(idx);
            } else if (exp instanceof ExportedGlobal) {
                data.writeUint8(0x03);
                data.writeULEB128(idx);
            }
        }

        return buf;
    }

    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let vector = [];
        for (let i = 0; i < cnt; i++) {

            let nlen = data.readULEB128();
            let name = data.readUTF8Bytes(nlen);
            let type = data.readUint8();
            let idx = data.readULEB128();

            if (type == 0x00) {
                let exp = new ExportedFunction();
                exp.name = name;
                exp.function = module.functions[idx];
                vector.push(exp);
            } else if (type == 0x01) {
                let exp = new ExportedTable();
                exp.name = name;
                exp.table = module.tables[idx];
                vector.push(exp);
            } else if (type == 0x02) {
                let exp = new ExportedMemory();
                exp.name = name;
                exp.memory = module.memory[idx];
                vector.push(exp);
            } else if (type == 0x03) {
                let exp = new ExportedGlobal();
                exp.name = name;
                exp.global = module.globals[idx];
                vector.push(exp);
            } else {
                console.warn("export of type %d is not supported", type);
            }
        }
        console.log("export vector count: %d", cnt);
        //console.log(results);
        //console.log(vector);

        let section = new WebAssemblyExportSection(module);
        section.data = vector;
        module["exports"] = vector;
        return section;
    }
}


class WebAssemblyStartSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_START, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let funcidx = mod.functions.indexOf(mod.startfn);
        if (funcidx == -1)
            throw new ReferenceError("mod.startfn not defined in mod.functions");

        totsz += lengthULEB128(funcidx);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_START);
        data.writeULEB128(secsz);
        data.writeULEB128(funcidx);

        return buf;
    }

    static decode(module, data, size) {
        let funcidx = data.readULEB128();
        let func = mod.functions[funcidx];
        mod.startfn = func;
        console.log("start section entry-fn-idx: %d", funcidx);

        return new WebAssemblyStartSection(module);
    }
}

class WasmElementSegment {

    constructor() {
        this.prefix = undefined;
        this.opcodes = undefined;
        this.vector = undefined;
        this.count = undefined;
    }
}

class WebAssemblyElementSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_ELEMENT, module);
        
    }

    encode(options) {

        let mod = this.module;
        let secsz, totsz = 0;
        let functions = mod.functions;
        let elementSegments = mod.elementSegments;
        let ylen = elementSegments.length;

        for (let y = 0; y < ylen; y++) {
            let element = elementSegments[y];
            totsz += byteCodeComputeByteLength(mod, element.opcodes, null);
            let vector = element.vector;
            let xlen = vector.length;
            for (let x = 0; x < xlen; x++) {
                let func = vector[x];
                let funcidx = functions.indexOf(func);
                if (funcidx === -1)
                    throw ReferenceError("function in element is not defined in module.functions");
                totsz += lengthULEB128(funcidx);
            }

            totsz += lengthULEB128(xlen);
        }

        totsz += ylen; // for element.prefix (one byte per element item)
        totsz += lengthULEB128(ylen);
        secsz = totsz;
        totsz += lengthULEB128(secsz);

        // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_ELEMENT);
        data.writeULEB128(secsz);
        data.writeULEB128(ylen);

        for (let y = 0; y < ylen; y++) {
            let element = elementSegments[y];
            data.writeUint8(element.prefix);
            encodeByteCode(mod, element.opcodes, null, data);
            let vector = element.vector;
            let xlen = vector.length;
            data.writeULEB128(xlen);
            for (let x = 0; x < xlen; x++) {
                let func = vector[x];
                let funcidx = functions.indexOf(func);
                data.writeULEB128(funcidx);
            }
        }

        return buf;

    }

    static decode(module, data, size) {
        
        let cnt = data.readULEB128();
        let functions = module.functions;
        let elementSegments = [];
        module.elementSegments = elementSegments;
        for (let i = 0; i < cnt; i++) {
            let prefix = data.readULEB128();
            if (prefix == 0x00) {
                let expr = decodeByteCode(data, module);
                let idx;
                if (expr.opcodes.length == 2 && expr.opcodes[0].opcode == 0x41 && expr.opcodes[1].opcode == 0x0B) {
                    idx = expr.opcodes[0].value;
                } else if (expr.opcodes.length == 2 && expr.opcodes[0].opcode == 0x23 && expr.opcodes[1].opcode == 0x0B) {
                    console.warn("implement support for global.get");
                    idx = 1;
                } else {
                    console.log(expr);
                    throw new TypeError("only static offset expressions supported ATM");
                }
                console.log(expr);
                let vlen = data.readULEB128();
                let tableidx = 0;
                let table;
                if (Array.isArray(module.tables[tableidx].contents)) {
                    table = module.tables[0].contents;
                } else {
                    table = [undefined];
                    module.tables[0].contents = table;
                }
                let vec = [];
                //vec.length = idx + vlen;
                for (let x = 0; x < vlen; x++) {
                    let funcidx = data.readULEB128();
                    let fn = functions[funcidx];
                    table[idx++] = fn;
                    vec.push(fn);
                }

                let element = new WasmElementSegment();
                element.prefix = prefix;
                element.opcodes = expr.opcodes;
                element.vector = vec;
                element.count = vlen;
                elementSegments.push(element);

                //console.log("prefix: %d expr: %o vec(funcidx) %o", prefix, expr, vec);
            }
        }

        //console.log("element section vector count: %d", cnt);

        return new WebAssemblyElementSection(module);
    }
}

function decodeElementSection(data, secsz, mod) {
    
}

function encodeElementSection(mod) {


}

/**
 * Holds cache for the input wasm binary.
 */
class WebAssemblyModuleCache {

}

class WasmLocal {

    constructor(type) {
        this.type = type;
        this.usage = 0;
    }
}

class WebAssemblyCodeSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_CODE, module);
        
    }

    encode(options) {

        let mod = this.module;
        let funcvec = mod.functions;
        let anyDirty = false;
        let len = funcvec.length;
        let org = mod._buffer;
        let start = 0;
        // first lets find where the our first non-import appears.
        for (let i = 0; i < len; i++) {
            let func = funcvec[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        let sec_sz = 0;
        let buffers = [];
        let modcnt = 0;

        for (let i = start; i < len; i++) {
            let func = funcvec[i];
            /*let debug = false;

            if (i == 214) {
                debugger;
            }*/

            let localsmapped;
            let subsz = 0;

            let locals = func.locals;
            if (locals && locals.length) {
                localsmapped = [];
                let count = 0;              // current count of type
                let type;                   // current type

                let xlen = locals.length;
                let narg = func.narg;
                for (let x = narg; x < xlen; x++) {
                    let local = locals[x];
                    if (local.type != type) {
                        if (type !== undefined)
                            localsmapped.push({type: type, count: count});
                        type = local.type;
                        count = 1; // reset
                    } else {
                        count++;
                    }
                }

                // will always miss the last one if any.
                if (count > 0) {
                    localsmapped.push({type: type, count: count});
                }

                xlen = localsmapped.length;
                subsz += lengthULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let local = localsmapped[x];
                    subsz += lengthULEB128(local.count);
                    subsz += 1;
                }

            } else {
                subsz += lengthULEB128(0);
            }

            let opcodesz = byteCodeComputeByteLength(mod, func.opcodes, func.locals);
            let totsz = subsz + opcodesz;
            totsz += lengthULEB128(subsz + opcodesz);
            let buf = new ArrayBuffer(totsz);
            let data = new ByteArray(buf);
            buffers.push(buf);
            data.writeULEB128(subsz + opcodesz);
            let xlen = localsmapped ? localsmapped.length : 0;
            data.writeULEB128(xlen);
            if (xlen > 0) {
                for (let x = 0; x < xlen; x++) {
                    let local = localsmapped[x];
                    data.writeULEB128(local.count);
                    data.writeUint8(local.type);
                }
            }
            let tmp = data.offset;
            encodeByteCode(mod, func.opcodes, func.locals, data);
            if (data.offset - tmp != opcodesz) {
                console.error("[%d] generated opcodes %d !== %d (real vs. computed)", i, data.offset - tmp, opcodesz);
            }
            sec_sz += buf.byteLength;
            modcnt++;

            // 1. encode opcodes but hold for pushing it into buffers.
            // 2. pre-compute locals + locals-count + entry-size
            // 3. encode the above, and push it into buffers.
            // 4. push opcode into buffers.
        }

        let cnt = funcvec.length - start;
        let cntsz = lengthULEB128(cnt);
        let headsz = 1 + lengthULEB128(sec_sz + cntsz); // section-type + section-length;
        headsz += cntsz;
        let header = new ArrayBuffer(headsz);
        let data = new ByteArray(header);
        data.writeUint8(SECTION_TYPE_CODE);
        data.writeULEB128(sec_sz + cntsz);
        data.writeULEB128(cnt);
        buffers.unshift(header);

        console.log("encoded %d of which %d where modified", cnt, modcnt);

        return buffers;
    }

    static decode(module, data, size) {
        
        let end = data.offset + size;
        let cnt = data.readULEB128();
        let idx = 0;
        let functions = module.functions;
        let start = 0;

        // first lets find where the our first non-import appears.
        for (let i = 0; i < functions.length; i++) {
            let func = functions[i];
            if (!(func instanceof ImportedFunction)) {
                start = i;
                break;
            }
        }

        for (let y = 0; y < cnt; y++) {
            let tmp1 = data.offset;
            let bytesz = data.readULEB128();
            let tmp = data.offset;
            let lcnt = data.readULEB128();
            let _locals;
            let tlocals;
            let func = functions[start++];
            let type = func.type;
            if (type.argv && type.argv.length > 0) {
                _locals = [];
                // arguments or aka. param(s) are also locals.
                let argv = type.argv;
                let zlen = argv.length
                for(let z = 0;z < zlen;z++) {
                    let t = argv[z];
                    let local = new WasmLocal(t);
                    _locals.push(local);
                }
            }
            if (!_locals && lcnt > 0) {
                _locals = [];
            }
            if (lcnt > 0)
                tlocals = [];
            for(let i = 0;i < lcnt;i++) {
                let n = data.readULEB128();
                let t = data.readUint8();
                tlocals.push({count: n, type: t});
                for (let x = 0; x < n; x++) {
                    let local = new WasmLocal(t);
                    _locals.push(local);
                }
            }
            if (data.offset == 32549)
                console.log("debug here!");
            let opcode_start = data.offset;
            let opcode_end = tmp + bytesz;
            let opcodes = decodeByteCode(data, module, _locals);
            
            func.narg = type.argc;
            func.locals = _locals;
            func._tlocals = tlocals;
            func.codeStart = tmp1;
            func.opcode_start = opcode_start;
            func.opcode_end = opcode_end;
            func.opcodes = opcodes.opcodes;
            data.offset = opcode_end;
        }
        console.log("code vector count: %d", cnt);

        return new WebAssemblyCodeSection(module);
    }
}


function prepareModuleEncode(mod) {
    let vector = mod.types;
    let len = vector.length;
    for (let i = 0; i < len; i++) {
        let type = vector[i];
        type.typeidx = i;
    }

    vector = mod.globals;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let glob = vector[i];
        glob._index = i;
    }

    vector = mod.tables;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let table = vector[i];
        table._index = i;
    }

    vector = mod.memory;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let mem = vector[i];
        mem._index = i;
    }

    vector = mod.functions;
    len = vector.length;
    for (let i = 0; i < len; i++) {
        let func = vector[i];
        func._index = i;
    }
}


class WasmDataSegment {

    constructor() {
        this._section = undefined;
        this.memory = undefined;
        this.inst = undefined;
        this.size = undefined;
        this._buffer = undefined;
        this._mutableDataBuffer = undefined;
        this._mutableDataOffset = undefined;
    }

    hasDataSegment(dataSegment) {
        
    }

    get buffer() {
        if (this._mutableDataBuffer) {
            let start = this._mutableDataOffset;
            let end = start + this.size;
            return this._mutableDataBuffer.slice(start, end);
        }

        return this._buffer;
    }
}

class WebAssemblyDataSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_DATA, module);
    }

    hasDataSegment(dataSegment) {

    }

    encode(options) {
        let mod = this.module;
        let segments;
        if (options.dataSegments) {
            segments = options.dataSegments;
        } else {
            segments = this.module.dataSegments;
        }

        let secsz;
        let tot = 0;
        let len = segments.length;
        for (let i = 0; i < len; i++) {
            let seg = segments[i];
            tot += lengthULEB128(0); // seg.kind (not implemented)
            tot += byteCodeComputeByteLength(mod, seg.inst.opcodes, null);
            tot += lengthULEB128(seg.size);
            tot += seg.size;
        }
        tot += lengthULEB128(len); // vector-length
        secsz = tot;
        tot += lengthULEB128(tot); // section-size
        tot += 1;                  // section-signature

        let buffer = new Uint8Array(tot); // {dst-offset, size}
        let data = new ByteArray(buffer);
        data.writeUint8(SECTION_TYPE_DATA);
        data.writeULEB128(secsz);
        data.writeULEB128(len);
        for (let i = 0; i < len; i++) {
            let seg = segments[i];
            data.writeULEB128(0); // seg.kind (not implemented)
            encodeByteCode(mod, seg.inst.opcodes, null, data);
            data.writeULEB128(seg.size);
            if (seg._mutableDataBuffer) {
                let off = seg._mutableDataOffset;
                u8_memcpy(seg._mutableDataBuffer, off, seg.size, buffer, data.offset);
                data.offset += seg.size;
            } else {
                u8_memcpy(seg._buffer, 0, seg.size, buffer, data.offset);
                data.offset += seg.size;
            }
        }

        return buffer;
    }

    static decode(module, data, size) {

        let cnt = data.readULEB128();
        let segments;
        if (!module.dataSegments) {
            segments = [];
            module.dataSegments = segments;
        } else if (Array.isArray(module.dataSegments) && module.dataSegments.length == 0) {
            segments = module.dataSegments;


        } else if (Array.isArray(module.dataSegments) && module.dataSegments.length == cnt){
                segments = [];
                module.dataSegments = segments;
        } else {
            throw new TypeError("module already defines dataSegment with another count");
        }
        let end = data.offset + size;
        let results = [];
        for (let i = 0; i < cnt; i++) {
            let kind = data.readULEB128();
            if (kind == 0x00) {
                let inst = decodeByteCode(data, module, null);
                let data_start = inst.end;
                data.offset = inst.end;
                let datasz = data.readULEB128();
                let segment = new WasmDataSegment();
                segment.kind = kind;
                segment.memory = module.memory[0];
                segment.inst = inst;
                segment.offset = data.offset;
                segment.size = datasz;
                segment._buffer = data._u8.slice(data.offset, data.offset + datasz);
                segments.push(segment);
                data.offset += datasz;
            } else if (kind == 0x01) {
                console.warn("data segment of type `init b*, mode passive` is not implemented");
                break;
            } else if (kind == 0x02) {
                console.warn("data segment of type `init b*, mode active {memory, offset }` is not implemented");
                let memidx = data.readULEB128();
                break;
            } else {
                console.warn("undefined data-segment mode!");
                break;
            }
        }
        console.log("data vector count: %d", cnt);
        console.log(segments);

        return new WebAssemblyDataSection(module);
    }
}

class WebAssemblyDataCountSection extends WebAssemblySection {

    constructor(module) {
        super(SECTION_TYPE_DATA_COUNT, module);
        this.count = 0;
    }

    encode(options) {
        let dataSegments = this.module.dataSegments;
        let totsz, secsz = lengthULEB128(dataSegments.length);
        totsz = secsz;
        totsz += lengthULEB128(secsz);
        let buffer = new Uint8Array(totsz + 1);
        let data = new ByteArray(buffer);
        data.writeUint8(SECTION_TYPE_DATA_COUNT);
        data.writeULEB128(secsz);
        data.writeULEB128(dataSegments.length);
    }

    static decode(module, data, size) {
        let cnt = data.readULEB128();
        let section = new WebAssemblyDataCountSection(module);
        section.count = cnt;
        if (!module.dataSegments) {
            let vec = [];
            vec.length = cnt;
            module.dataSegments = vec;
        }
        return section;
    }
}

function findCustomSectionByName(sections, name) {
    let len = sections.length;
    for (let i = 0; i < len; i++) {
        let sec = sections[i];
        if (sec.type == 0x00 && sec.name == name) {
            return sec;
        }
    }

    return null;
}

//
// known custom sections.
// 

// https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md


// https://github.com/WebAssembly/tool-conventions/blob/main/DynamicLinking.md
class WebAssemblyCustomSectionDylink0 extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "dylink.0");
    }

    encode(options) {

    }

    static decode(module, data, size) {

        let info;

        let end = data.offset + size;
        while (data.offset < end) {
            let id = data.readUint8();
            let sz = data.readULEB128();
            let substart = data.offset;
            if (id == 0x01) { // WASM_DYLINK_MEM_INFO
                let memsz = data.readULEB128();
                let memalignment = data.readULEB128();
                let tablesz = data.readULEB128();
                let tablealignment = data.readULEB128();
                console.log({memorysize: memsz, memoryalignment: memalignment, tablesize: tablesz, tablealignment: tablealignment});
            } else if (id == 0x02) { // WASM_DYLINK_NEEDED
                let entries = [];
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let strsz = data.readULEB128();
                    let str = data.readUTF8Bytes(strsz);
                    entries.push(str);
                }
                console.log(entries);
            } else if (id == 0x03) { // WASM_DYLINK_EXPORT_INFO
                let strsz = data.readULEB128();
                let name = data.readUTF8Bytes(strsz);
                let flags = data.readULEB128();
                console.log("name = %s flags = %d", name, flags);
            } else if (id == 0x04) { // WASM_DYLINK_IMPORT_INFO
                let strsz = data.readULEB128();
                let name = data.readUTF8Bytes(strsz);
                strsz = data.readULEB128();
                let field = data.readUTF8Bytes(strsz);
                let flags = data.readULEB128();
                console.log("name = %s field = %s flags = %d", name, field, flags);
            }

            data.offset = substart + sz;
        }

        return new WebAssemblyCustomSectionDylink0(module);
    }
}


// https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md#target-features-section
class WebAssemblyCustomSectionTargetFeatures extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "target_features");
    }

    encode(options) {

    }

    static decode(module, data, size) {
        let features = {};

        let end = data.offset + size;
        while (data.offset < end) {
            let prefix = data.readUint8();
            let strsz = data.readULEB128();
            let name = data.readUTF8Bytes(strsz);

            features[name] = prefix;
        }

        let section = new WebAssemblyCustomSectionTargetFeatures(module);
        section.data = features;
        module.target_features = features;
        return section;
    }
}


// https://github.com/WebAssembly/tool-conventions/blob/main/ProducersSection.md
class WebAssemblyCustomSectionProducers extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "producers");
    }

    encode(options) {

        let producers = this.data;
        let secsz, totsz = 0;
        let count = 0;
        let keys = ["language", "processed-by", "sdk"];
        let len = keys.length;
        for (let y = 0; y < len; y++) {
            let values, key = keys[y];
            if (!producers.hasOwnProperty(key))
                continue;
            values = producers[key];
            if (!Array.isArray(values))
                continue;

            let xlen = values.length;
            for (let x = 0; x < xlen; x++) {
                let value = values[x];
                if (typeof value == "string") {
                    let strlen = lengthBytesUTF8(value);
                    totsz += lengthULEB128(strlen);
                    totsz += strlen;
                    totsz += lengthULEB128(0);
                } else if (typeof value == "object" && value !== null) {
                    if (typeof value.value !== "string") {
                        throw TypeError(".value is a required field");
                    }
                    let strlen = lengthBytesUTF8(value.value);
                    totsz += lengthULEB128(strlen);
                    totsz += strlen;
                    if (typeof value.version == "string") {
                        let strlen = lengthBytesUTF8(value.version);
                        totsz += lengthULEB128(strlen);
                        totsz += strlen;
                    } else {
                        totsz += lengthULEB128(0);
                    }
                } else {
                    throw TypeError("unsupported value in field of producers");
                }
            }

            totsz += lengthULEB128(xlen);


            let strlen = lengthBytesUTF8(key);
            totsz += lengthULEB128(strlen);
            totsz += strlen;
            count++;
        }

        totsz += lengthULEB128(count);
        let strlen = lengthBytesUTF8("producers");
        totsz += lengthULEB128(strlen);
        secsz = totsz;
        totsz += lengthULEB128(totsz);

            // actual encdong
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
        data.writeULEB128(strlen);
        data.writeUTF8Bytes("producers");
        data.writeULEB128(count);

        len = keys.length;
        for (let y = 0; y < len; y++) {
            let values, key = keys[y];
            if (!producers.hasOwnProperty(key))
                continue;
            values = producers[key];
            if (!Array.isArray(values))
                continue;

            let strlen = lengthBytesUTF8(key);
            data.writeULEB128(strlen);
            data.writeUTF8Bytes(key);
            let xlen = values.length;
            data.writeULEB128(xlen);
            for (let x = 0; x < xlen; x++) {
                let value = values[x];
                if (typeof value == "string") {
                    let strlen = lengthBytesUTF8(value);
                    data.writeULEB128(strlen);
                    data.writeUTF8Bytes(value);
                } else if (typeof value == "object" && value !== null) {
                    if (typeof value.value !== "string") {
                        throw TypeError(".value is a required field");
                    }
                    let strlen = lengthBytesUTF8(value.value);
                    data.writeULEB128(strlen);
                    data.writeUTF8Bytes(value.value);
                    if (typeof value.version == "string") {
                        let strlen = lengthBytesUTF8(value.version);
                        data.writeULEB128(strlen);
                        data.writeUTF8Bytes(value.version);
                    }
                }
            }
        }

        return buf;
    }

    static decode(module, data, size) {

        let count = data.readULEB128();
        console.log("count: %d", count);
        let fields = {};
        for (let i = 0; i < count; i++) {
            let namesz = data.readULEB128();
            let fname = data.readUTF8Bytes(namesz);

            let valcnt = data.readULEB128();
            let values = [];
            for (let x = 0; x < valcnt; x++) {
                let verlen, valuesz = data.readULEB128();
                let value = data.readUTF8Bytes(valuesz);
                verlen = data.readULEB128(); // version string.
                if (verlen > 0) {
                    let version = data.readUTF8Bytes(verlen);
                    values.push({value: value, version: version});
                } else {
                    values.push(value);
                }
            }
            fields[fname] = values;
        }

        console.log(fields);

        let section = new WebAssemblyCustomSectionProducers(module);
        section.data = fields;
        module.producers = fields;
        return section;
    }
}


// Common Custom Section Name 

function canBeCustomNamed(obj) {
    if (obj === undefined || obj === null || typeof obj !== "object")
        return false;

    if (obj instanceof WasmFunction ||
        obj instanceof WasmLocal ||
        obj instanceof WasmMemory ||
        obj instanceof WasmGlobal ||
        obj instanceof WasmType ||
        obj instanceof WasmDataSegment ||
        obj instanceof WasmTable ||
        obj instanceof WasmTag ||
        obj instanceof WasmElementSegment ||
        obj instanceof WebAssemblyModule)
        return true;

    return false;
}

// https://webassembly.github.io/spec/core/appendix/custom.html
// https://github.com/WebAssembly/extended-name-section/blob/main/document/core/appendix/custom.rst
// 
// id   desc
// 0    module name     (wasm spec)
// 1    function names  (wasm spec)
// 2    local names     (wasm spec)
// 3    label names
// 4    type names
// 5    table names
// 6    memory names
// 7    global names
// 8    element segment names
// 9    data segment names
// 
// vec(indirectnameassoc)
// indirectnameassoc = idx namemap
// namemap = vec(nameassoc)
// nameassoc idx name

class WebAssemblyCustomSectionName extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "name");
    }

    encode() {
        let mod = this.module;
        let functions = mod.functions;
        let types = mod.types;
        let tables = mod.tables;
        let memory = mod.memory;
        let globals = mod.globals;
        let elementSegments = mod.elementSegments;
        let dataSegments = mod.dataSegments;
        let tags = mod.tags;

        let subsections = [];

        // precheck.

        if (typeof mod[__nsym] == "string") {
            let name = mod[__nsym];
            let secsz, strsz = lengthBytesUTF8(name);
            secsz = strsz;
            //secsz += lengthBytesUTF8(strsz);
            subsections.push({id: 0x00, name: name, strsz: strsz, size: secsz});
        }

        let nlocals = [];
        let nlabels = [];
        let hasNamedLocal = false;
        let hasNamedLabel = false;
        let items = [];
        let subsz = 0;
        let len = functions ? functions.length : 0;
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            let locals = func.locals;
            if (locals) {
                let names;
                let xlen = locals.length;
                for (let x = 0; x < xlen; x++) {
                    let local = locals[x];
                    if (typeof local[__nsym] != "string")
                        continue;
                    if (!names) {
                        names = [];
                        nlocals.push({funcidx: i, names: names});
                    }
                    names.push({idx: x, name: local[__nsym]})
                }
            }
            let labels = func.labels;
            if (labels) {
                let names;
                let xlen = labels.length;
                for (let x = 0; x < xlen; x++) {
                    let label = labels[x];
                    if (typeof label[__nsym] != "string")
                        continue;
                    if (!names) {
                        names = [];
                        nlabels.push({funcidx: i, names: names});
                    }
                    names.push({idx: x, name: label[__nsym]})
                }
            }

            if (typeof func[__nsym] != "string" || func[__nsym].length == 0)
                continue;
            let name = func[__nsym];
            subsz += lengthULEB128(i);  // funcidx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x01, items: items, size: subsz});
        }

        if (nlocals.length > 0) {

            let subsz = 0;
            let ylen = nlocals.length;
            for (let y = 0; y < ylen; y++) {
                let assoc = nlocals[y];
                let names = assoc.names;
                let xlen = names.length;
                subsz += lengthULEB128(assoc.funcidx);
                subsz += lengthULEB128(names.length);
                for (let x = 0; x < xlen; x++) {
                    let pair = names[x];
                    let strsz = lengthBytesUTF8(pair.name);
                    subsz += lengthULEB128(pair.idx);
                    subsz += lengthULEB128(strsz);
                    subsz += strsz;
                    pair.strsz = strsz;
                }
            }
            subsz += lengthULEB128(nlocals.length);
            subsections.push({id: 0x02, items: nlocals, size: subsz});

        } else {
            nlocals = undefined;
        }

        if (nlabels.length > 0) {

            let subsz = 0;
            let ylen = nlabels.length;
            for (let y = 0; y < ylen; y++) {
                let assoc = nlabels[y];
                let names = assoc.names;
                let xlen = names.length;
                subsz += lengthULEB128(assoc.funcidx);
                subsz += lengthULEB128(names.length);
                for (let x = 0; x < xlen; x++) {
                    let pair = names[x];
                    let strsz = lengthBytesUTF8(pair.name);
                    subsz += lengthULEB128(pair.idx);
                    subsz += lengthULEB128(strsz);
                    subsz += strsz;
                    pair.strsz = strsz;
                }
            }
            subsz += lengthULEB128(nlabels.length);
            subsections.push({id: 0x03, items: nlabels, size: subsz});

        } else {
            nlabels = undefined;
        }

        // types
        items = [];
        subsz = 0;
        len = types.length;
        for (let i = 0; i < len; i++) {
            let type = types[i];
            if (typeof type[__nsym] != "string" || type[__nsym].length == 0)
                continue;
            let name = type[__nsym];
            subsz += lengthULEB128(i);  // typeidx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x04, items: items, size: subsz});
        }

        // tables
        items = [];
        subsz = 0;
        len = tables ? tables.length : 0;
        for (let i = 0; i < len; i++) {
            let tbl = tables[i];
            if (typeof tbl[__nsym] != "string" || tbl[__nsym].length == 0)
                continue;
            let name = tbl[__nsym];
            subsz += lengthULEB128(i);  // tblidx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x05, items: items, size: subsz});
        }

        // memory/memories
        items = [];
        subsz = 0;
        len = memory ? memory.length : 0;
        for (let i = 0; i < len; i++) {
            let mem = memory[i];
            if (typeof mem[__nsym] != "string" || mem[__nsym].length == 0)
                continue;
            let name = mem[__nsym];
            subsz += lengthULEB128(i);  // memidx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x06, items: items, size: subsz});
        }

        // globals
        items = [];
        subsz = 0;
        len = globals ? globals.length : 0;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (typeof glob[__nsym] != "string" || glob[__nsym].length == 0)
                continue;
            let name = glob[__nsym];
            subsz += lengthULEB128(i);  // globalidx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x07, items: items, size: subsz});
        }

        // element segments
        items = [];
        subsz = 0;
        len = elementSegments ? elementSegments.length : 0;
        for (let i = 0; i < len; i++) {
            let segment = elementSegments[i];
            if (typeof segment[__nsym] != "string" || segment[__nsym].length == 0)
                continue;
            let name = segment[__nsym];
            subsz += lengthULEB128(i);  // element-idx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x08, items: items, size: subsz});
        }

        // data-segments
        items = [];
        subsz = 0;
        len = dataSegments ? dataSegments.length : 0;
        for (let i = 0; i < len; i++) {
            let segment = dataSegments[i];
            if (typeof segment[__nsym] != "string" || segment[__nsym].length == 0)
                continue;
            let name = segment[__nsym];
            subsz += lengthULEB128(i);  // data-segment-idx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x09, items: items, size: subsz});
        }

        // tags
        items = [];
        subsz = 0;
        len = tags ? tags.length : 0;
        for (let i = 0; i < len; i++) {
            let tag = tags[i];
            if (typeof tag[__nsym] != "string" || tag[__nsym].length == 0)
                continue;
            let name = tag[__nsym];
            subsz += lengthULEB128(i);  // tag-idx
            let strsz = lengthBytesUTF8(name);
            subsz += lengthULEB128(strsz);
            subsz += strsz;
            items.push({idx: i, name: name, strsz: strsz});
        }

        if (items.length > 0) {
            subsz += lengthULEB128(items.length);
            subsections.push({id: 0x0a, items: items, size: subsz});
        }

        // as we are checking each name index in order, then it appears in that order.

        let secsz = 0;
        let totsz = 0;
        len = subsections.length;
        totsz += len; // for all sub-section id(s)
        for (let i = 0; i < len; i++) {
            let subsec = subsections[i];
            totsz += lengthULEB128(subsec.size);
            totsz += subsec.size;
        }

        let strlen = lengthBytesUTF8("name");
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
        data.writeUTF8Bytes("name");


        let ylen = subsections.length;
        for (let y = 0; y < ylen; y++) {
            let subsec = subsections[y];
            if (subsec.id == 0x00) {
                data.writeUint8(subsec.id);
                data.writeULEB128(subsec.size);
                data.writeULEB128(subsec.strsz);
                data.writeUTF8Bytes(subsec.name);
            } else if (subsec.id == 0x02 || subsz.id == 0x03) {
                // indirect name map
                let items = subsec.items;
                let xlen = items.length;
                data.writeUint8(subsec.id);
                data.writeULEB128(subsec.size);
                data.writeULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let item = items[x];
                    let subpairs = item.names;
                    let zlen = subpairs.length;
                    data.writeULEB128(item.idx);
                    data.writeULEB128(zlen);
                    for (let x = 0; x < zlen; x++) {
                        let pair = subpairs[x];
                        data.writeULEB128(pair.idx);
                        data.writeULEB128(pair.strsz);
                        data.writeUTF8Bytes(pair.name);
                    }
                }
            } else {
                let items = subsec.items;
                let xlen = items.length;
                data.writeUint8(subsec.id);
                data.writeULEB128(subsec.size);
                data.writeULEB128(xlen);
                for (let x = 0; x < xlen; x++) {
                    let pair = items[x];
                    data.writeULEB128(pair.idx);
                    data.writeULEB128(pair.strsz);
                    data.writeUTF8Bytes(pair.name);
                }
            }
        }

        if (data.offset != buf.byteLength)
            console.error("computed name section length (real = %d vs. computed = %d)", data.offset, buf.byteLength);

        return buf;
    }

    static decode(module, data, size) {

        let results = {};
        let sectionIds = [];
        let end = data.offset + size;
        while (data.offset < end) {

            let id = data.readUint8();
            let subsz = data.readULEB128();
            let substart = data.offset;
            sectionIds.push(id);
            if (id == 0x01) { // function names: vec(nameassoc)

                //console.log("id %d size: %d", id, subsz);
                let functions = module.functions;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let func = functions[idx];
                    func[__nsym] = name;
                }

                //console.log(map);
                data.offset = substart + subsz;

            } else if (id == 0x00) { // module name

                let strlen = data.readULEB128();
                module[__nsym] = data.readUTF8Bytes(strlen);
                console.log("id %d size: %d", id, subsz);
                data.offset = substart + subsz;

            } else if (id == 0x02) { // local names: vec(indirectnameassoc)
                console.log("id %d size: %d", id, subsz);
                data.offset = substart + subsz;
            } else if (id == 0x03) { // label names: vec(indirectnameassoc)
                console.log("id %d size: %d", id, subsz);
                data.offset = substart + subsz;
            } else if (id == 0x04) { // type names: vec(nameassoc)
                
                console.log("id %d size: %d", id, subsz);

                let types = module.types;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let type = types[idx];
                    type[__nsym] = name;
                }

                data.offset = substart + subsz;

            } else if (id == 0x05) { // table names: vec(nameassoc)
                console.log("id %d size: %d", id, subsz);

                let tables = module.tables;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let tbl = tables[idx];
                    tbl[__nsym] = name;
                }

                data.offset = substart + subsz;
            } else if (id == 0x06) { // memory names: vec(nameassoc)
                console.log("id %d size: %d", id, subsz);

                let mems = module.memory;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let mem = mems[idx];
                    mem[__nsym] = name;
                }

                data.offset = substart + subsz;

            } else if (id == 0x07) { // global names: vec(nameassoc)

                let globals = module.globals;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let glob = globals[idx];
                    glob[__nsym] = name;
                }

                //console.log(map);
                data.offset = substart + subsz;

            } else if (id == 0x08) { // element segment names: vec(nameassoc)
               
                let segments = module.elementSegments;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let segment = segments[idx];
                    segment[__nsym] = name;
                }

                data.offset = substart + subsz;
            } else if (id == 0x09) { // data segment names

                let segments = module.dataSegments;
                let cnt = data.readULEB128();
                if (segments.length == 0)
                    cnt = 0; // skip

                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let segment = segments[idx];
                    segment[__nsym] = name;
                }

                data.offset = substart + subsz;
            } else if (id == 0x0a) { // tag names (11 according to spec, 10 from wat2wasm)

                let tags = module.tags;
                let cnt = data.readULEB128();
                if (tags.length == 0)
                    cnt = 0; // skip

                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let tag = tags[idx];
                    tag[__nsym] = name;
                }

                data.offset = substart + subsz;
            } else {
                console.warn("id %d size: %d", id, subsz);
                data.offset = substart + subsz;
            }
        }

        let section = new WebAssemblyCustomSectionName(module);
        section._sections = sectionIds;
        return section;
    }

    remove(obj) {
        delete obj[__nsym];
        this.markDirty();
    }

    rename(obj, newName) {
        obj[__nsym] = newName;
        this.markDirty();
    }

    isNamed(obj) {
        return typeof obj[__nsym] == "string";
    }
}

function isValidSectionType(type) {

}

function encodeWebAssemblyBinary(mod, options) {
    // check outputAction() in script.js for impl.
}

class WebAssemblyModule {

    constructor() {
        this._version = undefined;
    }

    /**
     * The WebAssemblyModule on which the method is called is considered to be the target, 
     * the object representation of wasmModule will be altered to fit into the target module.
     *
     * This action leaves the module provided in wasmModule argument in a unusable state; it will not encode
     * after this action is applied, encoding will throw a reference error. To mark this module as unusable
     * the tables for functions, types and more set to null.
     *
     * Its possible to merge for example merge within a single module as well, replacing a call to one function
     * with a call to another function from the same module.
     *
     * If type declartion with matching signature is found within the target module that is to be
     * used within the resulting object representation, opcode are change accordingly. If a type
     * declartion does not exists in target, its added.
     *
     * The `replacementMap` argument allows for references to be replaced at both sides;
     * for example a imported function in `wasmModule` can be replaced with a actual method from this.
     *
     * data-segments are inserted if there is no conflict for that address range, RELOC based data segments
     * could allow data-segments in the `wasmModule` to be merged at a non-conflict location.
     * 
     * @param  {[type]} wasmModule [description]
     * @param  {Map} replacementMap 
     * @return {[type]}            [description]
     */
    mergeWithModule(wasmModule, replacementMap) {

        if (wasmModule != this) {
            throw new ReferenceError("merge with self not allowed"); // use mergeWithModule(null, map) to merge within the module itself.
        }

        let funcmap = new Map();
        let memmap = new Map();
        let tblmap = new Map();
        let glbmap = new Map();
        let tagmap = new Map();

        if (wasmModule) {

            // merges the type table of the two modules.
            let oldtypes = []; // types to be replaced in wasmModule
            let newtypes = []; // replacment for above, index mapped; oldtypes[i] = newtypes[i]
            let addtypes = []; // types to be added to this

            let stypes = this.types;
            let otypes = wasmModule.types;
            let xlen = otypes.length;
            let ylen = stypes.length;
            for (let x = 0; x < xlen; x++) {
                let t1 = otypes[x];
                let anymatch = false;
                for (let y = 0; y < ylen; y++) {
                    let t2 = stypes[y];
                    if (WasmType.isEqual(t1, t2)) {
                        oldtypes.push(t1);
                        newtypes.push(t2);
                        anymatch = true;
                        break;
                    }
                }

                if (!anymatch) {
                    addtypes.push(t1);
                }
            }

            // replacing in tags.
            let tags = wasmModule.tags;
            if (tags) {
                let len = tags.length;
                for (let i = 0; i < len; i++) {
                    let tag = tags[i];
                    let idx = oldtypes.indexOf(tag.type);
                    if (idx !== -1) {
                        tag.type = newtypes[idx];
                    }
                }
            }

            // replacing in functions & opcode
            let functions = wasmModule.functions;
            if (functions) {
                let xlen = functions.length;
                for (let x = 0; x < xlen; x++) {
                    let func = functions[x];
                    let idx = oldtypes.indexOf(func.type);
                    if (idx !== -1) {
                        func.type = newtypes[idx];
                    }
                    if (func instanceof ImportedFunction)
                        continue;

                    let opcodes = func.opcodes;
                    let ylen = opcodes.length;
                    for (let y = 0; y < ylen; y++) {
                        let inst = opcodes[y];
                        switch (inst.opcode) {
                            case 0x02:  // block bt
                            case 0x03:  // loop bt
                            case 0x04:  // if bt
                            case 0x06:  // try bt
                            case 0x11:  // call_indirect
                            {
                                let type = inst.type;
                                let idx = oldtypes.indexOf(type);
                                if (idx !== -1) {
                                    inst.type = newtypes[idx];
                                }
                                break;
                            }
                        }
                    }
                }
            }

            xlen = addtypes.length;
            for (let x = 0; x < xlen; x++) {
                let type = addtypes[x];
                stypes.push(type);
            }

            // leave wasmModule unusable (won't encode any longer anyhow)
            wasmModule.types = null;
            

            // find in opcode:
            // - block
            // - loop
            // - if
            // - try
            // - call_indirect
            // 
            // replace in:
            // - WasmFunction | ImportedFunction
            // - WasmTag | ImportedTag
            // types
        }
        
        for (const [object, replacement] of replacementMap) {
            console.log(`${key} = ${value}`);

            // esnure not equal
            if (object === replacement) {
                throw new ReferenceError("replacement cannot be equal original");
            }

            if (typeof object != "object" || object === null || typeof replacement != "object" || object === null) {
                throw new TypeError("not an object");
            }

            if ((object instanceof ImportedFunction) || (object instanceof WasmFunction)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedFunction) || (replacement instanceof WasmFunction))) {
                    throw new TypeError("wrong type");
                }

                if (!WasmType.isEqual(object.type, replacement.type)) {
                    throw new TypeError("singature mismatch");
                }

                let target;
                if (this.functions.contains(object)) {
                    target = this;
                } else if (wasmModule && wasmModule.functions.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                funcmap.set(object, replacement);

                // find opcode:
                // - call       0x10
                // - ref.func   0xd2
                // replace in:
                // functions
                // imports (replace/remove as needed)
                // element-segments
            }

            if ((object instanceof ImportedMemory) || (object instanceof WasmMemory)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedMemory) || (replacement instanceof WasmMemory))) {
                    throw new TypeError("wrong type");
                }

                let target;
                if (this.memory.contains(object)) {
                    target = this;
                } else if (wasmModule.memory.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                memmap.set(object, replacement);

                // find in opcode: 
                // memory.size  0x3f
                // memory.grow  0x40
                // memory.copy  (0xfc << 8) | 10
                // memory.fill  (0xfc << 8) | 11 
                // memory.init  (0xfc << 8) | 8
                // 
                // replace in:
                // memory
                // imports (replace/remove as needed)
            }

            if ((object instanceof ImportedTable) || (object instanceof WasmTable)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedTable) || (replacement instanceof WasmTable))) {
                    throw new TypeError("wrong type");
                }

                if (object.reftype != replacement.reftype) {
                    throw new TypeError("reftype mismatch");
                }

                let target;
                if (this.tables.contains(object)) {
                    target = this;
                } else if (wasmModule.tables.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                tblmap.set(object, replacement);

                // find in opcode:
                // - call_indirect  0x11
                // - table.set      0x26
                // - table.get      0x25
                // - table.size     (0xfc << 8) | 16
                // - table.grow     (0xfc << 8) | 15
                // - table.init     (0xfc << 8) | 12
                // - table.copy     (0xfc << 8) | 14
                // - table.fill     (0xfc << 8) | 17
                //
                // replace in:
                // tables
                // imports (replace/remove as needed)
            }

            if ((object instanceof ImportedGlobal) || (object instanceof WasmGlobal)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedGlobal) || (replacement instanceof WasmGlobal))) {
                    throw new TypeError("wrong type");
                }

                let target;
                if (this.globals.contains(object)) {
                    target = this;
                } else if (wasmModule.globals.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                glbmap.set(object, replacement);

                // find:
                // - global.set     0x24
                // - global.get     0x23
                // 
                // (globals are also allowed in expr as in global.init, dataSegment.init)
                // 
                // replace in:
                // globals
                // imports (replace/remove as needed)
            }

            if ((object instanceof ImportedTag) || (object instanceof WasmTag)) {

                // ensure that replacement is of correct type
                if (!((replacement instanceof ImportedTag) || (replacement instanceof WasmTag))) {
                    throw new TypeError("wrong type");
                }

                if (!WasmType.isEqual(object.type, replacement.type)) {
                    throw new TypeError("singature mismatch");
                }

                let target;
                if (this.tags.contains(object)) {
                    target = this;
                } else if (wasmModule.tags.contains(object)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("func not defined");
                }

                tagmap.set(object, replacement);

                // find:
                // - throw      0x08
                // - catch      0x07
                // 
                // replace in:
                // tags
                // imports (replace/remove as needed)
            }

        }

        if (funcmap.size > 0) {

            // find opcode:
            // - call       0x10
            // - ref.func   0xd2
            // replace in:
            // functions
            // imports (replace/remove as needed)
            // element-segments

            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x10:  // call
                        case 0xd2:  // ref.func
                        {
                            let func = inst.func;
                            if (funcmap.has(func)) {
                                inst.func = funcmap.get(func);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.functions into this.functions
        if (wasmModule.functions && wasmModule.functions.length > 0) {

            let imports = this.imports;
            let src = wasmModule.functions;
            let len = src.length;
            let dst = this.functions;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let func = dst[x];
                if (!(func instanceof ImportedFunction)) {
                    first = y;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let func = src[i];
                if (dst.indexOf(func) !== -1)
                    continue;
                
                if (func instanceof ImportedFunction) {
                    dst.splice(first, 0, func);
                    first++;
                    imports.push(func);
                } else {
                    dst.push(func);
                }
            }
        }

        if (memmap.size > 0) {
            
            // find in opcode: 
            // memory.size  0x3f
            // memory.grow  0x40
            // memory.copy  (0xfc << 8) | 10
            // memory.fill  (0xfc << 8) | 11 
            // memory.init  (0xfc << 8) | 8
            // 
            // replace in:
            // memory
            // imports (replace/remove as needed)

            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                let idx = oldtypes.indexOf(func.type);
                if (idx !== -1) {
                    func.type = newtypes[idx];
                }
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x3f:
                        case 0x40:
                        case 0xfc0b:
                        case 0xfc08:
                        {
                            let mem = inst.mem;
                            if (memmap.has(mem)) {
                                inst.mem = memmap.get(mem);
                            }
                            break;
                        }
                        case 0xfc0a:
                        {
                            let mem = inst.mem1;
                            if (memmap.has(mem)) {
                                inst.mem1 = memmap.get(mem);
                            }

                            mem = inst.mem2;
                            if (memmap.has(mem)) {
                                inst.mem2 = memmap.get(mem);
                            }
                            break;
                        }
                    }
                }
            }

            for (const [oldmem, newmem] of memmap) {

                /*let target;
                let same = false;
                if (this.memory.contains(oldmem)) {
                    target = this;
                } else if (wasmModule.memory.contains(oldmem)) {
                    target = wasmModule;
                } else {
                    throw new ReferenceError("original not defined");
                }

                if (this.memory.contains(newmem)) {
                    same = (target === this);
                } else if (wasmModule.memory.contains(newmem)) {
                    same = (target === wasmModule);
                } else {
                    throw new ReferenceError("replacement not defined");
                }*/

                let memory = this.memory;
                let idx = memory.indexOf(newmem);

                if (idx == -1) {

                    if (newmem instanceof ImportedMemory) {
                        let len = memory.length;
                        let first = -1;
                        for (let i = 0; i < len; i++) {
                            let mem = memory[i];
                            if (!(mem instanceof ImportedMemory)) {
                                first = i;
                                break;
                            }
                        }

                        if (first === 0) {
                            memory.unshift(newmem);
                        } else {
                            memory.splice(first, 0, newmem);
                        }

                    } else {
                        memory.push(newmem);
                    }
                } else if (memory.indexOf(newmem, idx + 1) !== -1) {
                    throw new ReferenceError("mutiple references of memory"); // multiple references to same memory in same module, not allowed.
                }

                let target;
                idx = memory.indexOf(oldmem);
                if (idx !== -1) {
                    target = this;
                }

                if (!target) {
                    idx = wasmModule.memory.indexOf(oldmem);
                    if (idx !== -1)
                        target = wasmModule;
                }

                if (!target) {
                    throw new ReferenceError("original not defined");
                }

                target.memory.splice(idx, 1);
            }
        }

        // merge wasmModule.memory into this.memory
        if (wasmModule.memory && wasmModule.memory.length > 0) {

            let src = wasmModule.memory;
            let len = src.length;
            let dst = this.memory;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let mem = dst[x];
                if (!(mem instanceof ImportedMemory)) {
                    first = y;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let mem = src[i];
                if (dst.indexOf(mem) !== -1)
                    continue;
                
                if (mem instanceof ImportedMemory) {
                    dst.splice(first, 0, mem);
                    first++;
                } else {
                    dst.push(mem);
                }
            }
        }

        if (tblmap.size > 0) {

            // find in opcode:
            // - call_indirect  0x11
            // - table.set      0x26
            // - table.get      0x25
            // - table.size     (0xfc << 8) | 16
            // - table.grow     (0xfc << 8) | 15
            // - table.init     (0xfc << 8) | 12
            // - table.copy     (0xfc << 8) | 14
            // - table.fill     (0xfc << 8) | 17
            //
            // replace in:
            // tables
            // imports (replace/remove as needed)
            
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x11:      // call_indirect
                        case 0x25:      // table.get
                        case 0x26:      // table.set
                        case 0xfc0c:    // table.init
                        case 0xfc0f:    // table.grow
                        case 0xfc10:    // table.size
                        case 0xfc11:    // table.fill
                        {
                            let tbl = inst.table;
                            if (tblmap.has(tbl)) {
                                inst.table = tblmap.get(tbl);
                            }
                            break;
                        }
                        case 0xfc0e:    // table.copy
                        {
                            let tbl1 = inst.table1;
                            if (tblmap.has(tbl1)) {
                                inst.table1 = tblmap.get(tbl1);
                            }
                            // TODO: ensure that we can copy if tbl1 === tbl2
                            let tbl2 = inst.table2;
                            if (tblmap.has(tbl2)) {
                                inst.table2 = tblmap.get(tbl2);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.tables into this.tables
        if (wasmModule.tables && wasmModule.tables.length > 0) {

            let imports = this.imports;
            let src = wasmModule.tables;
            let len = src.length;
            let dst = this.tables;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let tbl = dst[x];
                if (!(tbl instanceof ImportedTable)) {
                    first = y;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let tbl = src[i];
                if (dst.indexOf(tbl) !== -1)
                    continue;
                
                if (tbl instanceof ImportedTable) {
                    dst.splice(first, 0, tbl);
                    first++;
                    imports.push(tbl);
                } else {
                    dst.push(tbl);
                }
            }
        }

        if (glbmap.size > 0) {

            // find:
            // - global.set     0x24
            // - global.get     0x23
            // 
            // (globals are also allowed in expr as in global.init, dataSegment.init)
            // 
            // replace in:
            // globals
            // imports (replace/remove as needed)
            
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (glbmap.has(glb)) {
                                inst.global = glbmap.get(glb);
                            }
                            break;
                        }
                    }
                }
            }

            let arr = [];
            xlen = globals.length;
            for (let x = 0; x < xlen; x++) {
                let glb = globals[i];
                if (glb instanceof ImportedGlobal) {
                    continue;
                }

                arr.push(glb.init);
            }

            xlen = dataSegments.length;
            for (let x = 0; x < xlen; x++) {
                let seg = dataSegments[i];
                arr.push(seg.inst.opcodes);
            }

            xlen = elementSegments.length;
            for (let x = 0; x < xlen; x++) {
                let seg = elementSegments[i];
                arr.push(seg.opcodes);
            }

            xlen = arr.length;
            for (let x = 0; x < xlen; x++) {
                let opcodes = arr[x];
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x23:  // global.get
                        case 0x24:  // global.set
                        {
                            let glb = inst.global;
                            if (glbmap.has(glb)) {
                                inst.global = glbmap.get(glb);
                            }
                            break;
                        }
                    }
                }
            }

        }

        // merge wasmModule.globals into this.globals
        if (wasmModule.globals && wasmModule.globals.length > 0) {

            let imports = this.imports;
            let src = wasmModule.globals;
            let len = src.length;
            let dst = this.globals;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let glob = dst[x];
                if (!(glob instanceof ImportedGlobal)) {
                    first = y;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let glob = src[i];
                if (dst.indexOf(glob) !== -1)
                    continue;
                
                if (glob instanceof ImportedGlobal) {
                    dst.splice(first, 0, glob);
                    first++;
                    imports.push(glob);
                } else {
                    dst.push(glob);
                }
            }
        }

        if (tagmap.size > 0) {
            
            // find:
            // - throw      0x08
            // - catch      0x07
            // 
            // replace in:
            // tags
            // imports (replace/remove as needed)
            
            let xlen = functions.length;
            for (let x = 0; x < xlen; x++) {
                let func = functions[x];
                if (func instanceof ImportedFunction)
                    continue;

                let opcodes = func.opcodes;
                let ylen = opcodes.length;
                for (let y = 0; y < ylen; y++) {
                    let inst = opcodes[y];
                    switch (inst.opcode) {
                        case 0x07:  // catch
                        case 0x08:  // throw
                        {
                            let tag = inst.tag;
                            if (tagmap.has(tag)) {
                                inst.tag = tagmap.get(tag);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // merge wasmModule.tags into this.tags
        if (wasmModule.tags && wasmModule.tags.length > 0) {

            let imports = this.imports;
            let src = wasmModule.tags;
            let len = src.length;
            let dst = this.tags;
            let ylen = dst.length;
            let first = 0;
            for (let x = 0; x < len; x++) {
                let tag = dst[x];
                if (!(tag instanceof ImportedTag)) {
                    first = y;
                    break;
                }
            }

            for (let x = 0; x < len; x++) {
                let tag = src[i];
                if (dst.indexOf(tag) !== -1)
                    continue;
                
                if (tag instanceof ImportedTag) {
                    dst.splice(first, 0, tag);
                    first++;
                    imports.push(tag);
                } else {
                    dst.push(tag);
                }
            }
        }

    }

    // types

    /**
     * Return type by the signature of what pull and push from/to the stack.
     * @param  {Array|Integer} pullv [description]
     * @param  {Array|Integer} pushv [description]
     * @return {WasmType}      The function type with the signature or null if no matching type was found.
     */
    typeByPullPush(pullv, pushv) {
        let types = this.types;
        let len = types.length;
        let argc = 0;
        let retc = 0;

        if (Array.isArray(pullv)) {

            if (pullv.length == 1) {
                pullv = pullv[0];
                argc = 1;
            } else if (pullv.length > 1) {
                argc = pullv.length;
            }

        } else if (Number.isInteger(pullv) && pullv != WA_TYPE_VOID) {
            argc = 1;
        }

        if (Array.isArray(pushv)) {

            if (pushv.length == 1) {
                pushv = pushv[0];
                retc = 1;
            } else if (pushv.length > 1) {
                retc = pushv.length;
            }

        } else if (Number.isInteger(pushv) && pushv != WA_TYPE_VOID) {
            retc = 1;
        }

        for (let i = 0; i < len; i++) {
            let type = types[i];
            if (argc != type.argc || retc != type.retc) {
                continue;
            }

            if (argc === 1) {

                if (pullv !== type.argv[0])
                    continue;

            } else if (argc != 0) {
                let match = true;
                for (let x = 0; x < argc; x++) {
                    if (pullv[x] != type.argv[x]) {
                        match = false;
                        break;
                    }
                }

                if (!match)
                    continue;
            }

            if (retc === 1) {

                if (pushv !== type.retv[0])
                    continue;

            } else if (retc != 0) {
                let match = true;
                for (let x = 0; x < retc; x++) {
                    if (pushv[x] != type.retv[x]) {
                        match = false;
                        break;
                    }
                }

                if (!match)
                    continue;
            }

            // if we reached here it matching.
            return type;
        }

        return null;
    }

    getOrCreateType(pullv, pushv) {
        
        let type = this.typeByPullPush(pullv, pushv);
        if (type)
            return type;

        let argc = 0;
        let argv = null;
        let retc = 0;
        let retv = null;

        if (Array.isArray(pullv) && pullv.length > 0) {

            argc = pullv.length;
            argv = pullv.slice(); // copy

        } else if (Number.isInteger(pullv) && pullv != WA_TYPE_VOID) {
            argc = 1;
            argv = [pullv];
        }

        if (Array.isArray(pushv) && pushv.length > 1) {

            retc = pushv.length;
            retv = pushv.slice(); // copy

        } else if (Number.isInteger(pushv) && pushv != WA_TYPE_VOID) {
            retc = 1;
            retv = [pushv];
        }

        type = new WasmType();
        type.argc = argc;
        type.argv = argv;
        type.retc = retc;
        type.retv = retv;
        type.typeidx = this.types.length; // TODO: remove me!
        type.count = 0;
        this.types.push(type);

        return type;
    }

    // imports
    
    appendImport(imp) {

        if (typeof imp.module != "string" || typeof imp.name != "string" || imp.module.length == 0 || imp.module.length == 0)
            throw new TypeError("invalid name");

        // check name or reference conflict
        let imports = this.imports;
        let len = imports.length;
        for (let i = 0; i < len; i++) {
            let other = imports[i];
            if (other == imp || (other.module == imp.module && other.name == imp.name)) {
                throw new ReferenceError("import already exist");
            }
        }

        if (imp instanceof ImportedFunction) {

            let functions = this.functions;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let func = functions[i];
                if (func instanceof ImportedFunction)
                    continue;
                
                last = i;
                break;
            }

            if (last == 0) {
                functions.unshift(imp);
            } else {
                functions.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedGlobal) {

            let globals = this.globals;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let glob = globals[i];
                if (glob instanceof ImportedGlobal)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                globals.unshift(imp);
            } else {
                globals.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedMemory) {

            let memory = this.memory;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let mem = memory[i];
                if (mem instanceof ImportedTag)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                memory.unshift(imp);
            } else {
                memory.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedTag) {

            let tags = this.tags;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let tag = tags[i];
                if (tag instanceof ImportedTag)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                tags.unshift(imp);
            } else {
                tags.splice(last + 1, 0, imp);
            }

        } else if(imp instanceof ImportedTable) {

            let tables = this.tables;
            let last, len = 0;
            for (let i = 0; i < len; i++) {
                let tbl = tables[i];
                if (tbl instanceof ImportedTable)
                    continue;

                last = i;
                break;
            }

            if (last == 0) {
                tables.unshift(imp);
            } else {
                tables.splice(last + 1, 0, imp);
            }

        } else {
            throw new TypeError("invalid type");
        }

        imports.push(imp);
    }

    // globals

    /**
     * 
     * @param {String} name
     * @param {String} module Optional. If specified the search is explicity done for a ImportedGlobal
     * @returns {WasmGlobal|ImportedGlobal}
     */
    getGlobalByName(name, module) {
        /*if (!this.names || !this.names.globals)
            throw TypeError("module must export the custom name section");
        let names = this.names.globals;
        let globals = this.globals;*/

        if (typeof name != "string")
            throw new TypeError("name must be string");

        if (typeof module == "string" && module.length > 0) {
            let imports = this.imports;
            let len = imports.length;
            let results = [];
            for (let i = 0; i < len; i++) {
                let imp = imports[i];
                if (imp.name == name && imp.module == module) {
                    return imp;
                }
            }

            return null;
        }

        let globals = this.globals;
        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (glob[__nsym] == name) {
                return glob;
            }
        }

        let imports = this.imports;
        len = imports.length;
        for (let i = 0; i < len; i++) {
            let imp = imports[i];
            if ((imp instanceof ImportedGlobal) && imp.name == name) {
                return imp;
            }
        }
        let exported = this.exports;
        len = exported.length;
        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            if (exp instanceof ExportedGlobal && exp.name == name) {
                return exp.global;
            }
        }

        // WebAssembly by itself has no internal need for globals if they are not imported/exported
        
        return null;
    }

    replaceGlobal(oldGlobal, newGlobal, byAddress) {

        byAddress = (byAddress === true);
        let gvalues = [];
        let oldIsImport = false;
        let isSameType = false;
        let firstInvalid = -1;
        let firstNonImport = 0;
        let newIndex = -1;
        let globals = this.globals;
        let len = globals.length;
        for (let i = 0; i < len; i++) {
            let glob = globals[i];
            if (glob instanceof WasmGlobal) {
                firstNonImport = i;
                break;
            }
        }

        if (globals.indexOf(newGlobal) !== -1)
            throw new ReferenceError("merging globals not implemented");

        if (oldGlobal instanceof ImportedGlobal)
            byAddress = false;

        if ((oldGlobal instanceof ImportedGlobal && newGlobal instanceof ImportedGlobal) || (oldGlobal instanceof WasmGlobal && newGlobal instanceof WasmGlobal))
            isSameType = true;

        if (isSameType) {
            let idx = globals.indexOf(oldGlobal);
            globals[idx] = newGlobal;
        } else {
            
            let idx = globals.indexOf(oldGlobal);
            globals.splice(idx, 1);

            if (newGlobal instanceof ImportedGlobal) {
                let firstNonImport = 0;
                let len = globals.length;
                for (let i = 0; i < len; i++) {
                    let glob = globals[i];
                    if (!(glob instanceof ImportedGlobal)) {
                        firstNonImport = i;
                        break;
                    }
                }
                globals.splice(firstNonImport, 0, newGlobal);
            } else {
                globals.push(newGlobal);
            }
        }
        
        let rawValue;
        
        if (oldGlobal.init.length == 2 && oldGlobal.init[0].opcode == 0x41 && oldGlobal.init[1].opcode == 0x0B) {
            rawValue = oldGlobal.init[0].value;
        } else {
            throw new TypeError("globals initial value unsupported");
        }

        let start = 0;
        let imports = this.imports;
        len = imports.length;
        for (let i = 0; i < len; i++) {
            let imp = imports[i];
            if (imp instanceof ImportedFunction) {
                start++;
            }
        }

        let functions = this.functions;
        let ylen = functions.length;
        for (let y = start; y < ylen; y++) {
            let func = functions[y];
            let opcodes = func.opcodes;
            let xlen = opcodes.length;
            let xend = xlen - 1;
            let dirty = false;
            let last = null;
            for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
                let op = opcodes[x];
                if (op.opcode == 0x23 || op.opcode == 0x24) {

                    if (op.global == oldGlobal) {
                        op.global = newGlobal;
                        op.x = newIndex;
                        dirty = true;
                    }
                } else if (byAddress === true && op.opcode == 0x41) { // i32.const
                    let val = op.value;
                    let idx = gvalues.indexOf(val);
                    if (val == rawValue) {
                        let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
                        opcodes[x] = inst;
                        dirty = true;
                    } else if (val == 0 && x < xlen - 1) {
                        let peek = opcodes[x + 1];
                        if (peek.opcode == 0x28 && peek.offset == rawValue) {
                            let inst = {opcode: 0x23, global: newGlobal, x: newIndex};
                            opcodes[x] = inst;
                            opcodes.splice(x + 1, 1);
                            xlen--;
                            dirty = true;
                        } else if (peek.opcode == 0x36 && peek.offset == rawValue) {
                            let inst = {opcode: 0x24, global: newGlobal, x: newIndex};
                            opcodes[x] = inst;
                            opcodes.splice(x + 1, 1);
                            xlen--;
                            dirty = true;
                        }
                    }
                }
            }

            if (dirty)
                func._opcodeDirty = true;
        }

        // as replacing globals basically might shift the index in which its arrange simply mark the whole
        // code section as dirty..
        this.findSection(SECTION_TYPE_CODE).markDirty();

        return true;

        // marks every function that uses a global defined after the replaced one as dirty to force update.
        if (firstInvalid !== -1) {
            let functions = this.functions;
            let ylen = functions.length;
            for (let y = start; y < ylen; y++) {
                let func = functions[y];
                if (func._opcodeDirty)
                    continue;
                let dirty = false;
                let opcodes = func.opcodes;
                let xlen = opcodes.length;
                for (let x = 0; x < xlen; x++) { // do get opcodes.length to local as handlers might alter opcode around them.
                    let op = opcodes[x];
                    if (op.opcode == 0x23 || op.opcode == 0x24) {
                        let idx = op.x;
                        if (op.x >= firstInvalid) {
                            dirty = true;
                            break;
                        }
                    }
                }

                if (dirty)
                    func._opcodeDirty = true;
            }
        }

        return true;
    }

    // exports

    appendExport(name, value) {

        if (!((value instanceof WasmGlobal) || (value instanceof WasmFunction) || (value instanceof WasmMemory) || (value instanceof ExportedTable))) {
            throw TypeError("invalid type for export");
        }

        if (value instanceof WasmGlobal) {

            let items = this.exports;
            let len = items.length;
            for (let i = 0; i < len; i++) {
                let item = items[i];
                if (item.name == name) {
                    throw new ReferenceError("name already declared");
                } else if (item.global == value) {
                    throw new ReferenceError("value already exported");
                }
            }

            let globals = this.globals;
            if (globals.indexOf(value) == -1) {
                globals.push(value);
            }

            let exp = new ExportedGlobal();
            exp.name = name;
            exp.global = value;
            items.push(exp);

        } else if (value instanceof WasmFunction) {

            let items = this.exports;
            let len = items.length;
            for (let i = 0; i < len; i++) {
                let item = items[i];
                if (item.name == name) {
                    throw new ReferenceError("name already declared");
                } else if (item.function == value) {
                    throw new ReferenceError("value already exported");
                }
            }

            let functions = this.functions;
            if (functions.indexOf(value) == -1) {
                functions.push(value);
            }

            let exp = new ExportedFunction();
            exp.name = name;
            exp.function = value;
            items.push(exp);

        } else if (value instanceof WasmMemory) {

            let items = this.exports;
            let len = items.length;
            for (let i = 0; i < len; i++) {
                let item = items[i];
                if (item.name == name) {
                    throw new ReferenceError("name already declared");
                } else if (item.memory == value) {
                    throw new ReferenceError("value already exported");
                }
            }

            let memory = this.memory;
            if (memory.indexOf(value) == -1) {
                memory.push(value);
            }

            let exp = new ExportedMemory();
            exp.name = name;
            exp.memory = value;
            items.push(exp);

        } else if (value instanceof ExportedTable) {

            let items = this.exports;
            let len = items.length;
            for (let i = 0; i < len; i++) {
                let item = items[i];
                if (item.name == name) {
                    throw new ReferenceError("name already declared");
                } else if (item.table == value) {
                    throw new ReferenceError("value already exported");
                }
            }

        } 

    }

    removeExportByName(name) {

    }

    removeExportByRef(obj) {
        // there is nothing in the spec which prevents a object to be exported more than once..
        if (obj instanceof WasmFunction) {

            let matched = [];
            let exported = this.exports;
            let len = exported.length;
            for (let i = 0; i < len; i++) {
                let exp = exported[i];
                if (!(exp instanceof ExportedFunction))
                    continue;
                if (exp.function == obj) {
                    matched.push(i);
                }
            }

            // removes in reverse..
            for (let i = matched.length - 1; i >= 0; i--) {
                let idx = matched[i];
                exported.splice(idx, 1);
            }

            return matched.length;

        } else if (obj instanceof WasmGlobal) {

            let matched = [];
            let exported = this.exports;
            let len = exported.length;
            for (let i = 0; i < len; i++) {
                let exp = exported[i];
                if (!(exp instanceof ExportedGlobal))
                    continue;
                if (exp.global == obj) {
                    matched.push(i);
                }
            }

            // removes in reverse..
            for (let i = matched.length - 1; i >= 0; i--) {
                let idx = matched[i];
                exported.splice(idx, 1);
            }

            return matched.length;

        } else if (obj instanceof WasmTable) {

            let matched = [];
            let exported = this.exports;
            let len = exported.length;
            for (let i = 0; i < len; i++) {
                let exp = exported[i];
                if (!(exp instanceof ExportedTable))
                    continue;
                if (exp.table == obj) {
                    matched.push(i);
                }
            }

            // removes in reverse..
            for (let i = matched.length - 1; i >= 0; i--) {
                let idx = matched[i];
                exported.splice(idx, 1);
            }

            return matched.length;

        } else if (obj instanceof WasmMemory) {

            let matched = [];
            let exported = this.exports;
            let len = exported.length;
            for (let i = 0; i < len; i++) {
                let exp = exported[i];
                if (!(exp instanceof ExportedMemory))
                    continue;
                if (exp.memory == obj) {
                    matched.push(i);
                }
            }

            // removes in reverse..
            for (let i = matched.length - 1; i >= 0; i--) {
                let idx = matched[i];
                exported.splice(idx, 1);
            }

            return matched.length;
        }


        return 0;
    }

    findExportDefByObject(obj) {
        let exps = this.exports;
        let len = exps.length;
        for (let i = 0; i < len; i++) {
            let exp = exps[i];
            if (exp instanceof ExportedFunction && exp.function === obj) {
                return exp;
            } else if (exp instanceof ExportedGlobal && exp.global === obj) {
                return exp;
            } else if (exp instanceof ExportedMemory && exp.memory === obj) {
                return exp;
            } else if (exp instanceof ExportedTable && exp.table === obj) {
                return exp;
            }
        }
    
        return undefined;
    }

    findAllExportDefByObject(obj) {
        let results = [];
        let exps = this.exports;
        let len = exps.length;
        for (let i = 0; i < len; i++) {
            let exp = exps[i];
            if (exp instanceof ExportedFunction && exp.function === obj) {
                results.push(exp);
            } else if (exp instanceof ExportedGlobal && exp.global === obj) {
                results.push(exp);
            } else if (exp instanceof ExportedMemory && exp.memory === obj) {
                results.push(exp);
            } else if (exp instanceof ExportedTable && exp.table === obj) {
                results.push(exp);
            }
        }
    
        return results;
    }

    // Custom Sections

    // getCustomSectionsByName(name)
    customSections(name) {
        let results = [];
        const sections = this.sections;
        let len = sections.length;
        for (let i = 0; i < len; i++) {
            let section = sections[i];
            if (section.type == 0x00 && section.name == name) {
                results.push(section);
            }
        }
    }

    // getSectionByType(type)
    
    findSection(search) {

        if (typeof search == "string") {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && sec.name == search) {
                    return sec;
                }
            }

        } else if (Number.isInteger(search)){

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == search) {
                    return sec;
                }
            }

        }

        return null;
    }

    findAllSections(search) {

        let results = [];

        if (typeof search == "string") {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && sec.name == search) {
                    results.push(sec);
                }
            }

        } else if (typeof search == "regexp") {

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == 0x00 && search.exec(sec.name)) {
                    results.push(sec);
                }
            }

        } else if (Number.isInteger(search)){

            let sections = this.sections;
            let len = sections.length;
            for (let i = 0; i < len; i++) {
                let sec = sections[i];
                if (sec.type == search) {
                    results.push(sec);
                }
            }

        } else {
            throw new TypeError("search argument is invalid");
        }

        return results;
    }

    // memory & data segments

    /**
     * Computes and constructs a ArrayBuffer which built up like the initial memory of the module. Which makes
     * access and mutation at addresses possible. If mutable is set to true, the data segments of the module is also
     * 
     * @todo add support for complex data-segment setup, where data-segments might have variable location and might be setup to different memory instances.
     * 
     * @param  {WasmMemory|ImportedMemory} memory The memory for which to compute the initial memory.
     * @param  {Boolean} mutable [description]
     * @return {ArrayBuffer}         [description]
     */
    computeInitialMemory(memory, mutable) {
        mutable = (mutable === true);

        if (mutable && this._mutableDataSegments) {
            return this._mutableDataSegments;
        }

        let segments = this.dataSegments
        let len = segments.length;
        let min = 0xFFFFFFFF;   // wasm-32 max
        let max = 0;
        for (let i = 0; i < len; i++) {
            let segment = segments[i];
            if (segment.memory !== memory)
                continue;
            let val = segment.inst.opcodes[0].value;
            let end = val + segment.size;
            if (end > max) {
                max = end;
            }
            if (val < min) {
                min = val;
            }
        }

        let mem = new Uint8Array(max);

        for (let i = 0; i < len; i++) {
            let segment = segments[i];
            let off = segment.inst.opcodes[0].value;
            let buf = segment._buffer;
            u8_memcpy(buf, 0, buf.byteLength, mem, off);
            if (mutable) {
                segment._mutableDataBuffer = mem;
                segment._mutableDataOffset = off;
            }
        }

        if (mutable) {
            this._mutableDataSegments = mem;
        }

        return mem;
    }

    computeInitialMemoryMaxAddress() {
        let segments = this.dataSegments
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
            if (val < min) {
                min  = val;
            }
        }

        return max;
        //return {min: min: max: max};
    }

    getDataSegmentByName(name) {

        let dataSegments = this.dataSegments;
        let len = dataSegments.length;
        for (let i = 0; i < len; i++) {
            let segment = dataSegments[i];
            if (typeof segment[__nsym] != "string")
                continue
            if (segment[__nsym] === name) {
                return segment;
            }
        }

        return null;
    }
    
    /**
     * Mutates all references to oldMemory to be instead reference newMemory.
     * @param  {oldMemory} oldMemory [description]
     * @param  {newMemory} newMemory [description]
     * @return {[type]}           [description]
     */
    replaceMemory(oldMemory, newMemory) {

    }

    // Functions

    getFunctionByName(name, checkExports) {

        checkExports = (checkExports === true);
        let functions = this.functions;
        let len = functions.length
        for (let i = 0; i < len; i++) {
            let func = functions[i];
            if (typeof func[__nsym] == "string" && func[__nsym] == name) {
                return func;
            }
        }

        if (!checkExports)
            return null;

        let exported = this.exports;
        len = exported.length
        for (let i = 0; i < len; i++) {
            let exp = exported[i];
            if (!(exp instanceof ExportedFunction)) {
                continue;
            }
            if (exp.name == name) {
                return exp.function;
            }
        }

        return null;
    }

    // Table utilities
    
    getTableByName(name) {

    }

    // Support for common custom sections

    /**
     * Adopts names from the exports if a name not already given to that value.
     */
    adoptNamesFromExports() {

    }

    // assemble binary

    encode(options) {
        let exported = [];
        let excludeSections = [];
        let sections = this.sections;
        let len = sections.length;
        let buffers = [];

        if (Array.isArray(options.exclude)) {
            let exclude = options.exclude;
            let ylen = sections.length;
            let xlen = exclude.length;

            for (let y = 0; y < ylen; y++) {
                let sec = sections[y];
                let match = false;
                for (let x = 0; x < xlen; x++) {
                    let p = exclude[x];
                    if (p.type != sec.type) {
                        continue;
                    } else {
                        if (p.type === 0x00) {

                            if (typeof p.name == "string" && p.name == sec.name) {
                                match = true;
                                break;
                            }

                        } else {
                            match = true;
                            break;
                        }
                    }
                }

                if (match) {
                    excludeSections.push(sec);
                }
            }
        }

        let header = new Uint8Array(8);
        buffers.push(header.buffer);
        header = new DataView(header.buffer);
        header.setUint32(0, 0x6D736100, true);
        header.setUint32(4, this._version, true);

        prepareModuleEncode(this);

        for (let i = 0;i < len;i++) {
            let section = sections[i];
            let excluded = excludeSections.indexOf(section) !== -1;
            let isExported = exported[i];
            let type = section.type;
            if (excluded) {
                //
                if (type == SECTION_TYPE_DATA) {
                    let buf = new Uint8Array(3);
                    buf[0] = SECTION_TYPE_DATA;
                    buf[1] = 1;
                    buf[2] = 0;
                    buffers.push(buf.buffer);
                } else {
                    continue;
                }
            } else if (section instanceof WebAssemblySection) {
                let sub = section.encode({});
                if (Array.isArray(sub)) {
                    let xlen = sub.length;
                    for (let x = 0; x < xlen; x++) {
                        buffers.push(sub[x]);
                    }
                } else {
                    buffers.push(sub);
                }
            } else {
                console.log("section %o not handled!", section);
                /*let end = section.dataOffset + section.size;
                let sub = moduleBuffer.slice(section.offset, end);
                buffers.push(sub);*/
            }
        }


        return buffers;
    }

    //

    static disassembleWebAssemblyBinary(buffer, options) {

    }
}

WebAssemblyModule.Name = __nsym;

// https://webassembly.github.io/spec/core/binary/modules.html#binary-version
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
function parseWebAssemblyBinary(buf) {
    let data = new ByteArray(buf);
    let magic = data.readUint32();
    let version = data.readUint32();

    data.offset = 0;
    if (data.readUint8() != 0x00 || data.readUint8() != 0x61 || data.readUint8() != 0x73 || data.readUint8() != 0x6D) {
        console.error("magic is not equal to '\\0asm'");
        return false;
    }

    console.log("magic: %s version: %d", magic.toString(16), version);

    data.offset = 8;
    let end = buf.byteLength;

    let results = [];
    let chunks = [];

    while (data.offset < end) {
        let start = data.offset;
        let type = data.readUint8();
        let tmp = data.offset;
        let size = data.readULEB128();
        let name = undefined;
        tmp = data.offset - tmp;
        //console.log("type: %d (%s) size: %d offset: %d data-offset: %d", type, sectionnames[type], size, start, data.offset);
        let chunk = {type: type, name: undefined, size: size, offset: start, dataOffset: data.offset};
        chunks.push(chunk);
        if (type == 0x00) {
            if (size === 0) {
                console.warn("invalid trailing chunk at %d", data.offset);
                break;
            }
            let tmp = data.offset;
            let nlen = data.readUint8();
            chunk.name = data.readUTF8Bytes(nlen);
            chunk.dataOffset = data.offset;
            chunk.size = chunk.size - (data.offset - tmp);
            data.offset = tmp;
        } else if (type > 0x0B) {
            console.warn("section type: %d (%s) not handled", type, sectionnames[type]);
        }

        // wasm binaries sometimes have trailing non used bytes.
        data.offset += size;
    }

    // by handling the section in a certain order:
    // 1. type section
    // 2. func section
    // 3. global section
    // 3. export section
    // 4. import section
    // then we can actually lookup functions and globals in export/import
    
    let filtered = [];
    let dwarfsec = [];
    let cnt = chunks.length;
    for (let i = 0; i < cnt; i++) {
        let sec = chunks[i];
        sec.index = i;
        if (sec.type != SECTION_TYPE_CUSTOM) {
            filtered.push(sec);
            continue;
        }

        let name = sec.name;
        if (name == ".debug_info" || name == ".debug_loc" || name == ".debug_ranges" || name == ".debug_abbrev" || name == ".debug_line" || name == ".debug_str") {
            dwarfsec.push(sec);
        } else {
            filtered.push(sec);
        }
    }

    let impfncnt = 0;
    let funcvec;
    let mod = new WebAssemblyModule();
    mod._version = version;
    mod.dataSegments = [];
    mod.elementSegments = [];
    mod.exports = [];
    mod.functions = [];
    mod.globals = [];
    mod.imports = [];
    mod.memory = [];
    mod.tables = [];
    mod.types = [];
    cnt = filtered.length;
    for (let i = 0; i < cnt; i++) {
        let chunk = filtered[i];
        let type = chunk.type;
        let size = chunk.size;
        data.offset = chunk.dataOffset;
        switch (type) {
            case 0x01:  // type
            {
                let sec = WebAssemblyFuncTypeSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x02:  // import
            {
                let sec = WebAssemblyImportSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //mod.imports = decodeImportSection(data, size, mod);
                //impfncnt = mod.functions ? mod.functions.length : 0;
                break;
            }
            case 0x03:  // function
            {
                let sec = WebAssemblyFunctionSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeFuncSection(data, size, mod);
                break;
            }
            case 0x04:  // table
            {
                let sec = WebAssemblyTableSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeTableSection(data, size, mod);
                break;
            }
            case 0x05:  // memory
            {
                let sec = WebAssemblyMemorySection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeMemorySection(data, size, mod);
                break;
            }
            case 0x06:  // global
            {
                let sec = WebAssemblyGlobalSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeGlobalSection(data, size, mod);
                break;
            }
            case 0x07:  // export
            {
                let sec = WebAssemblyExportSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeExportSection(data, size, mod);
                break;
            }
            case 0x08:  // start
            {
                let sec = WebAssemblyStartSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeStartSection(data, size, mod);
                break;
            }
            case 0x09:  // element
            {
                let sec = WebAssemblyElementSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeElementSection(data, size, mod);
                break;
            }
            case 0x0A:  // code
            {
                let sec = WebAssemblyCodeSection.decode(mod, data, size);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                //decodeCodeSection(data, size, mod, impfncnt);
                break;
            }
            case 0x0B:  // data
            {
                let sec = WebAssemblyDataSection.decode(mod, data, size);
                //mod.dataSegments = decodeDataSection(data, size, mod);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0C:  // data-count
            {
                let sec = WebAssemblyDataCountSection.decode(mod, data, size);
                //mod.dataSegments = decodeDataSection(data, size, mod);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x0d:  // data-count
            {
                let sec = WebAssemblyTagSection.decode(mod, data, size);
                //mod.dataSegments = decodeDataSection(data, size, mod);
                chunks[chunk.index] = sec;
                sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                break;
            }
            case 0x00: // custom
            {
                let sec;
                let name = chunk.name;
                switch (name) {
                    case 'producers':
                        sec = WebAssemblyCustomSectionProducers.decode(mod, data, size);
                        chunks[chunk.index] = sec;
                        mod.producers = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'name':
                        sec = WebAssemblyCustomSectionName.decode(mod, data, size);
                        chunks[chunk.index] = sec;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'dylink.0':
                        sec = WebAssemblyCustomSectionDylink0.decode(mod, data, size);
                        chunks[chunk.index] = sec;
                        mod.dylink0 = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    case 'target_features':
                        sec = WebAssemblyCustomSectionTargetFeatures.decode(mod, data, size);
                        chunks[chunk.index] = sec;
                        mod.features = sec.data;
                        chunk.data = sec.data;
                        sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                        break;
                    default:
                        break;  // do nothing;
                }
                break;
            }
            default:
                continue;
        }
    }

    if (dwarfsec.length > 0 && typeof decodeDWARFDebugSections == "function") {
        //let ret = decodeDWARFDebugSections(data, dwarfsec);
    }

    mod.sections = chunks;

    return mod;
}
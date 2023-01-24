
// https://coinexsmartchain.medium.com/wasm-introduction-part-1-binary-format-57895d851580
// https://en.wikipedia.org/wiki/LEB128
// https://nielsleenheer.com/articles/2017/the-case-for-console-hex/
// https://webassembly.github.io/spec/core/appendix/custom.html#binary-indirectnamemap
// https://webassembly.github.io/spec/core/appendix/index-instructions.html

// nexts steps:
// 1. manipulate globals; requires globals to be objectified rather than index referenced in instructions etc.
// 2. refactor into class based approach sectionclass.decode/encode etc each with section based logics such as insert/remove objects.

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

function functype_toString(functype) {
    let arg, ret;
    let argc = functype.argc;
    if (argc == 0) {
        arg = "void";
    } else if (argc == 1){
        arg = type_name(functype.argv[0]);
    } else {
        let argv = functype.argv;
        arg = [];
        for (let x = 0; x < argc; x++) {
            arg.push(type_name(argv[x]));
        }
    }

    let retc = functype.retc;
    if (retc == 0) {
        ret = "void";
    } else if (retc == 1){
        ret = type_name(functype.retv[0]);
    } else {
        let retv = functype.retv;
        ret = [];
        for (let x = 0; x < retc; x++) {
            ret.push(type_name(retv[x]));
        }
    }

    let str = "";
    if (typeof ret == "string") {
        str += ret;
    } else {
        str += '{ ' + ret.join(', ') + ' }';
    }
    str += '\x20(';
    if (typeof arg == "string") {
        str += arg;
    } else {
        str += arg.join(', ');
    }
    str += ")";
    return str;
}

function dump_functypes(functypes) {

    let ylen = functypes.length;
    for (let y = 0; y < ylen; y++) {
        let fstr = functype_toString(functypes[y]);
        console.log("[%d]: %s", y, fstr);

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

    constructor(opcode, funcidx) {
        super(opcode);
        this.funcidx = funcidx;
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

    constructor(opcode, tableidx, typeidx) {
        super(opcode);
        this.tableidx = tableidx;
        this.typeidx = typeidx;
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

function byteCodeComputeByteLength(opcodes, genloc) {
    genloc = genloc === true;
    let sz = 0;
    
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
                } else if (inst.type instanceof FuncType) {
                    if (!Number.isInteger(inst.type.typeidx))
                        throw TypeError("FuncType.typeidx must be set before encode");
                    let typeidx = inst.type.typeidx;
                    sz += lengthSLEB128(typeidx);
                }
                break;
            }
            case 0x05: // else <in2*> 0x0B
                sz += 1;
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
                sz += 1;
                sz += lengthULEB128(inst.funcidx);
                break;
            case 0x11: // call_indirect
                sz += 1;
                sz += lengthULEB128(inst.tableidx);
                sz += lengthULEB128(inst.typeidx);
                //opcodes.push({opcode: op_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()});
                break;
            case 0x41: // i32.const
                sz += 1;
                sz += lengthSLEB128(inst.value);
                break;
            case 0x42: // i64.const
                sz += 1;
                sz += lengthULEB128(inst.value);
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
                sz += 1;
                sz += lengthULEB128(inst.x);
                break;
            case 0x21: // local.set
                sz += 1;
                sz += lengthULEB128(inst.x);
                break;
            case 0x22: // local.tee
                sz += 1;
                sz += lengthULEB128(inst.x);
                break;
            case 0x23: // global.get
            {
                sz += 1;
                sz += lengthULEB128(inst.global.index);
                break;
            }
            case 0x24: // global.set
            {
                sz += 1;
                sz += lengthULEB128(inst.global.index);
                break;
            }
            case 0x25: // table.get
                sz += 1;
                sz += lengthULEB128(inst.tableidx);
                break;
            case 0x26: // table.set
                sz += 1;
                sz += lengthULEB128(inst.tableidx);
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
                sz += 1;
                sz += lengthULEB128(inst.funcidx);
                break;
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
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.dataidx);
                        break;
                    case  9: // data.drop
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.dataidx);
                        break;
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
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.tableidx);
                        sz += lengthULEB128(inst.elemidx);
                        break;
                    case 13: // elem.drop
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.elemidx);
                        break;
                    case 14: // table.copy
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.tableidx1);
                        sz += lengthULEB128(inst.tableidx2);
                        break;
                    case 15: // table.grow
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.tableidx);
                        break;
                    case 16: // table.size
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.tableidx);
                        break;
                    case 17: // table.fill
                        sz += 1;
                        sz += lengthULEB128(b2);
                        sz += lengthULEB128(inst.tableidx);
                        break;
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

function byteCodeComputeInstCount(data) {

}

// https://webassembly.github.io/spec/core/binary/instructions.html#binary-expr
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
function decodeByteCode(data, mod) {
    
    let start = data.offset;
    let brk = false;
    let topInsts = [];
    let opcodes = topInsts;
    let blkstack = [{opcodes: topInsts}]; // holds the nesting for block, loop and if/else

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
                    type = data.readSLEB128();
                    if (type > 0) {
                        inst.type = mod.types[type];
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
                    type = data.readSLEB128();
                    if (type > 0) {
                        inst.type = mod.types[type];
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
            // 0x06 try bt
            // 0x07 catch x
            // 0x19 catch_all
            // 0x18 delegate rd
            // 0x08 throw x
            // 0x09 rethrow rd
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
                opcodes.push(new CallInst(op_code, data.readULEB128()));
                break;
            case 0x11: // call_indirect [t1 i32] -> [t2]
                opcodes.push(new IndirectCallInst(op_code, data.readULEB128(), data.readULEB128()));
                //opcodes.push({opcode: op_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()});
                break;
            case 0x41: // i32.const     [] -> [i32]
                opcodes.push({opcode: op_code, value: data.readSLEB128()});
                break;
            case 0x42: // i64.const     [] -> [i64]
                opcodes.push({opcode: op_code, value: data.readULEB128(true)});
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
            case 0x1C: // select t*         [t t i32] -> [t]
                opcodes.push({opcode: op_code});
                break;
            case 0x20: // local.get         [] -> [t]
                opcodes.push({opcode: op_code, x: data.readULEB128()});
                break;
            case 0x21: // local.set         [t] -> []
                opcodes.push({opcode: op_code, x: data.readULEB128()});
                break;
            case 0x22: // local.tee         [t] -> [t]
                opcodes.push({opcode: op_code, x: data.readULEB128()});
                break;
            case 0x23: // global.get        [] -> [t]
            {
                let idx = data.readULEB128();
                let inst = {opcode: op_code, x: idx};
                inst.global = mod.globals[idx];
                opcodes.push(inst);
                break;
            }
            case 0x24: // global.set        [t] -> []
            {
                let idx = data.readULEB128();
                let inst = {opcode: op_code, x: idx};
                inst.global = mod.globals[idx];
                opcodes.push(inst);
                break;
            }
            case 0x25: // table.get         [i32] -> [t]
                opcodes.push({opcode: op_code, tableidx: data.readULEB128()});
                break;
            case 0x26: // table.set         [i32 t] -> []
                opcodes.push({opcode: op_code, tableidx: data.readULEB128()});
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
                opcodes.push({opcode: op_code, funcidx: data.readULEB128()});
                break;
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
                        opcodes.push({opcode: (op_code << 8) | sub, dataidx: data.readULEB128()});
                        break;
                    case  9: // data.drop               [] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, dataidx: data.readULEB128()});
                        break;
                    case 10: // memory.copy 0x00 0x00   [i32 i32 i32] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, memidx1: data.readUint8(), memidx2: data.readUint8()});
                        break;
                    case 11: // memory.fill 0x00        [i32 i32 i32] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, memidx: data.readUint8()});
                        break;
                    //
                    case 12: // table.init              [i32 i32 i32] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, tableidx: data.readULEB128(), elemidx: data.readULEB128()});
                        break;
                    case 13: // elem.drop               [] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, elemidx: data.readULEB128()});
                        break;
                    case 14: // table.copy              [i32 i32 i32] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, tableidx1: data.readULEB128(), tableidx2: data.readULEB128()});
                        break;
                    case 15: // table.grow              [t i32] -> [i32]
                        opcodes.push({opcode: (op_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
                    case 16: // table.size              [] -> [i32]
                        opcodes.push({opcode: (op_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
                    case 17: // table.fill              [i32 t i32] -> []
                        opcodes.push({opcode: (op_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
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
                        opcodes.push({opcode: (op_code << 8) | sub, memidx: memidx});
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

function encodeByteCode(data, opcodes) {
    
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
                data.writeUint8(b1);
                if (typeof inst.type == "number") {
                    let type = inst.type;
                    if (!(type == 0x40 || type == 0x7F || type == 0x7E || type == 0x7D || type == 0x7C || type == 0x7B  || type == 0x70 || type == 0x6F))
                        throw TypeError("invalid valuetype");
                    data.writeUint8(type);
                } else if (typeof inst.typeidx == "number") {
                    data.writeSLEB128(inst.typeidx);
                } else if (inst.type instanceof FuncType) {
                    if (!Number.isInteger(inst.type.typeidx))
                        throw TypeError("FuncType.typeidx must be set before encode");
                    let typeidx = inst.type.typeidx;
                    data.writeSLEB128(typeidx);
                }
                break;
            }
            case 0x05: // else in2* 0x0B
                data.writeUint8(b1);
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
                data.writeUint8(b1);
                data.writeULEB128(inst.funcidx);
                break;
            case 0x11: // call_indirect
                data.writeUint8(b1);
                data.writeULEB128(inst.tableidx);
                data.writeULEB128(inst.typeidx);
                //opcodes.push({opcode: op_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()});
                break;
            case 0x41: // i32.const
                data.writeUint8(b1);
                data.writeSLEB128(inst.value);
                break;
            case 0x42: // i64.const
                data.writeUint8(b1);
                data.writeULEB128(inst.value);
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
                data.writeUint8(b1);
                data.writeULEB128(inst.x);
                break;
            case 0x21: // local.set
                data.writeUint8(b1);
                data.writeULEB128(inst.x);
                break;
            case 0x22: // local.tee
                data.writeUint8(b1);
                data.writeULEB128(inst.x);
                break;
            case 0x23: // global.get
            {
                data.writeUint8(b1);
                data.writeULEB128(inst.global.index);
                break;
            }
            case 0x24: // global.set
            {
                data.writeUint8(b1);
                data.writeULEB128(inst.global.index);
                break;
            }
            case 0x25: // table.get
                data.writeUint8(b1);
                data.writeULEB128(inst.tableidx);
                break;
            case 0x26: // table.set
                data.writeUint8(b1);
                data.writeULEB128(inst.tableidx);
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
                data.writeUint8(b1);
                data.writeULEB128(inst.funcidx);
                break;
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
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.dataidx);
                        break;
                    case  9: // data.drop
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.dataidx);
                        break;
                    case 10: // memory.copy 0x00 0x00
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeUint8(inst.memidx1);
                        data.writeUint8(inst.memidx2);
                        break;
                    case 11: // memory.fill 0x00
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeUint8(inst.memidx);
                        break;
                    //
                    case 12: // table.init
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.tableidx);
                        data.writeULEB128(inst.elemidx);
                        break;
                    case 13: // elem.drop
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.elemidx);
                        break;
                    case 14: // table.copy
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.tableidx1);
                        data.writeULEB128(inst.tableidx2);
                        break;
                    case 15: // table.grow
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.tableidx);
                        break;
                    case 16: // table.size
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.tableidx);
                        break;
                    case 17: // table.fill
                        data.writeUint8(b1);
                        data.writeULEB128(b2);
                        data.writeULEB128(inst.tableidx);
                        break;
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

    // reads a signed LEB128 (little-endian-base128) integer
    readSLEB128(as64) {
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

    writeULEB128(value) {
        if (typeof value == "bigint") {
            const mask = BigInt(0x7f);
            let u8 = this._u8;
            let off = this._offset;
            let len = u8.byteLength;
            do {
                let byte = Number(value & mask);
                value >>= 7n;
                if (value != 0) {
                    u8[off++] = (byte | 0x80);
                } else {
                    u8[off++] = byte;
                    this._offset = off;
                    return;
                }

            } while (value != 0n);

            throw RangeError("arraybuffer to small");
        }

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
        if (typeof value == "bigint") {
            console.log("writeSLEB128 from bigint here");
        }
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

function lengthULEB128(value) {
    let cnt = 0;
    if (typeof value == "bigint") {
        do {
            value >>= 7n;
            if (value != 0n) {
                cnt++;
            } else {
                cnt++;
                return cnt;
            }

        } while (value != 0n);

        throw TypeError("should never get here!");
    }

    do {
        value >>= 7;
        if (value != 0) {
            cnt++;
        } else {
            cnt++;
            return cnt;
        }

    } while (value != 0);

    throw TypeError("should never get here!");
}

function lengthSLEB128(value) {
    let cnt = 0;
    value |= 0;
    while (true) {
        const byte_ = value & 0x7f;
        value >>= 7;
        if ((value === 0 && (byte_ & 0x40) === 0) || (value === -1 && (byte_ & 0x40) !== 0)) {
            cnt++;
            return cnt;
        }
        cnt++;
    }

    throw RangeError("arraybuffer to small");
}

class WasmGlobal {

    constructor(type, mutable, expr) {
        this.type = type;
        this.mutable = mutable === true;
        this.init = typeof expr == "object" ? expr : null;
    }
};

class WasmFunction {

    constructor() {

    }
};

class FuncType {

    constructor() {

    }
};

function decodeTypeSection(data, len) {
    let end = data.offset + len;
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
        let functype = new FuncType();
        functype.argc = argc;
        functype.argv = argv;
        functype.retc = retc;
        functype.retv = retv;
        functype.typeidx = y;
        functype.count = 0;
        functypes.push(functype);
    }

    //console.log("functype vector count: %d", cnt);
    //console.log(functypes);
    //dump_functypes(functypes);

    return functypes;
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

function decodeImportSection(data, len, m) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let functypes = m.types;
    let results = [];
    while (data.offset < end) {
        let mlen = data.readULEB128();
        let mod = data.readUTF8Bytes(mlen);
        let nlen = data.readULEB128();
        let name = data.readUTF8Bytes(nlen);
        let type = data.readUint8();
        let imp;
        if (type == 0x00) {         // function
            imp = new ImportedFunction();
            let typeidx = data.readULEB128();
            imp.type = functypes[typeidx];
            imp.type.count++; // increment refcount.
            if (!m.functions) {
                m.functions = [];
            }
            m.functions.push(imp);
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
            if (!m.tables) {
                m.tables = [];
            }
            m.tables.push(imp);
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
            if (!m.memory) {
                m.memory = [];
            }
            m.memory.push(imp);
        } else if (type == 0x03) {  // global
            imp = new ImportedGlobal();
            let t = data.readUint8();
            imp.globaltype = type_name(t);
            imp.type = t;
            imp.mutable = data.readUint8() === 1;
            if (!m.globals) {
                m.globals = [];
            }
            m.globals.push(imp);
        } else {
            console.error("found unsupported import type %d", type);
            continue;
        }

        if (imp) {
            //imp.type = export_type_name(type);
            imp.module = mod;
            imp.name = name;
            results.push(imp);
        }
    }
    
    //console.log("import vector count: %d", cnt);
    //console.log(results);
    // TODO: map every existing module-name
    return results;
}

function encodeImportSection(imports) {

    let total = 0;
    let ylen = imports.length;
    let cnt = 0;
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
            total += lengthULEB128(imp.type.typeidx);
            cnt++;
        } else if (imp instanceof ImportedGlobal) {
            total += 3; // type, valuetype, mutable
            cnt++;
        } else if (imp instanceof ImportedMemory) {
            total += 2; // type, limits
            total += lengthULEB128(imp.min);
            if (imp.max !== null) {
                total += lengthULEB128(imp.max);
            } 
            cnt++;
        } else if (imp instanceof ImportedTable) {
            total += 3; // type, reftype, limits
            total += lengthULEB128(imp.min);
            if (imp.max !== null) {
                total += lengthULEB128(imp.max);
            }
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
    data.writeUint8(SECTION_TYPE.IMPORT);
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
            data.writeULEB128(imp.type.typeidx);
        } else if (imp instanceof ImportedGlobal) {
            data.writeUint8(0x03);
            data.writeUint8(imp.type);
            data.writeUint8(imp.mutable ? 1 : 0);
        } else if (imp instanceof ImportedMemory) {
            data.writeUint8(0x02);
            if (imp.shared) {
                if (imp.max === null) {
                    data.writeUint8(0x02);
                    data.writeULEB128(imp.min);
                } else {
                    data.writeUint8(0x03);
                    data.writeULEB128(imp.min);
                    data.writeULEB128(imp.max);
                }

            } else {
                if (imp.max === null) {
                    data.writeUint8(0x00);
                    data.writeULEB128(imp.min);
                } else {
                    data.writeUint8(0x01);
                    data.writeULEB128(imp.min);
                    data.writeULEB128(imp.max);
                }

            }

        } else if (imp instanceof ImportedTable) {
            data.writeUint8(0x01);
            data.writeUint8(imp.reftype);
            data.writeULEB128(imp.min);
            if (imp.max !== null) {
                data.writeULEB128(imp.max);
            }
        } else {
            console.error("unsupported import type");
            continue;
        }
    }

    return buf;
}


function decodeFuncSection(data, len, mod) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    let arr;
    let funcidx = 0;
    if (!mod.functions) {
        mod.functions = [];
    }

    let functypes = mod.types;
    /*let len2 = functypes.length;
    for (let i = 0; i < len2; i++) {
        functypes[i].count = 0;
    }*/

    arr = mod.functions;
    while (data.offset < end) {
        let typeidx = data.readULEB128();
        let fn = new WasmFunction();
        let functype = functypes[typeidx];
        fn.type = functype;
        fn.funcidx = funcidx++;
        functype.count++;
        arr.push(fn);
        results.push(fn);
    }
    console.log("function vector count: %d", cnt);
    return results;
}

function decodeTableSection(data, len, mod) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let arr, tables = [];
    if (!mod.tables)
        mod.tables = [];
    arr = mod.tables;
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
        arr.push(table);
    }

    console.log("table vector count: %d", cnt);
    console.log(tables);
}

function decodeMemorySection(data, len) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    while (data.offset < end) {
        let limit = data.readUint8();
        let obj = {};
        if (limit == 0x01) {
            obj.min = data.readULEB128();
            obj.max = data.readULEB128();
            obj.shared = false;
        } else if (limit == 0x00) {
            obj.min = data.readULEB128();
            obj.shared = false;
        } else if (limit == 0x02) {
            obj.min = data.readULEB128();
            obj.shared = true;
        } else if (limit == 0x03) {
            obj.min = data.readULEB128();
            obj.max = data.readULEB128();
            obj.shared = true;              
        }
        results.push(obj);
    }
    console.log("memory vector count: %d", cnt);
    console.log(results);
}

function decodeGlobalSection(data, len, mod) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    let arr;
    if (!mod.globals) {
        mod.globals = [];
    }
    arr = mod.globals;
    while (data.offset < end) {
        let type = data.readUint8();
        let mut = data.readUint8();
        let opcode = decodeByteCode(data, mod);
        let obj = new WasmGlobal(type, (mut === 1), opcode.opcodes);
        results.push(obj);
        arr.push(obj);
        data.offset = opcode.end;
    }
    //console.log("global vector count: %d", cnt);
    //console.log(results);
}

function encodeGlobalSection(mod) {

    let arr = [];
    let globals = mod.globals;
    let len = globals.length;
    for (let i = 0; i < len; i++) {
        let glob = globals[i];
        glob.index = i;
        if (glob instanceof ImportedGlobal)
            continue;
        arr.push(glob);
    }

    let secsz = 0;
    secsz += lengthULEB128(arr.length);
    len = arr.length;
    for (let i = 0; i < len; i++) {
        let glob = arr[i];
        secsz += byteCodeComputeByteLength(glob.init);
        secsz += 2;
    }

    let totsz = lengthULEB128(secsz);
    totsz += secsz + 1;

    let buf = new ArrayBuffer(totsz);
    let data = new ByteArray(buf);
    data.writeUint8(0x06);
    data.writeULEB128(secsz);
    data.writeULEB128(arr.length);
    for (let i = 0; i < len; i++) {
        let glob = arr[i];
        data.writeUint8(glob.type);
        data.writeUint8(glob.mutable);
        encodeByteCode(data, glob.init);
    }

    return buf;
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

function decodeExportSection(data, len, mod) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    let results2 = [];
    while (data.offset < end) {
        let nlen = data.readULEB128();
        let name = data.readUTF8Bytes(nlen);
        let type = data.readUint8();
        let idx = data.readULEB128();
        results.push({
            name: name,
            type: export_type_name(type),
            index: idx,
        });

        if (type == 0x00) {
            let exp = new ExportedFunction();
            exp.name = name;
            exp.function = mod.functions[idx];
            results2.push(exp);
        } else if (type == 0x01) {
            let exp = new ExportedTable();
            exp.name = name;
            exp.table = mod.tables[idx];
            results2.push(exp);
        } else if (type == 0x02) {
            let exp = new ExportedMemory();
            exp.name = name;
            exp.memory = mod.memory[idx];
            results2.push(exp);
        } else if (type == 0x03) {
            let exp = new ExportedGlobal();
            exp.name = name;
            exp.global = mod.globals[idx];
            results2.push(exp);
        } else {
            console.warn("export of type %d is not supported", type);
        }
    }
    console.log("export vector count: %d", cnt);
    //console.log(results);
    //console.log(results2);

    mod.exports = results2;
}

function encodeExportSection(mod) {

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
    data.writeUint8(0x07);
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

function decodeStartSection(data, len) {
    let funcidx = data.readULEB128();
    console.log("start section entry-fn-idx: %d", funcidx);
}

function decodeElementSection(data, secsz, mod) {
    let end = data.offset + secsz;
    let cnt = data.readULEB128();
    for (let i = 0; i < cnt; i++) {
        let prefix = data.readULEB128();
        if (prefix == 0x00) {
            let expr = decodeByteCode(data, mod);
            let idx = expr.opcodes[0].value;
            let vlen = data.readULEB128();
            let vec = [undefined];
            vec.length = idx + vlen;
            for (let x = 0; x < vlen; x++) {
                let funcidx = data.readULEB128();
                vec[idx++] = funcidx;
            }

            mod.tables[0].contents = vec;

            //console.log("prefix: %d expr: %o vec(funcidx) %o", prefix, expr, vec);
        }
    }

    //console.log("element section vector count: %d", cnt);
}

function decodeCodeSection(data, len, mod, funcvec) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let idx = 0;
    let results = [];
    for (let y = 0; y < cnt; y++) {
        let tmp1 = data.offset;
        let bytesz = data.readULEB128();
        let tmp = data.offset;
        let lcnt = data.readULEB128();
        let locals = lcnt > 0 ? [] : null;
        for(let i = 0;i < lcnt;i++) {
            let n = data.readULEB128();
            let t = data.readUint8();
            locals.push({count: n, type: t});
        }
        let opcode_start = data.offset;
        let opcode_end = tmp + bytesz;
        let opcodes = decodeByteCode(data, mod);
        let fn = funcvec[y];
        fn.locals = locals;
        fn.codeStart = tmp1;
        fn.opcode_start = opcode_start;
        fn.opcode_end = opcode_end;
        fn.opcodes = opcodes.opcodes;
        data.offset = opcode_end;
    }
    console.log("code vector count: %d", cnt);
}

function encodeCodeSection(mod, section, funcvec) {

    let anyDirty = false;
    let len = funcvec.length;
    let org = mod._buffer;
    let off = 0;
    // first lets find where the our first non-import appears.
    for (let i = 0; i < len; i++) {
        let func = funcvec[i];
        if (!(func instanceof ImportedFunction)) {
            off = i;
            break;
        }
    }

    for (let i = off; i < len; i++) {
        let func = funcvec[i];
        if (func._opcodeDirty === true) {
            anyDirty = true;
            break;
        }
    }

    if (!anyDirty) {
        console.log("nothing changed in code section");
        let end = section.dataOffset + section.size;
        return org.slice(section.offset, end);
    }

    let sec_sz = 0;
    let buffers = [];
    let modcnt = 0;

    for (let i = off; i < len; i++) {
        let func = funcvec[i];
        /*let debug = false;

        if (i == 214) {
            debugger;
        }*/

        if (func._opcodeDirty !== true) {
            // just copy the code entery from the original.
            let sub = org.slice(func.codeStart, func.opcode_end);
            buffers.push(sub);
            sec_sz += sub.byteLength;
        } else {

            let subsz = 0;
            let locals = func.locals;
            let xlen = locals ? locals.length : 0;
            subsz += lengthULEB128(xlen);
            for (let x = 0; x < xlen; x++) {
                let local = locals[x];
                subsz += lengthULEB128(local.count);
                subsz += 1;
            }

            let opcodesz = byteCodeComputeByteLength(func.opcodes);
            let totsz = subsz + opcodesz;
            totsz += lengthULEB128(subsz + opcodesz);
            let buf = new ArrayBuffer(totsz);
            let data = new ByteArray(buf);
            buffers.push(buf);
            data.writeULEB128(subsz + opcodesz);
            data.writeULEB128(xlen);
            for (let x = 0; x < xlen; x++) {
                let local = locals[x];
                data.writeULEB128(local.count);
                data.writeUint8(local.type);
            }
            let tmp = data.offset;
            encodeByteCode(data, func.opcodes);
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
    }

    let cnt = funcvec.length - off;
    let cntsz = lengthULEB128(cnt);
    let headsz = 1 + lengthULEB128(sec_sz + cntsz); // section-type + section-length;
    headsz += cntsz;
    let header = new ArrayBuffer(headsz);
    let data = new ByteArray(header);
    data.writeUint8(0x0A);
    data.writeULEB128(sec_sz + cntsz);
    data.writeULEB128(cnt);
    buffers.unshift(header);

    console.log("encoded %d of which %d where modified", cnt, modcnt);

    return buffers;
}

function decodeDataSection(data, len, mod) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    while (data.offset < end) {
        let kind = data.readULEB128();
        if (kind == 0x00) {
            let inst = decodeByteCode(data, mod);
            let data_start = inst.end;
            data.offset = inst.end;
            let datasz = data.readULEB128();
            results.push({
                memidx: 0,
                inst: inst,
                offset: data.offset,
                size: datasz,
            });
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
    console.log(results);

    return results;
}

function decodeCustomSection(data, section, size) {
    let end = data.offset + len;
    let results = [];
    let nlen = data.readUint8();
    let name = data.readUTF8Bytes(nlen);
    let start = data.offset;
    //let datasz = data.readULEB128();
    results.push({
        name: name,
        start: start,
        end : end,
    });
    console.log("custom section name: %s", name);
    section.name = name;
    console.log(results);

    if (name == "producers") {
        let info = decodeCustomProducers(start, end);
    } else if (name == "name") {
        let info = decodeCustomName(start, end);
    } else if (name == "debug_info") {
        let info = decodeDWARFDebugInfoSection(data, section);
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
    // https://www.slideshare.net/chimerawang/dwarf-data-representation
    // https://yurydelendik.github.io/webassembly-dwarf/#embedding-DWARF
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

// known custom sections.

// https://github.com/WebAssembly/tool-conventions/blob/main/ProducersSection.md
function decodeCustomProducers(data, size) {
    let count = data.readULEB128();
    console.log("count: %d", count);
    let dict = {};
    for (let i = 0; i < count; i++) {
        let nlen = data.readULEB128();
        let key = data.readUTF8Bytes(nlen);

        let vcnt = data.readULEB128();
        if (vcnt == 1) {
            let vlen = data.readULEB128();
            let val = data.readUTF8Bytes(vlen);
            vlen = data.readULEB128(); // version string.
            if (vlen > 0) {
                let verv = data.readUTF8Bytes(vlen);
                dict[key] = {value: val, version: verv};
            } else {
                dict[key] = val;
            }
            
        } else if (vcnt > 0) {
            let values = [];
            for (let x = 0; x < vcnt; x++) {
                let vlen = data.readULEB128();
                let val = data.readUTF8Bytes(vlen);
                vlen = data.readULEB128(); // version string.
                if (vlen > 0) {
                    let verv = data.readUTF8Bytes(vlen);
                    values.push({value: val, version: verv});
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

function decode_name_map(data, size) {

    let end = data.offset + size;
    let cnt = data.readULEB128();
    let map = new Map();
    while (data.offset < end) {
        let idx = data.readULEB128();
        let nlen = data.readULEB128();
        let name = data.readUTF8Bytes(nlen);
        map.set(idx, name);
    }

    return map;
}

// https://webassembly.github.io/spec/core/appendix/custom.html
// https://github.com/WebAssembly/extended-name-section/blob/main/document/core/appendix/custom.rst
// 
// id   desc
// 0    module name
// 1    function names
// 2    local names
// 3    label names
// 4    type names
// 5    table names
// 6    memory names
// 7    global names
// 8    element segment names
// 9    data segment names
function decodeCustomName(data, size) {

    let results = {};

    let end = data.offset + size;
    while (data.offset < end) {

        let id = data.readUint8();
        let subsz = data.readULEB128();
        let substart = data.offset;
        if (id == 0x01) {

            //console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            //console.log(map);
            data.offset = substart + subsz;
            results.functions = map;

        } else if (id == 0x00) {
            //console.log("id %d size: %d", id, subsz);
            data.offset = substart + subsz;
        } else if (id == 0x02) {
            //console.log("id %d size: %d", id, subsz);
            data.offset = substart + subsz;
        } else if (id == 0x07) {

            //console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            //console.log(map);
            data.offset = substart + subsz;
            results.globals = map;

        } else if (id == 0x09) {

            //console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            //console.log(map);
            data.offset = substart + subsz;
            results.data = map;
        } else {
            //console.warn("id %d size: %d", id, subsz);
            data.offset = substart + subsz;
        }
    }

    return results;
}

function isValidSectionType(type) {

}

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
            let tmp = data.offset;
            let nlen = data.readUint8();
            chunk.name = data.readUTF8Bytes(nlen);
            chunk.dataOffset = data.offset;
            chunk.size = chunk.size - (data.offset - tmp);
            data.offset = tmp;
        } else if (type > 0x0B) {
            console.warn("section type: %d (%s) not handled", type, sectionnames[type]);
        }

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
        if (sec.type != 0x00) {
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

    let funcvec;
    let mod = {};
    cnt = filtered.length;
    for (let i = 0; i < cnt; i++) {
        let chunk = filtered[i];
        let type = chunk.type;
        let size = chunk.size;
        data.offset = chunk.dataOffset;
        switch (type) {
            case 0x01:  // type
                mod.types = decodeTypeSection(data, size, mod);
                break;
            case 0x02:  // import
                mod.imports = decodeImportSection(data, size, mod);
                break;
            case 0x03:  // function
                funcvec = decodeFuncSection(data, size, mod);
                break;
            case 0x04:  // table
                decodeTableSection(data, size, mod);
                break;
            case 0x05:  // memory
                decodeMemorySection(data, size, mod);
                break;
            case 0x06:  // global
                decodeGlobalSection(data, size, mod);
                break;
            case 0x07:  // export
                decodeExportSection(data, size, mod);
                break;
            case 0x08:  // start
                decodeStartSection(data, size, mod);
                break;
            case 0x09:  // element
                decodeElementSection(data, size, mod);
                break;
            case 0x0A:  // code
                decodeCodeSection(data, size, mod, funcvec);
                break;
            case 0x0B:  // data
                mod.dataSegments = decodeDataSection(data, size, mod);
                break;
            case 0x00: // custom
            {
                let name = chunk.name;
                switch (name) {
                    case 'producers':
                        decodeCustomProducers(data, size);
                        break;
                    case 'name':
                        mod.names = decodeCustomName(data, size);
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
        let ret = decodeDWARFDebugSections(data, dwarfsec);
    }

    mod.sections = chunks;

    console.log(mod);

    return mod;
}
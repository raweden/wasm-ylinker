
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

function inst_name(optcode) {

}


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

class InstList {

    constructor(optcode) {
        this.optcodes = [];
    }
};

class Inst {

    constructor(optcode) {
        this.optcode = optcode;
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

    constructor(optcode) {
        super(optcode);
    }
}

class LoopInst extends Inst {

    constructor(optcode) {
        super(optcode);
    }
}

class IfInst extends Inst {

    constructor(optcode) {
        super(optcode);
    }
}

class ReturnInst extends Inst {

    constructor(optcode) {
        super(optcode);
    }
}

class LoadInst extends Inst {

    constructor(optcode) {
        super(optcode);
    }
}

class StoreInst extends Inst {

    constructor(optcode) {
        super(optcode);
    }
}

class CallInst extends Inst {

    constructor(optcode, funcidx) {
        super(optcode);
        this.funcidx = funcidx;
    }
}

class BranchInst extends Inst {

    constructor(optcode, labelidx) {
        super(optcode);
        this.labelidx = labelidx;
    }
}

class BranchIfInst extends Inst {

    constructor(optcode, labelidx) {
        super(optcode);
        this.labelidx = labelidx;
    }
}

class BranchTableInst extends Inst {

    constructor(optcode, labels) {
        super(optcode);
        this.labels = labels;
    }
}

class IndirectCallInst extends Inst {

    constructor(optcode, tableidx, typeidx) {
        super(optcode);
        this.tableidx = tableidx;
        this.typeindx = typeidx;
    }
}

class LocalGetInst extends Inst {

    constructor(optcode, localidx) {
        super(optcode);
        this.localidx = localidx;
    }
}

class LocalSetInst extends Inst {

    constructor(optcode, localidx) {
        super(optcode);
        this.localidx = localidx;
    }
}

class GlobalGetInst extends Inst {

    constructor(optcode, globalidx) {
        super(optcode);
        this.globalidx = globalidx;
    }
}

class GlobalSetInst extends Inst {

    constructor(optcode, globalidx) {
        super(optcode);
        this.globalidx = globalidx;
    }
}

class TableGetInst extends Inst {

    constructor(optcode, tableidx) {
        super(optcode);
        this.tableidx = tableidx;
    }
}

class TableSetInst extends Inst {

    constructor(optcode, tableidx) {
        super(optcode);
        this.tableidx = tableidx;
    }
}

function InstTraversal(optcodes) {

    let atEnd = false;
    let lidx = 0;
    let pseudo = null;
    let scope = optcodes;
    let scopes = [{scope: optcodes, index: undefined}];

    return function next() {

        if (pseudo !== null) {
            let tmp = pseudo;
            pseudo = null;
            return tmp;
        } else if (atEnd) {
            return null;
        }

        let inst = scope[lidx++];
        if ((inst.optcode == 0x02 || inst.optcode == 0x03 || inst.optcode == 0x04 || inst.optcode == 0x05) && inst.optcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.optcodes, inst: inst, index: undefined});
            scope = inst.optcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

            if (scope.inst.optcode == 0x04 && blkst.else) {
                let last = scopes[scopes.length - 1];
                last.scope = blkst.else.optcodes;
                last.inst = blkst.else;
                last.index = undefined;
                scope = last.scope;
                lidx = 0;
                pseudo = {optcode: 0x05};
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

function InstToArray(optcodes) {

    let lidx = 0;
    let scope = optcodes;
    let scopes = [{optcodes: scope, inst: undefined, index: undefined}];
    let results = [];

    while (lidx < scope.length) {

        let inst = scope[lidx++];

        if ((inst.optcode == 0x02 || inst.optcode == 0x03 || inst.optcode == 0x04 || inst.optcode == 0x05) && inst.optcodes.length > 0) {
            scopes[scopes.length - 1].index = lidx;
            scopes.push({scope: inst.optcodes, inst: inst, index: undefined});
            scope = inst.optcodes;
            lidx = 0;
        } else if (lidx == scope.length) {

        }

        return inst;
    }
}

function InstMap(optcodes, cb) {

}


// https://webassembly.github.io/spec/core/binary/instructions.html#binary-expr
// https://webassembly.github.io/spec/core/appendix/index-instructions.html
function decodeByteCode(data) {
    
    let start = data.offset;
    let brk = false;
    let topInsts = [];
    let optcodes = topInsts;
    let blkstack = [{optcodes: topInsts}]; // holds the nesting for block, loop and if/else

    while(brk == false) {
        let opt_code = data.readUint8();
        switch (opt_code) {
            case 0x00: // unreachable
            case 0x01: // nop
                optcodes.push({optcode: opt_code});
                break;
            case 0x02: // block
            case 0x03: // loop
            {
                let inst = (opt_code == 0x03) ? new LoopInst(opt_code) : new BlockInst(opt_code);
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
                optcodes.push(inst);
                inst.optcodes = [];
                optcodes = inst.optcodes;
                blkstack.push(inst);
                break;
            }
            case 0x04: // if <inst> 0x0B || if <inst> 0x05 <inst> 0x0B
            {
                let inst = new IfInst(opt_code);
                optcodes.push(inst);
                inst.optcodes = [];
                optcodes = inst.optcodes;
                blkstack.push(inst);
                break;
            }
            case 0x05: // else <inst> 0x0B
            {
                let lastidx = blkstack.length - 1;
                let blkst = blkstack[lastidx];
                if (blkst.optcode != 0x04)
                    throw new TypeError("else optcode found outside if optcode");
                if (blkst.else)
                    throw new TypeError("else followed by a else");
                let inst = new IfInst(opt_code);
                inst.optcodes = [];
                blkst.else = inst;
                optcodes = inst.optcodes;
                blkstack[lastidx] = inst;
                break;
            }
            case 0x0C: // br
                optcodes.push({optcode: opt_code, labelidx: data.readULEB128()});
                break;
            case 0x0D: // br_if
                optcodes.push({optcode: opt_code, labelidx: data.readULEB128()});
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
                let inst = new BranchTableInst(opt_code, labels);
                inst.default_br = def;
                optcodes.push(inst);
                break;
            }
            case 0x0F: // return
                optcodes.push(new ReturnInst(opt_code));
                break;
            case 0x10: // call
                optcodes.push(new CallInst(opt_code, data.readULEB128()));
                break;
            case 0x11: // call_indirect
                optcodes.push(new IndirectCallInst(opt_code, data.readULEB128(), data.readULEB128()));
                //optcodes.push({optcode: opt_code, tableidx: data.readULEB128(), typeidx: data.readULEB128()});
                break;
            case 0x41: // i32.const     [] -> [i32]
                optcodes.push({optcode: opt_code, value: data.readULEB128()});
                break;
            case 0x42: // i64.const     [] -> [i64]
                optcodes.push({optcode: opt_code, value: data.readULEB128()});
                break;
            case 0x43: // f32.const     [] -> [f32]
                optcodes.push({optcode: opt_code, value: data.readFloat32()});
                break;
            case 0x44: // f64.const     [] -> [f64]
                optcodes.push({optcode: opt_code, value: data.readFloat64()});
                break;
            case 0x0b: // end
            {
                optcodes.push({optcode: opt_code});
                blkstack.pop();

                if (blkstack.length > 0) {
                    let last = blkstack[blkstack.length - 1];
                    optcodes = last.optcodes;
                } else if (blkstack.length == 0) {
                    brk = true;
                }
                break;
            }
            case 0x1A: // drop              [t] -> []
                optcodes.push({optcode: opt_code});
                break;
            case 0x1B: // select
                optcodes.push({optcode: opt_code});
                break;
            case 0x1C: // select t*
                optcodes.push({optcode: opt_code});
                break;
            case 0x20: // local.get
                optcodes.push({optcode: opt_code, x: data.readULEB128()});
                break;
            case 0x21: // local.set
                optcodes.push({optcode: opt_code, x: data.readULEB128()});
                break;
            case 0x22: // local.tee
                optcodes.push({optcode: opt_code, x: data.readULEB128()});
                break;
            case 0x23: // global.get
                optcodes.push({optcode: opt_code, x: data.readULEB128()});
                break;
            case 0x24: // global.set
                optcodes.push({optcode: opt_code, x: data.readULEB128()});
                break;
            case 0x25: // table.get
                optcodes.push({optcode: opt_code, tableidx: data.readULEB128()});
                break;
            case 0x26: // table.set
                optcodes.push({optcode: opt_code, tableidx: data.readULEB128()});
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
                optcodes.push({optcode: opt_code, offset: data.readULEB128(), align: data.readULEB128()});
                break;
            }
            case 0x3f: // suffix 0x00 memory.size   [] -> [i32]
            {
                let sub = data.readULEB128();
                if (sub == 0x00) {
                    optcodes.push({optcode: (opt_code << 8) | sub});
                }
                break;
            }
            case 0x40: // suffix 0x00 memory.grow   [i32] -> []
            {
                let sub = data.readULEB128();
                if (sub == 0x00) {
                    optcodes.push({optcode: (opt_code << 8) | sub});
                } 
                break
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
                optcodes.push({optcode: opt_code});
                break;
            case 0xD0: // ref.null
                optcodes.push({optcode: opt_code, reftype: data.readULEB128()});
                break;
            case 0xD1: // ref.is_null
                optcodes.push({optcode: opt_code});
                break;
            case 0xD2: // ref.func
                optcodes.push({optcode: opt_code, funcidx: data.readULEB128()});
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
                        optcodes.push({optcode: (opt_code << 8) | sub});
                        break;
                    case  8: // memory.init
                        optcodes.push({optcode: (opt_code << 8) | sub, dataidx: data.readULEB128()});
                        break;
                    case  9: // data.drop
                        optcodes.push({optcode: (opt_code << 8) | sub, dataidx: data.readULEB128()});
                        break;
                    case 10: // memory.copy [i32 i32 i32] -> []
                    case 11: // memory.fill [i32 i32 i32] -> []
                        optcodes.push({optcode: (opt_code << 8) | sub});
                        break;
                    //
                    case 12: // table.init
                        optcodes.push({optcode: (opt_code << 8) | sub, tableidx: data.readULEB128(), elemidx: data.readULEB128()});
                        break;
                    case 13: // elem.drop
                        optcodes.push({optcode: (opt_code << 8) | sub, elemidx: data.readULEB128()});
                        break;
                    case 14: // table.copy
                        optcodes.push({optcode: (opt_code << 8) | sub, tableidx1: data.readULEB128(), tableidx2: data.readULEB128()});
                        break;
                    case 15: // table.grow
                        optcodes.push({optcode: (opt_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
                    case 16: // table.size [] -> [i32]
                        optcodes.push({optcode: (opt_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
                    case 17: // table.fill
                        optcodes.push({optcode: (opt_code << 8) | sub, tableidx: data.readULEB128()});
                        break;
                }
                break;
            } 

            case 0xFD: // multi-byte sequence
            {
                let sub = data.readULEB128();
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
                        optcodes.push({optcode: (opt_code << 8) | sub, offset: data.readULEB128(), align: data.readULEB128()});
                        break;
                    case 12: // v128.const
                        optcodes.push({optcode: (opt_code << 8) | sub});
                        data.offset += 16;
                        break
                    case 13: // i8x16.shuffle
                        optcodes.push({optcode: (opt_code << 8) | sub});
                        data.offset += 16;
                        break
                    case 84: // v128.load8_lane
                    case 85: // v128.load16_lane
                    case 86: // v128.load32_lane
                    case 87: // v128.load64_lane
                    case 88: // v128.store8_lane
                    case 89: // v128.store16_lane
                    case 90: // v128.store32_lane
                    case 91: // v128.store64_lane
                        optcodes.push({optcode: (opt_code << 8) | sub});
                        break;
                        // the list of ops convers the whole 0-255 byte range.
                    

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
                        optcodes.push({optcode: (opt_code << 8) | sub, offset: data.readULEB128(), align: data.readULEB128()});
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

                        break;
                    case 13:    // i8x16.shuffle l

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
                }
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
                    {
                        let o = data.readULEB128();
                        let a = data.readULEB128();
                        optcodes.push({optcode: (opt_code << 8) | sub, offset: o, align: a});
                        break;
                    }
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

    return {start: start, end: data.offset, optcodes: topInsts};
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
        } else {
            throw TypeError("buffer is of unsupported type");
        }
        this._offset = 0;
        this._littleEndian = true;
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
        functypes.push(functype);
    }

    console.log("functype vector count: %d", cnt);
    console.log(functypes);

    dump_functypes(functypes);

    return functypes;
}

class ImportedFunction {

    constructor() {
        this.module = undefined;
        this.name = undefined;
        this.typeidx = undefined;
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
        this.globaltype = undefined;
        this.mutable = false;
    }
};

function decodeImportSection(data, len, m) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
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
            imp.typeidx = data.readULEB128();
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
            imp.valtype = type_name(t);
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
            imp.type = export_type_name(type);
            imp.module = mod;
            imp.name = name;
            results.push(imp);
        }
    }
    console.log("import vector count: %d", cnt);
    console.log(results);
    // TODO: map every existing module-name
    return results;
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
    arr = mod.functions;
    while (data.offset < end) {
        let typeidx = data.readULEB128();
        let fn = new WasmFunction();
        fn.type = mod.types[typeidx];
        fn.funcidx = funcidx++;
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
        let optcode = decodeByteCode(data);
        let obj = {
            type: type_name(type),
            mutable: (mut === 1),
            init: optcode.optcodes,
        };
        results.push(obj);
        arr.push(obj);
        data.offset = optcode.end;
    }
    console.log("global vector count: %d", cnt);
    console.log(results);
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
    console.log(results);
    console.log(results2);

    mod.exports = results2;
}

function decodeStartSection(data, len) {
    let funcidx = data.readULEB128();
    console.log("start section entry-fn-idx: %d", funcidx);
}

function decodeElementSection(data, secsz) {
    let end = data.offset + secsz;
    let cnt = data.readULEB128();
    for (let i = 0; i < cnt; i++) {
        let prefix = data.readULEB128();
        if (prefix == 0x00) {
            let expr = decodeByteCode(data);
            let vlen = data.readULEB128();
            let vec = [];
            for (let x = 0; x < vlen; x++) {
                let funcidx = data.readULEB128();
                vec.push(funcidx);
            }

            console.log("prefix: %d expr: %o vec(funcidx) %o", prefix, expr, vec);
        }
    }

    console.log("element section vector count: %d", cnt);
}

function decodeCodeSection(data, len, mod, funcvec) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let idx = 0;
    let results = [];
    while (data.offset < end) {
        let bytesz = data.readULEB128();
        let tmp = data.offset;
        let lcnt = data.readULEB128();
        let locals = lcnt > 0 ? [] : null;
        for(let i = 0;i < lcnt;i++) {
            let n = data.readULEB128();
            let t = data.readUint8();
            locals.push({count: n, type: type_name(t)});
        }
        let optcode_start = data.offset;
        let optcode_end = tmp + bytesz;
        let optcodes = decodeByteCode(data);
        let fn = funcvec[idx++];
        fn.locals = locals;
        fn.optcode_start = optcode_start;
        fn.optcode_end = optcode_end;
        fn.optcodes = optcodes.optcodes;
        data.offset = optcode_end;
    }
    console.log("code vector count: %d", cnt);
}

function decodeDataSection(data, len) {
    let end = data.offset + len;
    let cnt = data.readULEB128();
    let results = [];
    while (data.offset < end) {
        let kind = data.readULEB128();
        if (kind == 0x00) {
            let inst = decodeByteCode(data);
            let data_start = inst.end;
            data.offset = inst.end;
            let datasz = data.readULEB128();
            results.push({
                memidx: 0,
                inst: inst,
                offset: data_start,
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

            console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            console.log(map);
            data.offset = substart + subsz;
            results.functions = map;

        } else if (id == 0x00) {
            console.log("id %d size: %d", id, subsz);
            data.offset = substart + subsz;
        } else if (id == 0x02) {
            console.log("id %d size: %d", id, subsz);
            data.offset = substart + subsz;
        } else if (id == 0x07) {

            console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            console.log(map);
            data.offset = substart + subsz;
            results.global = map;

        } else if (id == 0x09) {

            console.log("id %d size: %d", id, subsz);
            let map = decode_name_map(data, subsz);
            console.log(map);
            data.offset = substart + subsz;
            results.data = map;
        } else {
            console.warn("id %d size: %d", id, subsz);
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
        console.log("type: %d (%s) size: %d offset: %d data-offset: %d", type, sectionnames[type], size, start, data.offset);
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

    console.log(chunks);

    // by handling the section in a certain order:
    // 1. type section
    // 2. func section
    // 3. global section
    // 3. export section
    // 4. import section
    // then we can actually lookup functions and globals in export/import

    let funcvec;
    let mod = {};
    let cnt = chunks.length;
    for (let i = 0; i < cnt; i++) {
        let chunk = chunks[i];
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

    mod.sections = chunks;

    console.log(mod);

    return mod;
}
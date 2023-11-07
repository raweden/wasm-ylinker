
const WA_TYPE_I32 = 0x7F;
const WA_TYPE_I64 = 0x7E;
const WA_TYPE_F32 = 0x7D;
const WA_TYPE_F64 = 0x7C;
const WA_TYPE_VOID = 0x00;
const WA_TYPE_V128 = 0x7b;
const WA_TYPE_FUNC_REF = 0x70;
const WA_TYPE_EXTERN_REF = 0x67;
const WA_TYPE_ANY = Symbol("@any");
const WA_TYPE_NUMRIC = Symbol("@type-numric");

const WA_LOCAL_TYPE = Symbol("@local-type"); // indicates that the pull/push value is of the type of the local at given index.

const WA_ROLE_ADDR = "addr";
const WA_TYPE_ADDR = WA_TYPE_I32; //Symbol("@addr");   // everything that is a memory address has this type.. 

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

const opclsmap = new Map();
const opcode_info = [
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

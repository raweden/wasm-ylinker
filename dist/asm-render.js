
function no_render(element, mod, fn, op, opcls) {
    throw new Error("no render");
}

// the instruction has no embedded parameters.
function wat_render_inst(element, mod, fn, op, opcls) {
    let instElement = document.createElement("span");
    instElement.classList.add("instr");
    instElement.textContent = opcls.name;
    element.appendChild(instElement);
}

function bin_render_inst8(element, mod, fn, op, opcls) {
    let instElement = document.createElement("span");
    instElement.classList.add("instr");
    instElement.textContent = (op.opcode).toString(16).padStart(2, '0');
    element.appendChild(instElement);
}

function bin_render_inst16(element, mod, fn, op, opcls) {
    let instElement = document.createElement("span");
    instElement.classList.add("instr");
    instElement.textContent = (op.opcode).toString(16).padStart(2, '0');
    element.appendChild(instElement);
}

function wat_render_i32_const(element, mod, fn, op, opcls) {
    
    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "value=" + ((op.value).toString());
    element.appendChild(v);
}

function wat_render_i64_const(element, mod, fn, op, opcls) {
    
    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "value=" + ((op.value).toString());
    element.appendChild(v);
}

function wat_render_f32_const(element, mod, fn, op, opcls) {
    
    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "value=" + ((op.value).toString());
    element.appendChild(v);
}

function wat_render_f64_const(element, mod, fn, op, opcls) {
    
    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "value=" + ((op.value).toString());
    element.appendChild(v);
}

function bin_render_i32_const(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.value);
    element.appendChild(v);
}

function bin_render_i64_const(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.value);
    element.appendChild(v);
}

function bin_render_f32_const(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.value);
    element.appendChild(v);
}

function bin_render_f64_const(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.value);
    element.appendChild(v);
}



function bin_render_inst_bt(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    if (typeof op.type == "number") {
        v.textContent = toHex(op.type);
    } else if (op.type instanceof WasmType) {
        let typeidx = mod.types.indexOf(op.type);
        v.textContent = toHex(typeidx);
    }
    element.appendChild(v);
}

function wat_render_inst_bt(element, mod, fn, op, opcls) {
    
    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    if (typeof op.type == "number") {
        let type = op.type;
        if (type !== 0x40) {
            let ts = document.createElement("span");
            ts.classList.add("stack-signature");
            let typename = type_name(type);
            ts.textContent = "[] → [" + typename + "]";
            element.appendChild(ts);
        } else {
            let ts = document.createElement("span");
            ts.classList.add("stack-signature");
            ts.textContent = "[] → []";
            element.appendChild(ts);
        }
    } else if (op.type instanceof WasmType) {
        let type = op.type;
        let ts = document.createElement("span");
        ts.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
        element.appendChild(ts);
    }
}

// webassembly text 

function wat_render_mem_notify(element, mod, fn, op, opcls) {

}

function wat_render_i64_rmw(element, mod, fn, op, opcls) {

}

function wat_render_i64_load(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "align=" + ((op.align).toString());
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = "offset=" + ((op.offset).toString());
    element.appendChild(v);
}

function wat_render_i64_store(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "align=" + ((op.align).toString());
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = "offset=" + ((op.offset).toString());
    element.appendChild(v);
}

function wat_render_mem_wait64(element, mod, fn, op, opcls) {

}

function wat_render_i32_rmw(element, mod, fn, op, opcls) {

}

function wat_render_i32_load(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "align=" + ((op.align).toString());
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = "offset=" + ((op.offset).toString());
    element.appendChild(v);
}

function wat_render_i32_store(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "align=" + ((op.align).toString());
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = "offset=" + ((op.offset).toString());
    element.appendChild(v);
}

function wat_render_mem_wait32(element, mod, fn, op, opcls) {

}

function wat_render_call(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let func = op.func;
    v.textContent = typeof func[__nsym] == "string" ? func[__nsym] : mod.functions.indexOf(func);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.classList.add("stack-signature");
    let type = func.type;
    v.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
    element.appendChild(v);
}

function wat_render_call_indirect(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = "tableidx=" + op.tableidx;
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.classList.add("stack-signature");
    let type = mod.types[op.typeidx];
    v.textContent = "[" + (type.argc > 0 ? type.argv.map(type_name).join(", ") : '') + "] → [" + (type.retc > 0 ? type.retv.map(type_name).join(", ") : '') + "]";
    element.appendChild(v);
}

function wat_render_local_op(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    let argc = fn.type.argc;

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let idx = fn.locals.indexOf(op.local);
    v.textContent = idx < argc ? "arg" + (idx).toString() : (op.x).toString();
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.classList.add("stack-signature");
    if (op.opcode == 0x22) {
        let tn = type_name(op.local.type);
        v.textContent = "[" + tn + "] → [" + tn + "]";
    } else if (op.opcode == 0x21) {
        v.textContent = "[" + type_name(op.local.type) + "] → []";
    } else {
        v.textContent = "[] → [" + type_name(op.local.type) + "]";
    }
    element.appendChild(v);
}

function wat_render_global_op(element, mod, fn, op, opcls) {

    wat_render_inst(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.classList.add("variable");
    let glob = op.global;
    let globidx = mod.globals.indexOf(glob);
    if (typeof glob[__nsym] == "string") {
        v.textContent = glob[__nsym];
    } else if (glob instanceof ImportedGlobal) {
        v.textContent = glob.module + '.' + glob.name;
    } else {
        //let globidx = mod.globals.indexOf(glob);
        v.textContent = ((globidx).toString());
    }
    element.appendChild(v);
}

function wat_render_table_op(element, mod, fn, op, opcls) {

}

function wat_render_select(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_br(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_br_if(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_br_table(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_f32_load(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_f32_store(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_f64_load(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_f64_store(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_mem_size(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}

function wat_render_mem_grow(element, mod, fn, op, opcls) {
    wat_render_inst(element, mod, fn, op, opcls);
}


// webassembly binary

function bin_render_mem_notify(element, mod, fn, op, opcls) {

}

function bin_render_i64_rmw(element, mod, fn, op, opcls) {

}

function bin_render_i64_load(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.align);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = toHex(op.offset);
}

function bin_render_i64_store(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.align);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = toHex(op.offset);
}

function bin_render_mem_wait64(element, mod, fn, op, opcls) {

}

function bin_render_i32_rmw(element, mod, fn, op, opcls) {

}

function bin_render_i32_load(element, mod, fn, op, opcls) {
    
    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.align);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = toHex(op.offset);
}

function bin_render_i32_store(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    v.textContent = toHex(op.align);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    v.textContent = toHex(op.offset);
}

function bin_render_mem_wait32(element, mod, fn, op, opcls) {

}

function bin_render_call(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let funcidx = mod.functions.indexOf(op.func);
    v.textContent = toHex(funcidx);
    element.appendChild(v);
}

function bin_render_call_indirect(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let tableidx = mod.tables.indexOf(op.table);
    v.textContent = toHex(tableidx);
    element.appendChild(v);
    element.appendChild(document.createTextNode('\x20'));
    v = document.createElement("span");
    let typeidx = mod.types.indexOf(op.type);
    v.textContent = toHex(typeidx);
    element.appendChild(v);
}

function bin_render_local_op(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let idx = fn.locals.indexOf(op.local);
    v.textContent = toHex(idx);
    element.appendChild(v);
}

function bin_render_global_op(element, mod, fn, op, opcls) {

    bin_render_inst8(element, mod, fn, op, opcls);

    element.appendChild(document.createTextNode('\x20'));
    let v = document.createElement("span");
    let globalidx = mod.globals.indexOf(op.global);
    v.textContent = toHex(globalidx);
    element.appendChild(v);
}

function bin_render_table_op(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_select(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_br(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_br_if(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_br_table(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_f32_load(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_f32_store(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_f64_load(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_f64_store(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_mem_size(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

function bin_render_mem_grow(element, mod, fn, op, opcls) {
    bin_render_inst8(element, mod, fn, op, opcls);
}

const inst_render = [
    {
        opcode: 0x00, // unreachable
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
    }, {
        opcode: 0x01, // nop
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
    }, 
    {
        opcode: 0x02, // block bt
		render_bin: bin_render_inst_bt,
		render_wat: wat_render_inst_bt
    }, {
        opcode: 0x03, // loop bt
		render_bin: bin_render_inst_bt,
		render_wat: wat_render_inst_bt
    }, {
        opcode: 0x04, // if bt <in*> 0x0B || if bt <in1*> 0x05 <in2*> 0x0B
		render_bin: bin_render_inst_bt,
		render_wat: wat_render_inst_bt
    }, {
        opcode: 0x05, // else <in2*> 0x0B
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x06, // try bt
		render_bin: bin_render_inst_bt,
		render_wat: wat_render_inst_bt
    }, {
        opcode: 0x07, // catch x
		render_bin: no_render,
		render_wat: no_render
    }, {
        opcode: 0x19, // catch_all
		render_bin: no_render,
		render_wat: no_render
    }, {
        opcode: 0x18, // delegate rd
		render_bin: no_render,
		render_wat: no_render
    }, {
        opcode: 0x08, // throw x
		render_bin: no_render,
		render_wat: no_render
    }, {
        opcode: 0x09, // rethrow rd
		render_bin: no_render,
		render_wat: no_render
    }, {
        opcode: 0x0C, // br
		render_bin: bin_render_br,
		render_wat: wat_render_br
    }, {
        opcode: 0x0D, // br_if
		render_bin: bin_render_br_if,
		render_wat: wat_render_br_if
    }, {
        opcode: 0x0E, // br_table
		render_bin: bin_render_br_table,
		render_wat: wat_render_br_table
    }, {
        opcode: 0x0F, // return
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
    }, {
        opcode: 0x10, // call
		render_bin: bin_render_call,
		render_wat: wat_render_call
    }, {
        opcode: 0x11, // call_indirect
		render_bin: bin_render_call_indirect,
		render_wat: wat_render_call_indirect
    }, 
    // https://github.com/WebAssembly/tail-call/blob/main/proposals/tail-call/Overview.md
    // return_call          0x12    [t3* t1*] -> [t4*]
    // return_call_indirect 0x13    [t3* t1* i32] -> [t4*]
    {
        opcode: 0x41, // i32.const
		render_bin: bin_render_i32_const,
		render_wat: wat_render_i32_const
        
    }, {
        opcode: 0x42, // i64.const
		render_bin: bin_render_i64_const,
		render_wat: wat_render_i64_const
        
    }, {
        opcode: 0x43, // f32.const
		render_bin: bin_render_f32_const,
		render_wat: wat_render_f32_const
        
    }, {
        opcode: 0x44, // f64.const
		render_bin: bin_render_f64_const,
		render_wat: wat_render_f64_const
        
    }, {
        opcode: 0x0b, // end
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
    }, {
        opcode: 0x1A, // drop
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
    }, {
        opcode: 0x1B, // select
		render_bin: bin_render_select,
		render_wat: wat_render_select
    }, {
        opcode: 0x1C, // select t*
		render_bin: bin_render_select,
		render_wat: wat_render_select
    }, {
        opcode: 0x20, // local.get x
		render_bin: bin_render_local_op,
		render_wat: wat_render_local_op
    }, {
        opcode: 0x21, // local.set x
		render_bin: bin_render_local_op,
		render_wat: wat_render_local_op
    }, {
        opcode: 0x22, // local.tee x
		render_bin: bin_render_local_op,
		render_wat: wat_render_local_op
    }, {
        opcode: 0x23, // global.get x
		render_bin: bin_render_global_op,
		render_wat: wat_render_global_op
    }, {
        opcode: 0x24, // global.set x
		render_bin: bin_render_global_op,
		render_wat: wat_render_global_op
    }, {
        opcode: 0x25, // table.get
		render_bin: bin_render_table_op,
		render_wat: wat_render_table_op
    }, {
        opcode: 0x26, // table.set
		render_bin: bin_render_table_op,
		render_wat: wat_render_table_op
    }, {
        opcode: 0x28, // i32.load
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
    }, {
        opcode: 0x29, // i64.load
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x2a, // f32.load
		render_bin: bin_render_f32_load,
		render_wat: wat_render_f32_load
        
    }, {
        opcode: 0x2b, // f64.load
		render_bin: bin_render_f64_load,
		render_wat: wat_render_f64_load
        
    }, {
        opcode: 0x2c, // i32.load8_s
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
    }, {
        opcode: 0x2d, // i32.load8_u
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: 0x2e, // i32.load16_s
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: 0x2f, // i32.load16_u
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: 0x30, // i64.load8_s
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x31, // i64.load8_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x32, // i64.load16_s
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x33, // i64.load16_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x34, // i64.load32_s
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x35, // i64.load32_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: 0x36, // i32.store
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: 0x37, // i64.store
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: 0x38, // f32.store
		render_bin: bin_render_f32_store,
		render_wat: wat_render_f32_store
        
    }, {
        opcode: 0x39, // f64.store
		render_bin: bin_render_f64_store,
		render_wat: wat_render_f64_store
        
    }, {
        opcode: 0x3a, // i32.store8
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: 0x3b, // i32.store16
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: 0x3c, // i64.store8
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: 0x3d, // i64.store16
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: 0x3e, // i64.store32
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: 0x3f, // memory.size 0x00
		render_bin: bin_render_mem_size,
		render_wat: wat_render_mem_size
        
    }, {
        opcode: 0x40, // memory.grow 0x00
		render_bin: bin_render_mem_grow,
		render_wat: wat_render_mem_grow
        
    }, {
        opcode: 0x45, // i32.eqz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x46, // i32.eq
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x47, // i32.ne
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x48, // i32.lt_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x49, // i32.lt_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4a, // i32.gt_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4b, // i32.gt_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4c, // i32.le_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4d, // i32.le_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4e, // i32.ge_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x4f, // i32.ge_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x50, // i64.eqz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x51, // i64.eq
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x52, // i64.ne
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x53, // i64.lt_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x54, // i64.lt_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x55, // i64.gt_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x56, // i64.gt_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x57, // i64.le_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x58, // i64.le_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x59, // i64.ge_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5a, // i64.ge_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5b, // f32.eq
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5c, // f32.ne
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5d, // f32.lt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5e, // f32.gt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x5f, // f32.le
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x60, // f32.ge
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x61, // f64.eq
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x62, // f64.ne
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x63, // f64.lt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x64, // f64.gt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x65, // f64.le
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x66, // f64.ge
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x67, // i32.clz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x68, // i32.ctz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x69, // i32.popcnt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6a, // i32.add
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6b, // i32.sub
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6c, // i32.mul
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6d, // i32.div_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6e, // i32.div_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x6f, // i32.rem_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x70, // i32.rem_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x71, // i32.and
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x72, // i32.or
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x73, // i32.xor
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x74, // i32.shl
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x75, // i32.shr_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x76, // i32.shr_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x77, // i32.rotl
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x78, // i32.rotr
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x79, // i64.clz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7a, // i64.ctz
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7b, // i64.popcnt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7c, // i64.add
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7d, // i64.sub
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7e, // i64.mul
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x7f, // i64.div_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x80, // i64.div_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x81, // i64.rem_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x82, // i64.rem_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x83, // i64.and
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x84, // i64.or
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x85, // i64.xor
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x86, // i64.shl
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x87, // i64.shr_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x88, // i64.shr_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x89, // i64.rotl
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8a, // i64.rotr
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8b, // f32.abs
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8c, // f32.neg
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8d, // f32.ceil
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8e, // f32.floor
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x8f, // f32.trunc
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x90, // f32.nearest
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x91, // f32.sqrt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x92, // f32.add
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x93, // f32.sub
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x94, // f32.mul
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x95, // f32.div
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x96, // f32.min
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x97, // f32.max
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x98, // f32.copysign
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x99, // f64.abs
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9a, // f64.neg
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9b, // f64.ceil
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9c, // f64.floor
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9d, // f64.trunc
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9e, // f64.nearest
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0x9f, // f64.sqrt
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA0, // f64.add
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA1, // f64.sub
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA2, // f64.mul
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA3, // f64.div
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA4, // f64.min
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA5, // f64.max
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA6, // f64.copysign
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA7, // i32.wrap_i64
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA8, // i32.trunc_f32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xA9, // i32.trunc_f32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAA, // i32.trunc_f64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAB, // i32.trunc_f64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAC, // i64.extend_i32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAD, // i64.extend_i32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAE, // i64.trunc_f32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xAF, // i64.trunc_f32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB0, // i64.trunc_f64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB1, // i64.trunc_f64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB2, // f32.convert_i32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB3, // f32.convert_i32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB4, // f32.convert_i64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB5, // f32.convert_i64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB6, // f32.demote_f64
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB7, // f64.convert_i32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB8, // f64.convert_i32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xB9, // f64.convert_i64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBA, // f64.convert_i64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBB, // f64.promote_f32
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBC, // i32.reinterpret_f32
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBD, // i64.reinterpret_f64
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBE, // f32.reinterpret_i32
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xBF, // f64.reinterpret_i64
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xC0, // i32.extend8_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xC1, // i32.extend16_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xC2, // i64.extend8_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xC3, // i64.extend16_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xC4, // i64.extend32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: 0xD0, // ref.null
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: 0xD1, // ref.is_null
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: 0xD2, // ref.func
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 0, // i32.trunc_sat_f32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 1, // i32.trunc_sat_f32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 2, // i32.trunc_sat_f64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 3, // i32.trunc_sat_f64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 4, // i64.trunc_sat_f32_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 5, // i64.trunc_sat_f32_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 6, // i64.trunc_sat_f64_s
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 7, // i64.trunc_sat_f64_u
		render_bin: bin_render_inst8,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xfc << 8) | 8, // memory.init
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 9, // data.drop
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 10, // memory.copy 0x00 0x00
		render_bin: no_render,
		render_wat: no_render
        
    }, 
    {
        opcode: (0xfc << 8) | 11, // memory.fill 0x00
		render_bin: no_render,
		render_wat: no_render
        
    }, 
    {
        opcode: (0xfc << 8) | 12, // table.init
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 13, // elem.drop
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 14, // table.copy
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 15, // table.grow
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 16, // table.size
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xfc << 8) | 17, // table.fill
		render_bin: no_render,
		render_wat: no_render
        
    },


        // multi-byte sequence

    {
        opcode: (0xFD << 8) | 0, //   m:memarg => v128.load m
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 1, //   m:memarg => v128.load8x8_s m
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 2, //   m:memarg => v128.load8x8_u m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 3, //   m:memarg => v128.load16x4_s m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 4, //   m:memarg => v128.load16x4_u m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 5, //   m:memarg => v128.load32x2_s m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 6, //   m:memarg => v128.load32x2_u m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 7, //   m:memarg => v128.load8_splat m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 8, // v128.load16_splat //   m:memarg => v128.load16_splat m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 9, //   m:memarg => v128.load32_splat m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 10, //   m:memarg => v128.load64_splat m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 92, //   m:memarg => v128.load32_zero m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 93, //   m:memarg => v128.load64_zero m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 11, // m:memarg => v128.store m
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 84, //   m:memarg l:laneidx   => v128.load8_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 85, //   m:memarg l:laneidx   => v128.load16_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 86, //   m:memarg l:laneidx   => v128.load32_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 87, //   m:memarg l:laneidx   => v128.load64_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 88, //   m:memarg l:laneidx   => v128.store8_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 89, //   m:memarg l:laneidx   => v128.store16_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 90, //   m:memarg l:laneidx   => v128.store32_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 91, //   m:memarg l:laneidx   => v128.store64_lane m l
		render_bin: no_render,
		render_wat: no_render
        
        
    }, {
        opcode: (0xFD << 8) | 21, //   l:laneidx    => i8x16.extract_lane_s l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 22, //   l:laneidx    => i8x16.extract_lane_u l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 23, //   l:laneidx    => i8x16.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 24, //   l:laneidx    => i16x8.extract_lane_s l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 25, //   l:laneidx    => i16x8.extract_lane_u l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 26, //   l:laneidx    => i16x8.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 27, //   l:laneidx    => i32x4.extract_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 28, //   l:laneidx    => i32x4.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 29, //   l:laneidx    => i64x2.extract_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 30, //   l:laneidx    => i64x2.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 31, //   l:laneidx    => f32x4.extract_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 32, //   l:laneidx    => f32x4.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 33, //   l:laneidx    => f64x2.extract_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 34, //   l:laneidx    => f64x2.replace_lane l
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 14, //  i8x16.swizzle
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 15, //  i8x16.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 16, //  i16x8.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 17, //  i32x4.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 18, //  i64x2.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 19, //  f32x4.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 20, //  f64x2.splat
		render_bin: no_render,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 35, // i8x16.eq
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 36, // i8x16.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 37, // i8x16.lt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 38, // i8x16.lt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 39, // i8x16.gt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 40, // i8x16.gt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 41, // i8x16.le_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 42, // i8x16.le_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 43, // i8x16.ge_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 44, // i8x16.ge_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 45, // i16x8.eq
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 46, // i16x8.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 47, // i16x8.lt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 48, // i16x8.lt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 49, // i16x8.gt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 50, // i16x8.gt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 51, // i16x8.le_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 52, // i16x8.le_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 53, // i16x8.ge_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 54, // i16x8.ge_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 55, // i32x4.eq
		render_bin: bin_render_inst16,
		render_wat: no_render
        
    }, {
        opcode: (0xFD << 8) | 56, // i32x4.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 57, // i32x4.lt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 58, // i32x4.lt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 59, // i32x4.gt_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 60, // i32x4.gt_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 61, // i32x4.le_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 62, // i32x4.le_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 63, // i32x4.ge_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 64, // i32x4.ge_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 214, // i64x2.eq
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 215, // i64x2.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 216, // i64x2.lt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 217, // i64x2.gt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 218, // i64x2.le
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 219, // i64x2.ge
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 65, // f32x4.eq
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 66, // f32x4.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 67, // f32x4.lt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 68, // f32x4.gt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 69, // f32x4.le
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 70, // f32x4.ge
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 71, // f64x2.eq
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 72, // f64x2.ne
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 73, // f64x2.lt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 74, // f64x2.gt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 75, // f64x2.le
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 76, // f64x2.ge
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 77, // v128.not
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 78, // v128.and
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 79, // v128.andnot
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 80, // v128.or
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 81, // v128.xor
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 82, // v128.bitselect
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 83, // v128.any_true
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 96, // i8x16.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 97, // i8x16.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 98, // i8x16.popcnt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 99, // i8x16.all_true
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 100, // i8x16.bitmask
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 101, // i8x16.narrow_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 102, // i8x16.narrow_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 107, // i8x16.shl
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 108, // i8x16.shr_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 109, // i8x16.shr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 110, // i8x16.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 111, // i8x16.add_sat_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 112, // i8x16.add_sat_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 113, // i8x16.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 114, // i8x16.sub_sat_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 115, // i8x16.sub_sat_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 118, // i8x16.min_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 119, // i8x16.min_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 120, // i8x16.max_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 121, // i8x16.max_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 123, // i8x16.avgr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 124, // i16x8.extadd_pairwise_i8x16_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 125, // i16x8.extadd_pairwise_i8x16_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 128, // i16x8.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 129, // i16x8.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 130, // i16x8.q15mulr_sat_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 131, // i16x8.all_true
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 132, // i16x8.bitmask
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 133, // i16x8.narrow_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 134, // i16x8.narrow_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 135, // i16x8.extend_low_i8x16_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 136, // i16x8.extend_high_i8x16_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 137, // i16x8.extend_low_i8x16_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 138, // i16x8.extend_high_i8x16_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 139, // i16x8.shl
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 140, // i16x8.shr_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 141, // i16x8.shr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 142, // i16x8.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 143, // i16x8.add_sat_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 144, // i16x8.add_sat_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 145, // i16x8.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 146, // i16x8.sub_sat_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 147, // i16x8.sub_sat_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 149, // i16x8.mul
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 150, // i16x8.min_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 151, // i16x8.min_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 152, // i16x8.max_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 153, // i16x8.max_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 155, // i16x8.avgr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 156, // i16x8.extmul_low_i8x16_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 157, // i16x8.extmul_high_i8x16_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 158, // i16x8.extmul_low_i8x16_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 159, // i16x8.extmul_high_i8x16_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 126, // i32x4.extadd_pairwise_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 127, // i32x4.extadd_pairwise_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 160, // i32x4.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 161, // i32x4.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 163, // i32x4.all_true
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 164, // i32x4.bitmask
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 167, // i32x4.extend_low_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 168, // i32x4.extend_high_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 169, // i32x4.extend_low_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 170, // i32x4.extend_high_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 171, // i32x4.shl
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 172, // i32x4.shr_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 173, // i32x4.shr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 174, // i32x4.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 177, // i32x4.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 181, // i32x4.mul
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 182, // i32x4.min_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 183, // i32x4.min_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 184, // i32x4.max_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 185, // i32x4.max_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 186, // i32x4.dot_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 188, // i32x4.extmul_low_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 189, // i32x4.extmul_high_i16x8_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 190, // i32x4.extmul_low_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 191, // i32x4.extmul_high_i16x8_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 192, // i64x2.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 193, // i64x2.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 195, // i64x2.all_true
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 196, // i64x2.bitmask
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 199, // i64x2.extend_low_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 200, // i64x2.extend_high_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 201, // i64x2.extend_low_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 202, // i64x2.extend_high_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 203, // i64x2.shl
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 204, // i64x2.shr_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 205, // i64x2.shr_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 206, // i64x2.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 209, // i64x2.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 213, // i64x2.mul
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 220, // i64x2.extmul_low_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 221, // i64x2.extmul_high_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 222, // i64x2.extmul_low_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 223, // i64x2.extmul_high_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 103, // f32x4.ceil
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 104, // f32x4.floor
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 105, // f32x4.trunc
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 106, // f32x4.nearest
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 224, // f32x4.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 225, // f32x4.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 227, // f32x4.sqrt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 228, // f32x4.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 229, // f32x4.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 230, // f32x4.mul
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 231, // f32x4.div
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 232, // f32x4.min
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 233, // f32x4.max
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 234, // f32x4.pmin
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 235, // f32x4.pmax
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 116, // f64x2.ceil
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 117, // f64x2.floor
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 122, // f64x2.trunc
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 148, // f64x2.nearest
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 236, // f64x2.abs
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 237, // f64x2.neg
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 239, // f64x2.sqrt
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 240, // f64x2.add
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 241, // f64x2.sub
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 242, // f64x2.mul
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 243, // f64x2.div
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 244, // f64x2.min
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 245, // f64x2.max
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 246, // f64x2.pmin
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 247, // f64x2.pmax
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 248, // i32x4.trunc_sat_f32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 249, // i32x4.trunc_sat_f32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 250, // f32x4.convert_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 251, // f32x4.convert_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 252, // i32x4.trunc_sat_f64x2_s_zero
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 253, // i32x4.trunc_sat_f64x2_u_zero
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 254, // f64x2.convert_low_i32x4_s
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 255, // f64x2.convert_low_i32x4_u
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 94, // f32x4.demote_f64x2_zero
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFD << 8) | 95, // f64x2.promote_low_f32x4
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    },



    // Atomic Memory Instructions
    {
        opcode: (0xFE << 8) | 0x00, // memory.atomic.notify
		render_bin: bin_render_mem_notify,
		render_wat: wat_render_mem_notify
        
    }, {
        opcode: (0xFE << 8) | 0x01, // memory.atomic.wait32
		render_bin: bin_render_mem_wait32,
		render_wat: wat_render_mem_wait32
        
    }, {
        opcode: (0xFE << 8) | 0x02, // memory.atomic.wait64
		render_bin: bin_render_mem_wait32,
		render_wat: wat_render_mem_wait64
        
    }, {
        opcode: (0xFE << 8) | 0x03, // atomic.fence
		render_bin: bin_render_inst16,
		render_wat: wat_render_inst
        
    }, {
        opcode: (0xFE << 8) | 0x10, // i32.atomic.load
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: (0xFE << 8) | 0x11, // i64.atomic.load
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: (0xFE << 8) | 0x12, // i32.atomic.load8_u
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: (0xFE << 8) | 0x13, // i32.atomic.load16_u
		render_bin: bin_render_i32_load,
		render_wat: wat_render_i32_load
        
    }, {
        opcode: (0xFE << 8) | 0x14, // i64.atomic.load8_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: (0xFE << 8) | 0x15, // i64.atomic.load16_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: (0xFE << 8) | 0x16, // i64.atomic.load32_u
		render_bin: bin_render_i64_load,
		render_wat: wat_render_i64_load
        
    }, {
        opcode: (0xFE << 8) | 0x17, // i32.atomic.store
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: (0xFE << 8) | 0x18, // i64.atomic.store
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: (0xFE << 8) | 0x19, // i32.atomic.store8
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: (0xFE << 8) | 0x1A, // i32.atomic.store16
		render_bin: bin_render_i32_store,
		render_wat: wat_render_i32_store
        
    }, {
        opcode: (0xFE << 8) | 0x1B, // i64.atomic.store8
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: (0xFE << 8) | 0x1C, // i64.atomic.store16
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: (0xFE << 8) | 0x1D, // i64.atomic.store32
		render_bin: bin_render_i64_store,
		render_wat: wat_render_i64_store
        
    }, {
        opcode: (0xFE << 8) | 0x1E, // i32.atomic.rmw.add
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x1F, // i64.atomic.rmw.add
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x20, // i32.atomic.rmw8.add_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x21, // i32.atomic.rmw16.add_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x22, // i64.atomic.rmw8.add_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x23, // i64.atomic.rmw16.add_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x24, // i64.atomic.rmw32.add_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x25, // i32.atomic.rmw.sub
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x26, // i64.atomic.rmw.sub
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x27, // i32.atomic.rmw8.sub_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x28, // i32.atomic.rmw16.sub_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x29, // i64.atomic.rmw8.sub_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2A, // i64.atomic.rmw16.sub_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2B, // i64.atomic.rmw32.sub_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2C, // i32.atomic.rmw.and
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2D, // i64.atomic.rmw.and
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2E, // i32.atomic.rmw8.and_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x2F, // i32.atomic.rmw16.and_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x30, // i64.atomic.rmw8.and_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x31, // i64.atomic.rmw16.and_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x32, // i64.atomic.rmw32.and_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x33, // i32.atomic.rmw.or
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x34, // i64.atomic.rmw.or
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x35, // i32.atomic.rmw8.or_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x36, // i32.atomic.rmw16.or_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x37, // i64.atomic.rmw8.or_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x38, // i64.atomic.rmw16.or_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x39, // i64.atomic.rmw32.or_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3A, // i32.atomic.rmw.xor
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3B, // i64.atomic.rmw.xor
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3C, // i32.atomic.rmw8.xor_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3D, // i32.atomic.rmw16.xor_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3E, // i64.atomic.rmw8.xor_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x3F, // i64.atomic.rmw16.xor_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x40, // i64.atomic.rmw32.xor_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x41, // i32.atomic.rmw.xchg
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x42, // i64.atomic.rmw.xchg
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x43, // i32.atomic.rmw8.xchg_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x44, // i32.atomic.rmw16.xchg_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x45, // i64.atomic.rmw8.xchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x46, // i64.atomic.rmw16.xchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x47, // i64.atomic.rmw32.xchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x48, // i32.atomic.rmw.cmpxchg
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x49, // i64.atomic.rmw.cmpxchg
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x4A, // i32.atomic.rmw8.cmpxchg_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x4B, // i32.atomic.rmw16.cmpxchg_u
		render_bin: bin_render_i32_rmw,
		render_wat: wat_render_i32_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x4C, // i64.atomic.rmw8.cmpxchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x4D, // i64.atomic.rmw16.cmpxchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }, {
        opcode: (0xFE << 8) | 0x4E, // i64.atomic.rmw32.cmpxchg_u
		render_bin: bin_render_i64_rmw,
		render_wat: wat_render_i64_rmw
        
    }
];
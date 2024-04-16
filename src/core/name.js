
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

import { ByteArray, lengthULEB128, lengthBytesUTF8 } from "./ByteArray";
import { SECTION_TYPE_CUSTOM, __nsym } from "./const";
import { WebAssemblyCustomSection, WasmFunction, WasmLocal, WasmMemory, WasmGlobal, WasmType, WasmDataSegment,
    WasmTable, WasmTag, WasmElementSegment } from "./types"
import { WebAssemblyModule } from "./WebAssembly";    

/** 
 * @param {Object} obj 
 * @return {boolean}
 */
export function canBeCustomNamed(obj) {
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

export class WebAssemblyCustomSectionName extends WebAssemblyCustomSection {

    /**
     * 
     * @param {WebAssemblyModule} module 
     */
    constructor(module) {
        super(module, "name");
    }

    encode(options) {
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
            secsz = strsz + lengthULEB128(strsz);
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

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionName}
     */
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

                let functions = module.functions;
                let cnt = data.readULEB128();
                for (let i = 0; i < cnt; i++) {
                    let idx = data.readULEB128();
                    let nlen = data.readULEB128();
                    let name = data.readUTF8Bytes(nlen);
                    let func = functions[idx];
                    func[__nsym] = name;
                }

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

    /**
     * Removes the custom name for the given object.
     * @param {Object} obj 
     */
    remove(obj) {
        delete obj[__nsym];
        this.markDirty();
    }

    /**
     * Renames the custom nameable WebAssembly object.
     * @param {Object} obj 
     * @param {string} newName 
     */
    rename(obj, newName) {
        obj[__nsym] = newName;
        this.markDirty();
    }

    /**
     * Indicates whether the WebAssembly object has a custom name specified.
     * @param {Object} obj 
     * @returns {boolean}
     */
    isNamed(obj) {
        return typeof obj[__nsym] == "string";
    }
}
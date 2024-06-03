
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

import * as fs from "node:fs"
import { ByteArray } from "./core/ByteArray";
import { WasmType, ImportedFunction, WA_EXPORT_KIND_FUNC } from "./core/types"
import { WebAssemblyFuncTypeSection, WebAssemblyImportSection, WebAssemblyFunctionSection, WebAssemblyExportSection, WebAssemblyDataSection } from "./core/WebAssembly";
import { WebAssemblyCustomSectionNetBSDExecHeader } from "./ylinker/rtld.exechdr"
import { WebAssemblyCustomSectionNetBSDDylinkV2 } from "./ylinker/rtld.dylink0";
import { RuntimeLinkingSymbol } from "./ylinker/core";
import { SECTION_TYPE_DATA } from "./core/const";

/**
 * @typedef {dylink0Symbol}
 * @type {object}
 * @property {string} name
 */

export class DylibSymbolLinker {

    constructor() {
        /** @type {Object.<string, dylink0Symbol>} */
        this._datamap = undefined;
        /** @type {Object.<string, dylink0Symbol>} */
        this._funcmap = undefined;
        /** @type {Object} */
        this._dl_data = undefined;
        /** @type {string} */
        this._linkMethod = undefined;
        /** @type {Object.<string, object>} */
        this._func_exports = undefined;
    }

    /**
     * 
     * @param {integer} fd 
     * @param {integer} filesize 
     * @param {object=} parseOptions 
     * @returns {DylibSymbolLinker}
     */
    static fromSymbolFile(fd, filesize, parseOptions) {
        let buffer = new Uint8Array(filesize);
        fs.readSync(fd, buffer, 0, filesize, 0);

        let data = new ByteArray(buffer);
        let magic = data.readUint32();
        let version = data.readUint32();

        if (magic != 0x6d736100) {
            throw new TypeError("magic is not equal to '\\0asm'");
        }
    
        if (version != 1) {
            throw new TypeError("version is not 1.0");
        }

        data.offset = 8;
        let end = buffer.byteLength;

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
                let nlen = data.readULEB128();
                chunk.name = data.readUTF8Bytes(nlen);
                chunk.dataOffset = data.offset;
                chunk.size = chunk.size - (data.offset - tmp);
                data.offset = tmp;
            } else if (type > 0x0C) {
                console.warn("section type: %d not handled", type);
            }

            // wasm binaries sometimes have trailing non used bytes.
            data.offset += size;
        }

        let dylink_opts = {decode_relocs: false};

        // we must include the exports into consideration so we load everything that makes that happen..
        let dataSection;
        let mod = {}
        mod._version = version;
        mod.dataSegments = [];
        mod.elementSegments = [];
        mod.exports = [];
        mod.functions = [];
        mod.globals = [];
        mod.memory = [];
        mod.tables = [];
        mod.types = [];
        mod.tags = [];
        let cnt = chunks.length;
        for (let i = 0; i < cnt; i++) {
            let chunk = chunks[i];
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
                    break;
                }
                case 0x03:  // function
                {
                    let sec = WebAssemblyFunctionSection.decode(mod, data, size);
                    chunks[chunk.index] = sec;
                    sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                    break;
                }
                case 0x07:  // export
                {
                    let sec = WebAssemblyExportSection.decode(mod, data, size);
                    chunks[chunk.index] = sec;
                    sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                    break;
                }
                case 0x0B:  // data
                {
                    let sec = WebAssemblyDataSection.decode(mod, data, size, null, {noCopy: true});
                    chunks[chunk.index] = sec;
                    sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                    dataSection = sec._cache;
                    break;
                }
                case 0x00:  // custom
                {
                    let sec;
                    let name = chunk.name;
                    switch (name) {
                        // custom netbsd
                        case 'rtld.dylink.0':
                            sec = WebAssemblyCustomSectionNetBSDDylinkV2.decode(mod, data, size, name, dylink_opts);
                            chunks[chunk.index] = sec;
                            mod._dl_data = sec.data;
                            chunk.data = sec.data;
                            sec._cache = {offset: chunk.offset, size: chunk.size, dataOffset: chunk.dataOffset};
                            break;
                        case 'rtld.exec-hdr':
                            sec = WebAssemblyCustomSectionNetBSDExecHeader.decode(mod, data, size, name);
                            chunks[chunk.index] = sec;
                            mod._exechdr = sec.data;
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

        let dl_data = mod._dl_data;

        let exports = mod.exports;
        let func_exports = {};
        let len = exports.length;
        for (let i = 0; i < len; i++) {
            let exp = exports[i];
            if (exp._kind == WA_EXPORT_KIND_FUNC) {
                let name = exp.name;
                let func = {name: name, type: exp.value.type};
                func_exports[name] = func;
            }
        }

        // interpet .dynsym and .dynstr
        const DYNSYM_SIZE = 12;
        let dynsym_seg, dynsym_off;
        let dynstr_seg, dynstr_off;
        let data_symbols = [];
        let func_symbols = [];
        let tmpoff;
        let dataSegments = dl_data.data_segments;
        len = dataSegments.length;
        for (let i = 0; i < len; i++) {
            let seg = dataSegments[i];
            if (seg.name == ".dynstr") {
                dynstr_seg = seg;
            } else if (seg.name == ".dynsym") {
                dynsym_seg = seg;
            }
        }

        if (!dynsym_seg || !dynstr_seg) {
            throw TypeError("DYNLINK_LOADER requires .dynstr & .dynsym segments");
        }

        dynstr_off = dataSection.dataOffset + dynstr_seg.offset;
        dynsym_off = dataSection.dataOffset + dynsym_seg.offset;
        len = dynsym_seg.size / DYNSYM_SIZE;
        let symbols = [];
        for (let i = 0; i < len; i++) {
            data.offset = dynsym_off;
            let strptr = data.readUint32();
            data.offset += 4;
            let namesz = data.readUint16();
            data.offset++;
            let type = data.readUint8();
            dynsym_off += DYNSYM_SIZE;
            
            data.offset = dynstr_off + strptr;
            let str = data.readUTF8Bytes(namesz);
            if (type == 1) {
                func_symbols.push({name: str});
            } else if (type == 2) {
                data_symbols.push({name: str});
            } else {
                symbols.push(str);
            }
        }





        let obj = new DylibSymbolLinker();
        // merge cached data
        obj._dl_data = dl_data;
        obj._func_exports = func_exports;
        obj._linkMethod = dl_data.module_name == "libobjc2" ? "both" : "dlsym";

        // build data symbol map
        let datamap = {};
        obj._datamap = datamap;
        len = data_symbols.length;
        for (let i = 0; i < len; i++) {
            let symbol = data_symbols[i];
            let name = symbol.name;
            datamap[name] = symbol;
        }

        // build func symbol map
        let funcmap = {};
        obj._funcmap = funcmap;
        len = func_symbols.length;
        for (let i = 0; i < len; i++) {
            let symbol = func_symbols[i];
            let name = symbol.name;
            funcmap[name] = symbol;
        }

        return obj;
    }

    /**
     * 
     * @param {string} symbol 
     * @param {WasmType} functype 
     * @returns {ImportedFunction|RuntimeLinkingSymbol}
     */
    resolveFuncSymbol(symbol, functype) {

        let method = this._linkMethod;
        let funcmap = this._func_exports;
        if (method == "both" && funcmap.hasOwnProperty(symbol)) {
            let expfunc = funcmap[symbol];
            if (WasmType.isEqual(functype, expfunc.type) === false) {
                throw new TypeError("type signature not matching");
            }

            if (expfunc.func)
                return expfunc.func; // ImportedFunction is cached here
            let dl_data = this._dl_data;
            let module_name = dl_data.module_name;
            if (!module_name) {
                module_name = "env";
            }
            let func = new ImportedFunction();
            func.module = module_name;
            func.name = expfunc.name;
            func.type = functype;
            expfunc.func = func;

            return func;
        }

        funcmap = this._funcmap;
        if (!funcmap.hasOwnProperty(symbol)) {
            return null;
        }

        let tblfunc = funcmap[symbol];

        // TODO: what about type-checking for dlsym based symbols? this would require reloc..
        //if (WasmType.isEqual(functype, tblfunc.type) === false) {
        //    throw new TypeError("type signature not matching");
        //}

        // TODO: if its found here it means that its table based function export

        if (tblfunc._symbol)
            return tblfunc._symbol; // ImportedFunction is cached here

        let mname = this._dl_data.module_name;
        let func = new RuntimeLinkingSymbol(mname, symbol, functype);
        tblfunc._symbol = func;
        func._usage = 0;

        return func;
    }

    /**
     * 
     * @param {string} symbol 
     * @returns {RuntimeLinkingSymbol}
     */
    resolveDataSymbol(symbol) {

        let datamap = this._datamap;
        if (!datamap.hasOwnProperty(symbol)) {
            return null;
        }

        return true;
    }

    /**
     * @param {integer} type
     * @param {string} symbol 
     * @param {WasmType} functype 
     * @returns {ImportedFunction|RuntimeLinkingSymbol}
     */
    resolve(type, symbol, functype) {

        if (type == 0) {
            return this.resolveFuncSymbol(symbol, functype);

        } else if (type == 1) {
            return this.resolveDataSymbol(symbol);
        }

        return null;
    }
}
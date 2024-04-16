
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

import { WebAssemblyCustomSection } from "./types"

export const R_WASM_FUNCTION_INDEX_LEB = 0x00;
export const R_WASM_TABLE_INDEX_SLEB = 0x01;
export const R_WASM_TABLE_INDEX_I32 = 0x02;
export const R_WASM_MEMORY_ADDR_LEB = 0x03;
export const R_WASM_MEMORY_ADDR_SLEB = 0x04;
export const R_WASM_MEMORY_ADDR_I32 = 0x05;
export const R_WASM_TYPE_INDEX_LEB = 0x06;
export const R_WASM_GLOBAL_INDEX_LEB = 0x07;
export const R_WASM_FUNCTION_OFFSET_I32 = 0x08;
export const R_WASM_SECTION_OFFSET_I32 = 0x09;
export const R_WASM_EVENT_INDEX_LEB = 0x10;
export const R_WASM_GLOBAL_INDEX_I32 = 0x13;
export const R_WASM_MEMORY_ADDR_LEB64 = 0x14;
export const R_WASM_MEMORY_ADDR_SLEB64 = 0x15;
export const R_WASM_MEMORY_ADDR_I64 = 0x16;
export const R_WASM_TABLE_INDEX_SLEB64 = 0x18;
export const R_WASM_TABLE_INDEX_I64 = 0x19;
export const R_WASM_TABLE_NUMBER_LEB = 0x20;

function relocTypeName(type) {
    switch (type) {
        case 0x00:
            return "R_WASM_FUNCTION_INDEX_LEB";
        case 0x01:
            return "R_WASM_TABLE_INDEX_SLEB";
        case 0x02:
            return "R_WASM_TABLE_INDEX_I32";
        case 0x03:
            return "R_WASM_MEMORY_ADDR_LEB";
        case 0x04:
            return "R_WASM_MEMORY_ADDR_SLEB";
        case 0x05:
            return "R_WASM_MEMORY_ADDR_I32";
        case 0x06:
            return "R_WASM_TYPE_INDEX_LEB";
        case 0x07:
            return "R_WASM_GLOBAL_INDEX_LEB";
        case 0x08:
            return "R_WASM_FUNCTION_OFFSET_I32";
        case 0x09:
            return "R_WASM_SECTION_OFFSET_I32";
        case 0x10:
            return "R_WASM_EVENT_INDEX_LEB";
        case 0x13:
            return "R_WASM_GLOBAL_INDEX_I32";
        case 0x14:
            return "R_WASM_MEMORY_ADDR_LEB64";
        case 0x15:
            return "R_WASM_MEMORY_ADDR_SLEB64";
        case 0x16:
            return "R_WASM_MEMORY_ADDR_I64";
        case 0x18:
            return "R_WASM_TABLE_INDEX_SLEB64";
        case 0x19:
            return "R_WASM_TABLE_INDEX_I64";
        case 0x20:
            return "R_WASM_TABLE_NUMBER_LEB";
    }
}

/**
 * @typedef {llvm.Reloc}
 * @type {object}
 * @property {integer} type
 * @property {integer} offset
 * @property {integer} index
 * @property {integer} addend
 */

/**
 * Used to represent the reloc.DATA and reloc.CODE section provided by clang in `*.bc` files.
 * 
 * @property {llvm.Reloc[]} relocs
 */
export class WebAssemblyCustomSectionReloc extends WebAssemblyCustomSection {

    constructor(module, name) {
        super(module, name);
    }

    encode(options) {

        throw new ReferenceError("encoding reloc.CODE section not supported");
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionReloc}
     */
    static decode(module, data, size, name) {

        let end = data.offset + size;
        let secidx = data.readULEB128();
        let count = data.readULEB128();
        let relocs = [];
        for (let i = 0; i < count; i++) {
            let reloc = {};
            let type = data.readUint8();
            reloc.type = type;
            reloc.offset = data.readULEB128();
            reloc.index = data.readULEB128();

            if (type == 3 || type == 4 || type == 5 || type == 8 || type == 9) {
                reloc.addend = data.readSLEB128(32);
            }

            relocs.push(reloc);
        }

        //console.log("%s secidx = %d relocs = %o", name, secidx, relocs);
        

        let section = new WebAssemblyCustomSectionReloc(module, name);
        section.relocs = relocs;
        return section;
    }
}
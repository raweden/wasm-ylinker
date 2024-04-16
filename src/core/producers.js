
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

import { ByteArray, lengthBytesUTF8, lengthULEB128 } from "./ByteArray";
import { SECTION_TYPE_CUSTOM } from "./const";
import { WebAssemblyCustomSection } from "./types"

/**
 * @typedef VersionedName
 * @type {Object}
 * @property {string} value
 * @property {string} version
 * 
 * @typedef ProducersData
 * @type {Object}
 * @property {Array.<string|VersionedName>} language
 * @property {Array.<string|VersionedName>} processed_by
 * @property {Array.<string|VersionedName>} sdk
 * 
 * TODO: map processed-by to processed_by
 */

// https://github.com/WebAssembly/tool-conventions/blob/main/ProducersSection.md
export class WebAssemblyCustomSectionProducers extends WebAssemblyCustomSection {

    constructor(module, fields) {
        super(module, "producers");
        /** @type {ProducersData} */
        this.data = fields;
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

        const SEC_NAME = this.name;

        totsz += lengthULEB128(count);
        let strlen = lengthBytesUTF8(SEC_NAME);
        totsz += lengthULEB128(strlen);
        totsz += strlen;
        secsz = totsz;
        totsz += lengthULEB128(totsz);

        // actual encoding
        let buf = new ArrayBuffer(totsz + 1);
        let data = new ByteArray(buf);
        data.writeUint8(SECTION_TYPE_CUSTOM);
        data.writeULEB128(secsz);
        data.writeULEB128(strlen);
        data.writeUTF8Bytes(SEC_NAME);
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
                    data.writeULEB128(0); // value has no version so write 0 in version string length
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
                    } else {
                        data.writeULEB128(0);
                    }
                }
            }
        }

        return buf;
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionProducers}
     */
    static decode(module, data, size) {

        let count = data.readULEB128();
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

        let section = new WebAssemblyCustomSectionProducers(module, fields);
        module.producers = fields;
        return section;
    }

    // TODO: add utilities from ylinker into this class.
}

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

import { ByteArray } from "./ByteArray";
import { SECTION_TYPE_CUSTOM } from "./const";
import { WebAssemblyCustomSection } from "./types"

/**
 * @typedef {TargetFeatures}
 * @type {Object}
 * 
 * @typedef TargetFeatures
 * @type {object}
 * @property {integer} atomics
 * @property {integer} bulk-memory
 * @property {integer} exception-handling
 * @property {integer} multivalue
 * @property {integer} mutable-globals
 * @property {integer} nontrapping-fptoint
 * @property {integer} sign-ext
 * @property {integer} simd128
 * @property {integer} tail-call
 */


// https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md#target-features-section
export class WebAssemblyCustomSectionTargetFeatures extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "target_features");
        /** @type {TargetFeatures} */
        this.data = null;
    }

    encode(options) {
        
    }

    /**
     * 
     * @param {WebAssemblyModule} module 
     * @param {ByteArray} data 
     * @param {integer} size 
     * @returns {WebAssemblyCustomSectionTargetFeatures}
     */
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
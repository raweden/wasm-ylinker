
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

import { UTF8ArrayToString, ASCIIArrayToString } from "./core/utils.js";
import { ImportedFunction } from "./core/types.js"
import { parseWebAssemblyBinary } from "./core/WebAssembly.js"
import {ByteCodeLinker} from "./bclinker.js"

const ar_hdrbuf = new Uint8Array(60);

export class ARLinker {

    constructor() {
        this._fd = undefined;
        this._symtable = new Map();
        this._hdrmap = new Map();
        this._codesyms = new Map();
        this._datasyms = new Map();
        /** @type {ByteCodeLinker} */
        this._bclinker = null;
        this._parseOptions = null;
        /** @type {boolean} */
        this._wholeArchive = false;
    }

    readHeaderAt(pos, reload) {

        let fd = this._fd;
        fs.readSync(fd, ar_hdrbuf, 0, 60, pos);

        let off = 0;
        let name = UTF8ArrayToString(ar_hdrbuf, off, 16);      // 16 bytes
        off += 16;
        let date = ASCIIArrayToString(ar_hdrbuf, off, 12);     // 12 bytes
        off += 12;
        let uid = ASCIIArrayToString(ar_hdrbuf, off, 6);       //  6 bytes
        off += 6;
        let gid = ASCIIArrayToString(ar_hdrbuf, off, 6);       //  6 bytes
        off += 6;
        let mode = ASCIIArrayToString(ar_hdrbuf, off, 8);      //  8 bytes
        off += 8;
        let size = ASCIIArrayToString(ar_hdrbuf, off, 10);     // 10 bytes
        off += 10;
        let fmag = ASCIIArrayToString(ar_hdrbuf, off, 2);      //  2 bytes
        off += 2;
        if (fmag != '\x60\x0a') {
            throw new TypeError("corruped ar file");
        }

        let hdrmap = this._hdrmap;
        let hdr, offset = pos + off;
        if (hdrmap.has(offset)) {
        	hdr = hdrmap.get(offset);
        } else {
        	hdr = {};
        	hdrmap.set(offset, hdr);
        }

        hdr.name = name.trimEnd();
        hdr.date = date.trim().length == 0 ? null : parseInt(date, 10);
        hdr.uid = uid.trim().length == 0 ? null : parseInt(uid, 10);
        hdr.gid = gid.trim().length == 0 ? null : parseInt(gid, 10);
        hdr.mode = mode.trim().length == 0 ? null : parseInt(mode, 10);
        hdr.size = parseInt(size, 10);
        hdr.offset = pos + off;
        hdr._isloaded = true;

        return hdr;
    }

    /**
     * 
     * @param {integer} fd 
     * @param {integer} filesize 
     * @param {object} parseOptions 
     * @returns {ARLinker}
     */
    static fromArchive(fd, filesize, parseOptions) {
        
        let loader = new ARLinker();
        loader._fd = fd;
        loader._filesize = filesize;
        loader._parseOptions = parseOptions;

        let hdr = loader.readHeaderAt(8);

        // the symbol table ('/') is as following:
        // i32 BE number of enteries
        // enteries x i32 BE (value + 60 [header] is the offset into file)
        // enteries x string (null-terminated)
        // 
        // The 2th chunks is just list of files separated by 0x0a chars..
        
        if (hdr.name != '/') {
            console.error("unexpected first chunk");
        }

        // reading symbol table.
        let buf = new Uint8Array(hdr.size);
        let data = new DataView(buf.buffer);

        fs.readSync(fd, buf, 0, hdr.size, hdr.offset);

        let offsets = [];
        let symtable = loader._symtable;
        let hdrmap = loader._hdrmap;
        let off = 0;
        let cnt = data.getUint32(off, false);
        off += 4;
        for (let i = 0; i < cnt; i++) {
            let chunk_off = data.getUint32(off, false);
            offsets.push(chunk_off);
            off += 4;
        }

        for (let i = 0; i < cnt; i++) {
            let sym = "";
            while(true) {
                let chr = buf[off++];
                if (chr == 0x00)
                    break;
                sym += String.fromCharCode(chr);
            }
            let hdr, fileoff = offsets[i] + 60;
            if (hdrmap.has(fileoff)) {
            	hdr = hdrmap.get(fileoff);
            } else {
            	hdr = {offset: fileoff, _isloaded: false};
            	hdrmap.set(fileoff, hdr);
            }

            symtable.set(sym, hdr);
        }

        return loader;
    }

    loadFullArchive() {
        this._wholeArchive = true;
        // TODO: implement this!
    }

    loadFuncSymbol(name) {

        let symtable = this._symtable;
        if (symtable.has(name)) {
            let fd = this._fd;
            let bclinker, buf, mod, hdr = symtable.get(name);
            if (!hdr._isloaded) {
                this.readHeaderAt(hdr.offset - 60);
                buf = new Uint8Array(hdr.size);
                fs.readSync(fd, buf, 0, hdr.size, hdr.offset);

                bclinker = this._bclinker;
                if (!bclinker) {
                    bclinker = new ByteCodeLinker();
                    this._bclinker = bclinker;
                }

                mod = parseWebAssemblyBinary(buf, this._parseOptions);
                bclinker.prepareLinking(mod);
                bclinker.mergeWithModule(mod);
            } else {
                bclinker = this._bclinker;
            }

            return true;
        }

        return false;
    }

    loadDataSymbol(name) {

        let symtable = this._symtable;
        if (symtable.has(name)) {
            let fd = this._fd;
            let bclinker, buf, mod, hdr = symtable.get(name);
            if (!hdr._isloaded) {
                this.readHeaderAt(hdr.offset - 60);
                buf = new Uint8Array(hdr.size);
                fs.readSync(fd, buf, 0, hdr.size, hdr.offset);

                bclinker = this._bclinker;
                if (!bclinker) {
                    bclinker = new ByteCodeLinker();
                    this._bclinker = bclinker;
                }

                mod = parseWebAssemblyBinary(buf, this._parseOptions);
                bclinker.prepareLinking(mod);
                bclinker.mergeWithModule(mod);
            } else {
                bclinker = this._bclinker;
            }

            return true;
        }

        return false;
    }

    resolveFuncSymbol(symbol, functype) {

        let symtable = this._symtable;
        if (symtable.has(symbol)) {
            let fd = this._fd;
            let bclinker, buf, mod, hdr = symtable.get(symbol);
            if (!hdr._isloaded) {
                this.readHeaderAt(hdr.offset - 60);
                buf = new Uint8Array(hdr.size);
                fs.readSync(fd, buf, 0, hdr.size, hdr.offset);

                bclinker = this._bclinker;
                if (!bclinker) {
                    bclinker = new ByteCodeLinker();
                    this._bclinker = bclinker;
                }

                mod = parseWebAssemblyBinary(buf, this._parseOptions);
                bclinker.prepareLinking(mod);
                bclinker.mergeWithModule(mod);
            } else {
                bclinker = this._bclinker;
            }

            let func = bclinker.funcmap[symbol];
            if (func instanceof ImportedFunction) {
                return null;
            }

            return func;
        }

        return null;
    }

    resolveDataSymbol(symbol) {

        let symtable = this._symtable;
        if (symtable.has(symbol)) {
            let fd = this._fd;
            let bclinker, buf, mod, hdr = symtable.get(symbol);
            if (!hdr._isloaded) {
                this.readHeaderAt(hdr.offset - 60);
                buf = new Uint8Array(hdr.size);
                fs.readSync(fd, buf, 0, hdr.size, hdr.offset);

                bclinker = this._bclinker;
                if (!bclinker) {
                    bclinker = new ByteCodeLinker();
                    this._bclinker = bclinker;
                }

                mod = parseWebAssemblyBinary(buf, this._parseOptions);
                bclinker.prepareLinking(mod);
                bclinker.mergeWithModule(mod);
            } else {
                bclinker = this._bclinker;
            }

            let _symtable = bclinker._symtable;
            let len = _symtable.length;
            for (let i = 0; i < len; i++) {
                let sym = _symtable[i];
                if (sym.kind != 1)
                    continue;
                if (sym.name == symbol) {
                    if (!sym.dataSegment)
                        console.warn("match found but is not strong ref");
                    return sym;
                }
            }

            return null;
        }

        return null;
    }
}

// https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md
// https://en.wikipedia.org/wiki/Ar_(Unix)
// https://manpages.ubuntu.com/manpages/trusty/man1/llvm-ar.1.html
// TODO: now we load the entire file, but we could simply read whats needed on demand;
//       By reading 60 bytes, then the size of the chunk.
function parseARFile(fd) {

    

}
#!/bin/env -S node --inspect-brk

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
import * as vm from "node:vm"
import * as path from "node:path"
import { parseWebAssemblyBinary } from "../src/core/WebAssembly.js"
import { ByteCodeLinker } from "../src/bclinker.js"
import { ARLinker } from "../src/ar-loader.js"
import { DylibSymbolLinker } from "../src/dylib-loader.js"
import { WebAssemblyCustomSectionNetBSDExecHeader } from "../src/ylinker/rtld.exechdr.js";
import { WebAssemblyCustomSectionNetBSDDylinkV2 } from "../src/ylinker/rtld.dylink0.js";

// 
// TODO (Next-up):
// - Try to merge the data-segments to build the "export" memory locations
// - fixup builtin(s)
// - fixup objc

function supportsFile(arg) {
    return arg.endsWith(".bc") || arg.endsWith(".so.wasm") || arg.endsWith(".a") || arg.endsWith(".wasm");
}

const opt_template = {
    '--synthesize-objc_msgSend': 1, // JUST a boolean flags, if present its true.
};

const LNK_DATA_SUFFIX = ".ylinker-data";

/**
 * 
 * @param {string} data 
 * @returns {string[]}
 */
function parseRSPFile(data) {
    let len = data.length;
    let idx = 0;
    let args = [];
    while (idx < len) {
        let quoted = false;
        let nxt, chr, str = "";
        // skip one or more space.
        while (idx < len) {
            chr = data.charCodeAt(idx);
            if (chr != 0x09 && chr != 0x20) {
                break;
            }
            idx++;
        }

        if (chr == 0x27) {
            // single quoted string
            idx++;
            quoted = true;
            while (idx < len) {
                chr = data.charCodeAt(idx);
                if (chr == 0x5c) {
                    idx++;
                    nxt = data.charCodeAt(idx);
                    if (nxt == 0x27) {
                        str += '\'';
                    } else if (nxt == 0x22) {
                        str += '\"';
                    } else if (nxt == 0x74) {
                        str += '\t';
                    } else {
                        console.log("found '%s' char-code: %s", data[idx], nxt.toString(16));
                    }
                } else if (chr == 0x27) {
                    idx++;
                    break;
                } else {
                    str += data[idx];
                }
                idx++;
            }
        } else if (chr == 0x22) {
            // double quoted string
            idx++;
            quoted = true;
            while (idx < len) {
                chr = data.charCodeAt(idx);
                if (chr == 0x5c) {
                    idx++;
                    nxt = data.charCodeAt(idx);
                    if (nxt == 0x27) {
                        str += '\'';
                    } else if (nxt == 0x22) {
                        str += '\"';
                    } else if (nxt == 0x74) {
                        str += '\t';
                    } else {
                        console.log("found '%s' char-code: %s", data[idx], nxt.toString(16));
                    }
                } else if (chr == 0x22) {
                    idx++;
                    break;
                } else {
                    str += data[idx];
                }
                idx++;
            }
        } else {
            // unquoted argument
            quoted = false;
            while (idx < len) {
                chr = data.charCodeAt(idx);
                if (chr == 0x5c) {
                    idx++;
                    nxt = data.charCodeAt(idx);
                    if (nxt == 0x20) {
                        str += '\x20';
                    } else if (nxt == 0x09) {
                        str += '\x09';
                    } else {
                        console.log("found '%s' char-code: %s", data[idx], nxt.toString(16));
                    }
                } else if (chr == 0x20) {
                    break;
                } else {
                    str += data[idx];
                }
                idx++;
            }
        }

        if (str.length > 0)
            args.push(str);
        str = "";
    }

    return args;
}

function main() {
    console.log(process.argv);
    console.log(process.cwd());
    //console.log(process.env);
    
    let bopts = [];
    let moduleName;
    let outfile, rspfile;
    let files = [];
    let flags = {};
    let noexport = false;
    let exported = [];
    let opts = {noexport: false, importMemory: false};

    let args = [];
    let argv = process.argv;
    let argc = argv.length;
    for (let i = 2; i < argc; i++) {
        let arg = argv[i];
        if (arg.startsWith("@") && arg.endsWith(".rsp")) {
            let rspPath = arg.substring(1);
            let rspargs, rsp = fs.readFileSync(rspPath, {encoding: 'utf8'});
            rspargs = parseRSPFile(rsp);
            args = args.concat(rspargs);
        } else {
            args.push(arg);
        }
    }

    console.log(argv);

    argc = args.length;
    for (let i = 0; i < argc; i++) {
        let arg = args[i];
        if (arg == '-o') {
            outfile = args[i + 1];
            i++;
        } else if(arg.startsWith("--")) {
            if (arg.startsWith("--no-export")) {
                opts.noexport = true;
            } else if (arg.startsWith("--import-memory")) {
                opts.importMemory = true;
            } else if (arg.startsWith("--shared")) {
                opts.memoryIsShared = true;
            } else if (arg.startsWith("--export=")) {
                let name = arg.substring(9);
                if (exported.indexOf(name) == -1)
                    exported.push(name);
            } else if (arg.startsWith("--module-name=")) {
                moduleName = arg.substring(14);
                if (moduleName.startsWith("\"") && moduleName.endsWith("\"")) {
                    moduleName = moduleName.substring(1, moduleName.length - 1);
                }
            } else if (arg.startsWith("--dylink-profiles-dirpath=")) {
                opts.dylink_profiles_dirpath = arg.substring(26);
            } else {
                console.log("%s not implemented", arg);
            }
        } else if (arg.startsWith('-')) {
            if (arg == "-L") {
                console.log("library search path '-L' not implemented for %s %s", arg, argv[i++]);
            } else if (arg == "-l") {
                console.log("library search path '-L' not implemented for %s %s", arg, argv[i++]);
            }
        } else if (supportsFile(arg)) {
            files.push(arg);
        }
    }

    let parseOptions = {
        linking: true, 
        customSections: function(mod, data, size, name, options, chunk) {
            let result;
            if (name == 'rtld.dylink.0') {
                result = WebAssemblyCustomSectionNetBSDDylinkV2.decode(mod, data, size, name);
                mod._dl_data = result.data;
            } else if (name == 'rtld.exec-hdr') {
                result = WebAssemblyCustomSectionNetBSDExecHeader.decode(mod, data, size);
                mod._exechdr = result.data;
            }

            return result;
        }
    };

    if (typeof outfile != "string") {

        if (files.length == 1) {
            outfile = generateOutputFilename(files[0]);
        } else {

        }
    }

    opts.exported = exported;

    let emptymap = new Map();
    let len = files.length;
    let bclinker = new ByteCodeLinker();
    bclinker.options = opts;
    //len = Math.min(4, len);
    let signbuf = new Uint8Array(8);
    let data = new DataView(signbuf.buffer);

    if (opts.so_ident) {
        bclinker.so_ident = opts.so_ident;
    } else {
        bclinker.so_ident = generateSOIdent(outfile);
    }

    if (moduleName) {
        bclinker.moduleName = moduleName;
    }
    
    // pre-group files based on file extentions (works in some cases..)
    for (let i = 0; i < len; i++) {
        let mod, file = files[i];
        console.log("linking file: %s", file);

        if (file.endsWith(".so.wasm") || file.endsWith(".dylib.wasm")) {
            console.log("should read %s as dynamic / shared object", file);
            let dlnk_file;
            try {
                dlnk_file = findDylinkedFile(null, file);
            } catch {
                console.error("missing %s linker file for %s", file);
                continue;
            }

            let infd = fs.openSync(dlnk_file, 'r');
            let filesize = fs.fstatSync(infd).size;
            let linker = DylibSymbolLinker.fromSymbolFile(infd, filesize);
            linker.filepath = file;
            bclinker.linkTo(linker, 'dylink');
            continue;
        }

        let infd;
        try {
            infd = fs.openSync(file, 'r');
        } catch (err) {
            console.error(err);
        }

        let filesize = fs.fstatSync(infd).size;
        fs.readSync(infd, signbuf, 0, 8, 0);

        if (data.getUint32(0, true) == 0x6d736100) {
            // reading and parsing wasm binary
            let buf = new Uint8Array(filesize);
            fs.readSync(infd, buf, 0, filesize, 0);
            mod = parseWebAssemblyBinary(buf, parseOptions);

            bclinker.prepareLinking(mod);
            bclinker.mergeWithModule(mod);
            fs.closeSync(infd);

        } else if (data.getUint32(0, true) == 0x72613C21 && data.getUint32(4, true) == 0x0A3E6863) { // == !<arch>\n
            log_code_relocs(bclinker);
            //let infd = fs.openSync(file);
            let linker = ARLinker.fromArchive(infd, filesize, parseOptions);
            linker.filepath = file;
            bclinker.linkTo(linker, 'static');
        }
    }

    bclinker.is_main_exec = outfile.endsWith(".so.wasm") == false;

    bclinker.performLinking(opts);

    /*
    let logout = outfile + ".symbol-log";
    try {
        outfd = fs.openSync(logout, 'w+', 438); // truncated if exists mode: 0666
        bclinker.writeSymbolLog(outfd);
        fs.closeSync(outfd);
    } catch (err) {
        console.error("cannot read/write %s", logout);
        console.error(err);
        fs.closeSync(outfd);
        //throw err;
    }*/


    let outfd = -1;
    let outfiletmp = outfile + ".tmp";
    try {
        outfd = fs.openSync(outfiletmp, 'w+', 438); // truncated if exists mode: 0666
        //throw new Error("DO NOT WRITE UNTIL WE ARE TESTING BINARY");
        bclinker.writeModule(outfd);
        fs.closeSync(outfd);
        outfd = -1;
        fs.renameSync(outfiletmp, outfile);
    } catch (err) {
        console.error("cannot read/write %s", outfiletmp);
        if (outfd !== -1)
            fs.closeSync(outfd);
        throw err
    }

}

/**
 * 
 * @param {string} filepath 
 * @returns {string}
 */
function generateSOIdent(filepath) {
    let parts = filepath.split('/');
    parts = parts.pop();
    if (parts.endsWith(".dylib.wasm")) {
        let end = parts.lastIndexOf(".dylib.wasm");
        parts = parts.substring(0, end);
    } else if (parts.endsWith(".so.wasm")) {
        let end = parts.lastIndexOf(".so.wasm");
        parts = parts.substring(0, end);
    } else if (parts.endsWith(".wasm")) {
        let end = parts.lastIndexOf(".wasm");
        parts = parts.substring(0, end);
    }

    return parts.replace(/[\s\.]/gm, '_');
}

function generateOutputFilename(filepath) {
    throw new Error("NOT IMPLEMENTED");
}

/**
 * 
 * @param {string[]} paths 
 * @param {string} filename 
 * @returns {string}
 */
function findDylinkedFile(paths, filename) {
    let found = false;
    let names = [filename];
    let testname = filename;
    if (filename.endsWith(".so.wasm")) {
        let name = filename.substring(0, filename.length - 8);
        names.push(name + ".wasm");
        names.push(name + ".dylib");
        names.push(name + ".so");
    } else if (filename.endsWith(".wasm")) {
        let name = filename.substring(0, filename.length - 5);
        names.push(name + ".wasm");
        names.push(name + ".dylib");
        names.push(name + ".so");
    }

    let len = names.length;
    for (let i = 0; i < len; i++) {
        let name = names[i];
        try {
            fs.accessSync(name, fs.constants.R_OK);
            return name;
        } catch (err) {
            // do nothing
        }
    }

    throw new ReferenceError("LINKER_FILE_NOT_FOUND");
}

function findLinkerDataFile(filename) {
    let found = false;
    let lnkfile = filename + LNK_DATA_SUFFIX;
    try {
        fs.accessSync(lnkfile, fs.constants.R_OK);
        return lnkfile;
    } catch (err) {
        // do nothing
    }

    let parts = filename.split('.');
    parts.pop();
    lnkfile = parts.join('.') + LNK_DATA_SUFFIX;
    try {
        fs.accessSync(lnkfile, fs.constants.R_OK);
        return lnkfile;
    } catch (err) {
        // do nothing
    }

    throw new ReferenceError("LINKER_FILE_NOT_FOUND");
}

function log_code_relocs(bclinker) {
    let code_relocs = bclinker._code_relocs;
    let types = [];
    let len = code_relocs.length;
    for (let i = 0; i < len; i++) {
        let reloc = code_relocs[i];
        if (types.indexOf(reloc.type) == -1) {
            types.push(reloc.type);
        }
    }

    console.log('reloc types %o', types);
}

// args & rsp example for executable:
// [
//   '/home/raweden/.nvm/versions/node/v16.15.1/bin/node',
//   '/home/raweden/Projects/wasm-info/bin/wasm-ylinker',
//   '-o',
//   'gdnc.wasm',
//   '@gdnc.wasm.rsp'
// ]
// [
//   '--export-all',
//   '--no-entry',
//   '-error-limit=1000',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Tools/gdnc.bc',
//   'obj/ABS_PATH/home/raweden/Projects/netbsd-src/lib/libc/arch/wasm/libnetbsd-libc.a',
//   'libs-base.so.wasm'
// ]
// 
// args & rsp example for shared-library
// [1/3] SOLINK libs-base.so.wasm
// [
//   '/home/raweden/.nvm/versions/node/v16.15.1/bin/node',
//   '/home/raweden/Projects/wasm-info/bin/wasm-ylinker',
//   '-o',
//   'libs-base.so.wasm',
//   '@libs-base.so.wasm.rsp'
// ]
// [
//   '-L/home/raweden/Projects/GnuStep on WebAssembly/libobjc2/objc',
//   '-L../../include',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/wasm/objcgnustep.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/callframe.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/externs.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/GSArray.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/GSAttributedString.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/GSBlocks.bc',
//   'obj/ABS_PATH/home/raweden/Projects/GnuStep on WebAssembly/libs-base/Source/GSConcreteValue.bc',
// ]

main();





function prepareLinking(wasmModule) {

}



const fs = require("fs");
const decodeYLinkerData = require("./ylinker-data.js").decodeYLinkerData;


class SOSymbolLinker {

    constructor() {

    }

    static fromSymbolFile(fd, filesize, parseOptions) {
        let buffer = new Uint8Array(filesize);
        fs.readSync(fd, buffer, 0, filesize, 0);
        let info = decodeYLinkerData(buffer);

        let obj = new SOSymbolLinker();
        // merge cached data
        obj._dylib_info = info.dylib_info;
        obj._reloc_globs = info.reloc_globs;
        obj._types = info.types;
        obj._data_sections = info.data_sections;
        obj._data_symbols = info.data_symbols;
        obj._func_symbols = info.func_symbols;

        // build data symbol map
        let data_symbols = info.data_symbols;
        let datamap = {};
        obj._datamap = datamap;
        let len = data_symbols.length;
        for (let i = 0; i < len; i++) {
            let symbol = data_symbols[i];
            let name = symbol.name;
            datamap[name] = symbol;
        }

        // build func symbol map
        let func_symbols = info.func_symbols;
        let funcmap = {};
        obj._funcmap = funcmap;
        len = func_symbols.length;
        for (let i = 0; i < len; i++) {
            let symbol = func_symbols[i];
            let name = symbol.name;
            funcmap[name] = symbol;
            if (symbol.aliases) {
                let aliases = symbol.aliases;
                let zlen = aliases.length;
                for(let z = 0; z < zlen; z++){
                    let alias = aliases[z];
                    funcmap[alias] = symbol;
                }
            }
        }

        return obj;
    }

    resolveFuncSymbol(symbol, functype) {

        let funcmap = this._funcmap;
        if (!funcmap.hasOwnProperty(symbol)) {
            return null;
        }

        let funcSymbol = funcmap[symbol];

        if (WasmType.isEqual(functype, funcSymbol.type) === false) {
            throw new TypeError("type signature not matching");
        }

        if (funcSymbol.func)
            return funcSymbol.func; // ImportedFunction is cached here

        let dylib_info = this._dylib_info;
        let func = new ImportedFunction();
        func.module = dylib_info.sharedObjectIdent;
        func.name = funcSymbol.name;
        func.type = functype;
        funcSymbol.func = func;

        return func;
    }

    resolveDataSymbol(symbol) {

        let datamap = this._datamap;
        if (!datamap.hasOwnProperty(symbol)) {
            return null;
        }

        let dataSymbol = datamap[symbol];
        return {reloc_glob: dataSymbol.reloc_global, reloc_offset: dataSymbol.reloc_offset};
    }

    resolve(type, symbol, functype) {

        if (type == 0) {

            let funcmap = this._funcmap;
            if (!funcmap.hasOwnProperty(symbol)) {
                return null;
            }

            let funcSymbol = funcmap[symbol];

            if (WasmType.isEqual(functype, funcSymbol.type) === false) {
                throw new TypeError("type signature not matching");
            }

            if (funcSymbol.func)
                return funcSymbol.func; // ImportedFunction is cached here

            let dylib_info = this._dylib_info;
            let func = new ImportedFunction();
            func.module = dylib_info.sharedObjectIdent;
            func.name = funcSymbol.name;
            func.type = functype;
            funcSymbol.func = func;

            return func;

        } else if (type == 1) {

            let datamap = this._datamap;
            if (!datamap.hasOwnProperty(symbol)) {
                return null;
            }

            let dataSymbol = datamap[symbol];
            return {reloc_glob: dataSymbol.reloc_global, reloc_offset: dataSymbol.reloc_offset};
        }

        return null;
    }
}

module.exports = SOSymbolLinker;
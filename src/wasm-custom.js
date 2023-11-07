




class WebAssemblyCustomRelocCMD extends WebAssemblyCustomSection {

    constructor(module) {
        super(module, "reloc.CMD");
        this._reloc_groups = undefined;
    }
}
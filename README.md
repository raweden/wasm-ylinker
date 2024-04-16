# wasm-ylinker

linker & post-processor for WebAssembly binaries.

This project began as a simple inspection tool to view whats defined within a WebAssembly binary, but did grow into a library and tooling for manipulation of binaries. The manipulation is based around a objectification of the entire binary down to the bytecode level. Which enables a placeholder import function to be replaced by a byte-code instruction or a sequence of such. 

### building 

```
# from the repo directory run one of the following commands:

rollup --config build/web.wasm-info.config.mjs --sourcemap
rollup --config build/bin.wasm-ylinker.config.mjs --sourcemap
rollup --config build/bin.wasm-info.config.mjs

```

### `./bin/wasm-ylinker`

A drop-in replacement for `wasm-ld` (clang lld) linker which bundles `*.bc` files into a final binary. Perfomance wise this is alot slower than clangs linker but allows for finegrained manipulation at the linking stage. My current uses are for:
- generating binaries which can be weakly dynamically linked at runtime (using WebAssembly.Table rather than exports) which generates `.dynsym` and `.dynstr` data-segments simular to elf.


### `./bin/wasm-info`

Command-line version of `dist/wasm-info` which can be runned from build-scripts.



### `./dist/wasm-info`

GUI for inspection of binaries. Drag 'n drop support and also supports running the same "workflows" as `bin/wasm-info`


### Runtime Dynamic linking

For the most part runtime dynamic linking only makes sense when using the same library in multiple executables or a single executable with optional loaded plugins which might not be needed everytime the program is runned. But is not the common case for most WebAssembly binaries. Unlike the convention proposal for dynamic linking this approach is based around a concept which is more similar with elf and uses relocation at runtime, for both data-symbols and function, The performance after relocation is the performance difference of `call` vs `indirect_call` which in theory at best would be a `i32 == i32` compare before the actual call, as this binding of runtime linked function is weak it also allows for circular dependencies without the use of a intermediate JavaScript-side function which acts a weak binding. For data-symbols there should not be any performance difference.


## Roadmap

- finalize the format of `rtld.exechdr` and `rtld.dylink0` custom section.
- unification of post-processing extention API for both `wasm-info` and `wasm-ylinker` phasing out the building-block based approach for sake of simplicity.
- Imrovements to the arrangement of data-symbols; how these are put in each data-segments affects unused memory space. Optimization such as reducing page-fault (virtual memory swapping) can be reduced but is almost impossible to optimize for.
- further cleanup of source code and repo layout.


## Dropped & no-longer maintained features

[wat parser](https://github.com/raweden/wasm-ylinker/tree/75aca507f129c4d62e55b5e3d81378d285b7eb8b) **[DROPPED.]** A lexical parser for WebAssembly text format
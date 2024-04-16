import shebang from 'rollup-plugin-preserve-shebang';

export default {
	input: 'tools/wasm-ylinker.js',
	output: {
		file: 'bin/wasm-ylinker',
		format: 'cjs'
	},
	plugins: [shebang()]
};
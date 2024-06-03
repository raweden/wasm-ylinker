
//
// $ident can be used before it's declared, maning that we must do a AST representation before we compile into object. 
// Or we could use a placeholder value like IdentRef to compile into object representation but allow use todo it later.
// or to simply wait with the parsing of the function body.
// 
// there seams to be a use mapping of idents on top level, as a local dont swadow a function ident.
// 
// idents cannot be redeclared "redefinition of function $test"

import { WA_EXPORT_KIND_FUNC, WA_EXPORT_KIND_GLOBAL, WA_EXPORT_KIND_MEMORY, WA_EXPORT_KIND_TABLE, WasmExport } from "../src/core/types";


function isIdentChar(chr) {
	return (chr > 0x5D && chr < 0x7B)	// a-z + '^_`' at start
		|| (chr > 0x3B && chr < 0x5B)	// A-Z + '<=>?@' at start
		|| (chr > 0x2F && chr < 0x3B)	// 0-9 + ':'
		|| (chr > 0x22 && chr < 0x28) 	// #$%&'
		|| chr == 0x21 	// !
		|| chr == 0x2A 	// *
		|| chr == 0x2B 	// +
		|| chr == 0x2D 	// -
		|| chr == 0x2E 	// .
		|| chr == 0x2F 	// '/'
		|| chr == 0x5C 	// '\'
		|| chr == 0x7C  // |
		|| chr == 0x7E;	// ~
}

let callcnt = 0;

const __wat_ident = Symbol("@wat-ident")
const WAT_TOKEN_IDENT = "ident";
const WAT_TOKEN_KEYWORD = "keyword";
const WAT_TOKEN_STRING = "string";
const WAT_TOKEN_BINARY = "binary";
const WAT_TOKEN_NUMBER = "number";
const WAT_TOKEN_COMMENT = "comment";
const WAT_TOKEN_BLOCK_COMMENT = "block-comment";

const WAT_EXPECTED_STRING = "expected string literal";
const WAT_EXPECTED_INTEGER = "expected integer";
const WAT_UNEXPECTED_TOKEN = "unexpected token";
const WAT_UNEXPECTED_BIN_CHR = "unexpected char in binary string";
const WAT_ALREADY_DECLARED = "identifier already declared";
const WAT_ERR_EXPECTED_KEYWORD = "expected keyword";
const WAT_ERR_REFINDEX_RANGE = "reference index out to keyword";
const WAT_ERR_NO_TYPE_IDENT = "undeclared type identifier";
const WAT_ERR_NO_TYPEIDX = "typeidx out of range";
const WAT_ERR_NO_VALTYPE = "unexpected value type";
const WAT_ERR_NO_IDENT = "undeclared identifier";
const WAT_ERR_NO_FUNCIDX = "funcidx out of range";
const WAT_ERR_NO_MEMIDX = "memidx out of range";
const WAT_ERR_NO_GLBIDX = "globalidx out of range";
const WAT_ERR_NO_ELEMIDX = "elemidx out of range";
const WAT_ERR_NO_TAGIDX = "tagidx out of range";
const WAT_ERR_NO_TBLIDX = "tableidx out of range";
const WAT_ERR_EXPECTED_GRP_OPEN = "expected folding start";
const WAT_ERR_EXPECTED_GRP_END = "expected folding end";
const instmap = {};

class BasicTokenizer {

	constructor(tokens) {

		this._tokens = tokens;
		this._index = 0;
	}

	get length() {
		return this._tokens.length;
	}

	get current() {
		return this._index === 0 ? this._tokens[0] : this._tokens[this._index - 1];
	}

	next(skipComment) {
		if (this._index >= this._tokens.length) {
			return null;
		}

		skipComment = (skipComment === true);

		if (skipComment == false) {
			return this._tokens[this._index++];
		}

		callcnt++;
		if (callcnt > 10000) {
			debugger;
		}

		let tkns = this._tokens;
		let idx = this._index;
		let len = tkns.length;
		while (idx < len) {
			let tkn = tkns[idx++];
			if (tkn === null) {
				break;
			}
			if (tkn.type !== WAT_TOKEN_COMMENT && tkn.type !== WAT_TOKEN_BLOCK_COMMENT) {
				this._index = idx;
				return tkn;
			}
		}

		return null;
	}

	peek(skipComment) {
		if (this._index >= this._tokens.length) {
			return null;
		}

		skipComment = (skipComment === true);

		if (skipComment == false) {
			return this._tokens[this._index];
		}

		let tkns = this._tokens;
		let idx = this._index;
		let len = tkns.length;
		while (idx < len) {
			let tkn = tkns[idx++];
			if (tkn.type !== WAT_TOKEN_COMMENT && tkn.type !== WAT_TOKEN_BLOCK_COMMENT) {
				return tkn;
			}
		}

		return null;
	}

	captureGroup(fromIndex, skipComment, traverse) {
		let lvl = 0;
		let end = -1;
		let tokens = this._tokens;
		let results;
		let len = tokens.length;
		skipComment = skipComment !== false;
		if (tokens[fromIndex].type != '(') {
			let tkn = tokens[fromIndex];
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		results = [];
		for (let i = fromIndex; i < len; i++) {
			let tkn = tokens[i];
			if (skipComment && (tkn.type === WAT_TOKEN_COMMENT || tkn.type === WAT_TOKEN_BLOCK_COMMENT))
				continue;

			results.push(tkn);
			if (tkn.type == '(') {
				lvl++;
			} else if (tkn.type == ')') {
				lvl--;
				if (lvl == 0) {
					end = i;
					break;
				}
			}
		}

		if (traverse && end !== -1) {
			let idx = end + 1;
			while (idx < len) {
				let tkn = tokens[idx];
				if (tkn.type !== WAT_TOKEN_COMMENT && tkn.type !== WAT_TOKEN_BLOCK_COMMENT) {
					break;
				}
				idx++;
			}

			this._index = idx;
		}

		if (results.length == 0) {
			return null;
		}

		return new BasicTokenizer(results);
	}

	skipTo(token, atToken) {
		atToken = (atToken === true);
		let index = this._tokens.indexOf(token);
		if (index == -1) {
			throw new ReferenceError("token argument not found");
		}

		this._index = atToken ? index : index + 1;
	}

	currentline() {
		let idx = this._index;
		if (idx >= this._tokens.length) {
			idx = this._tokens.length - 1;
		}

		return this._tokens[idx].line;
	}

	atEnd() {
		return this._index === this._tokens.length;
	}
}

class WatSyntaxError extends Error {

	constructor(message, line, column) {
		super(message);
		this.location = {line: line, column: column};
	}
}



function parseWAT(source, options) {
	console.log(source);

	function isBinaryData(idx) {
		let chr = source.charCodeAt(idx);
		if (chr != 0x5c) {
			return false;
		}
		chr = source.charCodeAt(idx + 1);
		if (!((chr > 0x2F && chr < 0x3A) || (chr > 0x60 && chr < 0x67) || (chr > 0x40 && chr < 0x47))) { // 0-9a-fA-F
			return false;
		}

		chr = source.charCodeAt(idx + 2);
		if (!((chr > 0x2F && chr < 0x3A) || (chr > 0x60 && chr < 0x67) || (chr > 0x40 && chr < 0x47))) { // 0-9a-fA-F
			return false;
		}

		return true;
	}

	let opt_ident2name = options && options.ident2name ? true : false;
	let opt_ir_idents = options && options.ir_idents ? true : false;
	let tokens = [];
	let tkn;
	let idx = 0;
	let len = source.length;
	let lnoff = 0;	// offset in string where line started, gives column index (for error reporting)
	let lncnt = 0;	// line index.
	while (idx < len) {
		let chr = source.charCodeAt(idx);

		if (chr == 0x28 && source.charCodeAt(idx + 1) == 0x3B) { // '(;' multi-line comment

			idx += 2;
			let start = idx;
			let end = -1;
			let foundend = false;
			let tlnoff = lnoff;
			let tlncnt = lncnt;
			let str = "";
			while (idx < len) {
				chr = source.charCodeAt(idx);
				if (chr == 0x3b && source.charCodeAt(idx + 1) == 0x29) {
					foundend = true;
					end = idx;
					idx += 2;
					break;
				} else if (chr == 0x0a) {						// new-line
					
					// making CR char optional (windows users)
					if (source.charCodeAt(idx) == 0x0d) {
						idx++;
					}

					tlncnt++;
					tlnoff = idx + 1;
				}
				idx++;
			}

			if (!foundend)
				throw new Error("unexpected end of comment");

			let tt = {type: WAT_TOKEN_BLOCK_COMMENT, value: source.substring(start, end)};
			tt.start = {line: lncnt, column: start - lnoff};
			tt.end = {line: tlncnt, column: end - tlnoff};
			tokens.push(tt);
			lnoff = tlnoff;
			lncnt = tlncnt;
			continue;

		} else if (chr == 0x28) {			// '('

			tkn = {type: '('};
			tokens.push(tkn);
			tkn.line = lncnt;
			tkn.column = idx - lnoff;

		} else if (chr == 0x29) { 	// ')'

			tkn = {type: ')'};
			tokens.push(tkn);
			tkn.line = lncnt;
			tkn.column = idx - lnoff;

		} else if (chr == 0x3B && source.charCodeAt(idx + 1) == 0x3B) {	// ';;' single line comment

			idx += 2;
			let start = idx;
			let end = -1;
			while (idx < len) {
				chr = source.charCodeAt(idx);
				if (chr == 0x0a) {
					end = idx;
					break;
				}
				idx++;
			}

			if (end === -1)
				end = len;

			tkn = {type: WAT_TOKEN_BLOCK_COMMENT, value: source.substring(start, end)};
			tokens.push(tkn);
			tkn.line = lncnt;
			tkn.column = idx - lnoff;
			continue; // skip increment of index to use new-line handling

		} else if (chr == 0x22) {	// '\"' string

			if (isBinaryData(idx + 1)) {
				let start = idx;
				let buffers = [];
				let buffer = new Uint8Array(512);
				buffers.push(buffer);
				let bufsz = 0;
				let cp, byte, used = 0;
				idx++;

				while (true) {
					byte = 0;
					cp = source.charCodeAt(idx++);
					if (cp == 0x22) {
						break;
					}
					if (cp != 0x5c) {
						throw new WatSyntaxError(WAT_UNEXPECTED_BIN_CHR, lncnt, idx - lnoff - 1);
					}
					cp = source.charCodeAt(idx++);
					if (cp > 0x30 && cp < 0x3A) { // 1-9 (skip compute for zero)
						byte = ((cp - 0x2F) << 4);
					} else if (cp > 0x40 && cp < 0x47) { // a-f
						byte = ((cp - 0x37) << 4);
					} else if (cp > 0x60 && cp < 0x67) { // A-F
						byte = ((cp - 0x57) << 4);
					} else if (cp != 0x30) {
						throw new WatSyntaxError(WAT_UNEXPECTED_BIN_CHR, lncnt, idx - lnoff - 1);
					}

					cp = source.charCodeAt(idx++);
					if (cp > 0x30 && cp < 0x3A) { // 1-9 (skip compute for zero)
						byte |= (cp - 0x2F);
					} else if (cp > 0x40 && cp < 0x47) { // a-f
						byte |= (cp - 0x37);
					} else if (cp > 0x60 && cp < 0x67) { // A-F
						byte |= (cp - 0x57);
					} else if (cp != 0x30) {
						throw new WatSyntaxError(WAT_UNEXPECTED_BIN_CHR, lncnt, idx - lnoff - 1);
					}

					buffer[used++] = byte;
					if (used === 512) {
						buffer = new Uint8Array(512);
						bufsz += 512;
						used = 0;
					}
				}

				let newbuf = new Uint8Array(bufsz + used);
				let cnt = buffers.length - 1;
				let off = 0;
				for (let i = 0; i < cnt; i++) {
					let buf = buffers[i];
					newbuf.set(buf, off);
					off += 512;
				}

				for (let i = 0; i < used; i++) {
					newbuf[off + i] = buffer[i];
				}

				tkn = {type: WAT_TOKEN_BINARY, value: newbuf};
				tokens.push(tkn);
				tkn.line = lncnt;
				tkn.column = start - lnoff;
				continue;
			}

			let start = idx;
			idx++;
			let foundend = false;
			let str = "";
			while (idx < len) {
				chr = source.charCodeAt(idx);
				if (chr == 0x5c) {
					let peek = source.charCodeAt(idx + 1);
					if (peek == 0x22) {
						str += '\"';
						idx++;
					} else if (peek == 0x74) {
						str += '\t';
						idx++;
					} else if (peek == 0x6e) {
						str += '\n';
						idx++;
					} else if (peek == 0x72) {
						str += '\r';
						idx++;
					} else if (peek == 0x27) {
						str += '\'';
						idx++;
					} else if (peek == 0x5c) {
						str += '\\';
						idx++;
					} else if (peek == 0x75) {
						let cp = 0;
						str += String.fromCharCode(cp);
					}
					idx++;
				} else if (chr == 0x22) {
					tkn = {type: WAT_TOKEN_STRING, value: str};
					tokens.push(tkn);
					tkn.line = lncnt;
					tkn.column = idx - lnoff;
					foundend = true;
					break;
				} else {
					str += source[idx];
					idx++;
				}
			}

			if (!foundend)
				throw new Error("unexpected end of String");

		} else if (chr == 0x24) { // dollar-sign  (identifiers must start with $)
			// https://webassembly.github.io/spec/core/text/values.html#text-id
			let start = idx;
			let end = -1;
			idx++;
			while (idx < len) {
				chr = source.charCodeAt(idx);
				if (!isIdentChar(chr)) {
					end = idx;
					break;
				}
				idx++;
			}

			tkn = {type: WAT_TOKEN_IDENT, value: source.substring(start, end)};
			tokens.push(tkn);
			tkn.line = lncnt;
			tkn.column = idx - lnoff;
			continue;
			
		} else if (chr > 0x60 && chr < 0x7B) { // a-z (keyword must with a-z)

			let start = idx;
			let end = -1;
			idx++;
			while (idx < len) {
				chr = source.charCodeAt(idx);
				if (!isIdentChar(chr)) {
					end = idx;
					break;
				}
				// equal sign seams to be a valid keyword char, but it should also break the keyword so that follwing
				// number for offset & align is interpeted as such.
				if (chr == 0x3d) {
					idx++;
					end = idx;
					break;
				}
				idx++;
			}

			tkn = {type: WAT_TOKEN_KEYWORD, value: source.substring(start, end)};
			tokens.push(tkn);
			tkn.line = lncnt;
			tkn.column = idx - lnoff;
			continue;

		} else if (chr == 0x2b || chr == 0x2d || (chr > 0x2F && chr < 0x3A)) { // plus minus 0-9

			let neg = false;
			if (chr == 0x2b) {
				idx++;
			} else if (chr == 0x2d) { // negative
				neg = true;
				idx++;
			}

			let hexnum = false;

			if (chr == 0x30 && source.charCodeAt(idx + 1) == 0x78) { // 0x
				hexnum = true;
				idx += 2;
				let str = "";
				while (idx < len) {
					chr = source.charCodeAt(idx)
					if ((chr > 0x2F && chr < 0x3A) || (chr > 0x60 && chr < 0x67) || (chr > 0x40 && chr < 0x47)) {
						str += source[idx];
						idx++;
					} else if (chr == 0x5F) {
						idx++;
					} else {
						break;
					}
				}

				let val = parseInt(str, 16);
				if (neg)
					val = -val;

				tkn = {type: WAT_TOKEN_NUMBER, value: val, source: "hex"};
				tokens.push(tkn);
				tkn.line = lncnt;
				tkn.column = idx - lnoff;
				continue;

			} else {
				const NUM_UKN = 0;
				const NUM_HEX = 1;
				const NUM_FP = 2;
				let str = "";
				let ntype = NUM_UKN;

				while (idx < len) {
					chr = source.charCodeAt(idx)
					if ((chr > 0x2F && chr < 0x3A)) {
						str += source[idx];
						idx++;
					} else if ((chr > 0x60 && chr < 0x67) || (chr > 0x40 && chr < 0x47)) {
						str += source[idx];
						idx++;
						ntype = NUM_HEX;
					} else if (chr == 0x65 || chr == 0x45 || chr == 0x2E) {
						str += source[idx];
						idx++;
						ntype = NUM_FP;
					} else if (chr == 0x5F) {
						idx++;
					} else {
						break;
					}
				}

				let val;
				if (ntype == NUM_UKN) {
					val = parseInt(str);
				} else if (ntype == NUM_HEX) {
					val = parseInt(str, 16);
				} else if (ntype == NUM_FP) {
					val = parseFloat(str);
				}

				if (neg)
					val = -val;

				tkn = {type: WAT_TOKEN_NUMBER, value: val, source: "num"};
				tokens.push(tkn);
				tkn.line = lncnt;
				tkn.column = idx - lnoff;
				continue;
			}



		} else if (chr == 0x20 || chr == 0x09) {	// space | tab

		} else if (chr == 0x0a) {					// new-line
			
			// making CR char optional (windows users)
			if (source.charCodeAt(idx) == 0x0d) {
				idx++;
			}

			lncnt++;
			lnoff = idx + 1;
		} else {
			tkn += source[idx];
		}

		idx++;
	}

	console.log(tokens);

	function sourceSyntaxError(msg, line, column) {
		throw new WatSyntaxError(msg, line, column);
	}

	function isTypedef(val) {
		return val == "i32" ||  val == "i64" ||  val == "f32" ||  val == "f64" ||  val == "v128" ||  val == "funcref";
	}

	function text2bintype(text) {

	    switch(text) {
	        case 'i32':
	            return 0x7F;
	        case 'i64':
	            return 0x7E;
	        case 'f32':
	            return 0x7D;
	        case 'f64':
	            return 0x7C;
	        // wasm 2.0
	        case 'v128':
	            return 0x7b;
	        case 'funcref':
	            return 0x70;
	        case 'externref':
	            return 0x67;
	        default:
	            return undefined;
	    }
	}


	let moduleId;
	let dataSegments = [];
	let elementSegments = [];
	let exported = [];
	let imported = [];
	let memory = [];
	let types = [];
	let functions = [];
	let globals = [];
	let tables = [];
	let tags = [];
	let startfn;
	let foundstart = false;
	let toplevel_identmap = {};
	let identmap_types = {};
	let identmap_funcs = {};
	let identmap_locals = null;
	let identmap_memory = {};
	let identmap_tables = {};
	let identmap_globals = {};
	let identmap_elem = {};
	let identmap_data = {};
	let identmap_tags = {};
	let pass2 = [];

	function findMatchingType(pullv, pushv) {
		let len = types.length;
		let argc = pullv.length;
		let retc = pushv.length;
		for (let i = 0; i < len; i++) {
			let type = types[i];
			if (type.argc != argc || type.retc != retc)
				continue;
			let match = true;
			if (argc > 0) {
				let argv = type.argv;
				let xlen = argv.length;
				for (let x = 0; x < xlen; x++) {
					if (argv[x] != pullv[x]) {
						match = false;
					}
				}
			}

			if (match && retc > 0) {
				let retv = type.retv;
				let xlen = retv.length;
				for (let x = 0; x < xlen; x++) {
					if (retv[x] != pushv[x]) {
						match = false;
					}
				}
			}

			if (match) {
				return type;
			}

		}

		return null;
	}

	function processTypeuse(tokens, identmap) {

		let peek, last = tokens._index;
		let start = last;
		let tkn = tokens.current;
		let inpush = false;	// in result part of the type declartion.
		let pullv = [];
		let pushv = [];

		peek = tokens.peek(true);
		if (!peek) {
			return null;
		}

		if (peek.type == WAT_TOKEN_KEYWORD && peek.value == "type") {
			let type;
			tokens.next(true);
			tkn = tokens.next();

			if (tkn.type == WAT_TOKEN_IDENT) {
				let ident = tkn.value;
				if (identmap_types.hasOwnProperty(ident) == false) {
					throw new WatSyntaxError(WAT_ERR_NO_TYPE_IDENT, tkn.line, tkn.column);
				}

				type = identmap_types[ident];
				tkn = tokens.next(true);

			} else if (tkn.type == WAT_TOKEN_NUMBER && Number.isInteger(tkn.value)) {
				let index = tkn.value;
				if (index < 0 || index >= types.length) {
					throw new WatSyntaxError(WAT_ERR_NO_TYPEIDX, tkn.line, tkn.column);
				}

				type = types[index];
				tkn = tokens.next(true);

			} else {
				throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
			}

			if (tkn.type != ')') {
				throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
			}

			return type
		}

		while (tkn.type == '(') {
			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "param") {
				let ident, type;
				let shortform = false;
				if (inpush) {
					throw new WatSyntaxError("unexpected param after first (result)");
				}
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					ident = tkn.value;
					tkn = tokens.next(true);
				}

				if (!ident) {

					if (tkn.type != WAT_TOKEN_KEYWORD) {
						throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
					}

					while (tkn) {
						if (tkn.type != WAT_TOKEN_KEYWORD)
							break;
						
						type = text2bintype(tkn.value);
						if (type === undefined) {
							throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
						}
						pullv.push(type);
						tkn = tokens.next(true);
					}

				} else if (tkn.type == WAT_TOKEN_KEYWORD) {
					type = text2bintype(tkn.value);
					if (type === undefined) {
						throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
					}
					tkn = tokens.next(true);
					let local = {type: type, ident: ident};
					pullv.push(local);
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}
				
				if (tkn.type != ')') {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
				}
					
				last = tokens._index;
				tkn = tokens.next(true);
				if (!tkn || tkn.type != '(') {
					tokens._index = last;
					break;
				}

			} else if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "result") {
				
				let type;
				let vcnt = 0;
				tkn = tokens.next(true);

				if (tkn.type != WAT_TOKEN_KEYWORD) {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				while (tkn) {
					if (tkn.type != WAT_TOKEN_KEYWORD)
						break;
					
					type = text2bintype(tkn.value);
					if (type === undefined) {
						throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
					}
					pushv.push(type);
					tkn = tokens.next(true);
					vcnt++;
				}

				if (tkn.type != ')') {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
				}
				
				last = tokens._index;
				tkn = tokens.next(true);
				inpush = true;
				if (!tkn || tkn.type != '(') {
					tokens._index = last;
					break;
				}
			} else {
				tokens._index = last;
				break;
			}
		}

		if (tokens._index == start) {
			return null; // done nothing so return null to indicate that its not a type
		}

		let type = findMatchingType(pullv, pushv);

		if (!type) {
			type = new WasmType();
			type.argc = pullv.length;
			type.argv = pullv.length > 0 ? pullv : null;
			type.retc = pushv.length;
			type.retv = pushv.length > 0 ? pushv : null;
			types.push(type);
		}

		return type;
	}

	function maybeTableRef(tokens) {
		let peek, tkn, table;
		peek = tokens.peek(true);
		if (peek.type == WAT_TOKEN_KEYWORD && peek.value == "table") {
			let type;
			tokens.next(true);
			tkn = tokens.next();

			if (tkn.type == WAT_TOKEN_IDENT) {
				let ident = tkn.value;
				if (identmap_types.hasOwnProperty(ident) == false) {
					throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
				}

				table = identmap_tables[ident];
				tkn = tokens.next(true);

			} else if (tkn.type == WAT_TOKEN_NUMBER && Number.isInteger(tkn.value)) {
				let index = tkn.value;
				if (index < 0 || index >= types.length) {
					throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, tkn.line, tkn.column);
				}

				table = tables[index];
				tkn = tokens.next(true);

			} else {
				throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
			}

			if (tkn.type != ')') {
				throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
			}
		}

		return table;
	}

	function processLocal(tokens, locals) {
		let ident;
		let type;
		tkn = tokens.next(true);

		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn.value;
			tkn = tokens.next(true);
		}

		if (!ident) {

			if (tkn.type != WAT_TOKEN_KEYWORD) {
				throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
			}

			while (tkn) {
				if (tkn.type != WAT_TOKEN_KEYWORD)
					break;
				
				type = text2bintype(tkn.value);
				if (type === undefined) {
					throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
				}
				locals.push(new WasmLocal(type));
				tkn = tokens.next(true);
			}

		} else if (tkn.type == WAT_TOKEN_KEYWORD) {
			type = text2bintype(tkn.value);
			if (type === undefined) {
				throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
			}
			tkn = tokens.next(true);
			let local = new WasmLocal(type);
			locals.push(local);
			identmap_locals[ident] = local;
		}

		if (tkn.type != ')') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
		}
		
	}

	function maybeMemarg(tokens, opcode, defaultAlign) {
		let start = tokens._index;
		let tkn = tokens.next(true);
		let anytrue = false;

		if (!tkn || tkn.type != WAT_TOKEN_KEYWORD) {
			tokens._index = start;
			return false;
		}

		// ordering of offset & align seams to be explicit
		
		if (tkn.value == "offset=") {
			tkn = tokens.next();
			if (tkn.type != WAT_TOKEN_NUMBER || !Number.isInteger(tkn.value))
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);

			opcode.offset = tkn.value;
			start = tokens._index;
			tkn = tokens.next(true);
			anytrue = true;
		} else {
			opcode.offset = 0;
		}

		if (tkn.value == "align=") {
			tkn = tokens.next();
			if (tkn.type != WAT_TOKEN_NUMBER || !Number.isInteger(tkn.value))
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);

			opcode.align = tkn.value - 1;
			anytrue = true;
		} else {
			opcode.align = defaultAlign;
			tokens._index = start;
		}

		if (!anytrue)
			tokens._index = start;

		return anytrue;
	}

	function processInstruction(tokens, opcls, opcodes, locals, folded) {

		if (folded) {
			tokens._tokens.shift();
			tokens._tokens.pop();
		}

		let pullc = 0;

		if (Number.isInteger(opcls.pull) && opcls.pull !== WA_TYPE_VOID) {
			pullc = 1;
		} else if (Array.isArray(opcls.pull)) {
			pullc = opcls.pull.length;
		} else if (typeof opcls.pull == "function") {
			pullc = -1;
		}

		console.log(tokens);
		let opval = opcls.opcode;
		let opcode;
		let start = tokens._index;
		let tkn, op = tokens.next();
		switch (op.value) {
			case 'unreachable':
			{
				opcode = new UnreachableInst();
				break;
			}
			case 'nop':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'block':
			case 'loop':
			{
				let label, rloc = tokens._index;
				let tmp = tokens.next(true);

				if (tmp && tmp.type == WAT_TOKEN_IDENT) {
					label = tmp.value;
					rloc = tokens._index;
					tkn = tokens.next(true);
				}
				
				let type = processTypeuse(tokens);
				if (type == null) {
					type = 0x40;
					tokens._index = rloc;
				}
				opcode = (opval == 0x03) ? new LoopInst(opval) : new BlockInst(opval);
				opcode.type = type;
				break;
			}
			case 'if':
			{
				let label, tmp;
				let grp1 = null; // condition folding
				let grp2 = null; // then folding
				let grp3 = null; // else folding
				let idx;
				// if can have up to 3 foldings
				// #1 the condition if next starts with (then ...)
				// #2 the then group (starts with then)
				// #3 the else group (starts with else)

				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					label = tkn.value;
				}

				let type = processTypeuse(tokens);
				if (type != null) {
					idx = tokens._index;
					tkn = tokens.next(true);
				} else {
					tkn = tokens.current;
					idx = tokens._index - 1;
				}
				if (tkn.type == '(') {
					grp1 = tokens.captureGroup(idx, true, true);
					console.log(tkn);
					idx = tokens._index;
					tkn = tokens.next(true);
				}

				if (tkn.type == '(') {
					grp2 = tokens.captureGroup(idx, true, true);
					console.log(tkn);
					tmp = grp2._tokens[1];
					if (tmp.type == WAT_TOKEN_KEYWORD && tmp.value == "then") {

					} else if (tmp.type == WAT_TOKEN_KEYWORD && tmp.value == "else") {
						grp3 = grp2;
						grp2 = grp1;
						grp1 = null;
					}
					idx = tokens._index;
					tkn = tokens.next(true);
				}

				if (grp3 === null && tkn.type == '(') {
					grp3 = tokens.captureGroup(idx, true, true);
					console.log(tkn);
					idx = tokens._index;
					tkn = tokens.next(true);
				}

				if (grp1) {
					let opcls, kwd, tkn = grp1.next(true);
					if (tkn.type == '(')
						tkn = grp1.next(true);

					if (tkn.type != WAT_TOKEN_KEYWORD)
						throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);

					kwd = tkn.value;
					if (instmap.hasOwnProperty(kwd) == false)
						throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);

					opcls = instmap[kwd];
					grp1._index = 0;
					let ret = processInstruction(grp1, opcls, opcodes, locals, true);
				}

				if (grp2) {
					opcode = new IfInst(opval);
					opcodes.push(opcode);

					// remove then keyword if present.
					let tkn = grp2._tokens[1];
					if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "then") {
						grp2._tokens.splice(1, 1);
					}

					// process folded range.
					tkn = grp2.next(true);
					if (tkn.type == '(') {
						tkn = grp2.next(true);
						if (tkn.type == '(') {
							tkn = grp2.next(true);
							grp2._tokens.shift();
							grp2._tokens.pop();
						}
					}

					if (tkn.type != WAT_TOKEN_KEYWORD)
						throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);

					kwd = tkn.value;
					if (instmap.hasOwnProperty(kwd) == false)
						throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);

					opcls = instmap[kwd];
					grp2._index = 0;
					let ret = processInstruction(grp2, opcls, opcodes, locals, true);
				}

				if (grp3) {
					opcode = new IfInst(0x05); // else
					opcodes.push(opcode);

					// remove else keyword if present.
					let tkn = grp3._tokens[1];
					if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "else") {
						grp3._tokens.splice(1, 1);
					}

					// process folded range.
					tkn = grp3.next(true);
					if (tkn.type == '(') {
						tkn = grp3.next(true);
						if (tkn.type == '(') {
							tkn = grp3.next(true);
							grp3._tokens.shift();
							grp3._tokens.pop();
						}
					}

					if (tkn.type != WAT_TOKEN_KEYWORD)
						throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);

					kwd = tkn.value;
					if (instmap.hasOwnProperty(kwd) == false)
						throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);

					opcls = instmap[kwd];
					grp3._index = 0;
					let ret = processInstruction(grp3, opcls, opcodes, locals, true);

					// if there was no closing end.
					if (opcodes[opcodes.length - 1].opcode != 0x0b) {
						opcodes.push({opcode: 0x0b});
					}
				}

				if (grp2) {
					return true;
				}

				throw new WatSyntaxError("not implemented");
				opcode = new IfInst(opval);
				break;
			}
			case 'else':
			{
				opcode = new IfInst(opval);
				break;
			}
			case 'try':
			{
				throw new WatSyntaxError("not implemented");
				opcode = new TryInst(opval);
				break;
			}
			case 'catch':
			{
                opcode = new CatchInst(opval);
                let tagref;
                tkn = tokens.next(true);
                if (tkn.type == WAT_TOKEN_IDENT) {
                	let ident = tkn.value;
                	if (!identmap_tags.hasOwnProperty(ident))
                		throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
                	tagref = identmap_tags[ident];
                } else if (tkn.type == WAT_TOKEN_NUMBER) {
                	if (!Number.isInteger(tkn.value))
                		throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
                	let tagidx = tkn.value;
                	if (tagidx < 0 || tagidx >= tags.length) {
                		throw new RangeError(WAT_ERR_NO_TAGIDX, tkn.line, tkn.column);
                	}
                	tagref = tags[tagidx];
                }
                opcode.tag = tagref;
                break;
            }
			case 'catch_all':
			{
                opcode = new CatchAllInst(opval);
                break;
            }
			case 'delegate':
			{
                opcode = new DelegateInst(opval);
                opcode.relative_depth = 0;
                break;
            }
			case 'throw':
			{
                opcode = new ThrowInst(opval);
                let tagref;
                tkn = tokens.next(true);
                if (tkn.type == WAT_TOKEN_IDENT) {
                	let ident = tkn.value;
                	if (!identmap_tags.hasOwnProperty(ident))
                		throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
                	tagref = identmap_tags[ident];
                } else if (tkn.type == WAT_TOKEN_NUMBER) {
                	if (!Number.isInteger(tkn.value))
                		throw new WatSyntaxError(WAT_EXPECTED_INTEGER);
                	let tagidx = tkn.value;
                	if (tagidx < 0 || tagidx >= tags.length) {
                		throw new RangeError(WAT_ERR_NO_TAGIDX, tkn.line, tkn.column);
                	}
                	tagref = tags[tagidx];
                }
                opcode.tag = tagref;
                break;
            }
			case 'rethrow':
			{
                opcode = new ReThrowInst(opval);
                opcode.relative_depth = 0;
                break;
            }
			case 'br':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'br_if':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'br_table':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'return':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'call':
			{
				let func;

				tkn = tokens.next();
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_funcs.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					func = identmap_funcs[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= functions.length)
						throw new WatSyntaxError(WAT_ERR_NO_FUNCIDX, tkn.line, tkn.column);
					func = functions[index];
				}
				opcode = {opcode: opval, func: func};
				break;
			}
			case 'call_indirect':
			{
				let tableref;
				let typeref;

				tkn = tokens.next();
				if (tkn.type == '(') {
					tableref = maybeTableRef(tokens);
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					tableref = tables[index];
					tkn = tokens.next();
				}

				if (tkn.type == '(') {
					typeref = processTypeuse(tokens);
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					typeref = types[index];
				}
				opcode = {opcode: opval, table: tableref, type: typeref};
				break;
			}
			case 'i32.const':
			case 'i64.const':
			{
				tkn = tokens.next();
				if (tkn.type != WAT_TOKEN_NUMBER || Number.isInteger(tkn.value) == false) {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}
				opcode = {opcode: opval, value: tkn.value};
				break;
			}
			case 'f32.const':
			case 'f64.const':
			{
				tkn = tokens.next();
				if (tkn.type != WAT_TOKEN_NUMBER) {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}
				opcode = {opcode: opval, value: tkn.value};
				break;
			}
			case 'end':
			case 'drop':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'select':
			{
				throw new WatSyntaxError("not implemented");
				break;
			}
			case 'local.get':
			case 'local.set':
			case 'local.tee':
			{
				let local;

				tkn = tokens.next();
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_locals.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					local = identmap_locals[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					local = locals[index];
				}
				opcode = {opcode: opval, local: local};
				break;
			}
			case 'global.get':
			case 'global.set':
			{
				let glob;

				tkn = tokens.next();
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_globals.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					glob = identmap_globals[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= globals.length)
						throw new WatSyntaxError(WAT_ERR_NO_GLBIDX, tkn.line, tkn.column);
					glob = globals[index];
				}
				opcode = {opcode: opval, global: glob};
				break;
			}
			case 'table.get':
			case 'table.set':
			case 'table.grow':
			case 'table.size':
			case 'table.fill':
			{
				let tbl;
				let tmp = tokens._index;
				tkn = tokens.next();
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_tables.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					tbl = identmap_tables[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= tables.length)
						throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, tkn.line, tkn.column);
					tbl = tables[index];
				} else {
					if (tables.length == 0) {
						throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, op.line, op.column);
					}
					tbl = tables[0];
					tokens._index = tmp;
				}
				opcode = {opcode: opval, table: tbl};
				break;
			}
			case 'table.copy': // table.copy x y (where x = destination, y = source)
			{
				let tbl1, tbl2;
				let tmp = tokens._index;
				tkn = tokens.next();
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_tables.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					tbl1 = identmap_tables[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= tables.length)
						throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, tkn.line, tkn.column);
					tbl1 = tables[index];
				} else {
					if (tables.length == 0) {
						throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, op.line, op.column);
					}
					tbl1 = tables[0];
					tbl2 = tables[0];
					tokens._index = tmp;
				}

				if (tbl2 === undefined) {

					tkn = tokens.next();
					if (tkn.type == WAT_TOKEN_IDENT) {
						let ident = tkn.value;
						if (!identmap_tables.hasOwnProperty(ident))
							throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
						tbl2 = identmap_tables[ident];
					} else if (tkn.type == WAT_TOKEN_NUMBER) {
						let index = tkn.value;
						if (!Number.isInteger(index))
							throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
						if (index < 0 || index >= tables.length)
							throw new WatSyntaxError(WAT_ERR_NO_TBLIDX, tkn.line, tkn.column);
						tbl2 = tables[index];
					}
				}

				opcode = {opcode: opval, table1: tbl1, table2: tbl2};
				break;
			}
			case 'table.init':
			{
				let tbl, elem;
				let tmp = tokens._index;
				let tkn1 = tokens.next(true);
				let tkn2 = tokens.next(true);
				tokens._index = tmp;

				opcode = {opcode: opval, table: tbl, elem: elem};
				break;
			}
			case 'elem.drop':
			{
				let elem;
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_elem.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					elem = identmap_elem[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= elementSegments.length)
						throw new WatSyntaxError(WAT_ERR_REFINDEX_RANGE, tkn.line, tkn.column)
					elem = elementSegments[index];
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				opcode = {opcode: opval, elem: elem};
				break;
			}
			// 8-bit natural alignment = 0
			case 'i32.load8_s':
			case 'i32.load8_u':
			case 'i64.load8_s':
			case 'i64.load8_u':
			case 'i32.store8':
			case 'i64.store8':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 0);
				break;
			}
			// 16-bit natural alignment = 1
			case 'i32.load16_s':
			case 'i32.load16_u':
			case 'i32.store16':
			case 'i64.load16_s':
			case 'i64.load16_u':
			case 'i64.store16':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 1);
				break;
			}
			// 32-bit natural alignment = 2
			case 'i32.load':
			case 'i32.store':
			case 'f32.load':
			case 'f32.store':
			case 'i64.load32_s':
			case 'i64.load32_u':
			case 'i64.store32':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 2);

				break;
			}
			// 64-bit natural alignment = 3
			case 'f64.load':
			case 'f64.store':
			case 'i64.load':
			case 'i64.store':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 3);
				break;
			}
			case 'memory.size':
			case 'memory.grow':
			case 'memory.copy':
			case 'memory.fill':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i32.eqz':
			case 'i32.eq':
			case 'i32.ne':
			case 'i32.lt_s':
			case 'i32.lt_u':
			case 'i32.gt_s':
			case 'i32.gt_u':
			case 'i32.le_s':
			case 'i32.le_u':
			case 'i32.ge_s':
			case 'i32.ge_u':
			case 'i64.eqz':
			case 'i64.eq':
			case 'i64.ne':
			case 'i64.lt_s':
			case 'i64.lt_u':
			case 'i64.gt_s':
			case 'i64.gt_u':
			case 'i64.le_s':
			case 'i64.le_u':
			case 'i64.ge_s':
			case 'i64.ge_u':
			case 'f32.eq':
			case 'f32.ne':
			case 'f32.lt':
			case 'f32.gt':
			case 'f32.le':
			case 'f32.ge':
			case 'f64.eq':
			case 'f64.ne':
			case 'f64.lt':
			case 'f64.gt':
			case 'f64.le':
			case 'f64.ge':
			case 'i32.clz':
			case 'i32.ctz':
			case 'i32.popcnt':
			case 'i32.add':
			case 'i32.sub':
			case 'i32.mul':
			case 'i32.div_s':
			case 'i32.div_u':
			case 'i32.rem_s':
			case 'i32.rem_u':
			case 'i32.and':
			case 'i32.or':
			case 'i32.xor':
			case 'i32.shl':
			case 'i32.shr_s':
			case 'i32.shr_u':
			case 'i32.rotl':
			case 'i32.rotr':
			case 'i64.clz':
			case 'i64.ctz':
			case 'i64.popcnt':
			case 'i64.add':
			case 'i64.sub':
			case 'i64.mul':
			case 'i64.div_s':
			case 'i64.div_u':
			case 'i64.rem_s':
			case 'i64.rem_u':
			case 'i64.and':
			case 'i64.or':
			case 'i64.xor':
			case 'i64.shl':
			case 'i64.shr_s':
			case 'i64.shr_u':
			case 'i64.rotl':
			case 'i64.rotr':
			case 'f32.abs':
			case 'f32.neg':
			case 'f32.ceil':
			case 'f32.floor':
			case 'f32.trunc':
			case 'f32.nearest':
			case 'f32.sqrt':
			case 'f32.add':
			case 'f32.sub':
			case 'f32.mul':
			case 'f32.div':
			case 'f32.min':
			case 'f32.max':
			case 'f32.copysign':
			case 'f64.abs':
			case 'f64.neg':
			case 'f64.ceil':
			case 'f64.floor':
			case 'f64.trunc':
			case 'f64.nearest':
			case 'f64.sqrt':
			case 'f64.add':
			case 'f64.sub':
			case 'f64.mul':
			case 'f64.div':
			case 'f64.min':
			case 'f64.max':
			case 'f64.copysign':
			case 'i32.wrap_i64':
			case 'i32.trunc_f32_s':
			case 'i32.trunc_f32_u':
			case 'i32.trunc_f64_s':
			case 'i32.trunc_f64_u':
			case 'i64.extend_i32_s':
			case 'i64.extend_i32_u':
			case 'i64.trunc_f32_s':
			case 'i64.trunc_f32_u':
			case 'i64.trunc_f64_s':
			case 'i64.trunc_f64_u':
			case 'f32.convert_i32_s':
			case 'f32.convert_i32_u':
			case 'f32.convert_i64_s':
			case 'f32.convert_i64_u':
			case 'f32.demote_f64':
			case 'f64.convert_i32_s':
			case 'f64.convert_i32_u':
			case 'f64.convert_i64_s':
			case 'f64.convert_i64_u':
			case 'f64.promote_f32':
			case 'i32.reinterpret_f32':
			case 'i64.reinterpret_f64':
			case 'f32.reinterpret_i32':
			case 'f64.reinterpret_i64':
			case 'i32.extend8_s':
			case 'i32.extend16_s':
			case 'i64.extend8_s':
			case 'i64.extend16_s':
			case 'i64.extend32_s':
			case 'ref.is_null':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'ref.null':
			{
				let reftype;
				let tmp = tokens._index;
				tkn = tokens.next(true);
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
				}
				if (tkn.value == "func") {
					reftype = 0x70;
				} else if (tkn.value == "extern") {
					reftype = 0x6f;
				} else {
					throw new WatSyntaxError("unexpected reftype value");
				}

				opcode = {opcode: opval, reftype};
				break;
			}
			case 'ref.func':
			{
				let func;
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_funcs.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					func = identmap_funcs[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= functions.length)
						throw new WatSyntaxError(WAT_ERR_REFINDEX_RANGE, tkn.line, tkn.column)
					func = functions[index];
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				opcode = {opcode: opval, func: func};
				break;
			}
			case 'i32.trunc_sat_f32_s':
			case 'i32.trunc_sat_f32_u':
			case 'i32.trunc_sat_f64_s':
			case 'i32.trunc_sat_f64_u':
			case 'i64.trunc_sat_f32_s':
			case 'i64.trunc_sat_f32_u':
			case 'i64.trunc_sat_f64_s':
			case 'i64.trunc_sat_f64_u':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'memory.init':
			{
				let dataSegment;
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_data.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					dataSegment = identmap_data[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= dataSegments.length)
						throw new WatSyntaxError(WAT_ERR_REFINDEX_RANGE, tkn.line, tkn.column)
					dataSegment = dataSegments[index];
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				opcode = {opcode: opval, dataSegment: dataSegment};
				break;
			}
			case 'data.drop':
			{
				let dataSegment;
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					let ident = tkn.value;
					if (!identmap_data.hasOwnProperty(ident))
						throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
					dataSegment = identmap_data[ident];
				} else if (tkn.type == WAT_TOKEN_NUMBER) {
					let index = tkn.value;
					if (!Number.isInteger(index))
						throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
					if (index < 0 || index >= dataSegments.length)
						throw new WatSyntaxError(WAT_ERR_REFINDEX_RANGE, tkn.line, tkn.column)
					dataSegment = dataSegments[index];
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				opcode = {opcode: opval, dataSegment: dataSegment};
				break;
			}
			case 'v128.load':
			case 'v128.load8x8_s':
			case 'v128.load8x8_u':
			case 'v128.load16x4_s':
			case 'v128.load16x4_u':
			case 'v128.load32x2_s':
			case 'v128.load32x2_u':
			case 'v128.load8_splat':
			case 'v128.load16_splat':
			case 'v128.load32_splat':
			case 'v128.load64_splat':
			case 'v128.load32_zero':
			case 'v128.load64_zero':
			case 'v128.store':
			case 'v128.load8_lane':
			case 'v128.load16_lane':
			case 'v128.load32_lane':
			case 'v128.load64_lane':
			case 'v128.store8_lane':
			case 'v128.store16_lane':
			case 'v128.store32_lane':
			case 'v128.store64_lane':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i8x16.extract_lane_s':
			case 'i8x16.extract_lane_u':
			case 'i16x8.extract_lane_s':
			case 'i16x8.extract_lane_u':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i32x4.extract_lane':
			case 'i64x2.extract_lane':
			case 'f32x4.extract_lane':
			case 'f64x2.extract_lane':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i8x16.replace_lane':
			case 'i16x8.replace_lane':
			case 'i32x4.replace_lane':
			case 'i64x2.replace_lane':
			case 'f32x4.replace_lane':
			case 'f64x2.replace_lane':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i8x16.swizzle':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i8x16.splat':
			case 'i16x8.splat':
			case 'i32x4.splat':
			case 'i64x2.splat':
			case 'f32x4.splat':
			case 'f64x2.splat':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'i8x16.eq':
			case 'i8x16.ne':
			case 'i8x16.lt_s':
			case 'i8x16.lt_u':
			case 'i8x16.gt_s':
			case 'i8x16.gt_u':
			case 'i8x16.le_s':
			case 'i8x16.le_u':
			case 'i8x16.ge_s':
			case 'i8x16.ge_u':
			case 'i16x8.eq':
			case 'i16x8.ne':
			case 'i16x8.lt_s':
			case 'i16x8.lt_u':
			case 'i16x8.gt_s':
			case 'i16x8.gt_u':
			case 'i16x8.le_s':
			case 'i16x8.le_u':
			case 'i16x8.ge_s':
			case 'i16x8.ge_u':
			case 'i32x4.eq':
			case 'i32x4.ne':
			case 'i32x4.lt_s':
			case 'i32x4.lt_u':
			case 'i32x4.gt_s':
			case 'i32x4.gt_u':
			case 'i32x4.le_s':
			case 'i32x4.le_u':
			case 'i32x4.ge_s':
			case 'i32x4.ge_u':
			case 'i64x2.eq':
			case 'i64x2.ne':
			case 'i64x2.lt':
			case 'i64x2.gt':
			case 'i64x2.le':
			case 'i64x2.ge':
			case 'f32x4.eq':
			case 'f32x4.ne':
			case 'f32x4.lt':
			case 'f32x4.gt':
			case 'f32x4.le':
			case 'f32x4.ge':
			case 'f64x2.eq':
			case 'f64x2.ne':
			case 'f64x2.lt':
			case 'f64x2.gt':
			case 'f64x2.le':
			case 'f64x2.ge':
			case 'v128.not':
			case 'v128.and':
			case 'v128.andnot':
			case 'v128.or':
			case 'v128.xor':
			case 'v128.bitselect':
			case 'v128.any_true':
			case 'i8x16.abs':
			case 'i8x16.neg':
			case 'i8x16.popcnt':
			case 'i8x16.all_true':
			case 'i8x16.bitmask':
			case 'i8x16.narrow_i16x8_s':
			case 'i8x16.narrow_i16x8_u':
			case 'i8x16.shl':
			case 'i8x16.shr_s':
			case 'i8x16.shr_u':
			case 'i8x16.add':
			case 'i8x16.add_sat_s':
			case 'i8x16.add_sat_u':
			case 'i8x16.sub':
			case 'i8x16.sub_sat_s':
			case 'i8x16.sub_sat_u':
			case 'i8x16.min_s':
			case 'i8x16.min_u':
			case 'i8x16.max_s':
			case 'i8x16.max_u':
			case 'i8x16.avgr_u':
			case 'i16x8.extadd_pairwise_i8x16_s':
			case 'i16x8.extadd_pairwise_i8x16_u':
			case 'i16x8.abs':
			case 'i16x8.neg':
			case 'i16x8.q15mulr_sat_s':
			case 'i16x8.all_true':
			case 'i16x8.bitmask':
			case 'i16x8.narrow_i32x4_s':
			case 'i16x8.narrow_i32x4_u':
			case 'i16x8.extend_low_i8x16_s':
			case 'i16x8.extend_high_i8x16_s':
			case 'i16x8.extend_low_i8x16_u':
			case 'i16x8.extend_high_i8x16_u':
			case 'i16x8.shl':
			case 'i16x8.shr_s':
			case 'i16x8.shr_u':
			case 'i16x8.add':
			case 'i16x8.add_sat_s':
			case 'i16x8.add_sat_u':
			case 'i16x8.sub':
			case 'i16x8.sub_sat_s':
			case 'i16x8.sub_sat_u':
			case 'i16x8.mul':
			case 'i16x8.min_s':
			case 'i16x8.min_u':
			case 'i16x8.max_s':
			case 'i16x8.max_u':
			case 'i16x8.avgr_u':
			case 'i16x8.extmul_low_i8x16_s':
			case 'i16x8.extmul_high_i8x16_s':
			case 'i16x8.extmul_low_i8x16_u':
			case 'i16x8.extmul_high_i8x16_u':
			case 'i32x4.extadd_pairwise_i16x8_s':
			case 'i32x4.extadd_pairwise_i16x8_u':
			case 'i32x4.abs':
			case 'i32x4.neg':
			case 'i32x4.all_true':
			case 'i32x4.bitmask':
			case 'i32x4.extend_low_i16x8_s':
			case 'i32x4.extend_high_i16x8_s':
			case 'i32x4.extend_low_i16x8_u':
			case 'i32x4.extend_high_i16x8_u':
			case 'i32x4.shl':
			case 'i32x4.shr_s':
			case 'i32x4.shr_u':
			case 'i32x4.add':
			case 'i32x4.sub':
			case 'i32x4.mul':
			case 'i32x4.min_s':
			case 'i32x4.min_u':
			case 'i32x4.max_s':
			case 'i32x4.max_u':
			case 'i32x4.dot_i16x8_s':
			case 'i32x4.extmul_low_i16x8_s':
			case 'i32x4.extmul_high_i16x8_s':
			case 'i32x4.extmul_low_i16x8_u':
			case 'i32x4.extmul_high_i16x8_u':
			case 'i64x2.abs':
			case 'i64x2.neg':
			case 'i64x2.all_true':
			case 'i64x2.bitmask':
			case 'i64x2.extend_low_i32x4_s':
			case 'i64x2.extend_high_i32x4_s':
			case 'i64x2.extend_low_i32x4_u':
			case 'i64x2.extend_high_i32x4_u':
			case 'i64x2.shl':
			case 'i64x2.shr_s':
			case 'i64x2.shr_u':
			case 'i64x2.add':
			case 'i64x2.sub':
			case 'i64x2.mul':
			case 'i64x2.extmul_low_i32x4_s':
			case 'i64x2.extmul_high_i32x4_s':
			case 'i64x2.extmul_low_i32x4_u':
			case 'i64x2.extmul_high_i32x4_u':
			case 'f32x4.ceil':
			case 'f32x4.floor':
			case 'f32x4.trunc':
			case 'f32x4.nearest':
			case 'f32x4.abs':
			case 'f32x4.neg':
			case 'f32x4.sqrt':
			case 'f32x4.add':
			case 'f32x4.sub':
			case 'f32x4.mul':
			case 'f32x4.div':
			case 'f32x4.min':
			case 'f32x4.max':
			case 'f32x4.pmin':
			case 'f32x4.pmax':
			case 'f64x2.ceil':
			case 'f64x2.floor':
			case 'f64x2.trunc':
			case 'f64x2.nearest':
			case 'f64x2.abs':
			case 'f64x2.neg':
			case 'f64x2.sqrt':
			case 'f64x2.add':
			case 'f64x2.sub':
			case 'f64x2.mul':
			case 'f64x2.div':
			case 'f64x2.min':
			case 'f64x2.max':
			case 'f64x2.pmin':
			case 'f64x2.pmax':
			case 'i32x4.trunc_sat_f32x4_s':
			case 'i32x4.trunc_sat_f32x4_u':
			case 'f32x4.convert_i32x4_s':
			case 'f32x4.convert_i32x4_u':
			case 'i32x4.trunc_sat_f64x2_s_zero':
			case 'i32x4.trunc_sat_f64x2_u_zero':
			case 'f64x2.convert_low_i32x4_s':
			case 'f64x2.convert_low_i32x4_u':
			case 'f32x4.demote_f64x2_zero':
			case 'f64x2.promote_low_f32x4':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'memory.atomic.notify':
			case 'memory.atomic.wait32':
			case 'memory.atomic.wait64':
			{
				opcode = {opcode: opval};
				break;
			}
			case 'atomic.fence':
			{
				opcode = {opcode: opval};
				break;
			}
			// 8-bit natural alignment = 0
			case 'i32.atomic.load8_u':
			case 'i64.atomic.load8_u':
			case 'i32.atomic.store8':
			case 'i64.atomic.store8':
			case 'i32.atomic.rmw8.add_u':
			case 'i64.atomic.rmw8.add_u':
			case 'i32.atomic.rmw8.sub_u':
			case 'i64.atomic.rmw8.sub_u':
			case 'i32.atomic.rmw8.and_u':
			case 'i64.atomic.rmw8.and_u':
			case 'i32.atomic.rmw8.or_u':
			case 'i64.atomic.rmw8.or_u':
			case 'i32.atomic.rmw8.xor_u':
			case 'i64.atomic.rmw8.xor_u':
			case 'i32.atomic.rmw8.xchg_u':
			case 'i64.atomic.rmw8.xchg_u':
			case 'i32.atomic.rmw8.cmpxchg_u':
			case 'i64.atomic.rmw8.cmpxchg_u':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 0);
				break;
			}

			// 16-bit natural alignment = 1
			case 'i32.atomic.load16_u':
			case 'i64.atomic.load16_u':
			case 'i32.atomic.store16':
			case 'i64.atomic.store16':
			case 'i32.atomic.rmw16.add_u':
			case 'i64.atomic.rmw16.add_u':
			case 'i32.atomic.rmw16.sub_u':
			case 'i64.atomic.rmw16.sub_u':
			case 'i32.atomic.rmw16.and_u':
			case 'i64.atomic.rmw16.and_u':
			case 'i32.atomic.rmw16.or_u':
			case 'i64.atomic.rmw16.or_u':
			case 'i32.atomic.rmw16.xor_u':
			case 'i64.atomic.rmw16.xor_u':
			case 'i32.atomic.rmw16.xchg_u':
			case 'i64.atomic.rmw16.xchg_u':
			case 'i32.atomic.rmw16.cmpxchg_u':
			case 'i64.atomic.rmw16.cmpxchg_u':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 1);
				break;
			}

			// 32-bit natural alignment = 2
			case 'i32.atomic.load':
			case 'i64.atomic.load32_u':
			case 'i32.atomic.store':
			case 'i64.atomic.store32':
			case 'i32.atomic.rmw.add':
			case 'i64.atomic.rmw32.add_u':
			case 'i32.atomic.rmw.sub':
			case 'i64.atomic.rmw32.sub_u':
			case 'i32.atomic.rmw.and':
			case 'i64.atomic.rmw32.and_u':
			case 'i32.atomic.rmw.or':
			case 'i64.atomic.rmw32.or_u':
			case 'i32.atomic.rmw.xor':
			case 'i64.atomic.rmw32.xor_u':
			case 'i32.atomic.rmw.xchg':
			case 'i64.atomic.rmw32.xchg_u':
			case 'i32.atomic.rmw.cmpxchg':
			case 'i64.atomic.rmw32.cmpxchg_u':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 2);
				break;
			}

			// 64-bit natural alignment = 3
			case 'i64.atomic.load':
			case 'i64.atomic.store':
			case 'i64.atomic.rmw.add':
			case 'i64.atomic.rmw.sub':
			case 'i64.atomic.rmw.and':
			case 'i64.atomic.rmw.or':
			case 'i64.atomic.rmw.xor':
			case 'i64.atomic.rmw.xchg':
			case 'i64.atomic.rmw.cmpxchg':
			{
				opcode = {opcode: opval};
				let ret = maybeMemarg(tokens, opcode, 3);
				break;
			}

			default:
				return false;

		}

		if (opcode == undefined) {
			throw new WatSyntaxError("not implemented");
		}

		if (tokens.atEnd() || folded == false) {
			opcodes.push(opcode);
			return true;
		}

		let rrloc = tokens._index;
		start = tokens._index;
		tkn = tokens.next();
		while (tkn && tokens.atEnd() == false) {
			let kwd, type;
			if (tkn.type == '(') {
				rrloc = tokens._index;
				tkn = tokens.next(true);
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					console.warn("not keyword after open (");
					tokens._index = start;
					break;
				}
				kwd = tkn.value;
				if (instmap.hasOwnProperty(kwd)) {
					let opcls = instmap[kwd];
					let rloc = tkn;
					let subgrp = tokens.captureGroup(start, true, true);
					let ret = processInstruction(subgrp, opcls, opcodes, locals, true);
					if (tokens.atEnd())
						break;

					start = tokens._index;
					rrloc = tokens._index;
					tkn = tokens.next(true);
				} else {
					throw new WatSyntaxError("unexpected keyword '" + kwd + "'", tkn.line, tkn.column);
				}
			} else {
				kwd = tkn.value;
				if (instmap.hasOwnProperty(kwd)) {
					let opcls = instmap[kwd];
					let rloc = tkn;
					tokens._index = rrloc;
					let ret = processInstruction(tokens, opcls, opcodes, locals, false);
					if (tokens.atEnd())
						break;

					start = tokens._index;
					rrloc = tokens._index;
					tkn = tokens.next(true);
				} else {
					throw new WatSyntaxError("unexpected keyword '" + kwd + "'", tkn.line, tkn.column);
				}
			}
		}
		/*
		start = tokens._index;
		tkn = tokens.next();
		while (tkn.type == '(') {
			let kwd, type;
			tkn = tokens.next(true);
			if (tkn.type != WAT_TOKEN_KEYWORD) {
				tokens._index = start;
				break;
			}
			kwd = tkn.value;
			if (instmap.hasOwnProperty(kwd)) {
				let opcls = instmap[kwd];
				let rloc = tkn;
				let subgrp = tokens.captureGroup(start, true, true);
				let ret = processInstruction(subgrp, opcls, opcodes, locals, folded);
				if (tokens.atEnd())
					break;

				start = tokens._index;
				tkn = tokens.next(true);
			}
		}*/

		opcodes.push(opcode);

		return true;
	}

	function maybeInlineExport(tokens) {
		let start = tokens._index;
		let tkn = tokens.current;
		let ret = false;

		if (tkn.type == '(') {
			tkn = tokens.next(true);
			if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "export") {
				tokens._index = start;
				return false;
			}

			tkn = tokens.next(true);
			if (tkn.type != WAT_TOKEN_STRING) {
				throw new WatSyntaxError(WAT_EXPECTED_STRING, tkn.line, tkn.column);
			}

			ret = tkn.value;

			tkn = tokens.next(true);
			if (tkn.type != ')') {
				throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
			}
		}

		return ret;
	}

	function maybeInlineImport(tokens) {
		let start = tokens._index;
		let tkn = tokens.current;

		if (tkn.type != '(') {
			return false;
		}

		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "import") {
			tokens._index = start;
			return false;
		}

		let mod, name;
		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_STRING) {
			throw new WatSyntaxError(WAT_EXPECTED_STRING, tkn.line, tkn.column);
		}
		mod = tkn.value;
		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_STRING) {
			throw new WatSyntaxError(WAT_EXPECTED_STRING, tkn.line, tkn.column);
		}
		name = tkn.value;

		tkn = tokens.next(true);
		if (tkn.type != ')') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
		}

		return {module: mod, name: name};
	}

	// (type $test2 (func (param i32) (param i32) (result i32)))
	function processToplevelType(tokens) {
		console.log(tokens);

		// skip open and closing fold.
		tokens._tokens.shift();
		tokens._tokens.pop();
		let tkn = tokens.next();

		if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "type") {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}
		tkn = tokens.next();

		let min;
		let max;
		let ident;
		let type;
		let last;
		let pullv = [];
		let pushv = [];
		let inpush = false;

		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next();
		}
		
		console.log("next tkn in memory: %o", tkn);

		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_KEYWORD && tkn.value == "func") {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}

		last = tokens._index;
		tkn = tokens.next(true);
		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		// processing (param id? i32) (result i32) part
		while (tkn.type == '(') {
			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "param") {
				let ident, type;
				let shortform = false;
				if (inpush) {
					throw new WatSyntaxError("unexpected param after first (result)");
				}
				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_IDENT) {
					ident = tkn.value;
					tkn = tokens.next(true);
				}

				if (!ident) {

					if (tkn.type != WAT_TOKEN_KEYWORD) {
						throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
					}

					while (tkn) {
						if (tkn.type != WAT_TOKEN_KEYWORD)
							break;
						
						type = text2bintype(tkn.value);
						if (type === undefined) {
							throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
						}
						pullv.push(type);
						tkn = tokens.next(true);
					}

				} else if (tkn.type == WAT_TOKEN_KEYWORD) {
					type = text2bintype(tkn.value);
					if (type === undefined) {
						throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
					}
					tkn = tokens.next(true);
					let local = {type: type, ident: ident};
					pullv.push(local);
				} else {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}
				
				if (tkn.type != ')') {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
				}
				
				last = tokens._index;
				tkn = tokens.next(true);

			} else if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "result") {
				
				let type;
				let vcnt = 0;
				tkn = tokens.next(true);

				if (tkn.type != WAT_TOKEN_KEYWORD) {
					throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
				}

				while (tkn) {
					if (tkn.type != WAT_TOKEN_KEYWORD)
						break;
					
					type = text2bintype(tkn.value);
					if (type === undefined) {
						throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
					}
					pushv.push(type);
					tkn = tokens.next(true);
					vcnt++;
				}

				if (tkn.type != ')') {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
				}
				
				last = tokens._index;
				tkn = tokens.next(true);
				inpush = true;
			}
		}

		if (pullv.length === 0 && pushv.length === 0) {
			return null;
		}

		type = new WasmType();
		type.argv = pullv;
		type.argc = pullv.length;
		type.retv = pushv;
		type.retc = pushv.length;
		types.push(type);

		if (ident) {
			let key = ident.value;
			if (identmap_types.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_types[key] = type;
		}

		if (tkn.type != ')') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
		}

		if (tokens.atEnd()) {
			return type;
		}

		if (!tokens.atEnd()) {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}
	}

	// (memory (export "memory") 1 100)
	function processToplevelMemory(tokens) {
		console.log(tokens);

		// skip open and closing fold.
		tokens._tokens.shift();
		tokens._tokens.pop();
		let tkn = tokens.next();

		if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "memory") {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}
		tkn = tokens.next();
		
		let min;
		let max;
		let ident;
		let mem;
		let imp = false;
		let exp = false;

		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next();
		}

		imp = maybeInlineImport(tokens);
		if (!imp) {
			exp = maybeInlineExport(tokens);
		}

		if (exp || imp) {
			tkn = tokens.next(true);
		}

		
		console.log("next tkn in memory: %o", tkn);

		if (tkn.type != WAT_TOKEN_NUMBER || Number.isInteger(tkn.value) == false) {
			throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
		}

		if (imp) {
			mem = new ImportedMemory();
			mem.module = imp.module;
			mem.name = imp.name;
			imported.push(mem);

			let firstidx = -1;
			let len = memory.length;
			for (let i = 0; i < len; i++) {
				let mem = memory[i];
				if (!(mem instanceof ImportedMemory)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				memory.unshift(mem);
			} else {
				memory.splice(firstidx, 0, mem);
			}

		} else {
			mem = new WasmMemory();
			memory.push(mem);
		}

		mem.min = tkn.value;
		mem.shared = false;

		if (tokens.atEnd()) {
			return mem;
		}

		tkn = tokens.next();
		if (tkn.type != WAT_TOKEN_NUMBER || Number.isInteger(tkn.value) == false) {
			throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
		}

		mem.max = tkn.value;

		if (exp) {
			let obj = new WasmExport(WA_EXPORT_KIND_MEMORY, exp, mem);
			exported.push(obj)
		}

		if (ident) {
			let key = ident.value;
			if (identmap_memory.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_memory[key] = mem;
		}

		if (tokens.atEnd()) {
			return mem;
		}

		tkn = tokens.next();

		if (tkn.type != WAT_TOKEN_KEYWORD && tkn.value != "shared") {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}

		if (!tokens.atEnd()) {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}

		return mem;
	}

	function processToplevelExport(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;

		console.log("export");
		console.log(tokens);
	}

	function processToplevelImport(tokens) {
		let start = tokens._index;
		let tkn, type, mod, name;
		tkn = tokens.next(true);
		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "import") {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}


		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_STRING) {
			throw new WatSyntaxError(WAT_EXPECTED_STRING, tkn.line, tkn.column);
		}
		mod = tkn.value;

		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_STRING) {
			throw new WatSyntaxError(WAT_EXPECTED_STRING, tkn.line, tkn.column);
		}
		name = tkn.value;

		tkn = tokens.next(true);
		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_KEYWORD) {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
		} else if (tkn.value == "func") {
			let func;
			let ident;

			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_IDENT) {
				ident = tkn;
				tkn = tokens.next(true);
			}

			func = new ImportedFunction();
			func.module = mod;
			func.name = name;
			imported.push(func);

			if (ident) {
				let id = ident.value;
				if (identmap_funcs.hasOwnProperty(id))
					throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
				identmap_funcs[id] = func;
			}

			let firstidx = -1;
			let len = functions.length;
			for (let i = 0; i < len; i++) {
				let fn = functions[i];
				if (!(fn instanceof ImportedFunction)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				functions.unshift(func);
			} else {
				functions.splice(firstidx, 0, func);
			}

			pass2.push({handler: processFuncBody, args: [tokens, func]});

		} else if (tkn.value == "table") {
			
			let ident;
			let min, max, reftype, tbl;

			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_IDENT) {
				ident = tkn;
				tkn = tokens.next(true);
			}

			if (tkn.type != WAT_TOKEN_NUMBER || Number.isInteger(tkn.value) == false) {
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
			}

			min = tkn.value;

			if (tkn.type == WAT_TOKEN_NUMBER) {
				// number but not integer
				if (Number.isInteger(tkn.value) == false)
					throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);

				max = tkn.value;
				tkn = tokens.next(true);
			}

			if (tkn.type != WAT_TOKEN_KEYWORD) {
				throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
			}

			reftype = text2bintype(tkn.value);
			if (reftype === undefined) {
				throw new WatSyntaxError("unexpected reftype '" + tkn.value + "'");
			}

			tbl = new ImportedTable();
			tbl.module = mod;
			tbl.name = name;
			tbl.min = min;
			tbl.max = max;
			tbl.reftype = reftype;
			imported.push(tbl);

			if (ident) {
				let key = ident.value;
				if (identmap_tables.hasOwnProperty(key))
					throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
				identmap_tables[key] = tbl;
			}

			let firstidx = -1;
			let len = tables.length;
			for (let i = 0; i < len; i++) {
				let tbl = tables[i];
				if (!(tbl instanceof ImportedTable)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				tables.unshift(tbl);
			} else {
				tables.splice(firstidx, 0, tbl);
			}

		} else if (tkn.value == "memory") {

			let ident;
			let min;
			let max;
			let shared = false;
			let mem;

			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_IDENT) {
				ident = tkn;
				tkn = tokens.next(true);
			}

			if (tkn.type != WAT_TOKEN_NUMBER) {
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
			}

			min = tkn.value;

			tkn = tokens.next(true);
			if (tkn && tkn.type == WAT_TOKEN_NUMBER && Number.isInteger(tkn.value)) {
				max = tkn.value;
				tkn = tokens.next(true);
			}

			if (tkn && tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "shared") {
				shared = true;
			}

			mem = new ImportedMemory();
			mem.module = mod;
			mem.name = name;
			mem.min = min;
			mem.max = max;
			mem.shared = shared;
			imported.push(mem);

			if (ident) {
				let key = ident.value;
				if (identmap_memory.hasOwnProperty(key))
					throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
				identmap_memory[key] = mem;
			}

			let firstidx = -1;
			let len = memory.length;
			for (let i = 0; i < len; i++) {
				let mem = memory[i];
				if (!(mem instanceof ImportedMemory)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				memory.unshift(mem);
			} else {
				memory.splice(firstidx, 0, mem);
			}

		} else if (tkn.value == "global") {

			let ident;
			let mutable = false;
			let type;
			let glob;

			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_IDENT) {
				ident = tkn;
				tkn = tokens.next(true);
			}

			if (tkn.type == '(') {

				tkn = tokens.next(true);
				if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "mut") {
					mutable = true;
					tkn = tokens.next(true);
				}

				if (tkn.type != WAT_TOKEN_KEYWORD) {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
				}

				type = text2bintype(tkn.value);
				if (type === undefined) {
					throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
				}
				tkn = tokens.next(true);

				if (tkn.type != ')') {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
				}

			} else {
				// wat allows for only the type to be specified if not enclosed like (mut i32)
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
				}

				type = text2bintype(tkn.value);
				if (type === undefined) {
					throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
				}
				tkn = tokens.next(true);
			}

			glob = new ImportedGlobal();
			glob.module = mod;
			glob.name = name;
			glob.mutable = mutable;
			glob.type = type;
			imported.push(glob);

			if (ident) {
				let key = ident.value;
				if (identmap_globals.hasOwnProperty(key))
					throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
				identmap_globals[key] = glob;
			}

			let firstidx = -1;
			let len = globals.length;
			for (let i = 0; i < len; i++) {
				let glob = globals[i];
				if (!(glob instanceof ImportedGlobal)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				globals.unshift(glob);
			} else {
				globals.splice(firstidx, 0, glob);
			}

		} else if (tkn.value == "tag") {

			let ident;
			let type;
			let tag;

			tkn = tokens.next(true);
			if (tkn.type == WAT_TOKEN_IDENT) {
				ident = tkn;
				tkn = tokens.next(true);
			}

			type = processTypeuse(tokens);

			if (type.retc != 0) {
				throw new WatSyntaxError("result in type for tags not allowed");
			}

			tag = new ImportedTag();
			tag.module = mod;
			tag.name = name;
			tag.type = type;
			imported.push(tag);

			if (ident) {
				let key = ident.value;
				if (identmap_tags.hasOwnProperty(key))
					throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
				identmap_tags[key] = tag;
			}

			let firstidx = -1;
			let len = tags.length;
			for (let i = 0; i < len; i++) {
				let tag = tags[i];
				if (!(tag instanceof ImportedTag)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				tags.unshift(tag);
			} else {
				tags.splice(firstidx, 0, tag);
			}

		} else {
			throw new WatSyntaxError("unexpected import-type keyword");
		}
	}

	// (global $id (import "js" "global") (mut i32))
	// (global $id (mut i32) (i32.const 65536))
	function processToplevelGlobal(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;

		console.log("globals");
		console.log(tokens);

		let ident;
		let expr;
		let glob;
		let mutable = false;
		let type;
		let imp = false;
		let exp = false;

		tkn = tokens.next(true);
		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next();
		}

		imp = maybeInlineImport(tokens);
		if (!imp) {
			exp = maybeInlineExport(tokens);
		}

		if (exp || imp) {
			tkn = tokens.next(true);
		}

		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		tkn = tokens.next(true);

		if (tkn.type == WAT_TOKEN_KEYWORD && tkn.value == "mut") {
			mutable = true;
			tkn = tokens.next(true);
		}


		if (tkn.type != WAT_TOKEN_KEYWORD) {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_KEYWORD, tkn.line, tkn.column);
		}

		type = text2bintype(tkn.value);
		if (type === undefined) {
			throw new WatSyntaxError(WAT_ERR_NO_VALTYPE, tkn.line, tkn.column);
		}
		tkn = tokens.next(true);

		if (tkn.type != ')') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_END, tkn.line, tkn.column);
		}

		tkn = tokens.next(true);

		if (imp) {
			glob = new ImportedGlobal();
			glob.module = imp.module;
			glob.name = imp.name;

			let firstidx = -1;
			let len = globals.length;
			for (let i = 0; i < len; i++) {
				let glob = globals[i];
				if (!(glob instanceof ImportedGlobal)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				globals.unshift(glob);
			} else {
				globals.splice(firstidx, 0, glob);
			}

		} else {
			glob = new WasmGlobal();
			globals.push(glob);
		}
		glob.mutable = mutable;
		glob.type = type;

		if (!imp) {
			if (!imp && tkn.type != '(')
				throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);

			expr = tokens.captureGroup(tokens._index - 1, false, true);
			tkn = tokens.next(true);
		}

		if (tokens.atEnd() == false) {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}

		if (ident) {
			let key = ident.value;
			if (identmap_globals.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_globals[key] = glob;
		}

		if (exp) {
			let obj = new WasmExport(WA_EXPORT_KIND_GLOBAL, exp, glob);
			exported.push(obj);
		}

		glob.init = [];

		if (expr) {
			pass2.push({handler: processConstExpr, args: [expr, glob.init]});
		}

		return glob;
	}

	function processFuncBody(tokens, func) {
		console.log("processFuncBody() %o %o", tokens, func);
		let locals = [];
		identmap_locals = {};

		if (tokens._tokens[0].line == 20 && tokens._tokens[0].column == 63) {
			debugger;
		}

		let typeuse = processTypeuse(tokens, null);
		if (typeuse !== null) {
			
		}

		if (func instanceof ImportedFunction) {
			func.type = typeuse;
			return;
		} else if (typeuse.argv && typeuse.argv.length > 0) {
			let pullv = typeuse.argv;
			let len = pullv.length;
			for (let i = 0; i < len; i++) {
				let l, t = pullv[i];
				if (Number.isInteger(t)) {
					l = new WasmLocal(t);
					locals.push(l);
				} else {
					l = new WasmLocal(t.type);
					locals.push(l);
					identmap_locals[t.ident] = l;
				}
			}
		}

		let opcodes = [];

		let start = tokens._index;
		let tkn = tokens.next(true);
		console.log(typeuse);
		console.log(tkn);

		// getting local declarations
		while (tkn.type == '(') {
			let kwd, type;
			tkn = tokens.next(true);
			if (tkn.type != WAT_TOKEN_KEYWORD || tkn.value != "local") {
				tokens._index = start;
				tkn = tokens.next(true);
				break;
			}
			processLocal(tokens, locals);
			console.log("start: %d", start);
			start = tokens._index;
			tkn = tokens.next(true);
		}

		while (tkn.type == '(' || tkn.type == WAT_TOKEN_KEYWORD) {
			let kwd, type, folded = false;

			if (tkn.type == '(') {
				folded = true;
				tkn = tokens.next(true);
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					tokens._index = start;
					break;
				}
				kwd = tkn.value;
			} else {
				kwd = tkn.value;
			}

			if (start ==  158) {
				debugger;
			}

			if (kwd == "local") {
				throw new WatSyntaxError("local declartion not allowed outside head of function");
			} else if (instmap.hasOwnProperty(kwd)) {
				let opcls = instmap[kwd];
				let rloc = tkn;
				let subgrp = tokens;
				if (folded) {
					subgrp = tokens.captureGroup(start, true, true);
				} else {
					tokens.skipTo(tkn, true);
				}
				let ret = processInstruction(subgrp, opcls, opcodes, locals, folded);
				if (tokens.atEnd())
					break;
				start = tokens._index;
				tkn = tokens.next(true);
			}
		}

		func.type = typeuse;
		func.opcodes = opcodes;

		identmap_locals = null;
		return true;
	}

	function processToplevelFunc(tokens) {

		// start after (func
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;

		// wat allows import declartion to start with func like:
		// (func $i (import "imports" "imported_func") (param i32))
		let imp;
		let exp;
		let func;
		let ident;

		peek = tokens.next(true);
		if (peek.type == WAT_TOKEN_IDENT) {
			ident = peek;
			peek = tokens.next();
		}

		imp = maybeInlineImport(tokens);
		if (!imp) {
			exp = maybeInlineExport(tokens);
		}

		if (imp || exp)
			peek = tokens.next(true);

		if (imp) {
			func = new ImportedFunction();
			func.module = imp.module;
			func.name = imp.name;
			imported.push(func);

			let firstidx = -1;
			let len = functions.length;
			for (let i = 0; i < len; i++) {
				let fn = functions[i];
				if (!(fn instanceof ImportedFunction)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				functions.unshift(func);
			} else {
				functions.splice(firstidx, 0, func);
			}

		} else {
			func = new WasmFunction();
			functions.push(func);
		}

		if (ident) {
			let key = ident.value;
			if (identmap_funcs.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_funcs[key] = func;
		}

		if (exp) {
			let obj = new WasmExport(WA_EXPORT_KIND_FUNC, exp, func);
			exported.push(obj);
		}

		pass2.push({handler: processFuncBody, args: [tokens, func]});
		return;
	}

	// (table $id 2 funcref)
	function processToplevelTable(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;
		let tkn, ident, tbl, imp, exp, min, max, reftype;

		//console.log("table");
		//console.log(tokens);

		tkn = tokens.next(true);
		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next(true);
		}

		imp = maybeInlineImport(tokens);
		if (!imp) {
			exp = maybeInlineExport(tokens);
		}
		if (imp || exp) {
			tkn = tokens.next(true);
		}

		if (tkn.type != WAT_TOKEN_NUMBER || Number.isInteger(tkn.value) == false) {
			throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
		}

		min = tkn.value;

		if (tkn.type == WAT_TOKEN_NUMBER) {
			// number but not integer
			if (Number.isInteger(tkn.value) == false)
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);

			max = tkn.value;
			tkn = tokens.next(true);
		}

		if (tkn.type != WAT_TOKEN_KEYWORD) {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}

		reftype = text2bintype(tkn.value);
		if (reftype === undefined) {
			throw new WatSyntaxError("unexpected reftype '" + tkn.value + "'");
		}

		if (imp) {
			tbl = new ImportedTable();
			tbl.module = imp.module;
			tbl.name = imp.name;

			let firstidx = -1;
			let len = tables.length;
			for (let i = 0; i < len; i++) {
				let table = tables[i];
				if (!(table instanceof ImportedTable)) {
					firstidx = i;
					break;
				}
			}

			if (firstidx == -1) {
				tables.unshift(tbl);
			} else {
				tables.splice(firstidx, 0, tbl);
			}

		} else {
			tbl = new WasmTable();
			tables.push(tbl);
		}
		tbl.min = min;
		tbl.max = max;
		tbl.reftype = reftype;

		if (ident) {
			let key = ident.value;
			if (identmap_tables.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_tables[key] = tbl;
		}

		if (exp) {
			let obj = new WasmExport(WA_EXPORT_KIND_TABLE, exp, tbl);
			exported.push(obj);
		}

		return tbl;
	}

	function processConstExpr(tokens, target) {

		let start = tokens._index;
		let tkn = tokens.next(true);
		while (tkn.type == '(' || tkn.type == WAT_TOKEN_KEYWORD) {
			let kwd, type, folded = false;

			if (tkn.type == '(') {
				folded = true;
				tkn = tokens.next(true);
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					tokens._index = start;
					break;
				}
				kwd = tkn.value;
			} else {
				kwd = tkn.value;
			}

			if (start ==  158) {
				debugger;
			}

			if (kwd == "local") {
				throw new WatSyntaxError("unexpected local");
			} else if (instmap.hasOwnProperty(kwd)) {
				let opcls = instmap[kwd];
				let rloc = tkn;
				let subgrp = tokens;
				if (folded) {
					subgrp = tokens.captureGroup(start, true, true);
				} else {
					tokens.skipTo(tkn, true);
				}
				let ret = processInstruction(subgrp, opcls, target, null, folded);
				if (tokens.atEnd())
					break;
				start = tokens._index;
				tkn = tokens.next(true);
			}
		}

		return true;
	}

	// (data $data2 (i32.const 0x020) "\01\03\05\07\09\0B\0D\0F")
	function processToplevelData(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;
		let expr, tkn, ident, buffer, buffers, bufsz = 0;

		//console.log("data");
		//console.log(tokens);

		tkn = tokens.next(true);
		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next(true);
		}

		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		expr = tokens.captureGroup(tokens._index - 1, false, true);
		tkn = tokens.next(true);
		if (tkn.type != WAT_TOKEN_BINARY) {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}
		buffers = [];
		while (tkn.type == WAT_TOKEN_BINARY) {
			let buf = tkn.value;
			buffers.push(buf);
			bufsz += buf.byteLength;
			if (tokens.atEnd())
				break;
			tkn = tokens.next(true);
		}

		if (buffers.length == 1) {
			buffer = buffers[0];
		} else if (buffers.length > 1) {
			buffer = new Uint8Array(bufsz);
			let len = buffers.length;
			let off = 0;
			for (let i = 0; i < len; i++) {
				let buf = buffers[i];
				buffer.set(buf, off);
				off += buf.byteLength;
			}
		}


		let dataSegment = new WasmDataSegment();
		dataSegment._buffer = buffer;
		dataSegment.init = [];
		dataSegments.push(dataSegment);

		if (ident) {
			let key = ident.value;
			if (identmap_data.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_data[key] = dataSegment
		}

		pass2.push({handler: processConstExpr, args: [expr, dataSegment.init]});

		return dataSegment;
	}

	function processElementPass2(element, tokens, vector) {

		let opcodes = [];
		let start = tokens._index;
		let tkn = tokens.next(true);
		while (tkn.type == '(' || tkn.type == WAT_TOKEN_KEYWORD) {
			let kwd, type, folded = false;

			if (tkn.type == '(') {
				folded = true;
				tkn = tokens.next(true);
				if (tkn.type != WAT_TOKEN_KEYWORD) {
					tokens._index = start;
					break;
				}
				kwd = tkn.value;
			} else {
				kwd = tkn.value;
			}

			if (start ==  158) {
				debugger;
			}

			if (kwd == "local") {
				throw new WatSyntaxError("unexpected local");
			} else if (instmap.hasOwnProperty(kwd)) {
				let opcls = instmap[kwd];
				let rloc = tkn;
				let subgrp = tokens;
				if (folded) {
					subgrp = tokens.captureGroup(start, true, true);
				} else {
					tokens.skipTo(tkn, true);
				}
				let ret = processInstruction(subgrp, opcls, opcodes, null, folded);
				if (tokens.atEnd())
					break;
				start = tokens._index;
				tkn = tokens.next(true);
			}
		}

		let results = [];
		let len = vector.length;
		for (let i = 0; i < len; i++) {
			let tkn = vector[i];
			if (tkn.type == WAT_TOKEN_IDENT) {
				let ident = tkn.value;
				if (identmap_funcs.hasOwnProperty(ident) == false) {
					throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
				}
				let func = identmap_funcs[ident];
				results.push(func);
			} else if (tkn.type == WAT_TOKEN_NUMBER) {
				let index = tkn.value;
				if (!Number.isInteger(index)) {
					throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
				} else if(index < 0 || index >= functions.length) {
					throw new WatSyntaxError(WAT_ERR_NO_FUNCIDX, tkn.line, tkn.column);
				}
				let func = functions[index];
				results.push(func);
			}
		}

		element.vector = results;
		element.opcodes = opcodes;
		element.count = vector.length;
	}

	// (elem (i32.const 0) $f1 $f2)
	function processToplevelElement(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;
		let tkn, ident, expr, vector = [];

		//console.log("element");
		//console.log(tokens);

		tkn = tokens.next(true);
		if (tkn.type == WAT_TOKEN_IDENT) {
			ident = tkn;
			tkn = tokens.next(true);
		}

		if (tkn.type != '(') {
			throw new WatSyntaxError(WAT_ERR_EXPECTED_GRP_OPEN, tkn.line, tkn.column);
		}

		expr = tokens.captureGroup(tokens._index - 1, false, true);
		tkn = tokens.next(true);

		while (tkn.type == WAT_TOKEN_IDENT || tkn.type == WAT_TOKEN_NUMBER) {
			vector.push(tkn);
			if (tokens.atEnd())
				break;
			tkn = tokens.next(true);
		}

		let segment = new WasmElementSegment();

		if (ident) {
			let key = ident.value;
			if (identmap_elem.hasOwnProperty(key))
				throw new WatSyntaxError(WAT_ALREADY_DECLARED, ident.line, ident.column);
			identmap_elem[key] = segment
		}

		pass2.push({handler: processElementPass2, args: [segment, expr, vector]});

		return segment;
	}

	function processStartPass2(tokens) {

		tkn = tokens.next(true);
		if (tkn.type == WAT_TOKEN_IDENT) {
			let ident = tkn.value;
			if (identmap_funcs.hasOwnProperty(ident) == false) {
				throw new WatSyntaxError(WAT_ERR_NO_IDENT, tkn.line, tkn.column);
			}
			startfn = identmap_funcs[ident];

		} else if (tkn.type == WAT_TOKEN_NUMBER) {
			let funcidx = tkn.value;
			if (!Number.isInteger(funcidx))
				throw new WatSyntaxError(WAT_EXPECTED_INTEGER, tkn.line, tkn.column);
			if (funcidx < 0 || funcidx >= functions.length)
				throw new WatSyntaxError(WAT_ERR_NO_FUNCIDX, tkn.line, tkn.column);
			startfn = functions[funcidx];
		} else {
			throw new WatSyntaxError(WAT_UNEXPECTED_TOKEN, tkn.line, tkn.column);
		}
	}

	function processToplevelStart(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;

		if (foundstart)
			throw new WatSyntaxError("duplicate start function");
		foundstart = true;

		// process the func ref in secound pass.
		pass2.push({handler: processStartPass2, args: [tokens]});

		console.log("start");
		console.log(tokens);
	}

	function processToplevelTag(tokens) {
		// remove folding start & end
		tokens._tokens.shift();
		tokens._tokens.pop();
		tokens._index = 1;

		console.log("tag");
		console.log(tokens);
	}

	const T_TOP_LEVEL = 0; // top-level
	const T_MOD_LEVEL = 1; // module

	tokens = new BasicTokenizer(tokens);
	let lvl = 0;
	tkn = tokens.next(true);
	idx = 0;
	while (tkn !== null) {

		if (tkn.type == '(') {
			let fstart = tokens._index - 1;
			tkn = tokens.next(true);

			if (tkn.type != WAT_TOKEN_KEYWORD) {
				throw new WatSyntaxError("expected keyword after opening '(' at top-level or module level");
			}

			if (lvl == T_TOP_LEVEL) {

				if (tkn.value == "module") {
					peek = tokens.next(true);
					if (peek.type == WAT_TOKEN_IDENT) {
						moduleId = peek;
					} else {
						tkn = peek;
						continue;
					}
				} else {

				}

			}

			if (lvl == T_TOP_LEVEL || lvl == T_MOD_LEVEL) {

				if (tkn.value == "type") {
					let fold = tokens.captureGroup(fstart, true, true);
					let type = processToplevelType(fold, toplevel_identmap);
					console.log(type);

				} else if (tkn.value == "import") {

					let fold = tokens.captureGroup(fstart, true, true);
					let imp = processToplevelImport(fold, toplevel_identmap);
					console.log(imp);

				} else if (tkn.value == "func") {

					let fold = tokens.captureGroup(fstart, true, true);
					let func = processToplevelFunc(fold, toplevel_identmap);
					console.log(func);

				} else if (tkn.value == "table") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelTable(fold);
					console.log(exp);
				} else if (tkn.value == "memory") {
					let fold = tokens.captureGroup(fstart, true, true);
					let mem = processToplevelMemory(fold);
					console.log(mem);

				} else if (tkn.value == "global") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelGlobal(fold);
					console.log(exp);

				} else if (tkn.value == "export") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelExport(fold);
					console.log(exp);

				} else if (tkn.value == "start") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelStart(fold);
					console.log(exp);
				} else if (tkn.value == "elem") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelElement(fold);
					console.log(exp);

				} else if (tkn.value == "data") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelData(fold);
					console.log(exp);

				} else if (tkn.value == "tag") {
					let fold = tokens.captureGroup(fstart, true, true);
					let exp = processToplevelTag(fold);
					console.log(exp);
				} else {

				}

			}

		} else if (tkn.type == ')') {

		}

		tkn = tokens.next();
	}

	let ylen = pass2.length;
	for (let y = 0; y < ylen; y++) {
		let pass = pass2[y];
		let handler = pass.handler;
		let args = pass.args;
		handler.apply(this, args);
	}

	if (options && options.ident2name) {

		for (let ident in identmap_types) {
			let obj = identmap_types[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_funcs) {
			let obj = identmap_funcs[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_memory) {
			let obj = identmap_memory[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_tables) {
			let obj = identmap_tables[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_globals) {
			let obj = identmap_globals[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_elem) {
			let obj = identmap_elem[ident];
			obj[__nsym] = ident;
		}

		for (let ident in identmap_data) {
			let obj = identmap_data[ident];
			obj[__nsym] = ident;
		}

	} else if (options && options.ir_idents) {
		
		for (let ident in identmap_types) {
			let obj = identmap_types[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_funcs) {
			let obj = identmap_funcs[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_memory) {
			let obj = identmap_memory[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_tables) {
			let obj = identmap_tables[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_globals) {
			let obj = identmap_globals[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_elem) {
			let obj = identmap_elem[ident];
			obj[__wat_ident] = ident;
		}

		for (let ident in identmap_data) {
			let obj = identmap_data[ident];
			obj[__wat_ident] = ident;
		}
	}

	console.log("module-ident: %o", moduleId);
	console.log("dataSegments: %o", dataSegments);
	console.log("elementSegments: %o", elementSegments);
	console.log("exported: %o", exported);
	console.log("imported: %o", imported);
	console.log("types: %o", types);
	console.log("memory: %o", memory);
	console.log("functions: %o", functions);
	console.log("globals: %o", globals);
	console.log("identmap_types: %o", identmap_types);
	console.log("identmap_funcs: %o", identmap_funcs);
	console.log("identmap_locals: %o", identmap_locals);
	console.log("identmap_memory: %o", identmap_memory);
	console.log("identmap_tables: %o", identmap_tables);
	console.log("identmap_globals: %o", identmap_globals);
	console.log("identmap_elem: %o", identmap_elem);
	console.log("identmap_data: %o", identmap_data);

	// computing the number of imported objects per type.
	let impfncnt = 0;
	let imptblcnt = 0;
	let impmemcnt = 0;
	let impglbcnt = 0;
	let imptagcnt = 0;
	let zlen = functions.length;
	for (let z = 0; z < zlen; z++) {
		let fn = functions[z];
		if (fn instanceof ImportedFunction) {
			impfncnt++;
		} else {
			break;
		}
	}
	zlen = tables.length;
	for (let z = 0; z < zlen; z++) {
		let tbl = tables[z];
		if (tbl instanceof ImportedTable) {
			imptblcnt++;
		} else {
			break;
		}
	}

	zlen = memory.length;
	for (let z = 0; z < zlen; z++) {
		let mem = memory[z];
		if (mem instanceof ImportedMemory) {
			impmemcnt++;
		} else {
			break;
		}
	}

	zlen = globals.length;
	for (let z = 0; z < zlen; z++) {
		let glb = globals[z];
		if (glb instanceof ImportedGlobal) {
			impglbcnt++;
		} else {
			break;
		}
	}

	zlen = tags.length;
	for (let z = 0; z < zlen; z++) {
		let tag = tags[z];
		if (tag instanceof ImportedTag) {
			imptagcnt++;
		} else {
			break;
		}
	}

	let sec, mod = new WebAssemblyModule();
	mod.types = types;
	mod.dataSegments = dataSegments;
	mod.elementSegments = elementSegments;
	mod.exports = exported;
	mod.functions = functions;
	mod.globals = globals;
	mod.imports = imported;
	mod.memory = memory;
	mod.tables = tables;
	if (startfn) {
		mod.startfn = startfn;
	}
	mod.producers = {language: ["WAT"], 'processed-by': [{value: 'wasm-hack.wat-parser', version: '1.0.0 (https://github.com/raweden/wasm-info)'}]};
	mod.sections = [];

	if (types.length > 0) {
		mod.sections.push(new WebAssemblyFuncTypeSection(mod));
	}
	
	if (imported.length > 0) {
		mod.sections.push(new WebAssemblyImportSection(mod));
	}
	
	if ((functions.length - impfncnt) > 0) {
		mod.sections.push(new WebAssemblyFunctionSection(mod));
	}

	if ((tables.length - imptblcnt) > 0) {
		mod.sections.push(new WebAssemblyTableSection(mod));
	}

	if ((memory.length - impmemcnt) > 0) {
		mod.sections.push(new WebAssemblyTableSection(mod));
	}

	if ((globals.length - impglbcnt) > 0) {
		mod.sections.push(new WebAssemblyGlobalSection(mod));
	}

	if (exported.length > 0) {
		mod.sections.push(new WebAssemblyExportSection(mod));
	}

	if (startfn) {
		mod.sections.push(new WebAssemblyStartSection(mod));
	}

	if (elementSegments.length > 0) {
		mod.sections.push(new WebAssemblyElementSection(mod));
	}
	
	if ((functions.length - impfncnt) > 0) {
		mod.sections.push(new WebAssemblyCodeSection(mod));
	}

	if (dataSegments.length > 0) {
		mod.sections.push(new WebAssemblyDataSection(mod));
	}

	if ((tags.length - imptagcnt) > 0) {
		mod.sections.push(new WebAssemblyTagSection(mod));
	}
	
	if (mod.producers) {
		let sec = new WebAssemblyCustomSectionProducers(mod);
		sec.data = mod.producers;
		mod.sections.push(sec);
	}

	return mod;
}

(function() {
	let len = opcode_info.length;
	for (let i = 0; i < len; i++) {
		let opcls = opcode_info[i];
		instmap[opcls.name] = opcls;
	}
})();
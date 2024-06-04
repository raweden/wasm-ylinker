import { ImportedFunction, WA_EXPORT_KIND_FUNC, WasmFunction } from "../../../src/core/types";
import * as constant from "../../../src/core/const";

export class WasmFunctionsInspectorView {

	constructor (header, body) {
		let _self = this;
		let findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "find";
		body.appendChild(findInput);

		let findOptions = document.createElement("select");
		findOptions.innerHTML = "<option value=\"starts-with\">Starts with</option><option value=\"ends-with\">Ends with</option><option value=\"contains\">Contains</option><option value=\"regexp\">Regexp</option>";
		findOptions.selectedIndex = 2;
		body.appendChild(findOptions);

		let findCS = document.createElement("input");
		findCS.type = "checkbox";
		findCS.id = "case-sensetive";
		body.appendChild(findCS);
		let labelCS = document.createElement("label");
		labelCS.for = "case-sensetive";
		labelCS.textContent = "Case Sensetive";
		body.appendChild(labelCS);

		let findResults = document.createElement("ul");
		body.appendChild(findResults);

		let thChilds = [];
		let columns = [{
			title: "funcidx",
			valueType: "number",
			cssClass: "wasm-funcidx",
			key: "funcidx",
			render: null,
		}, {
			title: "name",
			valueType: "string",
			key: "name",
			render: null,
		}, {
			title: "in -> out",
			valueType: "wasm-type",
			cssClass: "wasm-stack-signature",
			key: "type",
			render: function (context, td, item) {
				let sign, func = item.func;
				sign = func.type.toString();
				sign = sign.replace("->", "→");
				return sign;
			}
		}, {
			title: "typeidx",
			valueType: "number",
			cssClass: "wasm-typeidx",
			key: "typeidx",
			contents: null,
		}, {
			title: "use count",
			valueType: "number",
			key: "usecount",
			render: null,
		}, {
			title: "stack usage",
			valueType: "number",
			key: "stackuse",
			render: null
		}, {
			title: "inst cnt",
			valueType: "number",
			key: "instcount",
			render: null,
		}, {
			title: "bytecode size",
			valueType: "number",
			key: "bcsize",
			render: null
		}];

		this._sortColumns = [{column: 0, "direction":"asc"}];

		function onTableTitleClick(evt) {
			let idx = thChilds.indexOf(evt.target);
			if (idx == -1)
				return;
			let col = columns[idx];
			_self._sortBy(idx, null);
			_self._pageIndex = 0;
			_self.render();
		}

		let table = document.createElement("table");
		table.classList.add("data-table", "wasm-functions");
		let thead = document.createElement("thead");
		let tr = document.createElement("tr");
		let len = columns.length;
		for (let i = 0; i < len; i++) {
			let column = columns[i];
			let th = document.createElement("th");
			th.textContent = column.title;
			th.addEventListener("click", onTableTitleClick);
			tr.appendChild(th);
			thChilds.push(th);
		}
		thead.appendChild(tr);
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);

		this._heading = header;
		this._body = body;
		this._tbody = tbody;
		this._footer = footer;
		this._defaultCollection = null;
		this._collection = null;
		this._pageIndex = 0;
		this._pageRowCount = 25;
		this._columns = columns;

		{
			let paginator = document.createElement("div");
			paginator.classList.add("pagination");
			let first = document.createElement("span");
			first.textContent = "First";
			first.addEventListener("click", function (evt) {
				_self._pageIndex = 0;
				curr.textContent = "1"
				_self.render();
			});
			paginator.appendChild(first);
			let prev = document.createElement("span");
			prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
			prev.addEventListener("click", function (evt) {
				if (_self._pageIndex == 0)
					return;
				_self._pageIndex--;
				curr.textContent = (_self._pageIndex + 1)
				_self.render();
			});
			paginator.appendChild(prev);
			let curr = document.createElement("span");
			curr.classList.add("page-active");
			curr.textContent = "1";
			paginator.appendChild(curr);
			let next = document.createElement("span");
			next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
			next.addEventListener("click", function (evt) {
				let last = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				if (_self._pageIndex == last)
					return;
				_self._pageIndex++;
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(next);
			let lastBtn = document.createElement("span");
			lastBtn.textContent = "Last";
			lastBtn.addEventListener("click", function (evt) {
				_self._pageIndex = _self._collection.length == 0 ? 0 : Math.floor(_self._collection.length / _self._pageRowCount);
				curr.textContent = (_self._pageIndex + 1);
				_self.render();
			});
			paginator.appendChild(lastBtn);
			body.appendChild(paginator);
		}

		findOptions.addEventListener("change", function(evt) {
			let value = findInput.value;
			let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			_self._collection = results;
			_self._pageIndex = 0;
			_self.render();
		});

		findInput.addEventListener("keyup", function(evt) {
			if (evt.key == "Enter") {
				let value = findInput.value;
				let results = _self.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				_self._collection = results;
				_self._pageIndex = 0;
				_self.render();
			}
		});

		//let tbltest = document.createElement("table");
		//tbltest.innerHTML = "<thead></tr><th>funcidx</th><th>name</th><th>typeidx</th><th>use count</th><th>stack usage</th><th>inst cnt</th><th>bytecode size</th></tr></thead><tbody><tbody>"
		//body.appendChild(tbltest);
	}

	_sortBy(columnIndex, direction) {

		let key;
		
		function num_desc(a, b){
			let av = a[key];
			let bv = b[key];
			if (av > bv) {
				return 1;
			} else if (av < bv) {
				return -1;
			} else {
				return 0;
			}
		}

		function num_asc(a, b){
			let av = a[key];
			let bv = b[key];
			if (av > bv) {
				return -1;
			} else if (av < bv) {
				return 1;
			} else {
				return 0;
			}
		}

		if (this._sortColumns.length == 1 && this._sortColumns[0].column == columnIndex) {
			let sortcol = this._sortColumns[0];
			let dir = sortcol.dir;
			if (dir == "asc") {
				dir = "desc";
			} else if (dir == "desc") {
				dir = "asc";
			}

			let idx = sortcol.column;
			let col = this._columns[idx];
			key = col.key;

			if (dir == "desc") {
				this._collection.sort(num_desc);
			} else if (dir == "asc") {
				this._collection.sort(num_asc);
			} else {
				throw new TypeError("invalid direction");
			}
		} else {
			let dir;
			if (direction == null || direction == undefined) {
				dir = "asc";
			} else {
				dir = direction;
			}

			this._sortColumns[0] = {column: columnIndex, dir: dir};
			let col = this._columns[columnIndex];
			key = col.key;

			if (dir == "desc") {
				this._collection.sort(num_desc);
			} else if (dir == "asc") {
				this._collection.sort(num_asc);
			} else {
				throw new TypeError("invalid direction");
			}
		}
	}

	search(string, opts) {
		let mod = this._module;
		let items = this._defaultCollection;
		let len = items.length;
		let cis = opts.caseSensitive !== true;
		let matches = [];
		let searchType = opts.searchType;
		switch (searchType) {
			case "starts-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().startsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.startsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "ends-with":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().endsWith(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.endsWith(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "contains":
				if (cis) {
					let lc = string.toLowerCase();
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.toLowerCase().includes(lc)) {
							matches.push(item);
						}
					}
				} else {
					for (let i = 0; i < len; i++) {
						let item = items[i];
						if (item.name.includes(string)) {
							matches.push(item);
						}
					}
				}
				break;
			case "regexp": {
				let regexp = new RegExp(string);
				for (let i = 0; i < len; i++) {
					let item = items[i];
					if (item.name.search(regexp)) {
						matches.push(item);
					}
				}
				break;
			}
			default:
				break;
		}

		return matches;
	}

	render() {
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}

		let start = this._pageIndex * this._pageRowCount;
		let items = this._collection;
		let mod = this._module;
		let columns = this._columns;
		let xlen = columns.length;

		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let item = items[i];
			let funcidx = item.funcidx;
			let func = item.func; //mod.functions[funcidx];

			let tr = document.createElement("tr");
			for (let x = 0; x < xlen; x++) {
				let col = columns[x];
				let key = col.key;
				let td = document.createElement("td");
				if (col.cssClass) {
					td.classList.add(col.cssClass);
				}

				if (typeof col.render == "function") {
					let ret = col.render(this, td, item);
					if (typeof ret == "string")
						td.textContent = ret;
				} else if (col.key && item.hasOwnProperty(key) && item[key] !== undefined && item[key] !== null) {
					td.textContent = item[key];
				}

				tr.appendChild(td);
			}
			/*
			let td = document.createElement("td");
			td.classList.add();

			//let span = document.createElement("span");
			//span.classList.add("index-badge")
			//span.textContent = item.funcidx;
			//td.appendChild(span);
			td.textContent = item.funcidx;
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = item.name;
			tr.appendChild(td);
			td = document.createElement("td");
			td.classList.add("wasm-stack-signature");
			let sign = func.type.toString();
			sign = sign.replace("->", "→");
			td.textContent = sign;
			tr.appendChild(td);
			td = document.createElement("td");
			td.classList.add("wasm-typeidx");
			let typeidx = mod.types.indexOf(func.type);
			//span = document.createElement("span");
			//span.classList.add("index-badge")
			//span.textContent = typeidx;
			//td.appendChild(span);
			td.textContent = typeidx;
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = typeof func.usage == "number" ? func.usage : "";
			tr.appendChild(td);
			td = document.createElement("td"); // stack usage
			if (typeof func.stackUsage == "number")
				td.textContent = func.stackUsage;
			tr.appendChild(td);
			td = document.createElement("td"); // instruction count
			td.textContent = (func instanceof WasmFunction) ? func.opcodes.length : "";
			tr.appendChild(td);
			td = document.createElement("td"); // bytecode size
			td.textContent = (func instanceof WasmFunction) ? (func.opcode_end - func.codeStart) : "";
			tr.appendChild(td);
			*/
			tbody.appendChild(tr);
		}

		this._footer.textContent = "found " + this._collection.length + " matches";	
	}

	set module(mod) {
		let items = [];
		this._defaultCollection = items;
		this._collection = items;
		this._module = mod;
		let functions = mod.functions;
		let len = functions.length;
		for (let i = 0; i < len; i++) {
			let func = functions[i];
			let name = typeof func[constant.__nsym] == "string" ? func[constant.__nsym] : null;
			let obj = {funcidx: i, func: func, name: name, exportedAS: null, importedAs: null};
			obj.type = func.type;
			obj.typeidx = mod.types.indexOf(func.type);
			obj.usecount = func._usage;
			if (func instanceof WasmFunction) {
				obj.imported = false;
				obj.instcount = func.opcodes.length;
				obj.bcsize = func.opcode_end - func.codeStart;
			} else if (func instanceof ImportedFunction) {
				obj.imported = true;
				obj.name = func.module + "." + func.name;
				obj.instcount = null;
				obj.bcsize = null;
			}
			items.push(obj);
		}

		let exported = mod.exports;
		len = exported.length;
		for (let i = 0; i < len; i++) {
			let exp = exported[i];
			if (exp._kind != WA_EXPORT_KIND_FUNC) {
				continue;
			}
			let func = exp.value;
			let idx = functions.indexOf(func);
			if (idx == -1)
				continue;
			let obj = items[idx];
			obj.exportedAS = exp.name;
		}

		this.render();
	}

	get module() {
		return this._module;
	}
}
import { WasmGlobal } from "../../../src/core/types";
import { type_name } from "../../../src/core/utils";
import { FilteredSearchView } from "./FilteredSearchView";
import { PaginatorView } from "./PaginatorView";

export class WasmGlobalsInspectorView {

	constructor (header, body) {
		let _self = this;
		this._heading = header;
		this._body = body;

		let test = new FilteredSearchView();
		body.appendChild(test.element);

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

		let table = document.createElement("table");
		table.classList.add("data-table");
		let thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>index</th><th>name</th><th>type</th><th>initial value</th><th>use count</th><th>import/export</th></tr>";
		table.appendChild(thead);
		let tbody = document.createElement("tbody");
		table.appendChild(tbody);
		body.appendChild(table);
		let footer = document.createElement("span");
		body.appendChild(footer);
		this._footer = footer;
		this._tbody = tbody;

		this._defaultCollection;
		this._collection;
		this._pageRowCount = 25;

		let paginator = new PaginatorView();
		body.appendChild(paginator.element);
		paginator.on("change", (type, pageIndex) => {
			this.render();
		});

		findOptions.addEventListener("change", (evt) => {
			let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			this._collection = results;
			paginator.pageIndex = 0;
			paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
			this.render();
			this._footer.textContent = "found " + results.length + " matches";
		});

		findCS.addEventListener("change", (evt) => {
			let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
			this._collection = results;
			paginator.pageIndex = 0;
			paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
			this.render();
			this._footer.textContent = "found " + results.length + " matches";
		});

		findInput.addEventListener("keyup", (evt) => {
			if (evt.key == "Enter") {
				let results = this.search(findInput.value, {
					caseSensitive: findCS.value !== "off",
					searchType: findOptions.selectedOptions.item(0).value
				});
				this._collection = results;
				paginator.pageIndex = 0;
				paginator.pageCount = results.length == 0 ? 1 : Math.ceil(results.length / this._pageRowCount);
				this.render();
				this._footer.textContent = "found " + results.length + " matches";
			}
		});

		this._paginator = paginator;
	}

	search(string, opts) {

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
		let mod = this._module;
		let tbody = this._tbody;
		while (tbody.lastChild) {
			tbody.removeChild(tbody.lastChild);
		}
		let paginator = this._paginator;
		let start = paginator.pageIndex * this._pageRowCount;
		let items = this._collection;

		let globals = mod.globals;
		let len = Math.min(items.length, start + this._pageRowCount);
		for (let i = start; i < len; i++) {
			let item = items[i];
			let glob = item.global;

			let tr = document.createElement("tr");
			let td = document.createElement("td");
			td.textContent = globals.indexOf(glob);
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = item.name;
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = type_name(glob.type);
			tr.appendChild(td);
			td = document.createElement("td");
			if (glob instanceof WasmGlobal) {
				let init = glob.init[0].value
				td.textContent = init;
			}
			tr.appendChild(td);
			td = document.createElement("td");
			td.textContent = typeof glob.usage == "number" ? glob.usage : "";
			tr.appendChild(td);
			td = document.createElement("td"); // import/export
			tr.appendChild(td);
			tbody.appendChild(tr);
		}
	}

	set module(value) {
		this._module = value;
		if (this._defaultCollection)
			this.render();
	}

	get module() {
		return this._module;
	}

	set model(value) {
		let items = [];
		this._defaultCollection = items;
		this._collection = items;
		for (let p in value) {
			items.push({name: p, global: value[p]});
		}
		let paginator = this._paginator;
		paginator.pageIndex = 0;
		paginator.pageCount = items.length == 0 ? 1 : Math.ceil(items.length / this._pageRowCount);
		this.render();
	}

	get model() {
		return this._defaultCollection;
	}
}
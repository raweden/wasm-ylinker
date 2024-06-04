import { EventEmitter } from "../base/EventEmitter";

export class PaginatorView extends EventEmitter {

	constructor() {
		super();
		this._pageIndex = 0;
		this._pageCount = 1;

		let first, prev, curr, next, lastBtn, paginator = document.createElement("div");
		paginator.classList.add("pagination");
		first = document.createElement("span");
		first.textContent = "First";
		first.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex = 0;
			
			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = "1";
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(first);
		prev = document.createElement("span");
		prev.innerHTML = "<svg fill=\"currentColor\"><path d=\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>";
		prev.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex--;
			if (this._pageIndex < 0)
				this._pageIndex = 0; 

			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = (this._pageIndex + 1)
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(prev);
		curr = document.createElement("span");
		curr.classList.add("page-active");
		curr.textContent = "1";
		paginator.appendChild(curr);
		next = document.createElement("span");
		next.innerHTML = "<svg fill=\"currentColor\"><path d=\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\"/></svg>";
		next.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex++;
			if (this._pageIndex >= this._pageCount) {
				this._pageIndex = this._pageCount - 1;
			}
			if (this._pageIndex == oldValue)
				return;

			curr.textContent = (this._pageIndex + 1);
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(next);
		lastBtn = document.createElement("span");
		lastBtn.textContent = "Last";
		lastBtn.addEventListener("click", (evt) => {
			let oldValue = this._pageIndex;
			this._pageIndex = this._pageCount;

			if (this._pageIndex == oldValue)
				return;
			
			curr.textContent = (this._pageIndex + 1);
			this.emit("change", this._pageIndex);
		});
		paginator.appendChild(lastBtn);

		this._element = paginator;
	}

	get element() {
		return this._element;
	}

	get pageIndex() {
		return this._pageIndex;
	}

	set pageIndex(value) {
		if (!Number.isInteger(value))
			throw new TypeError("invalid type");
		if (value < 0 || value >= this._pageCount)
			throw new RangeError("invalid range");
		if (this._pageIndex === value)
			return;
		this._pageIndex = value;
	}

	get pageCount() {
		return this._pageCount;
	}

	set pageCount(value) {
		if (!Number.isInteger(value))
			throw new TypeError("invalid type");
		if (value <= 0)
			throw new RangeError("invalid range");
		if (this._pageCount === value)
			return;
		if (this._pageIndex >= this._pageCount)
			this._pageIndex = this._pageCount - 1;
		this._pageCount = value;
	}

}
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

// from emscripten.
let UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

// LEB128 is based on psudeo code from the wikipedia page as well as other sources
// https://en.wikipedia.org/wiki/LEB128
// https://gitlab.com/mjbecze/leb128/-/blob/master/unsigned.js
/**
 */
export class ByteArray {

    /**
     * 
     * @param {Uint8Array|DataView|ArrayBuffer} buffer 
     */
    constructor(buffer) {
        this._data = null;
        this._u8 = null;

        // TODO: should support DataView subrange trough .byteOffset
        if (buffer instanceof DataView) {
            this._data = buffer;
            this._u8 = new Uint8Array(buffer.buffer);
        } else if (buffer instanceof Uint8Array) {
            this._data = new DataView(buffer.buffer);
            this._u8 = buffer;
        } else if (ArrayBuffer.isView(buffer)) {
            this._data = new DataView(buffer.buffer);
            this._u8 = new Uint8Array(buffer.buffer);
        } else if (buffer instanceof ArrayBuffer) {
            this._data = new DataView(buffer);
            this._u8 = new Uint8Array(buffer);
        } else if (!(buffer instanceof ByteArray)) {
            throw TypeError("buffer is of unsupported type");
        }
        this._offset = 0;
        this._littleEndian = true;
        if (buffer instanceof ByteArray) {
            this._data = buffer._data;
            this._u8 = buffer._u8;
            this._offset = buffer._offset;
            this._littleEndian = buffer._littleEndian;
        }
    }

    /**
     * @type {integer}
     */
    get offset() {
        return this._offset;
    }

    set offset(value) {
        let len = this._u8.byteLength;
        if (value < 0 || value > len) {
            throw new RangeError("index out of range");
        }

        this._offset = value;
    }

    /**
     * @type {integer}
     */
    get isLittleEndian() {
        return this._littleEndian;
    }

    /**
     * @type {integer}
     */
    get length() {
        return this._u8.byteLength;
    }

    // reading

    /**
     * 
     * @returns {BigInt}
     */
    readBigInt64() {
        let off = this._offset;
        let ret = this._data.getBigInt64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    /**
     * 
     * @returns {BigInt}
     */
    readBigUint64() {
        let off = this._offset;
        let ret = this._data.getBigUint64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    /**
     * 
     * @returns {number}
     */
    readFloat32() {
        let off = this._offset;
        let ret = this._data.getFloat32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    /**
     * 
     * @returns {number}
     */
    readFloat64() {
        let off = this._offset;
        let ret = this._data.getFloat64(off, this._littleEndian);
        this._offset = off + 8;
        return ret;
    }

    /**
     * 
     * @returns {integer}
     */
    readInt16() {
        let off = this._offset;
        let ret = this._data.getInt16(off, this._littleEndian);
        this._offset = off + 2;
        return ret;
    }

    /**
     * 
     * @returns {integer}
     */
    readInt32() {
        let off = this._offset;
        let ret = this._data.getInt32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    /**
     * 
     * @returns {integer}
     */
    readInt8() {
        return this._data.getInt8(this._offset++);
    }

    /**
     * 
     * @returns {integer}
     */
    readUint16() {
        let off = this._offset;
        let ret = this._data.getUint16(off, this._littleEndian);
        this._offset = off + 2;
        return ret;
    }

    /**
     * 
     * @returns {integer}
     */
    readUint32() {
        let off = this._offset;
        let ret = this._data.getUint32(off, this._littleEndian);
        this._offset = off + 4;
        return ret;
    }

    /**
     * 
     * @returns {integer}
     */
    readUint8() {
        return this._data.getUint8(this._offset++);
    }

    /**
     * 
     * @returns {integer|BigInt}
     */
    readULEB128(as64) {
        // consumes an unsigned LEB128 integer starting at `off`.
        // changes `off` to immediately after the integer
        as64 = (as64 === true);
        let u8 = this._u8;
        let off = this._offset;
        let result = BigInt(0);
        let shift = BigInt(0);
        let byte = 0;
        do {
            byte = u8[off++];
            result += BigInt(byte & 0x7F) << shift;
            shift += 7n;
        } while (byte & 0x80);

        if (!as64 && result < 4294967295n)
            result = Number(result);

        this._offset = off;

        return result;
    }


    /**
     * Utility function to decode a SLEB128 value.
     *
     * @param {Number}          asIntN
     * @return {BigInt|integer}
     */
    readSLEB128(asIntN) {

        if (asIntN == 64 || asIntN === undefined) {

            const UINT64_MAX = 18446744073709551615n;
            let err, off = this._offset;
            const orig_p = off;
            const buf = this._u8;
            const end = buf.byteLength;
            let value = BigInt(0);
            let shift = 0;
            let byte;

            do {
                if (off == end) {
                    err = new RangeError("malformed sleb128, extends past end");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                byte = buf[off];
                let slice = byte & 0x7f;
                if ((shift >= 64 && slice != (value < 0n ? 0x7f : 0x00)) || (shift == 63 && slice != 0 && slice != 0x7f)) {
                    err = new RangeError("sleb128 too big for int64");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                value |= BigInt(slice) << BigInt(shift);
                shift += 7;
                ++off;
            } while (byte >= 128);
            
            // Sign extend negative numbers if needed.
            if (shift < 64 && (byte & 0x40))
                value |= UINT64_MAX << BigInt(shift);
            
            this._offset = off;
            
            return BigInt.asIntN(64, value);

        } else if (asIntN == 32) {

            let err, off = this._offset;
            const orig_p = off;
            const buf = this._u8;
            const end = buf.byteLength;
            let value = 0;
            let shift = 0;
            let byte;

            do {
                if (off == end) {
                    err = new RangeError("malformed sleb128, extends past end");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                byte = buf[off];
                let slice = byte & 0x7f;
                if ((shift >= 32 && slice != (value < 0 ? 0x7f : 0x00)) || (shift == 31 && slice != 0 && slice != 0x7f)) {
                    err = new RangeError("sleb128 too big for int32");
                    err.byteOffset = (off - orig_p);
                    throw err;
                }
                value |= slice << shift;
                shift += 7;
                ++off;
            } while (byte >= 128);
            
            // Sign extend negative numbers if needed.
            if (shift < 32 && (byte & 0x40))
                value |= 0xFFFFFFFF << shift;
            
            this._offset = off;
            
            return value;
        }
    }

    /**
     * 
     * @param {integer} length 
     * @returns {string}
     */
    readUTF8Bytes(length) {
        let u8 = this._u8;
        let off = this._offset;
        let end = off + length;
        let str = '';

        if (length > 16 && u8.subarray && UTF8Decoder) {
            str = UTF8Decoder.decode(u8.subarray(off, end));
            this._offset = end;
            return str;
        } else {
            // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
            while (off < end) {
                // For UTF8 byte structure, see:
                // http://en.wikipedia.org/wiki/UTF-8#Description
                // https://www.ietf.org/rfc/rfc2279.txt
                // https://tools.ietf.org/html/rfc3629
                let u0 = u8[off++];
                if (!(u0 & 0x80)) {
                    str += String.fromCharCode(u0);
                    continue;
                }
                let u1 = u8[off++] & 63;
                if ((u0 & 0xE0) == 0xC0) {
                    str += String.fromCharCode(((u0 & 31) << 6) | u1);
                    continue;
                }
                let u2 = u8[off++] & 63;
                if ((u0 & 0xF0) == 0xE0) {
                    u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
                } else {
                    if ((u0 & 0xF8) != 0xF0)
                        console.warn('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
                    u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8[off++] & 63);
                }

                if (u0 < 0x10000) {
                    str += String.fromCharCode(u0);
                } else {
                    let ch = u0 - 0x10000;
                    str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
                }
            }
        }

        this._offset = off;
        
        return str;
    }

    // writting

    /**
     * 
     * @param {BigInt} value
     */
    writeBigInt64(value) {
        let off = this._offset;
        this._data.setBigInt64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    /**
     * 
     * @param {BigInt} value
     */
    writeBigUint64(value) {
        let off = this._offset;
        this._data.setBigUint64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    /**
     * 
     * @param {number} value
     */
    writeFloat32(value) {
        let off = this._offset;
        this._data.setFloat32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    /**
     * 
     * @param {number} value
     */
    writeFloat64(value) {
        let off = this._offset;
        this._data.setFloat64(off, value, this._littleEndian);
        this._offset = off + 8;
    }

    /**
     * 
     * @param {integer} value
     */
    writeInt16(value) {
        let off = this._offset;
        this._data.setInt16(off, value, this._littleEndian);
        this._offset = off + 2;
    }

    /**
     * 
     * @param {integer} value
     */
    writeInt32(value) {
        let off = this._offset;
        this._data.setInt32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    /**
     * 
     * @param {integer} value
     */
    writeInt8(value) {
        this._data.setInt8(this._offset++, value);
    }

    /**
     * 
     * @param {integer} value
     */
    writeUint16(value) {
        let off = this._offset;
        this._data.setUint16(off, value, this._littleEndian);
        this._offset = off + 2;
    }

    /**
     * 
     * @param {integer} value
     */
    writeUint32(value) {
        let off = this._offset;
        this._data.setUint32(off, value, this._littleEndian);
        this._offset = off + 4;
    }

    /**
     * 
     * @param {integer} value
     */
    writeUint8(value) {
        this._data.setUint8(this._offset++, value);
    }

    /**
     * Utility function to encode a ULEB128 value to a buffer. Returns the length in bytes of the encoded value.
     * 
     * @param  {BigInt|integer} value
     * @param  {integer=} padTo
     * @return {integer}
     */
    writeULEB128(value, padTo) {
        if (!Number.isInteger(padTo))
            padTo = 0;
        
        if (typeof value == "bigint") {
            const mask = BigInt(0x7f);
            let u8 = this._u8;
            let off = this._offset;
            let orig_p = off;
            let len = u8.byteLength;
            let cnt = 0;
            do {
                let byte = Number(value & mask);
                value >>= 7n;
                if (value < 0n) // protecting against overflow (causing negative value)
                    value = 0n;
                cnt++;
                if (value != 0 || cnt < padTo) {
                    byte = (byte | 0x80);
                }
                u8[off++] = byte;
            } while (value != 0n);

            // pad with 0x80 and emit a nyll byte at the end.
            if (cnt < padTo) {
                let end = padTo - 1;
                for (;cnt < end;++cnt)
                    u8[off++] = 0x80;
                u8[off++] = 0x00;
            }

            this._offset = off;

            return (off - orig_p);
        }

        let u8 = this._u8;
        let off = this._offset;
        let orig_p = off;
        let len = u8.byteLength;
        let cnt = 0;
        do {
            let byte = value & 0x7f;
            value >>= 7;
            if (value < 0)
                value = 0;
            cnt++;
            if (value != 0 || cnt < padTo) {
                byte = (byte | 0x80);
            }
            u8[off++] = byte;

        } while (value != 0);

        // pad with 0x80 and emit a nyll byte at the end.
        if (cnt < padTo) {
            let end = padTo - 1;
            for (;cnt < end;++cnt)
                u8[off++] = 0x80;
            u8[off++] = 0x00;
        }

        this._offset = off;

        return (off - orig_p);
    }


    /**
     * Utility function to encode a SLEB128 value to a buffer. Returns the length in bytes of the encoded value.
     * @param  {BigInt|integer}  value 
     * @param  {integer=}         padTo 
     * @return {integer}
     */
    writeSLEB128(value, padTo) {
        
        if (!Number.isInteger(padTo))
            padTo = 0;
        
        if (typeof value == "bigint") {

            let off = this._offset;
            const buf = this._u8;
            const orig_p = off;
            let count = 0;
            let more;
            do {
                let byte = Number(value & BigInt(0x7f));
                // NOTE: this assumes that this signed shift is an arithmetic right shift.
                value >>= BigInt(7);
                more = !((((value == 0n) && ((byte & 0x40) == 0)) || ((value == BigInt(-1)) && ((byte & 0x40) != 0))));
                count++;
                if (more || count < padTo)
                    byte |= 0x80; // Mark this byte to show that more bytes will follow.
                buf[off++] = byte;
            } while (more);
         
            // Pad with 0x80 and emit a terminating byte at the end.
            if (count < padTo) {
                const padValue = value < BigInt(0) ? 0x7f : 0x00;
                for (; count < padTo - 1; ++count)
                    buf[off++] = (padValue | 0x80);
                buf[off++] = padValue;
            }

            this._offset = off;

            return (off - orig_p);
        
        } else {

            let off = this._offset;
            const buf = this._u8;
            const orig_p = off;
            let count = 0;
            let more;
            do {
                let byte = value & 0x7f;
                // NOTE: this assumes that this signed shift is an arithmetic right shift.
                value >>= 7;
                more = !((((value == 0 ) && ((byte & 0x40) == 0)) || ((value == -1) && ((byte & 0x40) != 0))));
                count++;
                if (more || count < padTo)
                    byte |= 0x80; // Mark this byte to show that more bytes will follow.
                buf[off++] = byte;
            } while (more);
         
            // Pad with 0x80 and emit a terminating byte at the end.
            if (count < padTo) {
                const padValue = value < 0 ? 0x7f : 0x00;
                for (; count < padTo - 1; ++count)
                    buf[off++] = (padValue | 0x80);
                buf[off++] = padValue;
            }

            this._offset = off;

            return (off - orig_p);
        }
    }

    /**
     * 
     * @param {string} value
     * @returns {integer} the number of bytes written.
     */
    writeUTF8Bytes(value) {
        let u8 = this._u8;
        let off = this._offset;

        let start = off;
        let end = u8.byteLength;
        for (let i = 0; i < value.length; ++i) {
            // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
            // See http://unicode.org/faq/utf_bom.html#utf16-3
            // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
            let u = value.charCodeAt(i); // possibly a lead surrogate
            if (u >= 0xD800 && u <= 0xDFFF) {
                let u1 = value.charCodeAt(++i);
                u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
            }
            if (u <= 0x7F) {
                if (off >= end)
                    break;
                u8[off++] = u;
            } else if (u <= 0x7FF) {
                if (off + 1 >= end)
                    break;
                u8[off++] = 0xC0 | (u >> 6);
                u8[off++] = 0x80 | (u & 63);
            } else if (u <= 0xFFFF) {
                
                if (off + 2 >= end)
                    break;
                u8[off++] = 0xE0 | (u >> 12);
                u8[off++] = 0x80 | ((u >> 6) & 63);
                u8[off++] = 0x80 | (u & 63);
            } else {
                if (off + 3 >= end)
                    break;
                if (u > 0x10FFFF)
                    console.warn('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
                u8[off++] = 0xF0 | (u >> 18);
                u8[off++] = 0x80 | ((u >> 12) & 63);
                u8[off++] = 0x80 | ((u >> 6) & 63);
                u8[off++] = 0x80 | (u & 63);
            }
        }
        
        this._offset = off;

        return off - start;
    }

};

/**
 * Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
 * @param {string} str 
 * @returns {integer} 
 */
export function lengthBytesUTF8(str) {
    let len = 0;
    for (let i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        let u = str.charCodeAt(i); // possibly a lead surrogate
        if (u >= 0xD800 && u <= 0xDFFF)
            u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
        if (u <= 0x7F)
            ++len;
        else if (u <= 0x7FF)
            len += 2;
        else if (u <= 0xFFFF)
            len += 3;
        else 
            len += 4;
    }
    
    return len;
}

/**
 * Returns the number of bytes needed to encode the value as a unsigned leb128
 * @param {BigInt|integer} value
 * @param {integer=} padTo 
 * @returns {integer}
 */
export function lengthULEB128(value, padTo) {
    if (!Number.isInteger(padTo))
        padTo = 0;
    let cnt = 0;
    if (typeof value == "bigint") {
        do {
            value >>= 7n;
            if (value < 0n) // protecting against overflow (causing negative value)
                value = 0n;

            if (value != 0n) {
                cnt++;
            } else {
                cnt++;
                if (cnt < padTo)
                    return padTo;
                return cnt;
            }

        } while (value != 0n);

        throw TypeError("should never get here!");
    }

    do {
        value >>= 7;
        if (value < 0)
            value = 0;

        if (value != 0) {
            cnt++;
        } else {
            cnt++;
            if (cnt < padTo)
                return padTo;
            return cnt;
        }

    } while (value != 0);

    throw TypeError("should never get here!");
}

/**
 * Utility function to compute the bytes needed to encode a SLEB128 value to a buffer.
 * @param  {BigInt|integer} value 
 * @param  {number=}         padTo 
 * @return {integer}         Returns the number of bytes needed.
 */
export function lengthSLEB128(value, padTo) {
    
    if (!Number.isInteger(padTo))
        padTo = 0;
    
    if (typeof value == "bigint") {

        let more, off = 0;
        let count = 0;
        do {
            let byte = Number(value & BigInt(0x7f));
            // NOTE: this assumes that this signed shift is an arithmetic right shift.
            value >>= BigInt(7);
            more = !((((value == 0n) && ((byte & 0x40) == 0)) || ((value == BigInt(-1)) && ((byte & 0x40) != 0))));
            count++;
            off++
        } while (more);
     
        // Pad with 0x80 and emit a terminating byte at the end.
        if (count < padTo) {
            for (; count < padTo - 1; ++count) {
                off++
            }
            off++
        }

        return off;
    
    } else {

        let more, off = 0;
        let count = 0;
        do {
            let byte = value & 0x7f;
            // NOTE: this assumes that this signed shift is an arithmetic right shift.
            value >>= 7;
            more = !((((value == 0 ) && ((byte & 0x40) == 0)) || ((value == -1) && ((byte & 0x40) != 0))));
            count++;
            off++;
        } while (more);
     
        // Pad with 0x80 and emit a terminating byte at the end.
        if (count < padTo) {
            for (; count < padTo - 1; ++count)
                off++;
            off++;
        }

        return off;
    }

    /*
    if (typeof value == "bigint") {
        const neg = value < 0n;
        if (value >= BigInt(-64) && value < BigInt(64)) {
            return 1;
        }

        let n = 0;
        let x = value;
        let more = true;
        while (more) {
            let byte = Number(x & BigInt(0x7f));
            let sign = (byte & 0x40) > 0;
            x >>= 7n;
            if ((x == 0n && !sign) || (x == BigInt(-1) && sign)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            n += 1;
        }

        return n;
    
    } else {
        // else we asume that its a value of Number
        const neg = value < 0;
        if (value >= -64 && value < 64) {
            return 1;
        }

        let n = 0;
        let x = value;
        let more = true;
        while (more) {
            let byte = (x & 0x7f);
            let sign = (byte & 0x40) > 0;
            x >>= 7;
            if ((x == 0 && !sign) || (x == -1 && sign)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            n += 1;
        }

        return n;
    }*/
}

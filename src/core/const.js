
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

export const __nsym = Symbol("@custom-name");

export const SECTION_TYPE_FUNCTYPE = 1;
export const SECTION_TYPE_IMPORT = 2;
export const SECTION_TYPE_FUNC = 3;
export const SECTION_TYPE_TABLE = 4;
export const SECTION_TYPE_MEMORY = 5;
export const SECTION_TYPE_GLOBAL = 6;
export const SECTION_TYPE_EXPORT = 7;
export const SECTION_TYPE_START = 8;
export const SECTION_TYPE_ELEMENT = 9;
export const SECTION_TYPE_CODE = 0x0A;
export const SECTION_TYPE_DATA = 0x0B;
export const SECTION_TYPE_DATA_COUNT = 0x0C;
export const SECTION_TYPE_TAG = 0x0D;
export const SECTION_TYPE_CUSTOM = 0x00;

export const WA_TYPE_I32 = 0x7F;
export const WA_TYPE_I64 = 0x7E;
export const WA_TYPE_F32 = 0x7D;
export const WA_TYPE_F64 = 0x7C;
export const WA_TYPE_VOID = 0x00;
export const WA_TYPE_V128 = 0x7b;
export const WA_TYPE_FUNC_REF = 0x70;
export const WA_TYPE_EXTERN_REF = 0x67;

export const RELOC_PAD = 5;             // padding applied to leb128 when encoding relocatable value
"use strict";
/*
 * Base-122 codec derived from Kevin Albertson's Base122 project.
 * Upstream: https://github.com/kevinAlbs/Base122
 * Copyright (c) 2016 Kevin Albertson
 * SPDX-License-Identifier: MIT
 *
 * The algorithm is intentionally pinned in-tree because Base122 is experimental
 * and is not published as an npm package.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeInlineString = exports.decodeBase122 = exports.encodeBase122 = exports.encodeBase122Bytes = void 0;
const ILLEGAL_BYTES = [0, 10, 13, 34, 38, 92];
const SHORTENED = 0b111;
function encodeBase122Bytes(rawData) {
    let byteIndex = 0;
    let bitIndex = 0;
    const encoded = [];
    const getSevenBits = () => {
        if (byteIndex >= rawData.length) {
            return undefined;
        }
        const first = rawData[byteIndex];
        let value = (((0b11111110 >>> bitIndex) & first) << bitIndex) >>> 1;
        bitIndex += 7;
        if (bitIndex < 8) {
            return value;
        }
        bitIndex -= 8;
        byteIndex += 1;
        if (byteIndex >= rawData.length) {
            return value;
        }
        const second = rawData[byteIndex];
        value |= (((0xFF00 >>> bitIndex) & second) & 0xFF) >>> (8 - bitIndex);
        return value;
    };
    while (true) {
        const bits = getSevenBits();
        if (bits === undefined) {
            break;
        }
        const illegalIndex = ILLEGAL_BYTES.indexOf(bits);
        if (illegalIndex === -1) {
            encoded.push(bits);
            continue;
        }
        let nextBits = getSevenBits();
        let firstByte = 0b11000010;
        const secondByteBase = 0b10000000;
        if (nextBits === undefined) {
            firstByte |= SHORTENED << 2;
            nextBits = bits;
        }
        else {
            firstByte |= illegalIndex << 2;
        }
        firstByte |= (nextBits & 0b01000000) > 0 ? 1 : 0;
        encoded.push(firstByte, secondByteBase | (nextBits & 0b00111111));
    }
    return Uint8Array.from(encoded);
}
exports.encodeBase122Bytes = encodeBase122Bytes;
function encodeBase122(rawData) {
    return Buffer.from(encodeBase122Bytes(rawData)).toString('utf8');
}
exports.encodeBase122 = encodeBase122;
function decodeBase122(encoded) {
    const decoded = [];
    let currentByte = 0;
    let bitOfByte = 0;
    const pushSeven = (value) => {
        const aligned = value << 1;
        currentByte |= aligned >>> bitOfByte;
        bitOfByte += 7;
        if (bitOfByte >= 8) {
            decoded.push(currentByte & 0xFF);
            bitOfByte -= 8;
            currentByte = (aligned << (7 - bitOfByte)) & 0xFF;
        }
    };
    for (let index = 0; index < encoded.length; index += 1) {
        const codePoint = encoded.charCodeAt(index);
        if (codePoint > 127) {
            const illegalIndex = (codePoint >>> 8) & 7;
            if (illegalIndex !== SHORTENED) {
                pushSeven(ILLEGAL_BYTES[illegalIndex]);
            }
            pushSeven(codePoint & 127);
        }
        else {
            pushSeven(codePoint);
        }
    }
    return Uint8Array.from(decoded);
}
exports.decodeBase122 = decodeBase122;
function safeInlineString(value) {
    // JSON.stringify escapes every U+0000..U+001F character as six ASCII bytes.
    // Base122 deliberately uses most of those code points, so JSON serialization
    // would make the output substantially larger than Base64. A JavaScript string
    // literal only requires quotes, slashes and line terminators to be escaped.
    return `"${value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')}"`;
}
exports.safeInlineString = safeInlineString;

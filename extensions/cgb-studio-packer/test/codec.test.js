'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  decodeBase122,
  encodeBase122,
  safeInlineString,
} = require('../dist/codec/base122');

function roundTrip(bytes) {
  const encoded = encodeBase122(bytes);
  const decoded = decodeBase122(encoded);
  assert.deepEqual(Buffer.from(decoded), Buffer.from(bytes));
}

test('Base122 round-trips every byte value', () => {
  roundTrip(Uint8Array.from({ length: 256 }, (_value, index) => index));
});

test('Base122 round-trips large and representative binary assets', () => {
  const random = crypto.randomBytes(1024 * 1024);
  roundTrip(random);
  const literal = safeInlineString(encodeBase122(random));
  const restored = Function(`return ${literal}`)();
  assert.deepEqual(Buffer.from(decodeBase122(restored)), random);
  assert.ok(Buffer.byteLength(literal) < Buffer.byteLength(random.toString('base64')));
  roundTrip(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  roundTrip(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0015', 'binary'));
  roundTrip(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
});

test('inline serialization cannot terminate a script element', () => {
  const encoded = safeInlineString('</script>\u2028&');
  assert.equal(encoded.includes('</script>'), false);
  assert.equal(JSON.parse(encoded), '</script>\u2028&');
});

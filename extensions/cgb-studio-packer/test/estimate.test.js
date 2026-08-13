'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { analyzeDefault } = require('../dist/packer/estimate');
const { packDirectory } = require('../dist/packer/packer');
const { createDefaultSettings } = require('../dist/settings');
const { NETWORK_IDS } = require('../dist/types');

function estimateFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-estimate-'));
  const input = path.join(root, 'build', 'web-mobile');
  for (const directory of [
    'assets',
    'assets/scenes',
    'assets/native',
    'cocos-js',
    'src',
  ]) {
    fs.mkdirSync(path.join(input, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(input, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Estimate Fixture</title></head>
<body><canvas id="GameCanvas"></canvas><script src="cocos-js/cc.js"></script>
<script src="src/project.js"></script></body></html>`);
  fs.writeFileSync(path.join(input, 'cocos-js', 'cc.js'), 'window.cc={engine:true};'.repeat(80));
  fs.writeFileSync(path.join(input, 'src', 'project.js'), 'window.project={ready:true};'.repeat(60));
  fs.writeFileSync(path.join(input, 'assets', 'mesh.bin'), Buffer.alloc(2300, 0x41));
  fs.writeFileSync(path.join(input, 'assets', 'animation.cconb'), Buffer.alloc(1300, 0x42));
  fs.writeFileSync(path.join(input, 'assets', 'texture.webp'), Buffer.alloc(1700, 0x89));
  fs.writeFileSync(path.join(input, 'assets', 'music.mp3'), Buffer.from(`ID3${'audio'.repeat(260)}`));
  fs.writeFileSync(path.join(input, 'assets', 'font.ttf'), Buffer.from(Array.from(
    { length: 2048 },
    (_, index) => (index * 47) & 255,
  )));
  fs.writeFileSync(path.join(input, 'assets', 'native', 'module.wasm'), Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
  ]));
  fs.writeFileSync(path.join(input, 'assets', 'native', 'module.wasm.br'), Buffer.alloc(32, 0x33));
  fs.writeFileSync(path.join(input, 'assets', 'native', 'fallback.asm.js'), 'window.asmFixture=true;');
  fs.writeFileSync(path.join(input, 'assets', 'scenes', 'main.json'), JSON.stringify({ scene: 1 }));
  fs.writeFileSync(path.join(input, 'assets', 'other.dat'), Buffer.alloc(77, 0x55));
  return { root, input };
}

function settingsFor(encoding) {
  const settings = createDefaultSettings();
  settings.assetEncoding = encoding;
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  return settings;
}

function generatedDefault(result) {
  const relative = result.files.find((file) => file.startsWith(`default${path.sep}`));
  assert.ok(relative, 'Default was generated');
  return path.join(result.outputDirectory, relative);
}

test('size analysis exactly matches written Base64 and Base122 Default HTML files', async () => {
  const { input } = estimateFixture();
  const analysis = await analyzeDefault(input, settingsFor('base64'));
  const base64Result = await packDirectory(input, settingsFor('base64'), 'Base64 control');
  const base122Result = await packDirectory(input, settingsFor('base122'), 'Base122 control');
  const base64File = generatedDefault(base64Result);
  const base122File = generatedDefault(base122Result);

  assert.equal(path.basename(base64File), path.basename(base122File));
  assert.doesNotMatch(path.basename(base64File), /_(?:b64|b122)%/);
  assert.equal(analysis.base64Bytes, fs.statSync(base64File).size);
  assert.equal(analysis.base122Bytes, fs.statSync(base122File).size);
  assert.equal(
    analysis.base122Bytes,
    Buffer.byteLength(fs.readFileSync(base122File, 'utf8'), 'utf8'),
  );
  assert.notEqual(
    analysis.base122Bytes,
    fs.readFileSync(base122File, 'utf8').length,
    'Base122 must be measured as UTF-8 bytes, not JavaScript characters',
  );
});

test('estimate categories recognize resources and allocate every encoded byte', async () => {
  const { input } = estimateFixture();
  const analysis = await analyzeDefault(input, settingsFor('base64'));
  const categories = new Map(analysis.categories.map((category) => [category.id, category]));

  for (const id of [
    'models',
    'textures',
    'audio',
    'fonts',
    'native',
    'engine',
    'scripts',
    'data',
    'other',
    'zip',
    'runtime',
  ]) {
    assert.ok(categories.has(id), `${id} category is present`);
  }
  assert.equal(
    analysis.categories.reduce((total, category) => total + category.base64Bytes, 0),
    analysis.base64Bytes,
  );
  assert.equal(
    analysis.categories.reduce((total, category) => total + category.base122Bytes, 0),
    analysis.base122Bytes,
  );
  assert.ok(categories.get('runtime').base64Bytes > 0);
  assert.ok(categories.get('zip').compressedBytes > 0);
  assert.ok(categories.get('native').rawBytes >= 40);
});

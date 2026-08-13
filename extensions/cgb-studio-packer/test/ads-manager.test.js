'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const {
  ADS_MANAGER_RELATIVE_PATH,
  getAdsManagerPath,
  getAdsManagerSource,
  installAdsManager,
} = require('../dist/ads-manager');

function loadManager(root) {
  const compiled = ts.transpileModule(getAdsManagerSource(), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const sandbox = { exports: {}, globalThis: root };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports.default;
}

test('AdsManager installer creates the documented project module once without overwriting it', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-ads-manager-'));
  const first = installAdsManager(project);
  assert.equal(first.created, true);
  assert.equal(first.path, path.join(project, ADS_MANAGER_RELATIVE_PATH));
  assert.match(fs.readFileSync(first.path, 'utf8'), /export default new AdsManager\(\)/);
  fs.writeFileSync(first.path, '// project customization', 'utf8');
  const second = installAdsManager(project);
  assert.equal(second.created, false);
  assert.equal(fs.readFileSync(second.path, 'utf8'), '// project customization');
  assert.equal(getAdsManagerPath(project), first.path);
});

test('AdsManager uses cgb first, supports legacy super_html and safely no-ops without a bridge', () => {
  const calls = [];
  const cgbRoot = {
    cgb: {
      download: (url) => calls.push(['download', url]),
      gameEnd: () => calls.push(['end']),
      gameReady: () => calls.push(['ready']),
      isDownloadHidden: () => true,
      setGooglePlayUrl: (url) => calls.push(['google', url]),
      setAppStoreUrl: (url) => calls.push(['appstore', url]),
    },
  };
  const cgb = loadManager(cgbRoot);
  cgb.download('https://explicit.example');
  cgb.gameEnd();
  cgb.gameReady();
  assert.equal(cgb.isDownloadHidden(), true);
  cgb.setGooglePlayUrl('https://play.example');
  cgb.setAppStoreUrl('https://apps.example');
  assert.deepEqual(calls, [
    ['download', 'https://explicit.example'], ['end'], ['ready'],
    ['google', 'https://play.example'], ['appstore', 'https://apps.example'],
  ]);

  let ended = 0;
  const legacyRoot = { super_html: { game_end: () => { ended += 1; } } };
  const legacy = loadManager(legacyRoot);
  legacy.gameEnd();
  legacy.setGooglePlayUrl('https://play.example');
  legacy.setAppStoreUrl('https://apps.example');
  assert.equal(ended, 1);
  assert.equal(legacyRoot.super_html.google_play_url, 'https://play.example');
  assert.equal(legacyRoot.super_html.appstore_url, 'https://apps.example');

  const absent = loadManager({});
  assert.doesNotThrow(() => {
    absent.download();
    absent.gameEnd();
    absent.gameReady();
    absent.setGooglePlayUrl('https://play.example');
    absent.setAppStoreUrl('https://apps.example');
  });
  assert.equal(absent.isDownloadHidden(), false);
});
